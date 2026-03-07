FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace files
COPY package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/backend/package.json ./packages/backend/

# Install dependencies
RUN npm install --workspace=packages/shared --workspace=packages/backend

# Build shared
COPY packages/shared ./packages/shared
RUN npm run build --workspace=packages/shared

# Build backend
COPY packages/backend ./packages/backend
RUN npm run build --workspace=packages/backend

# Run migrations and start
FROM node:20-alpine AS runner

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/
COPY --from=builder /app/packages/backend/dist ./packages/backend/dist
COPY --from=builder /app/packages/backend/drizzle ./packages/backend/drizzle
COPY --from=builder /app/packages/backend/package.json ./packages/backend/
COPY package.json ./

WORKDIR /app/packages/backend

EXPOSE 8080

CMD ["sh", "-c", "node dist/db/migrate.js && node dist/index.js"]
