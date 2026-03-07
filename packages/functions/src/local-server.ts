/**
 * ローカル開発サーバー
 *
 * 起動方法:
 *   LOCAL_AUTH=true LOCAL_WS=true npm run dev:local
 *   または: npm run dev:local  (package.json のスクリプトに設定済み)
 *
 * 前提: DynamoDB Local が port 8000 で起動済み
 *   npm run dev:dynamo && npm run dev:tables
 */

// env を最初に設定（ハンドラーのモジュールロード前に必要）
process.env['LOCAL_AUTH'] = 'true';
process.env['LOCAL_WS'] = 'true';

import http from 'http';
import { URL } from 'url';
import { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';

import { handler as restHandler } from './api-rest.js';
import { handler as wsConnectHandler } from './ws-connect.js';
import { handler as wsDisconnectHandler } from './ws-disconnect.js';
import { handler as wsMessageHandler } from './ws-message.js';
import { registerLocalWs, unregisterLocalWs } from './lib/localWs.js';

const PORT = parseInt(process.env['PORT'] ?? '8080', 10);

// ─── HTTP サーバー（REST API） ─────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const rawUrl = req.url ?? '/';
  const parsedUrl = new URL(rawUrl, `http://localhost:${PORT}`);
  const rawPath = parsedUrl.pathname;

  // リクエストボディ読み取り
  const bodyChunks: Buffer[] = [];
  for await (const chunk of req) {
    bodyChunks.push(chunk as Buffer);
  }
  const body = bodyChunks.length ? Buffer.concat(bodyChunks).toString() : undefined;

  // ヘッダーをフラット化（Node.js は小文字で渡す）
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    headers[k] = Array.isArray(v) ? v.join(',') : (v ?? '');
  }

  // クエリ文字列パラメータ
  const queryStringParameters: Record<string, string> = {};
  for (const [k, v] of parsedUrl.searchParams) {
    queryStringParameters[k] = v;
  }

  // API Gateway HTTP API v2 イベント形式に変換
  const event: Parameters<typeof restHandler>[0] = {
    version: '2.0',
    routeKey: '$default',
    rawPath,
    rawQueryString: parsedUrl.search.slice(1),
    headers,
    queryStringParameters,
    body,
    isBase64Encoded: false,
    requestContext: {
      accountId: 'local',
      apiId: 'local',
      domainName: `localhost:${PORT}`,
      domainPrefix: 'localhost',
      http: {
        method: req.method?.toUpperCase() ?? 'GET',
        path: rawPath,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: headers['user-agent'] ?? '',
      },
      requestId: uuidv4(),
      routeKey: '$default',
      stage: '$default',
      time: new Date().toISOString(),
      timeEpoch: Date.now(),
    },
  } as any;

  try {
    const result = await restHandler(event, {} as any, () => undefined);
    if (!result || typeof result !== 'object' || !('statusCode' in result)) {
      res.writeHead(500);
      res.end('Handler returned no response');
      return;
    }
    res.writeHead(result.statusCode ?? 200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, content-type',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      ...(result.headers as Record<string, string> | undefined),
    });
    res.end(result.body ?? '');
  } catch (err) {
    console.error('[REST]', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
});

// ─── WebSocket サーバー ────────────────────────────────────────────────────────

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', async (ws, req) => {
  const parsedUrl = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const boardId = parsedUrl.searchParams.get('boardId') ?? '';
  const token = parsedUrl.searchParams.get('token') ?? '';
  const connectionId = uuidv4();

  // 送信関数をローカルマップに登録（broadcast 用）
  registerLocalWs(connectionId, (data) => ws.send(data));

  // $connect イベントを生成してハンドラーを呼び出す
  const connectEvent = makeWsEvent(connectionId, boardId, token);
  const connectResult = await wsConnectHandler(connectEvent as any, {} as any, () => undefined);
  if (connectResult && (connectResult as any).statusCode !== 200) {
    console.warn(`[WS] connect rejected: ${JSON.stringify(connectResult)}`);
    ws.close();
    unregisterLocalWs(connectionId);
    return;
  }

  console.log(`[WS] connected: ${connectionId} board=${boardId}`);

  ws.on('message', async (data) => {
    const messageEvent = {
      ...makeWsEvent(connectionId, boardId, token),
      body: data.toString(),
    };
    try {
      await wsMessageHandler(messageEvent as any, {} as any, () => undefined);
    } catch (err) {
      console.error('[WS] message error:', err);
    }
  });

  ws.on('close', async () => {
    unregisterLocalWs(connectionId);
    const disconnectEvent = makeWsEvent(connectionId, boardId, token);
    try {
      await wsDisconnectHandler(disconnectEvent as any, {} as any, () => undefined);
    } catch (err) {
      console.error('[WS] disconnect error:', err);
    }
    console.log(`[WS] disconnected: ${connectionId}`);
  });
});

// ─── ヘルパー ──────────────────────────────────────────────────────────────────

function makeWsEvent(connectionId: string, boardId: string, token: string) {
  return {
    requestContext: {
      connectionId,
      routeKey: '$connect',
      eventType: 'CONNECT',
      connectedAt: Date.now(),
      requestId: uuidv4(),
      apiId: 'local',
      domainName: `localhost:${PORT}`,
      stage: 'local',
    },
    queryStringParameters: { boardId, token },
    isBase64Encoded: false,
  };
}

// ─── 起動 ──────────────────────────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`\n🚀 Local server running on http://localhost:${PORT}`);
  console.log(`   REST API : http://localhost:${PORT}/api/*`);
  console.log(`   WebSocket: ws://localhost:${PORT}/ws?boardId=<id>&token=<token>`);
  console.log(`   Health   : http://localhost:${PORT}/api/health\n`);
});
