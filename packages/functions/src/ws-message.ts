import type { APIGatewayProxyWebsocketHandlerV2 } from 'aws-lambda';
import type { ClientMessage } from '@whiteboard/shared';
import {
  getConnection,
  getConnectionsByBoard,
  getElementsByBoard,
  upsertElement,
  deleteElement,
} from './lib/dynamo.js';
import { sendToConnection, broadcast, broadcastCursor } from './lib/apigw.js';

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
  const connectionId = event.requestContext.connectionId;

  // 接続情報を取得して boardId・userId を解決
  const conn = await getConnection(connectionId);
  if (!conn) {
    console.error('[ws-message] connection not found', { connectionId });
    return { statusCode: 410, body: 'Connection not found' };
  }
  const { boardId, userId } = conn;

  let message: ClientMessage;
  try {
    message = JSON.parse(event.body ?? '{}') as ClientMessage;
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  console.log('[ws-message]', { connectionId, boardId, type: message.type });

  switch (message.type) {
    case 'element_add':
    case 'element_update': {
      const el = message.element;
      // createdBy は JWT 由来の userId で上書き（なりすまし防止）
      // boardId もサーバー側の値で上書き（boardId インジェクション防止）
      const toSave = { ...el, createdBy: userId, boardId };
      await upsertElement(toSave);
      console.log('[ws-message] saved element', { elementId: toSave.id, boardId });
      await broadcast(boardId, { type: message.type, element: toSave });
      break;
    }

    case 'element_delete': {
      await deleteElement(boardId, message.elementId);
      await broadcast(boardId, {
        type: 'element_delete',
        elementId: message.elementId,
      });
      break;
    }

    case 'cursor_move': {
      // DB への書き込みなし。接続キャッシュを利用してブロードキャスト
      await broadcastCursor(
        boardId,
        { type: 'cursor_move', userId, x: message.x, y: message.y },
        connectionId,
      );
      break;
    }

    case 'request_init': {
      // $connect 完了後にクライアントから送信される初期化リクエスト
      const existingConns = await getConnectionsByBoard(boardId);
      const seen = new Map<string, { userId: string; displayName: string }>();
      for (const c of existingConns) {
        if (!seen.has(c.userId)) {
          seen.set(c.userId, { userId: c.userId, displayName: c.displayName });
        }
      }
      const onlineUsers = Array.from(seen.values());
      const elements = await getElementsByBoard(boardId);
      await sendToConnection(connectionId, { type: 'init', elements, onlineUsers });

      // 同一ユーザーの初回接続のみ user_joined をブロードキャスト
      const sameUserConns = existingConns.filter(
        (c) => c.userId === userId && c.connectionId !== connectionId,
      );
      if (sameUserConns.length === 0) {
        await broadcast(
          boardId,
          { type: 'user_joined', user: { userId, displayName: conn.displayName } },
          connectionId,
        );
      }
      break;
    }

    case 'ping':
      // keepalive: 接続を維持するための no-op メッセージ
      break;
  }

  return { statusCode: 200, body: 'OK' };
};
