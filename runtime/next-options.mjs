// Shared build/runtime Next configuration. No environment values or secrets.
export const serverConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["puppeteer-core", "pino"],
  outputFileTracingIncludes: {
    "/*": ["./content/blog/**/*"],
  },
};
