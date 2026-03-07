import type { WebSocket } from '@fastify/websocket';
import type { OnlineUser, ServerMessage } from '@whiteboard/shared';

interface RoomClient {
  ws: WebSocket;
  userId: string;
  displayName: string;
}

export class RoomManager {
  private rooms = new Map<string, Map<string, RoomClient>>();

  join(boardId: string, socketId: string, client: RoomClient): void {
    if (!this.rooms.has(boardId)) {
      this.rooms.set(boardId, new Map());
    }
    this.rooms.get(boardId)!.set(socketId, client);
  }

  leave(boardId: string, socketId: string): RoomClient | undefined {
    const room = this.rooms.get(boardId);
    if (!room) return undefined;
    const client = room.get(socketId);
    room.delete(socketId);
    if (room.size === 0) {
      this.rooms.delete(boardId);
    }
    return client;
  }

  broadcast(boardId: string, message: ServerMessage, excludeSocketId?: string): void {
    const room = this.rooms.get(boardId);
    if (!room) return;
    const data = JSON.stringify(message);
    for (const [socketId, client] of room) {
      if (socketId === excludeSocketId) continue;
      if (client.ws.readyState === 1 /* OPEN */) {
        client.ws.send(data);
      }
    }
  }

  send(boardId: string, socketId: string, message: ServerMessage): void {
    const client = this.rooms.get(boardId)?.get(socketId);
    if (client?.ws.readyState === 1) {
      client.ws.send(JSON.stringify(message));
    }
  }

  getOnlineUsers(boardId: string): OnlineUser[] {
    const room = this.rooms.get(boardId);
    if (!room) return [];
    return Array.from(room.values()).map((c) => ({
      userId: c.userId,
      displayName: c.displayName,
    }));
  }
}

export const roomManager = new RoomManager();
