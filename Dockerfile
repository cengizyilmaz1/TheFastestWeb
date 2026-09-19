# syntax=docker/dockerfile:1
FROM node:24.21.0-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS dependencies
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM base AS browser
# Must match the puppeteer-core version in package-lock.json.
# Browser is downloaded only while building, never while handling a request.
ARG CHROME_VERSION=153.0.8010.36
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl unzip \
    && curl --fail --show-error --silent --location \
      "https://storage.googleapis.com/chrome-for-testing-public/${CHROME_VERSION}/linux64/chrome-linux64.zip" \
      --output /tmp/chrome.zip \
    && unzip -q /tmp/chrome.zip -d /opt/chrome \
    && chown root:root /opt/chrome/chrome-linux64/chrome_sandbox \
    && chmod 4755 /opt/chrome/chrome-linux64/chrome_sandbox \
    && rm /tmp/chrome.zip

FROM dependencies AS test-runner
COPY . .
CMD ["npm", "test"]

FROM test-runner AS builder
# No ARG/ENV secrets are accepted. Build must work with an empty environment.
RUN npm run build && node runtime/prepare-standalone.mjs

FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    TZ=UTC \
    CHROMIUM_EXECUTABLE_PATH=/opt/chrome/chrome-linux64/chrome \
    CHROME_DEVEL_SANDBOX=/opt/chrome/chrome-linux64/chrome_sandbox
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates tini fonts-liberation \
      libasound2 libatk-bridge2.0-0 libatk1.0-0 libcairo2 libcups2 libdbus-1-3 \
      libdrm2 libgbm1 libglib2.0-0 libnspr4 libnss3 libpango-1.0-0 \
      libx11-6 libxcb1 libxcomposite1 libxdamage1 libxext6 libxfixes3 libxkbcommon0 libxrandr2 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 1001 nextjs \
    && useradd --system --uid 1001 --gid nextjs --home-dir /app nextjs
COPY --from=browser /opt/chrome /opt/chrome
COPY --from=builder --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nextjs /app/public ./public
USER nextjs
EXPOSE 3000
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health/live',{signal:AbortSignal.timeout(3000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "runtime/server.mjs"]
