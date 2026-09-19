import { createServer, request as httpRequest, type IncomingHttpHeaders } from "node:http";
import { connect, type Socket } from "node:net";
import { type AddressResolver, parsePublicHttpUrl, resolvePublicTarget } from "@/lib/security/public-url";
import { pinnedRequestOptions } from "@/lib/security/safe-fetch";

const CONNECTION_BYTE_LIMIT = 8 * 1024 * 1024;
const SESSION_BYTE_LIMIT = 24 * 1024 * 1024;
const CONNECTION_LIMIT = 80;
const REQUEST_TIMEOUT_MS = 15_000;

export function parseConnectAuthority(authority: string): URL {
  // CONNECT is a tunnel to a single public TLS endpoint, never an arbitrary port.
  if (!/^(?:[a-z\d.-]+|\[[a-f\d:]+\]):443$/i.test(authority)) {
    throw new Error("Invalid CONNECT target.");
  }
  return parsePublicHttpUrl(`https://${authority}`);
}

function stripHopHeaders(headers: IncomingHttpHeaders): IncomingHttpHeaders {
  const result = { ...headers };
  const connectionHeaders = (result.connection ?? "").split(",");
  for (const header of [
    ...connectionHeaders, "connection", "keep-alive", "proxy-authenticate",
    "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade",
  ]) delete result[header.trim().toLowerCase()];
  return result;
}

/** Each browser receives its own short-lived loopback proxy and traffic budget. */
export async function createBrowserEgressProxy(options: { resolver?: AddressResolver } = {}) {
  const sockets = new Set<Socket>();
  let closed = false;
  let connectionCount = 0;
  let totalBytes = 0;
  const sessionController = new AbortController();

  function track(socket: Socket) {
    sockets.add(socket);
    socket.setTimeout(REQUEST_TIMEOUT_MS, () => socket.destroy());
    socket.on("error", () => socket.destroy());
    socket.once("close", () => sockets.delete(socket));
  }

  function withinBudget(bytes: number, connectionBytes: number) {
    totalBytes += bytes;
    if (totalBytes > SESSION_BYTE_LIMIT || connectionBytes > CONNECTION_BYTE_LIMIT) {
      sessionController.abort();
      for (const socket of sockets) socket.destroy();
      return false;
    }
    return !closed && !sessionController.signal.aborted;
  }

  const server = createServer({ maxHeaderSize: 16 * 1024 }, (request, response) => {
    const rejectRequest = () => {
      if (!response.headersSent) response.writeHead(403, { "Content-Type": "text/plain", Connection: "close" });
      response.end("Browser network policy denied this request.");
    };
    void (async () => {
      if (closed || sessionController.signal.aborted || ++connectionCount > CONNECTION_LIMIT ||
          !["GET", "HEAD"].includes(request.method ?? "") || !/^http:\/\//i.test(request.url ?? "")) {
        rejectRequest();
        return;
      }
      const target = await resolvePublicTarget(request.url!, options.resolver);
      if (closed || sessionController.signal.aborted) return rejectRequest();
      const headers = stripHopHeaders(request.headers);
      delete headers["content-length"];
      delete headers.expect;
      const outgoing = httpRequest({
        ...pinnedRequestOptions(target.url, target.address),
        method: request.method,
        headers: { ...headers, host: target.url.host },
        signal: sessionController.signal,
      }, (upstream) => {
        response.writeHead(upstream.statusCode ?? 502, stripHopHeaders(upstream.headers));
        let transferred = 0;
        upstream.on("data", (chunk: Buffer) => {
          transferred += chunk.byteLength;
          if (!withinBudget(chunk.byteLength, transferred)) upstream.destroy();
        });
        upstream.once("error", () => response.destroy());
        upstream.pipe(response);
      });
      outgoing.once("socket", track);
      outgoing.once("error", () => {
        if (!response.headersSent) response.writeHead(502, { Connection: "close" });
        response.end();
      });
      response.once("close", () => outgoing.destroy());
      outgoing.end();
    })().catch(rejectRequest);
  });

  server.on("connection", track);
  server.on("connect", (request, client, head) => {
    void (async () => {
      if (closed || sessionController.signal.aborted || ++connectionCount > CONNECTION_LIMIT) throw new Error("Proxy session exhausted.");
      const target = await resolvePublicTarget(parseConnectAuthority(request.url ?? ""), options.resolver);
      if (closed || client.destroyed || sessionController.signal.aborted) return client.destroy();
      // Direct connection to the validated IP: CONNECT never triggers another DNS lookup.
      const upstream = connect({ host: target.address.address, family: target.address.family, port: 443 });
      track(upstream);
      let transferred = 0;
      const countBytes = (chunk: Buffer) => {
        transferred += chunk.byteLength;
        if (!withinBudget(chunk.byteLength, transferred)) {
          upstream.destroy();
          client.destroy();
        }
      };
      client.on("data", countBytes);
      upstream.on("data", countBytes);
      upstream.once("connect", () => {
        client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head.length) {
          countBytes(head);
          if (!upstream.destroyed) upstream.write(head);
        }
        client.pipe(upstream);
        upstream.pipe(client);
      });
      upstream.once("error", () => client.destroy());
      upstream.once("close", () => client.destroy());
      client.once("close", () => upstream.destroy());
    })().catch(() => {
      if (!client.destroyed) client.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    });
  });
  server.on("upgrade", (_request, socket) => socket.destroy());
  server.on("clientError", (_error, socket) => socket.destroy());
  server.headersTimeout = 5_000;
  server.requestTimeout = REQUEST_TIMEOUT_MS;
  server.keepAliveTimeout = 1_000;
  server.maxRequestsPerSocket = CONNECTION_LIMIT;

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not start browser proxy.");
  const close = async () => {
    if (closed) return;
    closed = true;
    clearTimeout(lifetime);
    sessionController.abort();
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };
  const lifetime = setTimeout(() => { void close(); }, 25_000);
  lifetime.unref();
  return { url: `http://127.0.0.1:${address.port}`, close };
}
