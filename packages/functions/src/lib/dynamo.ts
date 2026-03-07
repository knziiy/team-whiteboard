import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  DeleteCommand,
  QueryCommand,
  BatchWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type { ConnectionItem } from './types.js';
import type { BoardElement } from '@whiteboard/shared';

const isLocal = process.env['LOCAL_AUTH'] === 'true';

const client = new DynamoDBClient(
  isLocal
    ? {
        endpoint: 'http://localhost:8000',
        region: 'us-east-1',
        // DynamoDB Local はダミー認証情報で動作する
        credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
      }
    : {},
);
export const ddb = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

// ─── テーブル名 ───────────────────────────────────────────────────────────────

const T = {
  connections: process.env['TABLE_CONNECTIONS'] ?? 'wb-connections',
  elements: process.env['TABLE_ELEMENTS'] ?? 'wb-elements',
  boards: process.env['TABLE_BOARDS'] ?? 'wb-boards',
  users: process.env['TABLE_USERS'] ?? 'wb-users',
  groups: process.env['TABLE_GROUPS'] ?? 'wb-groups',
  groupMembers: process.env['TABLE_GROUP_MEMBERS'] ?? 'wb-group-members',
};

// ─── Connections ─────────────────────────────────────────────────────────────

export async function putConnection(item: ConnectionItem): Promise<void> {
  await ddb.send(new PutCommand({ TableName: T.connections, Item: item }));
}

export async function getConnection(
  connectionId: string,
): Promise<ConnectionItem | null> {
  const res = await ddb.send(
    new GetCommand({ TableName: T.connections, Key: { connectionId } }),
  );
  return (res.Item as ConnectionItem) ?? null;
}

export async function deleteConnection(connectionId: string): Promise<void> {
  await ddb.send(
    new DeleteCommand({ TableName: T.connections, Key: { connectionId } }),
  );
}

export async function getConnectionsByBoard(
  boardId: string,
): Promise<ConnectionItem[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: T.connections,
      IndexName: 'boardId-index',
      KeyConditionExpression: 'boardId = :b',
      ExpressionAttributeValues: { ':b': boardId },
    }),
  );
  return (res.Items ?? []) as ConnectionItem[];
}

// ─── Elements ────────────────────────────────────────────────────────────────

export async function getElementsByBoard(
  boardId: string,
): Promise<BoardElement[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: T.elements,
      KeyConditionExpression: 'boardId = :b',
      ExpressionAttributeValues: { ':b': boardId },
    }),
  );
  return (res.Items ?? []).map(itemToElement);
}

export async function upsertElement(el: BoardElement): Promise<void> {
  await ddb.send(
    new PutCommand({
      TableName: T.elements,
      Item: {
        boardId: el.boardId,
        elementId: el.id,
        type: el.type,
        props: el.props,
        zIndex: el.zIndex,
        createdBy: el.createdBy,
        updatedAt: el.updatedAt,
      },
    }),
  );
}

export async function deleteElement(
  boardId: string,
  elementId: string,
): Promise<void> {
  await ddb.send(
    new DeleteCommand({
      TableName: T.elements,
      Key: { boardId, elementId },
    }),
  );
}

export async function deleteAllElementsForBoard(
  boardId: string,
): Promise<void> {
  // 全要素を取得してから BatchWrite（25件ずつ）で削除
  const elements = await getElementsByBoard(boardId);
  if (elements.length === 0) return;

  const chunks: BoardElement[][] = [];
  for (let i = 0; i < elements.length; i += 25) {
    chunks.push(elements.slice(i, i + 25));
  }

  for (const chunk of chunks) {
    await ddb.send(
      new BatchWriteCommand({
        RequestItems: {
          [T.elements]: chunk.map((el) => ({
            DeleteRequest: { Key: { boardId, elementId: el.id } },
          })),
        },
      }),
    );
  }
}

function itemToElement(item: Record<string, unknown>): BoardElement {
  return {
    id: item['elementId'] as string,
    boardId: item['boardId'] as string,
    type: item['type'] as BoardElement['type'],
    props: item['props'] as BoardElement['props'],
    zIndex: item['zIndex'] as number,
    createdBy: item['createdBy'] as string,
    updatedAt: item['updatedAt'] as string,
  };
}

// ─── Boards ──────────────────────────────────────────────────────────────────

export interface BoardItem {
  boardId: string;
  title: string;
  groupId?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export async function getBoard(boardId: string): Promise<BoardItem | null> {
  const res = await ddb.send(
    new GetCommand({ TableName: T.boards, Key: { boardId } }),
  );
  return (res.Item as BoardItem) ?? null;
}

export async function putBoard(item: BoardItem): Promise<void> {
  await ddb.send(new PutCommand({ TableName: T.boards, Item: item }));
}

export async function updateBoardTitle(
  boardId: string,
  title: string,
): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: T.boards,
      Key: { boardId },
      UpdateExpression: 'SET title = :t, updatedAt = :u',
      ExpressionAttributeValues: {
        ':t': title,
        ':u': new Date().toISOString(),
      },
    }),
  );
}

export async function deleteBoard(boardId: string): Promise<void> {
  await ddb.send(
    new DeleteCommand({ TableName: T.boards, Key: { boardId } }),
  );
}

export async function scanBoards(): Promise<BoardItem[]> {
  // 小規模を想定。大規模になったら GSI + Query に変更
  const { ScanCommand } = await import('@aws-sdk/lib-dynamodb');
  const res = await ddb.send(new ScanCommand({ TableName: T.boards }));
  return (res.Items ?? []) as BoardItem[];
}

// ─── Users ───────────────────────────────────────────────────────────────────

export interface UserItem {
  userId: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
  createdAt: string;
}

export async function getUser(userId: string): Promise<UserItem | null> {
  const res = await ddb.send(
    new GetCommand({ TableName: T.users, Key: { userId } }),
  );
  return (res.Item as UserItem) ?? null;
}

export async function upsertUser(item: UserItem): Promise<void> {
  await ddb.send(new PutCommand({ TableName: T.users, Item: item }));
}

export async function scanUsers(): Promise<UserItem[]> {
  const { ScanCommand } = await import('@aws-sdk/lib-dynamodb');
  const res = await ddb.send(new ScanCommand({ TableName: T.users }));
  return (res.Items ?? []) as UserItem[];
}

// ─── Groups ──────────────────────────────────────────────────────────────────

export interface GroupItem {
  groupId: string;
  name: string;
  createdBy: string;
  createdAt: string;
}

export async function getGroup(groupId: string): Promise<GroupItem | null> {
  const res = await ddb.send(
    new GetCommand({ TableName: T.groups, Key: { groupId } }),
  );
  return (res.Item as GroupItem) ?? null;
}

export async function putGroup(item: GroupItem): Promise<void> {
  await ddb.send(new PutCommand({ TableName: T.groups, Item: item }));
}

export async function deleteGroup(groupId: string): Promise<void> {
  await ddb.send(
    new DeleteCommand({ TableName: T.groups, Key: { groupId } }),
  );
}

export async function scanGroups(): Promise<GroupItem[]> {
  const { ScanCommand } = await import('@aws-sdk/lib-dynamodb');
  const res = await ddb.send(new ScanCommand({ TableName: T.groups }));
  return (res.Items ?? []) as GroupItem[];
}

// ─── GroupMembers ─────────────────────────────────────────────────────────────

export async function getGroupMember(
  groupId: string,
  userId: string,
): Promise<boolean> {
  const res = await ddb.send(
    new GetCommand({
      TableName: T.groupMembers,
      Key: { groupId, userId },
    }),
  );
  return res.Item != null;
}

export async function putGroupMember(
  groupId: string,
  userId: string,
): Promise<void> {
  // 冪等 Put（既に存在する場合も上書きして問題なし）
  await ddb.send(
    new PutCommand({
      TableName: T.groupMembers,
      Item: { groupId, userId },
    }),
  );
}

export async function deleteGroupMember(
  groupId: string,
  userId: string,
): Promise<void> {
  await ddb.send(
    new DeleteCommand({
      TableName: T.groupMembers,
      Key: { groupId, userId },
    }),
  );
}

export async function getMembersByGroup(
  groupId: string,
): Promise<{ userId: string }[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: T.groupMembers,
      KeyConditionExpression: 'groupId = :g',
      ExpressionAttributeValues: { ':g': groupId },
    }),
  );
  return (res.Items ?? []) as { userId: string }[];
}

export async function getGroupsByUser(userId: string): Promise<string[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: T.groupMembers,
      IndexName: 'userId-index',
      KeyConditionExpression: 'userId = :u',
      ExpressionAttributeValues: { ':u': userId },
    }),
  );
  return (res.Items ?? []).map((i) => i['groupId'] as string);
}
