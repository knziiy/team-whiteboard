import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';

const cloudfrontPlugin: FastifyPluginAsync = async (fastify) => {
  const secret = process.env['CLOUDFRONT_SECRET'];
  if (!secret) return; // Skip validation in local dev

  fastify.addHook('onRequest', async (request, reply) => {
    const { url } = request;
    if (url === '/health' || url === '/api/health') return;

    const header = request.headers['x-cf-secret'];
    if (header !== secret) {
      await reply.code(403).send({ error: 'Forbidden' });
    }
  });
};

export default fp(cloudfrontPlugin, { name: 'cloudfront' });
