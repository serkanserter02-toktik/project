# Derleme bağlamı: DEPO KÖKÜ  →  docker build -f worker/Dockerfile -t brick-marathon-worker .
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY worker/package.json worker/package-lock.json* ./worker/
RUN cd worker && npm install --omit=dev --no-audit --no-fund
COPY worker ./worker
COPY api/_lib ./api/_lib
COPY src ./src
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1
CMD ["node", "worker/index.js"]
