// Shared build/runtime Next configuration. No environment values or secrets.
export const serverConfig = {
  poweredByHeader: false,
  // Keep Flight/prefetch headers visible to Proxy so background navigation
  // never increments redirect or crawler counters. Routing responses stay equal.
  skipProxyUrlNormalize: true,
  experimental: { optimizePackageImports: ["@phosphor-icons/react", "@phosphor-icons/react/dist/ssr"] },
  serverExternalPackages: ["puppeteer-core", "pino", "bullmq", "ioredis"],
  outputFileTracingIncludes: {
    "/*": ["./content/blog/**/*", "./node_modules/bullmq/dist/cjs/commands/**/*.lua"],
  },
};
