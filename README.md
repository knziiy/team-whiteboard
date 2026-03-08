# Team Whiteboards

複数ユーザーがリアルタイムで共同編集できるホワイトボードアプリケーション。

## 機能

- 付箋・矩形・円・矢印・フリーハンド描画
- WebSocket によるリアルタイム同期
- 他ユーザーのカーソル表示
- ズーム（Ctrl+ホイール）・パン（ホイール / 空白ドラッグ）
- Undo / Redo（Ctrl+Z / Ctrl+Shift+Z）
- コピー＆ペースト（Ctrl+C / Ctrl+V）
- 要素の色・フォントサイズ・テキスト色変更
- 最前面 / 最背面への移動
- グループ単位のワークスペース共有
- Amazon Cognito 認証（管理者 / 一般ユーザー）

## アーキテクチャ

```
Browser
  ├─ HTTPS  → CloudFront → S3 (React SPA)
  ├─ /api/* → CloudFront → API Gateway HTTP API → Lambda (REST)
  └─ /ws    → CloudFront → API Gateway WebSocket API → Lambda (WS)
                                    │
                              DynamoDB (6テーブル)
                                    │
                           Cognito User Pool (JWT)
```

## 技術スタック

| 領域 | 技術 |
|------|------|
| Frontend | React 18 + Vite + TypeScript |
| キャンバス | react-konva |
| UI | Tailwind CSS + shadcn/ui |
| 状態管理 | Zustand |
| Backend | AWS Lambda (Node.js 22.x) |
| WebSocket | API Gateway WebSocket API |
| REST API | API Gateway HTTP API |
| 認証 | Amazon Cognito |
| DB | Amazon DynamoDB |
| インフラ | AWS CDK v2 |
| AWSリージョン | us-east-1 |

## プロジェクト構造

```
team-whiteboards/
├── packages/
│   ├── shared/       # 共有型定義 (@whiteboard/shared)
│   ├── frontend/     # React SPA
│   └── functions/    # Lambda ハンドラー群
│       └── src/
│           ├── lib/            # DynamoDB / API GW / 認証 共通処理
│           ├── api-rest.ts     # REST API Lambda
│           ├── ws-connect.ts   # WebSocket $connect
│           ├── ws-disconnect.ts
│           └── ws-message.ts
├── docker/
│   └── docker-compose.serverless.yml  # DynamoDB Local (開発用)
├── infra/            # AWS CDK v2 スタック
├── scripts/
│   └── create-tables-local.ts         # ローカルテーブル作成スクリプト
└── package.json      # npm workspaces
```

## ローカル開発

### 前提条件

- Node.js 22+
- Docker（Rancher Desktop / Docker Desktop）

### 1. 依存関係インストール

```bash
npm install
npm run build --workspace=packages/shared
```

### 2. 環境変数設定

```bash
cp packages/frontend/.env.example packages/frontend/.env
```

`packages/frontend/.env`:
```env
VITE_AUTH_MODE=local   # Cognito を使わずローカルトークンで認証
```

Cognito を使う場合は追加:
```env
VITE_COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
VITE_COGNITO_CLIENT_ID=XXXXXXXXXXXXXXXXXXXXXXXXXX
```

### 3. DynamoDB Local 起動（初回・Docker 再起動後）

```bash
npm run dev:dynamo   # DynamoDB Local コンテナ起動（port 8000）
npm run dev:tables   # テーブル作成
```

> `-inMemory` モードのため Docker を再起動するとデータが消えます。
> 再起動後は `npm run dev:tables` を再実行してください。

### 4. バックエンド起動

```bash
npm run dev:local --workspace=packages/functions
# → http://localhost:8080 で起動
```

### 5. フロントエンド起動

```bash
npm run dev:frontend
# → http://localhost:5173
```

### ローカルログイン

`VITE_AUTH_MODE=local` の場合、ログイン画面で任意の表示名を入力してログインできます（パスワード不要）。管理者フラグも画面から切り替え可能です。

---

## AWS デプロイ

### 前提条件

- AWS CLI 設定済み（`aws configure`）
- CDK ブートストラップ済み（`npx cdk bootstrap --region us-east-1`）

### 1. ビルド

```bash
npm run build --workspace=packages/shared
npm run build --workspace=packages/frontend
```

### 2. CDK デプロイ

```bash
cd infra
npm install
npx cdk deploy --all
```

デプロイ順序: `WhiteboardAuth` → `WhiteboardData` → `WhiteboardApi` → `WhiteboardFrontend`

> **CloudFront シークレット**: CloudFront → API Gateway 間のオリジン検証シークレットは、初回デプロイ時に AWS Secrets Manager（`whiteboard/cloudfront-secret`）で自動生成・永続化されます。手動設定は不要です。

出力例:
```
WhiteboardAuth.UserPoolId         = us-east-1_XXXXXXXXX
WhiteboardAuth.UserPoolClientId   = XXXXXXXXXXXXXXXXXXXXXXXXXX
WhiteboardApi.HttpApiEndpoint     = https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com
WhiteboardApi.WsApiEndpoint       = wss://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/ws
WhiteboardFrontend.CloudFrontUrl  = https://xxxxxxxxxxxx.cloudfront.net
```

### 3. フロントエンド環境変数を更新して再デプロイ

CDK 出力の Cognito 値を `packages/frontend/.env.production` に設定後:
```bash
npm run build --workspace=packages/frontend
cd infra && npx cdk deploy WhiteboardFrontend
```

---

## 管理者設定

Cognito の `Admins` グループに追加されたユーザーは全ボードへのアクセスとグループ管理が可能です。

```bash
aws cognito-idp admin-add-user-to-group \
  --user-pool-id <UserPoolId> \
  --username <email> \
  --group-name Admins \
  --region us-east-1
```

---

## WebSocket プロトコル

接続: `wss://<host>/ws?boardId=<id>&token=<JWT>`

| 方向 | type | 説明 |
|------|------|------|
| S→C | `init` | 全要素 + オンラインユーザー一覧 |
| S→C | `element_add/update/delete` | 要素変更のブロードキャスト |
| S→C | `cursor_move` | 他ユーザーのカーソル位置 |
| S→C | `user_joined/left` | 入退室通知 |
| C→S | `request_init` | 接続確立直後に送信し `init` を要求 |
| C→S | `element_add/update/delete` | 要素操作 |
| C→S | `cursor_move` | カーソル位置（500ms スロットル） |
| C→S | `ping` | keepalive（25s 間隔） |

---

## キーボードショートカット

| ショートカット | 操作 |
|--------------|------|
| Ctrl+Z | Undo |
| Ctrl+Shift+Z | Redo |
| Ctrl+C | 選択要素をコピー |
| Ctrl+V | ペースト（+20px ずつオフセット） |
| Delete / Backspace | 選択要素を削除 |
| Ctrl+ホイール | ズーム |
| Shift+ホイール | 水平スクロール |
| Escape | 選択解除 / 編集キャンセル |
