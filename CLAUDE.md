# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Language

ユーザーとのやり取りは常に日本語で行う。
## Build & Dev Commands

```bash
# Install dependencies (from root)
npm install

# Build shared types (must run first - other packages depend on it)
npm run build --workspace=packages/shared

# Build frontend
npm run build --workspace=packages/frontend

# Build Lambda functions (esbuild)
npm run build --workspace=packages/functions

# Local development
npm run dev:dynamo          # Start DynamoDB Local (Docker, port 8000, in-memory)
npm run dev:tables          # Create local DynamoDB tables (re-run after Docker restart)
npm run dev:local --workspace=packages/functions  # Backend on :8080
npm run dev:frontend        # Frontend on :5173 (Vite, proxies /api and /ws to :8080)

# Type checking
npm run typecheck --workspace=packages/functions  # tsc --noEmit

# CDK deploy (env=dev by default, use -c env=prod for production)
cd infra && npx cdk deploy --all -c env=dev
```

DynamoDB Local uses `-inMemory` mode: data is lost on container restart. Re-run `npm run dev:tables` after restart.

## Architecture

Serverless collaborative whiteboard app. npm workspaces monorepo.

```
Browser (React SPA)
  ├─ HTTPS  → CloudFront → S3
  ├─ /api/* → CloudFront → API Gateway HTTP API → Lambda (api-rest.ts)
  └─ /ws    → CloudFront → API Gateway WebSocket API → Lambda (ws-*.ts)
                                    │
                              DynamoDB (6 tables)
                                    │
                           Cognito User Pool (JWT)
```

### Packages

- **`packages/shared`** — Shared TypeScript types (`BoardElement`, `ServerMessage`, `ClientMessage`). ESM. Must be built before other packages.
- **`packages/functions`** — Lambda handlers. CommonJS. Imports from `@whiteboard/shared` are type-only (esbuild strips them).
  - `api-rest.ts` — Single Lambda handling all REST routes via path matching
  - `ws-connect.ts` / `ws-disconnect.ts` / `ws-message.ts` — WebSocket lifecycle handlers
  - `lib/dynamo.ts` — DynamoDB operations for all 6 tables
  - `lib/apigw.ts` — Management API for sending messages to WebSocket clients
  - `lib/auth.ts` — Cognito JWT verification (via `jose`) + local dev token support
  - `local-server.ts` — Node.js HTTP+WS server wrapping Lambda handlers for local dev
- **`packages/frontend`** — React 18 + Vite + TypeScript + Tailwind CSS + react-konva + Zustand
  - `store/boardStore.ts` — Global Zustand store for board elements, cursors, online users, undo/redo
  - `hooks/useWebSocket.ts` — WebSocket connection with auto-reconnect and keepalive ping
  - `hooks/useAuth.ts` — Auth context provider (Cognito mode + local dev mode)
  - `pages/Board.tsx` — Main canvas page (Konva Stage, keyboard shortcuts, tool handling)
  - `api/client.ts` — REST API client
- **`infra`** — AWS CDK v2 stacks

### CDK Stacks (deploy order)

Environment-aware: `-c env=dev` (default) or `-c env=prod`. Stack names and resource names include the env prefix.

1. `Whiteboard-{Env}-Auth` — Cognito UserPool + "Admins" group + client
2. `Whiteboard-{Env}-Data` — 6 DynamoDB tables (PAY_PER_REQUEST, all DESTROY) + Secrets Manager
3. `Whiteboard-{Env}-Api` — 4 Lambda functions (NodejsFunction) + HTTP API GW + WebSocket API GW
4. `Whiteboard-{Env}-Frontend` — S3 + CloudFront (S3 origin + API GW origins)

### DynamoDB Tables

Table names are prefixed with `wb-{env}-` (e.g., `wb-dev-boards`, `wb-prod-boards`).

- `wb-{env}-connections` (PK: connectionId, GSI: boardId-index, TTL)
- `wb-{env}-elements` (PK: boardId, SK: elementId)
- `wb-{env}-boards` (PK: boardId)
- `wb-{env}-users` (PK: userId)
- `wb-{env}-groups` (PK: groupId)
- `wb-{env}-group-members` (PK: groupId, SK: userId, GSI: userId-index)

### WebSocket Protocol

Connection: `/ws?boardId=<id>&token=<JWT>`

Server→Client: `init`, `element_add`, `element_update`, `element_delete`, `cursor_move`, `user_joined`, `user_left`
Client→Server: `element_add`, `element_update`, `element_delete`, `cursor_move`, `ping`

LWW conflict resolution. Optimistic UI with client-generated UUIDs. Cursor throttle: 500ms.

### Key Patterns

- **Local auth mode**: `VITE_AUTH_MODE=local` in frontend `.env`. Tokens are `local.<base64json>`. Backend checks `LOCAL_AUTH=true` env var to accept these tokens.
- **Runtime config**: Cognito UserPoolId/ClientId は CDK が `/config.json` として S3 に自動デプロイ。フロントエンドはランタイムで fetch する。`VITE_COGNITO_*` 環境変数は不要。
- **CloudFront security**: `X-CF-Secret` custom header added by CloudFront, validated by `api-rest.ts`. Skipped when `CLOUDFRONT_SECRET` env var is unset (local dev).
- **Lambda bundling**: `NodejsFunction` with esbuild. `@aws-sdk/*` externalized (provided by Node.js 22 Lambda runtime).
- **WebSocket stage name**: `ws` — matches CloudFront `/ws` behavior path without origin path rewrite.
- **Board element display**: Elements are fetched both via REST API (`GET /api/boards/:id/elements`) on mount and via WebSocket `init` message. REST serves as fallback if WebSocket init is delayed.
