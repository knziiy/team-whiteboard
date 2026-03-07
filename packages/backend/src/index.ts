import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyCors from '@fastify/cors';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { eq } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { db } from './db/index.js';
import { users } from './db/schema.js';
import cloudfrontPlugin from './plugins/cloudfront.js';
import boardRoutes from './routes/boards.js';
import groupRoutes from './routes/groups.js';
import wsRoutes from './routes/ws.js';

declare module 'fastify' {
  interface FastifyInstance {
    verifyJWT: (request: FastifyRequest) => Promise<void>;
  }
  interface FastifyRequest {
    user: {
      id: string;
      email: string;
      displayName: string;
      isAdmin: boolean;
      groups: string[];
    };
  }
}

const fastify = Fastify({ logger: true });

// CORS
await fastify.register(fastifyCors, {
  origin: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});

// WebSocket support
await fastify.register(fastifyWebsocket);

// CloudFront header validation
await fastify.register(cloudfrontPlugin);

// Setup JWT verifier
const userPoolId = process.env['COGNITO_USER_POOL_ID'];
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let issuer = '';

if (userPoolId) {
  const region = userPoolId.split('_')[0]!;
  issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
  jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
}

fastify.decorate('verifyJWT', async (request: FastifyRequest): Promise<void> => {
  const authHeader = request.headers['authorization'];
  if (!authHeader?.startsWith('Bearer ')) {
    throw Object.assign(new Error('Missing authorization header'), { statusCode: 401 });
  }
  const token = authHeader.slice(7);

  // Local dev mode: accept "local.<base64json>" tokens when Cognito is not configured
  if (!jwks) {
    if (!token.startsWith('local.')) {
      throw Object.assign(new Error('Auth not configured'), { statusCode: 500 });
    }
    let parsed: { id: string; email: string; displayName: string; isAdmin: boolean };
    try {
      parsed = JSON.parse(decodeURIComponent(Buffer.from(token.slice(6), 'base64').toString()));
    } catch {
      throw Object.assign(new Error('Invalid local token'), { statusCode: 401 });
    }
    await db
      .insert(users)
      .values({ id: parsed.id, email: parsed.email, displayName: parsed.displayName, isAdmin: parsed.isAdmin })
      .onConflictDoUpdate({
        target: users.id,
        set: { email: parsed.email, displayName: parsed.displayName, isAdmin: parsed.isAdmin },
      });
    request.user = { ...parsed, groups: parsed.isAdmin ? ['Admins'] : [] };
    return;
  }

  // Production: Cognito JWT verification
  const { payload } = await jwtVerify(token, jwks, { issuer });

  const sub = payload['sub'] as string;
  const email = (payload['email'] as string) ?? '';
  const name =
    (payload['name'] as string) ??
    (payload['cognito:username'] as string) ??
    email;
  const cognitoGroups = (payload['cognito:groups'] as string[]) ?? [];
  const isAdminGroup = cognitoGroups.includes('Admins');

  await db
    .insert(users)
    .values({ id: sub, email, displayName: name, isAdmin: isAdminGroup })
    .onConflictDoUpdate({
      target: users.id,
      set: { email, displayName: name, isAdmin: isAdminGroup },
    });

  request.user = {
    id: sub,
    email,
    displayName: name,
    isAdmin: isAdminGroup,
    groups: cognitoGroups,
  };
});

// Health check
fastify.get('/health', async () => ({ status: 'ok' }));
fastify.get('/api/health', async () => ({ status: 'ok' }));

// Routes
await fastify.register(boardRoutes);
await fastify.register(groupRoutes);
await fastify.register(wsRoutes);

const port = parseInt(process.env['PORT'] ?? '8080', 10);
await fastify.listen({ port, host: '0.0.0.0' });
