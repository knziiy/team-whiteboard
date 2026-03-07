import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';

declare module 'fastify' {
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

const authPlugin: FastifyPluginAsync = async (fastify) => {
  const userPoolId = process.env['COGNITO_USER_POOL_ID']!;
  const region = userPoolId.split('_')[0]!;
  const issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
  const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));

  fastify.decorate('verifyJWT', async (request: FastifyRequest) => {
    const authHeader = request.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
      throw { statusCode: 401, message: 'Missing authorization header' };
    }
    const token = authHeader.slice(7);
    const { payload } = await jwtVerify(token, jwks, { issuer });

    const sub = payload['sub'] as string;
    const email = (payload['email'] as string) ?? '';
    const name =
      (payload['name'] as string) ??
      (payload['cognito:username'] as string) ??
      email;
    const cognitoGroups = (payload['cognito:groups'] as string[]) ?? [];
    const isAdminGroup = cognitoGroups.includes('Admins');

    // Upsert user in DB
    await db
      .insert(users)
      .values({ id: sub, email, displayName: name, isAdmin: isAdminGroup })
      .onConflictDoUpdate({
        target: users.id,
        set: { email, displayName: name, isAdmin: isAdminGroup },
      });

    const [user] = await db.select().from(users).where(eq(users.id, sub));
    request.user = {
      id: sub,
      email,
      displayName: name,
      isAdmin: user?.isAdmin ?? isAdminGroup,
      groups: cognitoGroups,
    };
  });

  fastify.addHook('onRequest', async (request) => {
    // Skip auth for health and public routes
    const { url } = request;
    if (url === '/health' || url === '/api/health') return;
  });
};

export default fp(authPlugin, { name: 'auth' });
