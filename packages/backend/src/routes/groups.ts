import type { FastifyPluginAsync } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/index.js';
import { groups, groupMembers, users } from '../db/schema.js';

const groupRoutes: FastifyPluginAsync = async (fastify) => {
  // List all groups (admin) or own groups
  fastify.get('/api/groups', async (request) => {
    await (fastify as any).verifyJWT(request);
    const { user } = request;

    if (user.isAdmin) {
      return db.select().from(groups);
    }

    const memberships = await db
      .select({ groupId: groupMembers.groupId })
      .from(groupMembers)
      .where(eq(groupMembers.userId, user.id));
    const ids = memberships.map((m) => m.groupId);

    const all = await db.select().from(groups);
    return all.filter((g) => ids.includes(g.id));
  });

  // Create group (admin only)
  fastify.post<{ Body: { name: string } }>('/api/groups', async (request, reply) => {
    await (fastify as any).verifyJWT(request);
    const { user } = request;
    if (!user.isAdmin) return reply.code(403).send({ error: 'Admin only' });

    const [group] = await db
      .insert(groups)
      .values({ id: uuidv4(), name: request.body.name, createdBy: user.id })
      .returning();

    return reply.code(201).send(group);
  });

  // Delete group (admin only)
  fastify.delete<{ Params: { id: string } }>('/api/groups/:id', async (request, reply) => {
    await (fastify as any).verifyJWT(request);
    const { user } = request;
    if (!user.isAdmin) return reply.code(403).send({ error: 'Admin only' });

    await db.delete(groups).where(eq(groups.id, request.params.id));
    return reply.code(204).send();
  });

  // List group members
  fastify.get<{ Params: { id: string } }>(
    '/api/groups/:id/members',
    async (request, reply) => {
      await (fastify as any).verifyJWT(request);
      const { user } = request;
      if (!user.isAdmin) return reply.code(403).send({ error: 'Admin only' });

      const members = await db
        .select({ userId: groupMembers.userId, email: users.email, displayName: users.displayName })
        .from(groupMembers)
        .innerJoin(users, eq(users.id, groupMembers.userId))
        .where(eq(groupMembers.groupId, request.params.id));

      return members;
    },
  );

  // Add member to group (admin only)
  fastify.post<{ Params: { id: string }; Body: { userId: string } }>(
    '/api/groups/:id/members',
    async (request, reply) => {
      await (fastify as any).verifyJWT(request);
      const { user } = request;
      if (!user.isAdmin) return reply.code(403).send({ error: 'Admin only' });

      await db
        .insert(groupMembers)
        .values({ groupId: request.params.id, userId: request.body.userId })
        .onConflictDoNothing();

      return reply.code(201).send({ ok: true });
    },
  );

  // Remove member from group (admin only)
  fastify.delete<{ Params: { id: string; userId: string } }>(
    '/api/groups/:id/members/:userId',
    async (request, reply) => {
      await (fastify as any).verifyJWT(request);
      const { user } = request;
      if (!user.isAdmin) return reply.code(403).send({ error: 'Admin only' });

      await db
        .delete(groupMembers)
        .where(
          and(
            eq(groupMembers.groupId, request.params.id),
            eq(groupMembers.userId, request.params.userId),
          ),
        );

      return reply.code(204).send();
    },
  );

  // List users (admin only, for member management)
  fastify.get('/api/users', async (request, reply) => {
    await (fastify as any).verifyJWT(request);
    const { user } = request;
    if (!user.isAdmin) return reply.code(403).send({ error: 'Admin only' });

    return db.select({ id: users.id, email: users.email, displayName: users.displayName }).from(users);
  });
};

export default groupRoutes;
