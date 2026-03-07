import type { APIGatewayProxyWebsocketHandlerV2, APIGatewayProxyWebsocketEventV2 } from 'aws-lambda';

// @types/aws-lambda の型定義に queryStringParameters が含まれていないため補完
type WsConnectEvent = APIGatewayProxyWebsocketEventV2 & {
  queryStringParameters?: Record<string, string>;
};
import { verifyToken } from './lib/auth.js';
import {
  putConnection,
  getConnectionsByBoard,
  getBoard,
} from './lib/dynamo.js';
import { getElementsByBoard } from './lib/dynamo.js';
import { sendToConnection, broadcast } from './lib/apigw.js';

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (rawEvent) => {
  const event = rawEvent as WsConnectEvent;
  const connectionId = event.requestContext.connectionId;
  const qs = event.queryStringParameters ?? {};
  const boardId = qs['boardId'];
  const token = qs['token'];

  // パラメータ検証
  if (!boardId || !token) {
    return { statusCode: 400, body: 'Missing boardId or token' };
  }

  // JWT 検証
  let user: Awaited<ReturnType<typeof verifyToken>>;
  try {
    user = await verifyToken(token);
  } catch {
    return { statusCode: 401, body: 'Unauthorized' };
  }

  // ボード存在確認
  const board = await getBoard(boardId);
  if (!board) {
    return { statusCode: 403, body: 'Board not found' };
  }

  // 接続を登録
  await putConnection({
    connectionId,
    boardId,
    userId: user.id,
    displayName: user.displayName,
    ttl: Math.floor(Date.now() / 1000) + 86400,
  });
  console.log('[ws-connect] connected', { connectionId, boardId, userId: user.id });

  // 既存接続から onlineUsers を構築（重複排除）
  const existingConns = await getConnectionsByBoard(boardId);
  const seen = new Map<string, { userId: string; displayName: string }>();
  for (const c of existingConns) {
    if (!seen.has(c.userId)) {
      seen.set(c.userId, { userId: c.userId, displayName: c.displayName });
    }
  }
  const onlineUsers = Array.from(seen.values());

  // 全要素を取得して init を送信
  const elements = await getElementsByBoard(boardId);
  await sendToConnection(connectionId, {
    type: 'init',
    elements,
    onlineUsers,
  });

  // 同一ユーザーの初回接続のみ user_joined をブロードキャスト
  const sameUserConns = existingConns.filter(
    (c) => c.userId === user.id && c.connectionId !== connectionId,
  );
  if (sameUserConns.length === 0) {
    await broadcast(
      boardId,
      { type: 'user_joined', user: { userId: user.id, displayName: user.displayName } },
      connectionId,
    );
  }

  return { statusCode: 200, body: 'Connected' };
};
