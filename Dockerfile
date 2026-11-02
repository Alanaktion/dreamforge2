# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx svelte-kit sync && npm run build

# Stage 2: Production
FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache dumb-init

ENV NODE_ENV=production
ENV PORT=3000
ENV BODY_SIZE_LIMIT=20971520

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=builder /app/node_modules/better-sqlite3/build ./node_modules/better-sqlite3/build
COPY --from=builder /app/build ./build

RUN mkdir -p /data && chown node:node /data
ENV DATABASE_PATH=/data/dreamforge.db
ENV DATA_DIR=/data/projects
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
EXPOSE 3000
VOLUME ["/data"]
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "build/index.js"]
