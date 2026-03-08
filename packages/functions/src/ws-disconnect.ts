import type { APIGatewayProxyWebsocketHandlerV2 } from 'aws-lambda';
import {
  getConnection,
  deleteConnection,
  getConnectionsByBoard,
  unlockAllByUser,
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

  // 同一ユーザーの残接続がなければロック解除 + user_left をブロードキャスト
  // GSI は結果整合性のため、削除した接続がまだ残っている可能性がある → フィルタで除外
  const remaining = (await getConnectionsByBoard(boardId)).filter(
    (c) => c.connectionId !== connectionId,
  );
  const stillPresent = remaining.some((c) => c.userId === userId);
  if (!stillPresent) {
    // ユーザーの全ロックを解除してブロードキャスト
    const unlockedIds = await unlockAllByUser(boardId, userId);
    for (const elementId of unlockedIds) {
      await broadcast(boardId, { type: 'element_unlocked', elementId });
    }
    await broadcast(boardId, { type: 'user_left', userId });
  }

  return { statusCode: 200, body: 'Disconnected' };
};
