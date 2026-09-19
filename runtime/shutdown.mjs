/**
 * @param {{
 *   server: import('node:http').Server,
 *   app: { close: () => Promise<void> },
 *   markStopping: () => void,
 *   closeResources: () => Promise<void>,
 *   log: (event: string) => void,
 *   exit?: (code: number) => void,
 *   timeoutMs?: number
 * }} options
 */
export function createShutdown(options) {
  const { server, app, markStopping, closeResources, log } = options;
  const exit = options.exit ?? ((code) => process.exit(code));
  const timeoutMs = options.timeoutMs ?? 25000;
  /** @type {Promise<void> | undefined} */
  let shutdown;
  return () => shutdown ??= (async () => {
    markStopping();
    log("runtime.stopping");
    const deadline = setTimeout(() => {
      log("runtime.shutdown_timeout");
      server.closeAllConnections();
      exit(1);
    }, timeoutMs);
    try {
      try {
        await new Promise((resolve, reject) => {
          server.close((error) => error ? reject(error) : resolve(undefined));
          server.closeIdleConnections();
        });
        await app.close();
      } finally {
        await closeResources();
      }
      log("runtime.stopped");
      clearTimeout(deadline);
      exit(0);
    } catch {
      log("runtime.shutdown_failed");
      clearTimeout(deadline);
      exit(1);
    }
  })();
}
