// esbuild バンドルスクリプト — Lambda zip デプロイ用
import { build } from 'esbuild';

const entryPoints = [
  'src/ws-connect.ts',
  'src/ws-disconnect.ts',
  'src/ws-message.ts',
  'src/api-rest.ts',
];

await build({
  entryPoints,
  bundle: true,
  minify: true,
  platform: 'node',
  target: 'node22',
  outdir: 'dist',
  format: 'cjs',
  external: ['@aws-sdk/*'],  // Lambda ランタイムに含まれる AWS SDK は外部化
  sourcemap: false,
  logLevel: 'info',
});
