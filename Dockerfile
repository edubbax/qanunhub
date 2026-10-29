# Production image: builds the web app and the API server, then runs the server, which also serves the SPA.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci
COPY packages packages
COPY apps apps
COPY content/build/content.json content/build/content.json
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
ENV NODE_ENV=production PORT=8080 \
    WEB_DIST=/app/apps/web/dist MIGRATIONS_DIR=/app/apps/server/migrations CONTENT_SEED=/app/content/build/content.json
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/packages/core packages/core
COPY --from=build /app/apps/server/package.json apps/server/
COPY --from=build /app/apps/server/dist apps/server/dist
COPY --from=build /app/apps/server/migrations apps/server/migrations
COPY --from=build /app/apps/web/dist apps/web/dist
COPY --from=build /app/content/build/content.json content/build/content.json
USER node
EXPOSE 8080
CMD ["node", "apps/server/dist/index.js"]
