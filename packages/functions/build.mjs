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
  external: [],  // すべてバンドルに含める（cold start 短縮のため node_modules も同梱）
  sourcemap: false,
  logLevel: 'info',
});
