# Team Whiteboards

複数ユーザーがリアルタイムで共同編集できるホワイトボードアプリケーション。

## 機能

- 付箋・矩形・円・矢印・フリーハンド描画
- WebSocketによるリアルタイム同期
- 他ユーザーのカーソル表示
- グループ単位のワークスペース共有
- Amazon Cognito認証（管理者/一般ユーザー）

## アーキテクチャ

```
Internet → WAF (IP制限) → CloudFront
                             ├─ /api/*, /ws → EC2:8080 (Fastify + WebSocket)
                             └─ default     → S3 (React SPA)

EC2 (Docker Compose)
  ├─ backend:8080
  └─ postgres:5432
```

## 技術スタック

| 領域 | 技術 |
|------|------|
| Frontend | React 18 + Vite + TypeScript |
| キャンバス | react-konva |
| UI | Tailwind CSS |
| 状態管理 | Zustand |
| Backend | Fastify + TypeScript |
| WebSocket | @fastify/websocket |
| ORM | Drizzle ORM |
| 認証 | Amazon Cognito |
| DB | PostgreSQL 15 |
| インフラ | EC2 + Docker Compose + CDK v2 |

## プロジェクト構造

```
team-whiteboards/
├── packages/
│   ├── shared/      # 共有型定義 (@whiteboard/shared)
│   ├── frontend/    # React SPA
│   └── backend/     # Fastify サーバー
├── docker/          # docker-compose.yml + Dockerfile
├── infra/           # AWS CDK v2 スタック
└── package.json     # npm workspaces
```

## ローカル開発

### 前提条件

- Node.js 20+
- Docker + Docker Compose
- AWS アカウント（Cognito 設定用）

### 1. 依存関係インストール

```bash
npm install
```

### 2. 環境変数設定

```bash
cp packages/frontend/.env.example packages/frontend/.env
cp docker/.env.example docker/.env
```

`packages/frontend/.env`:
```env
VITE_COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
VITE_COGNITO_CLIENT_ID=XXXXXXXXXXXXXXXXXXXXXXXXXX
```

`docker/.env`:
```env
DB_PASSWORD=your-secure-password
COGNITO_USER_POOL_ID=us-east-1_XXXXXXXXX
COGNITO_CLIENT_ID=XXXXXXXXXXXXXXXXXXXXXXXXXX
CLOUDFRONT_SECRET=   # ローカルでは空白でOK（検証スキップ）
```

### 3. DBマイグレーションファイル生成

```bash
npm run generate --workspace=packages/backend
```

### 4. バックエンド起動（Docker Compose）

```bash
cd docker
docker compose up -d
```

バックエンドは `http://localhost:8080` で起動。

### 5. フロントエンド開発サーバー起動

```bash
npm run dev:frontend
```

ブラウザで `http://localhost:5173` を開く。

## AWSデプロイ

### 前提条件

- AWS CLI 設定済み（`aws configure`）
- CDK ブートストラップ済み（`npx cdk bootstrap`）

### 1. フロントエンドビルド

```bash
npm run build --workspace=packages/shared
npm run build --workspace=packages/frontend
```

### 2. CloudFront シークレット設定

```bash
export CLOUDFRONT_SECRET=$(openssl rand -hex 32)
```

### 3. CDK デプロイ

```bash
cd infra
npm install
npx cdk deploy --all
```

スタック順: `WhiteboardNetwork` → `WhiteboardAuth` → `WhiteboardCompute` → `WhiteboardFrontend` → `WhiteboardWaf`

出力例:
```
WhiteboardAuth.UserPoolId        = us-east-1_XXXXXXXXX
WhiteboardAuth.UserPoolClientId  = XXXXXXXXXXXXXXXXXXXXXXXXXX
WhiteboardCompute.PublicIp       = x.x.x.x
WhiteboardFrontend.CloudFrontUrl = https://xxxx.cloudfront.net
```

### 4. EC2 へのアプリケーションデプロイ

```bash
# docker/ ディレクトリを EC2 に転送
scp -r docker/ ec2-user@<EC2-IP>:/opt/whiteboard/

# SSM Parameter Store のパスワードを更新（初回）
aws ssm put-parameter \
  --name /whiteboard/db-password \
  --value "your-secure-password" \
  --overwrite

# EC2 上で実行
ssh ec2-user@<EC2-IP>
cd /opt/whiteboard
# .env を作成（UserData で自動生成されているはず）
docker compose up -d --build
```

### 5. WAF IP 制限の設定

`infra/cdk.json` の `allowedCidrs` を編集:
```json
{
  "context": {
    "allowedCidrs": ["203.0.113.0/24", "198.51.100.1/32"]
  }
}
```

再デプロイ:
```bash
cd infra && npx cdk deploy WhiteboardWaf
```

## 動作確認

```bash
# ヘルスチェック
curl https://<cloudfront-url>/api/health

# E2E テスト
# 1. 2つのブラウザで同じボードを開く
# 2. 一方で付箋を追加 → 他方にリアルタイム反映を確認
# 3. カーソル移動が相手に見えることを確認
```

## WebSocket プロトコル

接続: `wss://<host>/ws?boardId=<id>&token=<JWT>`

| 方向 | メッセージ | 説明 |
|------|-----------|------|
| S→C | `init` | 接続時の全要素 + オンラインユーザー |
| S→C | `element_add/update/delete` | 要素変更のブロードキャスト |
| S→C | `cursor_move` | 他ユーザーのカーソル位置 |
| S→C | `user_joined/left` | 入退室通知 |
| C→S | `element_add/update/delete` | 要素操作 |
| C→S | `cursor_move` | カーソル位置（30ms スロットル） |

## 管理者機能

Cognito の `Admins` グループに追加されたユーザーは:
- 全ボードへのアクセス
- グループの作成・削除
- グループメンバーの追加・削除

Cognito コンソールまたは CLI でユーザーをグループに追加:
```bash
aws cognito-idp admin-add-user-to-group \
  --user-pool-id <UserPoolId> \
  --username <email> \
  --group-name Admins
```
