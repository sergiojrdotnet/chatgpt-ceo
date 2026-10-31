import { createServer } from "node:http";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { authentication } from "./auth.ts";
import type { AuthConfig } from "./auth.ts";
import type { JWTVerifyGetKey } from "jose";
import { mcp } from "./mcp.ts";
import { Store } from "./store.ts";
export function app(
  config: AuthConfig & { databasePath: string; publicOrigin: string },
  keys?: JWTVerifyGetKey,
) {
  const store = new Store(config.databasePath),
    authenticate = authentication(config, keys),
    handler = mcp(store);
  const nodeHandler = toNodeHandler(
    {
      fetch: async (request) => {
        const p = await authenticate(request.headers);
        if (!p)
          return Response.json(
            { error: "UNAUTHORIZED" },
            { status: 401, headers: { "Cache-Control": "no-store" } },
          );
        return handler.fetch(request, {
          authInfo: {
            token: "",
            clientId: p.id,
            scopes: [...p.roles],
            expiresAt: p.expiresAt / 1000,
          },
        });
      },
    },
    { maxRequestBodySize: 512 * 1024 },
  );
  const server = createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const json = (status: number, value: object) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(value));
    };
    try {
      if (req.url === "/healthz" && req.method === "GET")
        return json(200, { status: "ok" });
      if (req.url === "/readyz" && req.method === "GET") {
        store.ready();
        return json(200, { status: "ready" });
      }
      if (req.url !== "/mcp") return json(404, { error: "NOT_FOUND" });
      if (req.headers.origin && req.headers.origin !== config.publicOrigin)
        return json(403, { error: "ORIGIN_DENIED" });
      if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        return json(405, { error: "METHOD_NOT_ALLOWED" });
      }
      await nodeHandler(req, res);
    } catch {
      if (!res.headersSent) json(503, { error: "UNAVAILABLE" });
      else res.end();
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return {
    server,
    store,
    async close() {
      await new Promise<void>((resolve, reject) =>
        server.listening
          ? server.close((e) => (e ? reject(e) : resolve()))
          : resolve(),
      );
      await handler.close();
      store.close();
    },
  };
}
