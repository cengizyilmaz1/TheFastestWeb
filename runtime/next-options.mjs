// Shared build/runtime Next configuration. No environment values or secrets.
export const serverConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["puppeteer-core", "pino", "bullmq", "ioredis"],
  outputFileTracingIncludes: {
    "/*": ["./content/blog/**/*", "./node_modules/bullmq/dist/cjs/commands/**/*.lua"],
  },
};
