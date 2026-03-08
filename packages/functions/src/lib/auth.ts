import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { AuthUser } from './types.js';

const userPoolId = process.env['COGNITO_USER_POOL_ID'];
const clientId = process.env['COGNITO_CLIENT_ID'];
const localAuth = process.env['LOCAL_AUTH'] === 'true';

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let issuer = '';

if (userPoolId) {
  const region = userPoolId.split('_')[0]!;
  issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
  jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
}

/**
 * JWT トークンを検証して AuthUser を返す。
 * LOCAL_AUTH=true の場合は "local.<base64json>" 形式のトークンを受け入れる。
 */
export async function verifyToken(token: string): Promise<AuthUser> {
  // ローカル開発モード（COGNITO_USER_POOL_ID が設定されている場合は LOCAL_AUTH を無視）
  if (!jwks) {
    if (!token.startsWith('local.')) {
      throw new Error('AUTH_REQUIRED');
    }
    try {
      const decoded = JSON.parse(
        decodeURIComponent(Buffer.from(token.slice(6), 'base64').toString()),
      ) as AuthUser;
      return decoded;
    } catch {
      throw new Error('INVALID_TOKEN');
    }
  }

  // Cognito JWT 検証
  const { payload } = await jwtVerify(token, jwks, {
    issuer,
    ...(clientId ? { audience: clientId } : {}),
  });

  const sub = payload['sub'] as string;
  const email = (payload['email'] as string) ?? '';
  const displayName =
    (payload['name'] as string) ??
    (payload['cognito:username'] as string) ??
    email;
  const cognitoGroups = (payload['cognito:groups'] as string[]) ?? [];
  const isAdmin = cognitoGroups.includes('Admins');

  return { id: sub, email, displayName, isAdmin };
}

/**
 * Authorization ヘッダーからトークンを取り出して検証する。
 */
export async function verifyAuthHeader(
  authHeader: string | undefined,
): Promise<AuthUser> {
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('AUTH_REQUIRED');
  }
  return verifyToken(authHeader.slice(7));
}

/**
 * CloudFront カスタムヘッダーを検証する。
 * CLOUDFRONT_SECRET が未設定の場合はスキップ（ローカル開発用）。
 */
export function verifyCloudfrontSecret(headerValue: string | undefined): void {
  const secret = process.env['CLOUDFRONT_SECRET'];
  if (!secret) return;
  if (headerValue !== secret) {
    throw new Error('FORBIDDEN');
  }
}
