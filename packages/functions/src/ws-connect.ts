import type { APIGatewayProxyWebsocketHandlerV2, APIGatewayProxyWebsocketEventV2 } from 'aws-lambda';

// @types/aws-lambda の型定義に queryStringParameters が含まれていないため補完
type WsConnectEvent = APIGatewayProxyWebsocketEventV2 & {
  queryStringParameters?: Record<string, string>;
};
import { verifyToken } from './lib/auth.js';
import { putConnection, getBoard, getGroupMember } from './lib/dynamo.js';

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

  // ボード存在確認 + アクセス権チェック
  const board = await getBoard(boardId);
  if (!board) {
    return { statusCode: 403, body: 'Board not found' };
  }
  if (!user.isAdmin && board.createdBy !== user.id) {
    if (!board.groupId) {
      return { statusCode: 403, body: 'Forbidden' };
    }
    const isMember = await getGroupMember(board.groupId, user.id);
    if (!isMember) {
      return { statusCode: 403, body: 'Forbidden' };
    }
  }

  // 接続を登録
  // NOTE: $connect ハンドラー実行中は API GW の接続が未確立のため
  // sendToConnection を呼ぶと GoneException → deleteConnection で
  // 書き込み直後のレコードが削除されてしまう。
  // init データの送信は $connect 完了後にクライアントが request_init を送って行う。
  await putConnection({
    connectionId,
    boardId,
    userId: user.id,
    displayName: user.displayName,
    ttl: Math.floor(Date.now() / 1000) + 86400,
  });
  console.log('[ws-connect] connected', { connectionId, boardId, userId: user.id });

  return { statusCode: 200, body: 'Connected' };
};
