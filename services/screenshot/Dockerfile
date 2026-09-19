# syntax=docker/dockerfile:1
# Build with repository root as context. No build arguments accept credentials.
FROM node:24.21.0-bookworm-slim AS base
WORKDIR /app

FROM base AS build
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY tsconfig.json ./
COPY src ./src
COPY services/screenshot ./services/screenshot
RUN node services/screenshot/build.mjs

FROM base AS dependencies
COPY services/screenshot/package.json services/screenshot/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

FROM base AS browser
ARG CHROME_VERSION=153.0.8010.36
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl unzip \
    && curl --fail --silent --show-error --location "https://storage.googleapis.com/chrome-for-testing-public/${CHROME_VERSION}/linux64/chrome-linux64.zip" --output /tmp/chrome.zip \
    && unzip -q /tmp/chrome.zip -d /opt/chrome && chown root:root /opt/chrome/chrome-linux64/chrome_sandbox \
    && chmod 4755 /opt/chrome/chrome-linux64/chrome_sandbox && rm /tmp/chrome.zip

FROM base AS api
ENV NODE_ENV=production TZ=UTC SCREENSHOT_PORT=3100 SCREENSHOT_WORKER_PORT=3101
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates tini \
    && rm -rf /var/lib/apt/lists/* && groupadd --system --gid 1001 screenshot \
    && useradd --system --uid 1001 --gid screenshot --home-dir /app screenshot
COPY --from=dependencies --chown=screenshot:screenshot /app/node_modules ./node_modules
COPY --from=build --chown=screenshot:screenshot /app/dist/screenshot ./dist/screenshot
COPY --chown=screenshot:screenshot services/screenshot/migrations ./services/screenshot/migrations
USER screenshot
EXPOSE 3100
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
 CMD node -e "fetch('http://127.0.0.1:3100/health/ready',{signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/screenshot/api.cjs"]

FROM api AS worker
USER root
ENV CHROMIUM_EXECUTABLE_PATH=/opt/chrome/chrome-linux64/chrome CHROME_DEVEL_SANDBOX=/opt/chrome/chrome-linux64/chrome_sandbox
RUN apt-get update && apt-get install -y --no-install-recommends fonts-liberation \
    libasound2 libatk-bridge2.0-0 libatk1.0-0 libcairo2 libcups2 libdbus-1-3 libdrm2 libgbm1 libglib2.0-0 \
    libnspr4 libnss3 libpango-1.0-0 libx11-6 libxcb1 libxcomposite1 libxdamage1 libxext6 libxfixes3 libxkbcommon0 libxrandr2 \
    && rm -rf /var/lib/apt/lists/*
COPY --from=browser /opt/chrome /opt/chrome
USER screenshot
EXPOSE 3101
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
 CMD node -e "fetch('http://127.0.0.1:3101/health/ready',{signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/screenshot/worker.cjs"]
