/**
 * ランタイムコンフィグ
 * 本番環境: CDK が S3 にデプロイした /config.json から取得
 * ローカル開発: VITE_AUTH_MODE=local の場合は不要
 */

interface RuntimeConfig {
  cognitoUserPoolId: string;
  cognitoClientId: string;
}

let cached: RuntimeConfig | null = null;

export async function getRuntimeConfig(): Promise<RuntimeConfig> {
  if (cached) return cached;

  const res = await fetch('/config.json');
  if (!res.ok) {
    throw new Error('Failed to load /config.json. Ensure CDK deploy has completed.');
  }
  cached = (await res.json()) as RuntimeConfig;
  return cached;
}
