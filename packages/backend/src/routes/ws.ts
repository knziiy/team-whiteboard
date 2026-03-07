import type { FastifyPluginAsync } from 'fastify';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/index.js';
import { boards, elements, groupMembers, users } from '../db/schema.js';
import { roomManager } from '../ws/RoomManager.js';
import { handleMessage } from '../ws/handlers.js';
import type { ClientMessage } from '@whiteboard/shared';

interface WsUser {
  id: string;
  displayName: string;
  isAdmin: boolean;
}

async function verifyWsToken(token: string): Promise<WsUser> {
  const userPoolId = process.env['COGNITO_USER_POOL_ID'];

  // Local dev mode
  if (!userPoolId) {
    if (!token.startsWith('local.')) {
      throw new Error('Auth not configured');
    }
    const parsed = JSON.parse(decodeURIComponent(Buffer.from(token.slice(6), 'base64').toString())) as {
      id: string;
      displayName: string;
      isAdmin: boolean;
      email: string;
    };
    await db
      .insert(users)
      .values({ id: parsed.id, email: parsed.email, displayName: parsed.displayName, isAdmin: parsed.isAdmin })
      .onConflictDoUpdate({
        target: users.id,
        set: { email: parsed.email, displayName: parsed.displayName, isAdmin: parsed.isAdmin },
      });
    return { id: parsed.id, displayName: parsed.displayName, isAdmin: parsed.isAdmin };
  }

  // Cognito JWT
  const region = userPoolId.split('_')[0]!;
  const issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
  const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
  const { payload } = await jwtVerify(token, jwks, { issuer });

  const cognitoGroups = (payload['cognito:groups'] as string[]) ?? [];
  return {
    id: payload['sub'] as string,
    displayName:
      (payload['name'] as string) ??
      (payload['cognito:username'] as string) ??
      (payload['email'] as string) ??
      (payload['sub'] as string),
    isAdmin: cognitoGroups.includes('Admins'),
  };
}

const wsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/ws', { websocket: true }, async (socket, request) => {
    const socketId = uuidv4();
    let boardId: string | null = null;
    let userId: string | null = null;

    try {
      const url = new URL(request.url, 'http://localhost');
      boardId = url.searchParams.get('boardId');
      const token = url.searchParams.get('token');

      if (!boardId || !token) {
        socket.send(JSON.stringify({ type: 'error', message: 'Missing boardId or token' }));
        socket.close(1008, 'Missing params');
        return;
      }

      const wsUser = await verifyWsToken(token);
      userId = wsUser.id;

      // Verify board access
      const [board] = await db.select().from(boards).where(eq(boards.id, boardId));
      if (!board) {
        socket.send(JSON.stringify({ type: 'error', message: 'Board not found' }));
        socket.close(1008, 'Board not found');
        return;
      }

      if (!wsUser.isAdmin && board.groupId) {
        const [membership] = await db
          .select()
          .from(groupMembers)
          .where(
            and(
              eq(groupMembers.groupId, board.groupId),
              eq(groupMembers.userId, wsUser.id),
            ),
          );
        if (!membership) {
          socket.send(JSON.stringify({ type: 'error', message: 'Access denied' }));
          socket.close(1008, 'Access denied');
          return;
        }
      }

      // Join room and send init
      const alreadyPresent = roomManager.hasUser(boardId, wsUser.id);
      roomManager.join(boardId, socketId, {
        ws: socket,
        userId: wsUser.id,
        displayName: wsUser.displayName,
      });

      const allElements = await db.select().from(elements).where(eq(elements.boardId, boardId));
      socket.send(
        JSON.stringify({
          type: 'init',
          elements: allElements.map((el) => ({
            id: el.id,
            boardId: el.boardId,
            type: el.type,
            props: el.props,
            zIndex: el.zIndex,
            createdBy: el.createdBy,
            updatedAt: el.updatedAt.toISOString(),
          })),
          onlineUsers: roomManager.getOnlineUsers(boardId),
        }),
      );

      // Only announce if this is the user's first socket in the room
      if (!alreadyPresent) {
        roomManager.broadcast(
          boardId,
          { type: 'user_joined', user: { userId: wsUser.id, displayName: wsUser.displayName } },
          socketId,
        );
      }

      socket.on('message', async (raw: Buffer | string) => {
        try {
          const message = JSON.parse(raw.toString()) as ClientMessage;
          if (boardId && userId) {
            await handleMessage(boardId, socketId, userId, message);
          }
        } catch (err) {
          fastify.log.error(err, 'WS message error');
        }
      });

      socket.on('close', () => {
        if (boardId) {
          roomManager.leave(boardId, socketId);
          // Only announce departure if the user has no remaining sockets in the room
          if (!roomManager.hasUser(boardId, wsUser.id)) {
            roomManager.broadcast(boardId, { type: 'user_left', userId: wsUser.id });
          }
        }
      });
    } catch (err) {
      fastify.log.error(err, 'WS connection error');
      socket.send(JSON.stringify({ type: 'error', message: 'Authentication failed' }));
      socket.close(1008, 'Auth failed');
    }
  });
};

export default wsRoutes;
