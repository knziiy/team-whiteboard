import type { FastifyPluginAsync } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/index.js';
import { boards, groupMembers, elements } from '../db/schema.js';

const boardRoutes: FastifyPluginAsync = async (fastify) => {
  // List boards accessible to current user
  fastify.get('/api/boards', async (request, reply) => {
    await (fastify as any).verifyJWT(request);
    const { user } = request;

    if (user.isAdmin) {
      const all = await db.select().from(boards);
      return all;
    }

    // Get boards for groups user belongs to, plus personal boards
    const memberships = await db
      .select({ groupId: groupMembers.groupId })
      .from(groupMembers)
      .where(eq(groupMembers.userId, user.id));

    const groupIds = memberships.map((m) => m.groupId);

    const all = await db.select().from(boards);
    const accessible = all.filter(
      (b) =>
        b.createdBy === user.id ||
        b.groupId === null ||
        (b.groupId && groupIds.includes(b.groupId)),
    );
    return accessible;
  });

  // Get single board
  fastify.get<{ Params: { id: string } }>('/api/boards/:id', async (request, reply) => {
    await (fastify as any).verifyJWT(request);
    const { user } = request;
    const [board] = await db
      .select()
      .from(boards)
      .where(eq(boards.id, request.params.id));

    if (!board) return reply.code(404).send({ error: 'Not found' });

    if (!user.isAdmin && board.groupId) {
      const [member] = await db
        .select()
        .from(groupMembers)
        .where(
          and(
            eq(groupMembers.groupId, board.groupId),
            eq(groupMembers.userId, user.id),
          ),
        );
      if (!member) return reply.code(403).send({ error: 'Forbidden' });
    }

    return board;
  });

  // Create board
  fastify.post<{ Body: { title: string; groupId?: string } }>(
    '/api/boards',
    async (request, reply) => {
      await (fastify as any).verifyJWT(request);
      const { user } = request;
      const { title, groupId } = request.body;

      const [board] = await db
        .insert(boards)
        .values({
          id: uuidv4(),
          title,
          groupId: groupId ?? null,
          createdBy: user.id,
        })
        .returning();

      return reply.code(201).send(board);
    },
  );

  // Update board title
  fastify.patch<{ Params: { id: string }; Body: { title?: string } }>(
    '/api/boards/:id',
    async (request, reply) => {
      await (fastify as any).verifyJWT(request);
      const { user } = request;
      const [board] = await db
        .select()
        .from(boards)
        .where(eq(boards.id, request.params.id));

      if (!board) return reply.code(404).send({ error: 'Not found' });
      if (!user.isAdmin && board.createdBy !== user.id)
        return reply.code(403).send({ error: 'Forbidden' });

      const [updated] = await db
        .update(boards)
        .set({ title: request.body.title ?? board.title, updatedAt: new Date() })
        .where(eq(boards.id, request.params.id))
        .returning();

      return updated;
    },
  );

  // Delete board
  fastify.delete<{ Params: { id: string } }>(
    '/api/boards/:id',
    async (request, reply) => {
      await (fastify as any).verifyJWT(request);
      const { user } = request;
      const [board] = await db
        .select()
        .from(boards)
        .where(eq(boards.id, request.params.id));

      if (!board) return reply.code(404).send({ error: 'Not found' });
      if (!user.isAdmin && board.createdBy !== user.id)
        return reply.code(403).send({ error: 'Forbidden' });

      await db.delete(boards).where(eq(boards.id, request.params.id));
      return reply.code(204).send();
    },
  );

  // Get elements for a board
  fastify.get<{ Params: { id: string } }>(
    '/api/boards/:id/elements',
    async (request, reply) => {
      await (fastify as any).verifyJWT(request);
      const els = await db
        .select()
        .from(elements)
        .where(eq(elements.boardId, request.params.id));
      return els;
    },
  );
};

export default boardRoutes;
