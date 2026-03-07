import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { elements } from '../db/schema.js';
import { roomManager } from './RoomManager.js';
import type { ClientMessage, BoardElement } from '@whiteboard/shared';

function toSharedElement(row: typeof elements.$inferSelect): BoardElement {
  return {
    id: row.id,
    boardId: row.boardId,
    type: row.type as BoardElement['type'],
    props: row.props as BoardElement['props'],
    zIndex: row.zIndex,
    createdBy: row.createdBy,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function handleMessage(
  boardId: string,
  socketId: string,
  userId: string,
  message: ClientMessage,
): Promise<void> {
  switch (message.type) {
    case 'element_add':
    case 'element_update': {
      const el = message.element;
      await db
        .insert(elements)
        .values({
          id: el.id,
          boardId: el.boardId,
          type: el.type,
          props: el.props,
          zIndex: el.zIndex,
          createdBy: userId,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: elements.id,
          set: {
            type: el.type,
            props: el.props,
            zIndex: el.zIndex,
            updatedAt: new Date(),
          },
        });

      const [saved] = await db
        .select()
        .from(elements)
        .where(eq(elements.id, el.id));
      if (!saved) return;

      const serverMsg = {
        type: message.type,
        element: toSharedElement(saved),
      } as const;
      roomManager.broadcast(boardId, serverMsg);
      break;
    }

    case 'element_delete': {
      await db.delete(elements).where(eq(elements.id, message.elementId));
      roomManager.broadcast(boardId, {
        type: 'element_delete',
        elementId: message.elementId,
      });
      break;
    }

    case 'cursor_move': {
      roomManager.broadcast(
        boardId,
        {
          type: 'cursor_move',
          userId,
          x: message.x,
          y: message.y,
        },
        socketId,
      );
      break;
    }
  }
}
