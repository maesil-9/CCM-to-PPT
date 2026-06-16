# WorshipScore AI web (styling editor). Runs the TS server via tsx (no build step;
# see ADR-011). Mount a scores volume at /app/scores.
FROM node:22-slim

RUN corepack enable
WORKDIR /app

# Install deps (workspace manifests + lockfile first for layer caching).
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
RUN pnpm install --frozen-lockfile

ENV PORT=4317 WS_HOST=0.0.0.0 WS_SCORES_DIR=/app/scores
EXPOSE 4317
VOLUME ["/app/scores"]
USER node

# Container health: the readiness probe.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4317)+'/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["pnpm", "web"]
