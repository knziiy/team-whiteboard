# Serverless Migration Spec
## API Gateway + Lambda + DynamoDB への移行

Version: 1.0
Status: Draft
対象ブランチ: `feature/serverless`

---

## 1. 目的・背景

現行の EC2 (t3.small) + Docker Compose + PostgreSQL 構成を、
API Gateway + Lambda + DynamoDB のサーバーレス構成に置き換える。

**目標**
- 未使用時のコストを最小化（WAF 固定費 ~$5.50/月のみ）
- 月21セッション（10人×1時間）以下の利用では EC2 より安価
- サーバー管理・パッチ適用が不要になる

---

## 2. アーキテクチャ概要

```
Browser
  │
  ├─ HTTPS  → CloudFront → S3 (React SPA)
  │
  ├─ /api/* → CloudFront → API Gateway HTTP API → Lambda (REST handlers)
  │
  └─ /ws    → CloudFront → API Gateway WebSocket API → Lambda (WS handlers)
                                    │
                              DynamoDB Tables
                                    │
                         Cognito User Pool (JWT検証)
```

CloudFront カスタムヘッダー `X-CF-Secret` による直接アクセス遮断は継続。
WAF WebACL による IP 制限も継続。

---

## 3. DynamoDB テーブル設計

### 3-1. `wb-connections`

接続中の WebSocket クライアントを管理。

| 属性 | 型 | 説明 |
|------|----|------|
| `connectionId` | S (PK) | API Gateway が付与する接続 ID |
| `boardId` | S | 接続先ボード ID |
| `userId` | S | Cognito Sub |
| `displayName` | S | 表示名 |
| `ttl` | N | Unix 秒。接続切断時に設定（+24h）。DynamoDB TTL で自動削除 |

**GSI: `boardId-index`**
- PK: `boardId`
- 用途: boardId → 接続中の全クライアント一覧取得（broadcast 用）

**Capacity**: オンデマンド
**TTL 属性**: `ttl`

---

### 3-2. `wb-elements`

ボード上の要素を管理。

| 属性 | 型 | 説明 |
|------|----|------|
| `boardId` | S (PK) | ボード ID |
| `elementId` | S (SK) | 要素 ID（クライアント生成 UUID） |
| `type` | S | `sticky` \| `rect` \| `circle` \| `arrow` \| `freehand` |
| `props` | M | 要素プロパティ（Map 型。現行 JSONB に相当） |
| `zIndex` | N | 描画順 |
| `createdBy` | S | userId |
| `updatedAt` | S | ISO 8601 文字列 |

**GSI なし**（boardId + elementId でフルアクセス可能）
**Capacity**: オンデマンド

---

### 3-3. `wb-boards`

| 属性 | 型 | 説明 |
|------|----|------|
| `boardId` | S (PK) | UUID |
| `title` | S | ボードタイトル |
| `groupId` | S | グループ ID（省略可、存在しない場合はキーなし） |
| `createdBy` | S | userId |
| `createdAt` | S | ISO 8601 |
| `updatedAt` | S | ISO 8601 |

**GSI: `createdBy-index`**
- PK: `createdBy`
- 用途: ユーザーが作成したボード一覧

**Capacity**: オンデマンド

---

### 3-4. `wb-users`

| 属性 | 型 | 説明 |
|------|----|------|
| `userId` | S (PK) | Cognito Sub |
| `email` | S | メールアドレス |
| `displayName` | S | 表示名 |
| `isAdmin` | BOOL | 管理者フラグ |
| `createdAt` | S | ISO 8601 |

**Capacity**: オンデマンド

---

### 3-5. `wb-groups`

| 属性 | 型 | 説明 |
|------|----|------|
| `groupId` | S (PK) | UUID |
| `name` | S | グループ名 |
| `createdBy` | S | userId |
| `createdAt` | S | ISO 8601 |

**Capacity**: オンデマンド

---

### 3-6. `wb-group-members`

| 属性 | 型 | 説明 |
|------|----|------|
| `groupId` | S (PK) | グループ ID |
| `userId` | S (SK) | ユーザー ID |

**GSI: `userId-index`**
- PK: `userId`
- 用途: ユーザーが所属するグループ一覧

**Capacity**: オンデマンド

---

## 4. Lambda 関数仕様

ランタイム: **Node.js 22.x**
メモリ: **256MB**（デフォルト。将来チューニング可）
タイムアウト: REST **10秒** / WebSocket **10秒**
バンドル: esbuild でシングルファイルバンドル（cold start 短縮）
環境変数: 下記「6. 環境変数」参照

---

### 4-1. WebSocket ハンドラー

#### `ws-connect` — `$connect` ルート

**トリガー**: クライアントが `wss://.../ws?boardId=<id>&token=<JWT>` に接続

**処理フロー**:
1. クエリパラメータから `boardId`・`token` を取得
2. JWT 検証（`jose` ライブラリ、Cognito JWKS または local モード）
3. `boardId` が実在するか `wb-boards` を確認（存在しなければ 403）
4. `wb-connections` に接続情報を Put
   ```
   { connectionId, boardId, userId, displayName, ttl: now+86400 }
   ```
5. `wb-elements` から該当 boardId の全要素を Query
6. `wb-connections` GSI で boardId の既存接続一覧を取得
7. 接続元に `init` メッセージを送信（Management API）
8. 既存接続のうち同一 userId がいなければ `user_joined` を broadcast
9. HTTP 200 を返す（API GW が接続を確立）

**エラー時**: HTTP 4xx を返す → API GW が接続を拒否

---

#### `ws-disconnect` — `$disconnect` ルート

**トリガー**: クライアントが切断（正常・異常どちらも）

**処理フロー**:
1. `wb-connections` から connectionId のレコードを取得（userId・boardId を得る）
2. `wb-connections` から connectionId を Delete
3. `wb-connections` GSI で boardId に残っている同一 userId の接続を確認
4. 残接続がなければ `user_left` を broadcast
5. HTTP 200 を返す

---

#### `ws-message` — `$default` ルート

**トリガー**: クライアントからメッセージ受信

**処理フロー**:
1. `wb-connections` から connectionId のレコードを取得（userId・boardId を得る）
2. メッセージの `type` に応じて処理

| type | 処理 |
|------|------|
| `element_add` / `element_update` | `wb-elements` に Put（upsert）→ broadcast |
| `element_delete` | `wb-elements` から Delete → broadcast |
| `cursor_move` | DB 書き込みなし。connections 一覧取得 → broadcast のみ |

**broadcast の実装**:
```
1. wb-connections GSI で boardId の全接続を Query
2. 自分を除く各 connectionId に Management API で POST
3. 接続切れ（GoneException）は無視して Delete
```

**cursor_move の最適化**:
Lambda の実行コンテキスト（グローバル変数）に `boardId → connectionIds[]` を
最大 2 秒キャッシュする。DynamoDB 読み取り回数を削減。

---

### 4-2. REST ハンドラー

共通処理:
- `Authorization: Bearer <token>` ヘッダーから JWT を検証
- `X-CF-Secret` ヘッダーを検証（環境変数 `CLOUDFRONT_SECRET` が設定時）
- 管理者チェック: `wb-users` の `isAdmin` を参照

---

#### `api-boards` — `/boards`

| メソッド | パス | 処理 |
|---------|------|------|
| GET | `/boards` | ユーザーがアクセス可能なボード一覧。groupId なし or 自分が所属グループのもの |
| POST | `/boards` | ボード作成。`{ title, groupId? }` → `wb-boards` に Put |
| DELETE | `/boards/{boardId}` | 管理者 or 作成者のみ。`wb-elements` も一括削除（BatchWrite） |

---

#### `api-groups` — `/groups`

| メソッド | パス | 処理 | 権限 |
|---------|------|------|------|
| GET | `/groups` | 全グループ一覧 | 管理者のみ |
| POST | `/groups` | グループ作成 | 管理者のみ |
| DELETE | `/groups/{groupId}` | グループ削除 | 管理者のみ |
| POST | `/groups/{groupId}/members` | メンバー追加 `{ userId }` | 管理者のみ |
| DELETE | `/groups/{groupId}/members/{userId}` | メンバー削除 | 管理者のみ |

---

#### `api-users` — `/users`

| メソッド | パス | 処理 | 権限 |
|---------|------|------|------|
| POST | `/users/me` | 初回ログイン時にユーザー情報を upsert | 本人 |
| GET | `/users` | ユーザー一覧（グループ管理画面用） | 管理者のみ |

**Cognito PostConfirmation トリガーは使用しない**。
フロントエンドがログイン後に `POST /users/me` を呼び出してユーザー情報を登録する。

---

#### `api-health` — `/health`

| メソッド | パス | 処理 |
|---------|------|------|
| GET | `/health` | `{ status: "ok" }` を返す。認証なし |

---

## 5. API Gateway 設定

### 5-1. HTTP API（REST 用）

- プロトコル: HTTP API（REST API より安価・低レイテンシ）
- ルート: `ANY /{proxy+}` → Lambda 関数 URL またはルート別 Lambda
- CORS: CloudFront ドメインのみ許可
- ステージ: `$default`（ステージプレフィックスなし）

### 5-2. WebSocket API

- ルート選択式: `$request.body.type`
- ルート:
  - `$connect` → `ws-connect` Lambda
  - `$disconnect` → `ws-disconnect` Lambda
  - `$default` → `ws-message` Lambda
- ステージ: `prod`
- Management API エンドポイント: Lambda の環境変数 `WS_ENDPOINT` に設定

---

## 6. 環境変数

Lambda 関数共通（SSM Parameter Store から取得、CDK で注入）:

| 変数名 | 説明 |
|--------|------|
| `COGNITO_USER_POOL_ID` | Cognito User Pool ID |
| `COGNITO_CLIENT_ID` | Cognito App Client ID |
| `CLOUDFRONT_SECRET` | CloudFront カスタムヘッダー検証値（省略時スキップ） |
| `WS_ENDPOINT` | WebSocket Management API エンドポイント（ws-* Lambda のみ） |
| `LOCAL_AUTH` | `"true"` の場合 Cognito 検証をスキップしローカル token を受け入れる |
| `TABLE_CONNECTIONS` | DynamoDB テーブル名 |
| `TABLE_ELEMENTS` | DynamoDB テーブル名 |
| `TABLE_BOARDS` | DynamoDB テーブル名 |
| `TABLE_USERS` | DynamoDB テーブル名 |
| `TABLE_GROUPS` | DynamoDB テーブル名 |
| `TABLE_GROUP_MEMBERS` | DynamoDB テーブル名 |

---

## 7. CDK スタック再構成

### 削除するスタック

| スタック | 理由 |
|---------|------|
| `WhiteboardNetwork` | VPC 不要 |
| `WhiteboardCompute` | EC2 不要 |

### 変更するスタック

#### `WhiteboardAuth`（変更なし）
Cognito User Pool・クライアント設定は流用。

#### `WhiteboardFrontend`（変更あり）
CloudFront のオリジン変更:
- 旧: `/api/*`, `/ws` → EC2 Elastic IP
- 新: `/api/*` → HTTP API Gateway エンドポイント
- 新: `/ws` → WebSocket API Gateway エンドポイント

#### `WhiteboardWaf`（変更なし）
WebACL・IPSet はそのまま流用。

### 新設するスタック

#### `WhiteboardData`
- DynamoDB テーブル 6 本（上記 3. の定義通り）
- GSI・TTL 設定
- Lambda に付与する IAM ポリシー（テーブル別 CRUD 権限）

#### `WhiteboardApi`
- Lambda 関数 5 本（ws-connect, ws-disconnect, ws-message, api-rest, api-health）
- HTTP API Gateway + ルーティング
- WebSocket API Gateway + ルーティング
- Lambda 実行ロール（DynamoDB・Management API・CloudWatch Logs）
- SSM パラメータ参照権限

### デプロイ順序
```
WhiteboardAuth → WhiteboardData → WhiteboardApi → WhiteboardFrontend → WhiteboardWaf
```

---

## 8. パッケージ構成

```
team-whiteboards/
├── packages/
│   ├── shared/              # 変更なし
│   ├── frontend/            # 最小限の変更（後述）
│   └── functions/           # 新規（旧 backend を置き換え）
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── lib/
│           │   ├── dynamo.ts        # DynamoDB クライアント・共通操作
│           │   ├── apigw.ts         # Management API クライアント
│           │   ├── auth.ts          # JWT 検証（jose, local mode 共用）
│           │   └── types.ts         # Lambda イベント型など
│           ├── ws-connect.ts
│           ├── ws-disconnect.ts
│           ├── ws-message.ts
│           └── api-rest.ts          # HTTP API の全ルートをまとめて処理
├── infra/
│   └── lib/stacks/
│       ├── auth-stack.ts            # 変更なし
│       ├── data-stack.ts            # 新規
│       ├── api-stack.ts             # 新規
│       ├── frontend-stack.ts        # 変更あり
│       └── waf-stack.ts             # 変更なし
└── docker/                          # 不要になるが削除は後回し
```

---

## 9. フロントエンド変更点

### 9-1. カーソルスロットル変更
`packages/frontend/src/pages/Board.tsx`

```diff
- if (now - lastCursorSend.current > 30) {
+ if (now - lastCursorSend.current > 500) {
```

### 9-2. ユーザー登録処理追加
ログイン成功後に `POST /users/me` を呼び出してユーザー情報をDynamoDBに登録する。
`packages/frontend/src/hooks/useAuth.ts` のログイン後処理に追加。

### 9-3. 環境変数
`.env` / `.env.production` に以下を追加:

```
VITE_API_URL=https://<cloudfront-domain>
VITE_WS_URL=wss://<cloudfront-domain>
```

WebSocket 接続先は `/ws` → CloudFront → API GW WebSocket にルーティングされる。
（既存の `useWebSocket.ts` のロジック変更なし）

---

## 10. ローカル開発環境

移行後もローカルで動作できるよう、以下の構成を維持する。

### オプション A: SAM Local（推奨）
```bash
cd packages/functions && npm run build
sam local start-api          # REST API をローカルで起動
sam local start-lambda       # WebSocket handler をローカルで起動（別途 wscat でテスト）
```
`template.yaml`（SAM テンプレート）を `packages/functions/` に追加する。

### オプション B: ローカルモード継続（暫定）
`LOCAL_AUTH=true` 設定時は DynamoDB Local（Docker）+ `sam local` で動作させる。
`docker/docker-compose.yml` に `dynamodb-local` サービスを追加。

```yaml
dynamodb-local:
  image: amazon/dynamodb-local:latest
  ports:
    - "8000:8000"
  command: ["-jar", "DynamoDBLocal.jar", "-inMemory"]
```

初回起動時にテーブル作成スクリプト（`scripts/create-tables-local.ts`）を実行。

---

## 11. 移行ステップ（実装順序）

### Step 1: `packages/functions` 雛形作成
- package.json（`@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`, `@aws-sdk/client-apigatewaymanagementapi`, `jose`）
- tsconfig.json
- esbuild バンドル設定
- `lib/auth.ts`（JWT 検証。既存 backend の auth plugin を移植）

### Step 2: REST ハンドラー実装
- `lib/dynamo.ts`（DynamoDB DocumentClient ラッパー）
- `api-rest.ts`（boards / groups / users / health）
- ローカルで SAM または DynamoDB Local でテスト

### Step 3: WebSocket ハンドラー実装
- `lib/apigw.ts`（Management API broadcast 関数）
- `ws-connect.ts`
- `ws-disconnect.ts`
- `ws-message.ts`
- ローカルで SAM + wscat でテスト

### Step 4: CDK スタック実装
- `WhiteboardData` スタック（DynamoDB テーブル）
- `WhiteboardApi` スタック（Lambda + API GW）
- `WhiteboardFrontend` スタック更新（オリジン変更）

### Step 5: フロントエンド修正
- カーソルスロットル 500ms に変更
- `POST /users/me` 呼び出し追加
- 環境変数更新

### Step 6: E2E テスト・デプロイ
- 2 ブラウザでリアルタイム同期確認
- カーソル表示確認
- Undo/Redo 確認
- `cdk deploy --all`

---

## 12. 廃止するもの

| 廃止対象 | 代替 |
|---------|------|
| `packages/backend/` | `packages/functions/` |
| `docker/docker-compose.yml` の backend サービス | SAM Local / DynamoDB Local |
| `docker/backend/Dockerfile` | Lambda コンテナイメージ不要（zip デプロイ） |
| Drizzle ORM・PostgreSQL | AWS SDK v3 DynamoDB DocumentClient |
| Fastify | Lambda ハンドラー（フレームワークなし） |
| EC2・Elastic IP | 不要 |
| VPC・サブネット | 不要 |

---

## 13. 非機能要件

| 項目 | 目標値 |
|------|--------|
| Lambda cold start（WebSocket $connect） | < 1.5 秒（esbuild + 256MB） |
| REST API レスポンス（warm） | < 200ms |
| WebSocket ブロードキャスト遅延（warm） | < 150ms |
| DynamoDB 読み書き整合性 | 結果整合性（コスト優先）。element 書き込みは強整合性 |
| 同時接続数 | Lambda 同時実行数デフォルト（1,000）で十分 |

---

## 14. 決定事項

1. **グループ非メンバーのボードアクセス制御**: `groupId` がないボードは**管理者のみ**アクセス可。一般ユーザーは自分が所属するグループのボードのみ閲覧可能。

2. **ボード削除時の elements 一括削除**: `BatchWriteItem`（最大25件/バッチ）を繰り返して全要素を明示削除する。

3. **既存データ移行**: 行わない。DynamoDB は新規データのみで運用開始。

4. **CloudFront + WebSocket**: CloudFront オリジンには `https://` で API GW WebSocket エンドポイントを設定し、CloudFront が WebSocket Upgrade を中継する構成を採用。
