import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
  DeleteConnectionCommand,
  GoneException,
} from '@aws-sdk/client-apigatewaymanagementapi';
import type { ServerMessage } from '@whiteboard/shared';
import { getConnectionsByBoard, deleteConnection } from './dynamo.js';

let _client: ApiGatewayManagementApiClient | null = null;

function getClient(): ApiGatewayManagementApiClient {
  if (!_client) {
    const endpoint = process.env['WS_ENDPOINT'];
    _client = new ApiGatewayManagementApiClient(
      endpoint ? { endpoint } : {},
    );
  }
  return _client;
}

/**
 * 特定の connectionId にメッセージを送信する。
 * 接続が切れていた場合（GoneException）は connections テーブルから削除する。
 */
export async function sendToConnection(
  connectionId: string,
  message: ServerMessage,
): Promise<void> {
  try {
    await getClient().send(
      new PostToConnectionCommand({
        ConnectionId: connectionId,
        Data: Buffer.from(JSON.stringify(message)),
      }),
    );
  } catch (err) {
    if (err instanceof GoneException) {
      await deleteConnection(connectionId);
    }
  }
}

/**
 * boardId に接続している全クライアントにブロードキャストする。
 * excludeConnectionId を指定した場合はその接続を除外する。
 */
export async function broadcast(
  boardId: string,
  message: ServerMessage,
  excludeConnectionId?: string,
): Promise<void> {
  const connections = await getConnectionsByBoard(boardId);
  await Promise.all(
    connections
      .filter((c) => c.connectionId !== excludeConnectionId)
      .map((c) => sendToConnection(c.connectionId, message)),
  );
}

// cursor_move 用の接続 ID キャッシュ（Lambda warm instance 内での最適化）
const connectionCache = new Map<
  string,
  { ids: string[]; expiresAt: number }
>();
const CACHE_TTL_MS = 2000;

export async function broadcastCursor(
  boardId: string,
  message: ServerMessage,
  excludeConnectionId: string,
): Promise<void> {
  const now = Date.now();
  const cached = connectionCache.get(boardId);

  let connectionIds: string[];
  if (cached && cached.expiresAt > now) {
    connectionIds = cached.ids;
  } else {
    const connections = await getConnectionsByBoard(boardId);
    connectionIds = connections.map((c) => c.connectionId);
    connectionCache.set(boardId, {
      ids: connectionIds,
      expiresAt: now + CACHE_TTL_MS,
    });
  }

  await Promise.all(
    connectionIds
      .filter((id) => id !== excludeConnectionId)
      .map((id) => sendToConnection(id, message)),
  );
}
