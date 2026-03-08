import type { APIGatewayProxyHandlerV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import { verifyAuthHeader, verifyCloudfrontSecret } from './lib/auth.js';
import { HttpError } from './lib/types.js';
import type { AuthUser } from './lib/types.js';
import {
  getBoard,
  putBoard,
  updateBoard,
  deleteBoard,
  scanBoards,
  deleteAllElementsForBoard,
  getElementsByBoard,
  upsertElement,
  getUser,
  upsertUser,
  scanUsers,
  getGroup,
  putGroup,
  deleteGroup,
  scanGroups,
  getGroupsByUser,
  getMembersByGroup,
  putGroupMember,
  deleteGroupMember,
  getGroupMember,
} from './lib/dynamo.js';

// ─── エントリーポイント ───────────────────────────────────────────────────────

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  // CloudFront シークレット検証
  try {
    verifyCloudfrontSecret(
      event.headers?.['x-cf-secret'] ?? event.headers?.['X-CF-Secret'],
    );
  } catch {
    return respond(403, { error: 'Forbidden' });
  }

  const method = event.requestContext.http.method.toUpperCase();
  const rawPath = event.rawPath ?? event.requestContext.http.path;

  try {
    return await route(method, rawPath, event);
  } catch (err) {
    if (err instanceof HttpError) {
      return respond(err.statusCode, { error: err.message });
    }
    console.error(err);
    return respond(500, { error: 'Internal server error' });
  }
};

// ─── ルーティング ─────────────────────────────────────────────────────────────

async function route(
  method: string,
  path: string,
  event: Parameters<APIGatewayProxyHandlerV2>[0],
): Promise<APIGatewayProxyStructuredResultV2> {
  // /health
  if (path === '/health' || path === '/api/health') {
    return respond(200, { status: 'ok' });
  }

  // 認証が必要なルート
  const user = await auth(event.headers?.['authorization'] ?? event.headers?.['Authorization']);

  // /api/users/me
  if (method === 'POST' && path === '/api/users/me') {
    return handleUpsertMe(user);
  }

  // /api/users
  if (method === 'GET' && path === '/api/users') {
    requireAdmin(user);
    return handleListUsers();
  }

  // /api/boards
  if (method === 'GET' && path === '/api/boards') {
    return handleListBoards(user);
  }
  if (method === 'POST' && path === '/api/boards') {
    return handleCreateBoard(user, parseBody(event.body));
  }

  // /api/boards/:boardId
  const boardMatch = path.match(/^\/api\/boards\/([^/]+)$/);
  if (boardMatch) {
    const boardId = boardMatch[1]!;
    if (method === 'GET') return handleGetBoard(user, boardId);
    if (method === 'PATCH') return handleUpdateBoard(user, boardId, parseBody(event.body));
    if (method === 'DELETE') return handleDeleteBoard(user, boardId);
  }

  // /api/boards/:boardId/duplicate
  const duplicateMatch = path.match(/^\/api\/boards\/([^/]+)\/duplicate$/);
  if (duplicateMatch && method === 'POST') {
    requireAdmin(user);
    return handleDuplicateBoard(user, duplicateMatch[1]!);
  }

  // /api/boards/:boardId/elements
  const elementsMatch = path.match(/^\/api\/boards\/([^/]+)\/elements$/);
  if (elementsMatch && method === 'GET') {
    return handleGetElements(user, elementsMatch[1]!);
  }

  // /api/groups
  if (method === 'GET' && path === '/api/groups') {
    return handleListGroups(user);
  }
  if (method === 'POST' && path === '/api/groups') {
    requireAdmin(user);
    return handleCreateGroup(user, parseBody(event.body));
  }

  // /api/groups/:groupId
  const groupMatch = path.match(/^\/api\/groups\/([^/]+)$/);
  if (groupMatch) {
    const groupId = groupMatch[1]!;
    if (method === 'DELETE') {
      requireAdmin(user);
      return handleDeleteGroup(groupId);
    }
  }

  // /api/groups/:groupId/members
  const membersMatch = path.match(/^\/api\/groups\/([^/]+)\/members$/);
  if (membersMatch) {
    const groupId = membersMatch[1]!;
    requireAdmin(user);
    if (method === 'GET') return handleListMembers(groupId);
    if (method === 'POST') return handleAddMember(groupId, parseBody(event.body));
  }

  // /api/groups/:groupId/members/:userId
  const memberMatch = path.match(/^\/api\/groups\/([^/]+)\/members\/([^/]+)$/);
  if (memberMatch && method === 'DELETE') {
    requireAdmin(user);
    return handleRemoveMember(memberMatch[1]!, memberMatch[2]!);
  }

  return respond(404, { error: 'Not found' });
}

// ─── ハンドラー関数群 ──────────────────────────────────────────────────────────

async function handleUpsertMe(user: AuthUser) {
  const now = new Date().toISOString();
  const existing = await getUser(user.id);
  await upsertUser({
    userId: user.id,
    email: user.email,
    displayName: user.displayName,
    isAdmin: user.isAdmin,
    company: user.company,
    createdAt: existing?.createdAt ?? now,
  });
  return respond(200, { ok: true });
}

async function handleListUsers() {
  const users = await scanUsers();
  return respond(200, users.map((u) => ({
    id: u.userId,
    email: u.email,
    displayName: u.displayName,
    company: u.company ?? '',
  })));
}

async function handleListBoards(user: AuthUser) {
  const all = await scanBoards();

  if (user.isAdmin) {
    return respond(200, all.map(boardToApi));
  }

  const myGroupIds = await getGroupsByUser(user.id);
  const accessible = all.filter((b) => {
    if (b.createdBy === user.id) return true;
    if (b.groupId && myGroupIds.includes(b.groupId)) return true;
    return false;
    // groupIdなし かつ 作成者でもない → アクセス不可（仕様 14-1）
  });
  return respond(200, accessible.map(boardToApi));
}

async function handleCreateBoard(user: AuthUser, body: Record<string, unknown>) {
  const title = body['title'] as string | undefined;
  if (!title?.trim()) throw new HttpError(400, 'title is required');

  const groupId = body['groupId'] as string | undefined;

  // groupId が指定された場合、グループの存在確認とメンバーシップ検証
  if (groupId) {
    const group = await getGroup(groupId);
    if (!group) throw new HttpError(400, 'Group not found');
    if (!user.isAdmin) {
      const isMember = await getGroupMember(groupId, user.id);
      if (!isMember) throw new HttpError(403, 'Not a member of the specified group');
    }
  }

  const boardId = uuidv4();
  const now = new Date().toISOString();
  const item = {
    boardId,
    title: title.trim(),
    ...(groupId ? { groupId } : {}),
    createdBy: user.id,
    createdAt: now,
    updatedAt: now,
  };
  await putBoard(item);
  return respond(201, boardToApi(item));
}

async function handleGetBoard(user: AuthUser, boardId: string) {
  const board = await getBoard(boardId);
  if (!board) throw new HttpError(404, 'Not found');
  await assertBoardAccess(user, board);
  return respond(200, boardToApi(board));
}

async function handleUpdateBoard(user: AuthUser, boardId: string, body: Record<string, unknown>) {
  const board = await getBoard(boardId);
  if (!board) throw new HttpError(404, 'Not found');
  if (!user.isAdmin && board.createdBy !== user.id) throw new HttpError(403, 'Forbidden');

  const title = (body['title'] as string | undefined) ?? board.title;

  // groupId: undefined=変更なし, null=グループ解除, string=グループ変更
  let groupId: string | null | undefined;
  if ('groupId' in body) {
    const raw = body['groupId'] as string | null | undefined;
    if (raw === null || raw === '') {
      groupId = null;
    } else if (raw) {
      const group = await getGroup(raw);
      if (!group) throw new HttpError(400, 'Group not found');
      groupId = raw;
    }
  }

  await updateBoard(boardId, { title, groupId });
  const updatedGroupId = groupId === undefined ? board.groupId : (groupId ?? undefined);
  return respond(200, boardToApi({ ...board, title, groupId: updatedGroupId, updatedAt: new Date().toISOString() }));
}

async function handleDeleteBoard(user: AuthUser, boardId: string) {
  const board = await getBoard(boardId);
  if (!board) throw new HttpError(404, 'Not found');
  if (!user.isAdmin && board.createdBy !== user.id) throw new HttpError(403, 'Forbidden');

  await deleteAllElementsForBoard(boardId);
  await deleteBoard(boardId);
  return respond(204, null);
}

async function handleDuplicateBoard(user: AuthUser, sourceBoardId: string) {
  const source = await getBoard(sourceBoardId);
  if (!source) throw new HttpError(404, 'Not found');

  const newBoardId = uuidv4();
  const now = new Date().toISOString();
  const newBoard = {
    boardId: newBoardId,
    title: `${source.title}(コピー)`,
    ...(source.groupId ? { groupId: source.groupId } : {}),
    createdBy: user.id,
    createdAt: now,
    updatedAt: now,
  };
  await putBoard(newBoard);

  // 要素をコピー
  const elements = await getElementsByBoard(sourceBoardId);
  for (const el of elements) {
    await upsertElement({
      ...el,
      id: uuidv4(),
      boardId: newBoardId,
      updatedAt: now,
    });
  }

  return respond(201, boardToApi(newBoard));
}

async function handleGetElements(user: AuthUser, boardId: string) {
  const board = await getBoard(boardId);
  if (!board) throw new HttpError(404, 'Not found');
  await assertBoardAccess(user, board);
  const elements = await getElementsByBoard(boardId);
  return respond(200, elements);
}

async function handleListGroups(user: AuthUser) {
  if (user.isAdmin) {
    return respond(200, (await scanGroups()).map(groupToApi));
  }
  const myGroupIds = await getGroupsByUser(user.id);
  const all = await scanGroups();
  return respond(200, all.filter((g) => myGroupIds.includes(g.groupId)).map(groupToApi));
}

async function handleCreateGroup(user: AuthUser, body: Record<string, unknown>) {
  const name = body['name'] as string | undefined;
  if (!name?.trim()) throw new HttpError(400, 'name is required');

  const group = {
    groupId: uuidv4(),
    name: name.trim(),
    createdBy: user.id,
    createdAt: new Date().toISOString(),
  };
  await putGroup(group);
  return respond(201, groupToApi(group));
}

async function handleDeleteGroup(groupId: string) {
  const group = await getGroup(groupId);
  if (!group) throw new HttpError(404, 'Not found');
  await deleteGroup(groupId);
  return respond(204, null);
}

async function handleListMembers(groupId: string) {
  const members = await getMembersByGroup(groupId);
  const users = await scanUsers();
  const userMap = new Map(users.map((u) => [u.userId, u]));
  return respond(200, members.map((m) => {
    const u = userMap.get(m.userId);
    return { userId: m.userId, email: u?.email ?? '', displayName: u?.displayName ?? '', company: u?.company ?? '' };
  }));
}

async function handleAddMember(groupId: string, body: Record<string, unknown>) {
  const userId = body['userId'] as string | undefined;
  if (!userId) throw new HttpError(400, 'userId is required');
  await putGroupMember(groupId, userId);
  return respond(201, { ok: true });
}

async function handleRemoveMember(groupId: string, userId: string) {
  await deleteGroupMember(groupId, userId);
  return respond(204, null);
}

// ─── ヘルパー ─────────────────────────────────────────────────────────────────

async function auth(authHeader: string | undefined): Promise<AuthUser> {
  try {
    return await verifyAuthHeader(authHeader);
  } catch {
    throw new HttpError(401, 'Unauthorized');
  }
}

function requireAdmin(user: AuthUser): void {
  if (!user.isAdmin) throw new HttpError(403, 'Admin only');
}

async function assertBoardAccess(
  user: AuthUser,
  board: Awaited<ReturnType<typeof getBoard>>,
): Promise<void> {
  if (!board) return;
  if (user.isAdmin) return;
  if (board.createdBy === user.id) return;
  if (board.groupId) {
    const isMember = await getGroupMember(board.groupId, user.id);
    if (isMember) return;
  }
  throw new HttpError(403, 'Forbidden');
}

function parseBody(body: string | undefined): Record<string, unknown> {
  if (!body) return {};
  try {
    return JSON.parse(body) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function respond(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: body === null ? '' : JSON.stringify(body),
  };
}

// DynamoDB アイテム → フロントエンドが期待する形式に変換
function boardToApi(b: NonNullable<Awaited<ReturnType<typeof getBoard>>>) {
  return {
    id: b.boardId,
    title: b.title,
    groupId: b.groupId ?? null,
    createdBy: b.createdBy,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  };
}

function groupToApi(g: NonNullable<Awaited<ReturnType<typeof getGroup>>>) {
  return {
    id: g.groupId,
    name: g.name,
    createdBy: g.createdBy,
    createdAt: g.createdAt,
  };
}
