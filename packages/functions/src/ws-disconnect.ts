import type { APIGatewayProxyWebsocketHandlerV2 } from 'aws-lambda';
import {
  getConnection,
  deleteConnection,
  getConnectionsByBoard,
} from './lib/dynamo.js';
import { broadcast } from './lib/apigw.js';

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
  const connectionId = event.requestContext.connectionId;

  const conn = await getConnection(connectionId);
  if (!conn) {
    console.warn('[ws-disconnect] connection not found (TTL expired?)', { connectionId });
    return { statusCode: 200, body: 'OK' };
  }

  const { boardId, userId } = conn;
  console.log('[ws-disconnect] disconnecting', { connectionId, boardId, userId });

  await deleteConnection(connectionId);

  // 同一ユーザーの残接続がなければ user_left をブロードキャスト
  const remaining = await getConnectionsByBoard(boardId);
  const stillPresent = remaining.some((c) => c.userId === userId);
  if (!stillPresent) {
    await broadcast(boardId, { type: 'user_left', userId });
  }

  return { statusCode: 200, body: 'Disconnected' };
};
