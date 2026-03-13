.PHONY: install build build-shared build-frontend build-functions typecheck \
       dev dev-frontend dev-backend dev-dynamo dev-tables \
       deploy clean help

# ─── セットアップ ─────────────────────────────────────────────────────────────

## 依存パッケージをインストール
install:
	npm install

# ─── ビルド ───────────────────────────────────────────────────────────────────

## 全パッケージをビルド（shared → frontend + functions）
build: build-shared build-frontend build-functions

## shared パッケージをビルド（他パッケージの前提）
build-shared:
	npm run build --workspace=packages/shared

## フロントエンドをビルド
build-frontend: build-shared
	npm run build --workspace=packages/frontend

## Lambda 関数をビルド
build-functions: build-shared
	npm run build --workspace=packages/functions

## 全パッケージの型チェック
typecheck: build-shared
	npm run typecheck --workspace=packages/functions
	cd infra && npx tsc --noEmit

# ─── ローカル開発 ─────────────────────────────────────────────────────────────

## DynamoDB Local + テーブル作成 + バックエンド + フロントエンドを起動
dev: dev-dynamo dev-tables dev-backend dev-frontend

## フロントエンド開発サーバーを起動（:5173）
dev-frontend:
	npm run dev --workspace=packages/frontend

## バックエンド開発サーバーを起動（:8080）
dev-backend:
	npm run dev:local --workspace=packages/functions

## DynamoDB Local を起動（Docker, :8000, in-memory）
dev-dynamo:
	docker compose -f docker/docker-compose.serverless.yml up -d

## DynamoDB Local にテーブルを作成（Docker 再起動後に再実行が必要）
dev-tables:
	npx tsx scripts/create-tables-local.ts

# ─── デプロイ ─────────────────────────────────────────────────────────────────

## CDK デプロイ（dev 環境）
deploy:
	cd infra && npx cdk deploy --all -c env=dev

## CDK デプロイ（prod 環境）
deploy-prod:
	cd infra && npx cdk deploy --all -c env=prod

# ─── ユーティリティ ───────────────────────────────────────────────────────────

## ビルド成果物を削除
clean:
	rm -rf packages/shared/dist
	rm -rf packages/frontend/dist
	rm -rf packages/functions/dist

## このヘルプを表示
help:
	@echo "使用可能なターゲット:"
	@echo ""
	@grep -E '^## ' $(MAKEFILE_LIST) | sed 's/^## //' | while IFS= read -r line; do echo "  $$line"; done
	@echo ""
	@echo "ターゲット一覧:"
	@grep -E '^[a-zA-Z_-]+:' $(MAKEFILE_LIST) | grep -v '^\.' | sed 's/:.*//' | sort | while read -r t; do printf "  make %-20s\n" "$$t"; done
