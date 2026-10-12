# Agent service image. Build context = repo root:
#   docker build -f apps/agent/Dockerfile .
# Runs as a long-lived container (Render), because `qloo mcp` is a stdio child process — not serverless.

FROM node:22-bookworm-slim AS build
WORKDIR /repo
RUN npm install --global pnpm@12.11.2
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/agent/package.json apps/agent/
RUN pnpm install --frozen-lockfile --filter @memory-lane/agent...
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/agent apps/agent
RUN pnpm --filter @memory-lane/agent build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
# The Qloo harness provides `qloo mcp`. Pinned; it reads QLOO_API_KEY from the environment.
RUN npm install --global @qloo/qloo-harness@0.1.26 && npm cache clean --force
WORKDIR /app
# dist/server.cjs is a single self-contained bundle (tsup), so no node_modules are needed here.
COPY --from=build /repo/apps/agent/dist ./dist
# SQL migrations, applied by the agent at startup (MIGRATIONS_DIR defaults to ./drizzle).
COPY --from=build /repo/apps/agent/drizzle ./drizzle
USER node
EXPOSE 8787
CMD ["node", "--enable-source-maps", "dist/server.cjs"]
