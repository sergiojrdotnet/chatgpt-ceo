import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from "jose";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { app } from "../src/app.ts";
import { authentication } from "../src/auth.ts";
import example from "../examples/inactive-a.json" with { type: "json" };
import { digest } from "../src/model.ts";
const config = {
  issuer: "https://access.example.test",
  audience: "synthetic-audience",
  readers: ["reader@example.test", "admin@example.test", "writer@example.test"],
  admins: ["admin@example.test"],
  eventWriters: ["writer@example.test"],
};
async function fixture() {
  const key = await generateKeyPair("RS256");
  const jwk = await exportJWK(key.publicKey);
  jwk.kid = "synthetic";
  const keys = createLocalJWKSet({ keys: [jwk] });
  const token = (
    email: string,
    overrides: Record<string, unknown> = {},
    expiry: string | number = "1h",
  ) =>
    new SignJWT({ email, type: "app", ...overrides })
      .setProtectedHeader({ alg: "RS256", kid: "synthetic" })
      .setSubject("synthetic-subject")
      .setIssuer(config.issuer)
      .setAudience(config.audience)
      .setIssuedAt()
      .setExpirationTime(expiry)
      .sign(key.privateKey);
  const r = app(
    {
      ...config,
      databasePath: ":memory:",
      publicOrigin: "https://ceo.example.test",
    },
    keys,
  );
  await new Promise<void>((resolve) =>
    r.server.listen(0, "127.0.0.1", resolve),
  );
  const address = r.server.address();
  assert.ok(address && typeof address !== "string");
  const url = new URL(`http://127.0.0.1:${address.port}/mcp`);
  async function client(email: string, modern = false) {
    const c = new Client(
      { name: "synthetic-fresh-consumer", version: "0.1.0" },
      modern ? { versionNegotiation: { mode: "auto" } } : {},
    );
    await c.connect(
      new StreamableHTTPClientTransport(url, {
        requestInit: {
          headers: { "cf-access-jwt-assertion": await token(email) },
        },
      }),
    );
    return c;
  }
  return { r, url, client, token, keys };
}
function data(result: Awaited<ReturnType<Client["callTool"]>>) {
  assert.notEqual(result.isError, true, JSON.stringify(result));
  return result.structuredContent as Record<string, any>;
}
test("fresh SDK consumers setup, discover nine tools, read subjects consistently and enforce distinct write roles", async () => {
  const f = await fixture();
  const admin = await f.client("admin@example.test"),
    reader = await f.client("reader@example.test"),
    writer = await f.client("writer@example.test", true);
  try {
    assert.equal(reader.getServerVersion()?.name, "ceo");
    const names = (await reader.listTools()).tools.map((tool) => tool.name);
    assert.equal(names.length, 9);
    const tools = (await reader.listTools()).tools;
    const show = tools.find((t) => t.name === "show_coordination_history")!;
    assert.deepEqual(show._meta?.ui, {
      resourceUri: "ui://ceo/coordination-history/v1.html",
    });
    assert.equal(
      tools.find((t) => t.name === "list_coordination_events")?._meta,
      undefined,
    );
    assert.equal(show.annotations?.readOnlyHint, true);
    const resources = await reader.listResources();
    assert.equal(resources.resources.length, 1);
    const resource = await reader.readResource({
      uri: "ui://ceo/coordination-history/v1.html",
    });
    assert.equal(resource.contents[0].mimeType, "text/html;profile=mcp-app");
    assert.ok(
      "text" in resource.contents[0] &&
        resource.contents[0].text.includes("connect-src 'none'"),
    );
    assert.deepEqual(resource.contents[0]._meta?.ui, {
      prefersBorder: true,
      csp: { connectDomains: [], resourceDomains: [], frameDomains: [] },
    });
    const shown = await reader.callTool({
      name: "show_coordination_history",
      arguments: { issueId: "SYN-1" },
    });
    assert.equal(shown.isError, undefined);
    assert.deepEqual(shown._meta, {
      historyFilters: { issueId: "SYN-1", order: "desc" },
    });
    assert.equal(JSON.stringify(shown.content).includes("SYN-1"), false);
    assert.equal(
      (
        await reader.callTool({
          name: "show_coordination_history",
          arguments: { scopeId: "missing-type" },
        })
      ).isError,
      true,
    );
    assert.ok(names.includes("append_coordination_event"));
    assert.ok(names.includes("list_coordination_events"));
    assert.ok(!names.includes("get_checkpoint"));
    assert.ok(!names.includes("get_release_policy"));
    assert.ok(!names.includes("save_checkpoint"));
    assert.equal(
      data(await admin.callTool({ name: "get_configuration", arguments: {} }))
        .setupRequired,
      true,
    );
    assert.equal(
      (await reader.callTool({ name: "get_operation_context", arguments: {} }))
        .isError,
      true,
    );
    assert.equal(
      (await reader.callTool({ name: "get_configuration", arguments: {} }))
        .isError,
      true,
    );
    const valid = data(
      await admin.callTool({
        name: "validate_configuration",
        arguments: { configuration: example },
      }),
    );
    assert.equal(valid.reviewDigest, digest(example));
    const args = {
      configuration: example,
      expectedRevision: 0,
      reviewDigest: valid.reviewDigest,
      requestId: "setup",
    };
    assert.equal(
      (await writer.callTool({ name: "update_configuration", arguments: args }))
        .isError,
      true,
    );
    assert.equal(
      data(
        await admin.callTool({ name: "update_configuration", arguments: args }),
      ).revision,
      1,
    );
    const context = data(
      await reader.callTool({ name: "get_operation_context", arguments: {} }),
    );
    assert.equal(context.complete, true);
    assert.equal(context.fixtureOnly, true);
    for (const name of [
      "get_agents",
      "get_selection_policy",
    ]) {
      const result = data(
        await reader.callTool({
          name,
          arguments: { expectedRevision: context.revision },
        }),
      );
      assert.equal(result.digest, context.digest);
      assert.equal(result.revision, context.revision);
    }
    assert.equal(
      (
        await reader.callTool({
          name: "get_agents",
          arguments: { expectedRevision: 2 },
        })
      ).isError,
      true,
    );
    assert.equal(
      (await reader.callTool({ name: "update_configuration", arguments: args }))
        .isError,
      true,
    );
    assert.equal(
      data(await admin.callTool({ name: "get_configuration", arguments: {} }))
        .revision,
      1,
    );
    const event = {
      action: "delegation",
      scope: { type: "issue", id: "SYN-1" },
      issueId: "SYN-1",
      phase: "implementation",
      reason: "Approved ready work",
      result: "Dispatch response unavailable",
      outcome: "uncertain",
      observedAt: "2026-01-01T00:00:00Z",
      evidenceRefs: [],
      threadId: "synthetic-thread",
      turnId: "synthetic-turn",
    };
    const argsEvent = { expectedRevision: 1, event, requestId: "event" };
    for (const denied of [admin, reader])
      assert.equal(
        (
          await denied.callTool({
            name: "append_coordination_event",
            arguments: argsEvent,
          })
        ).isError,
        true,
      );
    const saved = data(
      await writer.callTool({
        name: "append_coordination_event",
        arguments: argsEvent,
      }),
    );
    assert.equal(saved.event.outcome, "uncertain");
    assert.equal(saved.event.producerId.length, 64);
    assert.deepEqual(
      data(
        await writer.callTool({
          name: "append_coordination_event",
          arguments: argsEvent,
        }),
      ),
      saved,
    );
    const listed = data(
      await reader.callTool({
        name: "list_coordination_events",
        arguments: { issueId: "SYN-1", limit: 1 },
      }),
    );
    assert.deepEqual(listed.events, [saved.event]);
    assert.equal(listed.hasMore, false);
    for (const extra of [
      { sessions: [] },
      { producerId: "forged" },
      { threadId: ["a", "b"] },
      { turnId: "turn", threadId: undefined },
    ]) {
      assert.equal(
        (
          await writer.callTool({
            name: "append_coordination_event",
            arguments: { ...argsEvent, event: { ...event, ...extra } },
          })
        ).isError,
        true,
      );
    }
    assert.equal(
      (
        await reader.callTool({
          name: "list_coordination_events",
          arguments: { limit: 101 },
        })
      ).isError,
      true,
    );
    assert.equal(
      (
        await writer.callTool({
          name: "append_coordination_event",
          arguments: { ...argsEvent, requestId: "stale", expectedRevision: 2 },
        })
      ).isError,
      true,
    );
  } finally {
    await Promise.all([admin.close(), reader.close(), writer.close()]);
    await f.r.close();
  }
});
test("JWT signature, issuer, audience, expiry, identity and Origin deny access without private data", async () => {
  const f = await fixture();
  try {
    const auth = authentication(config, f.keys);
    const token = await f.token("reader@example.test");
    assert.ok(await auth(new Headers({ "cf-access-jwt-assertion": token })));
    for (const headers of [
      new Headers(),
      new Headers({ authorization: `Bearer ${token}` }),
      new Headers({
        "cf-access-jwt-assertion": token.slice(0, -8) + "invalid",
      }),
      new Headers({
        "cf-access-jwt-assertion": await f.token("outside@example.test"),
      }),
      new Headers({
        "cf-access-jwt-assertion": await f.token("reader@example.test", {
          type: "service",
        }),
      }),
      new Headers({
        "cf-access-jwt-assertion": await f.token("reader@example.test", {}, 1),
      }),
    ])
      assert.equal(await auth(headers), undefined);
    for (const method of ["resources/read", "tools/call"]) {
      for (const token of [
        await f.token("outside@example.test"),
        await f.token("reader@example.test", {}, 1),
      ]) {
        const denied = await fetch(f.url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "cf-access-jwt-assertion": token,
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method,
            params:
              method === "resources/read"
                ? { uri: "ui://ceo/coordination-history/v1.html" }
                : { name: "show_coordination_history", arguments: {} },
          }),
        });
        assert.equal(denied.status, 401);
        assert.equal(
          (await denied.text()).includes("Coordination history"),
          false,
        );
      }
    }
    const other = authentication({ ...config, audience: "wrong" }, f.keys);
    assert.equal(
      await other(new Headers({ "cf-access-jwt-assertion": token })),
      undefined,
    );
    const wrongIssuer = authentication(
      { ...config, issuer: "https://wrong.example.test" },
      f.keys,
    );
    assert.equal(
      await wrongIssuer(new Headers({ "cf-access-jwt-assertion": token })),
      undefined,
    );
    const response = await fetch(f.url, { method: "POST", body: "{}" });
    assert.equal(response.status, 401);
    assert.equal((await response.text()).includes("synthetic-profile"), false);
    assert.equal(
      (
        await fetch(f.url, {
          method: "POST",
          headers: { origin: "https://evil.example.test" },
          body: "{}",
        })
      ).status,
      403,
    );
    assert.equal((await fetch(f.url)).status, 405);
  } finally {
    await f.r.close();
  }
});
test("SDK v2 negotiates dated protocol versions and serves current stateless discovery", async () => {
  const f = await fixture();
  try {
    const modern = await f.client("reader@example.test", true);
    assert.equal((await modern.listTools()).tools.length, 9);
    await modern.close();
    async function rpc(
      method: string,
      params: Record<string, unknown>,
      version: string,
    ) {
      const modern = version === "2026-07-28";
      const headers: Record<string, string> = {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "cf-access-jwt-assertion": await f.token("reader@example.test"),
        "MCP-Protocol-Version": version,
      };
      if (modern) headers["Mcp-Method"] = method;
      const response = await fetch(f.url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method,
          params: {
            ...params,
            ...(modern
              ? {
                  _meta: {
                    "io.modelcontextprotocol/protocolVersion": version,
                    "io.modelcontextprotocol/clientInfo": {
                      name: "synthetic",
                      version: "1",
                    },
                    "io.modelcontextprotocol/clientCapabilities": {},
                  },
                }
              : {}),
          },
        }),
      });
      const raw = await response.text();
      return JSON.parse(
        response.headers.get("content-type")?.includes("text/event-stream")
          ? raw
              .split("\n")
              .find((l) => l.startsWith("data: "))!
              .slice(6)
          : raw,
      );
    }
    const discover = await rpc("server/discover", {}, "2026-07-28");
    assert.ok(discover.result.supportedVersions.includes("2026-07-28"));
    assert.equal(discover.result.cacheScope, "private");
    const initialized = await rpc(
      "initialize",
      {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "synthetic", version: "1" },
      },
      "2025-11-25",
    );
    assert.equal(initialized.result.protocolVersion, "2025-11-25");
  } finally {
    await f.r.close();
  }
});

test("SDK validates and saves five agents without extra instructions, preserving absence", async () => {
  const f = await fixture();
  const admin = await f.client("admin@example.test"), reader = await f.client("reader@example.test");
  try {
    const agents = Array.from({ length: 5 }, (_, i) => {
      const { instructions, ...rest } = example.agents[0];
      return { ...rest, id: `agent-${i}` };
    });
    const proposal = { ...example, agents };
    const validated = data(await admin.callTool({ name: "validate_configuration", arguments: { configuration: proposal } }));
    assert.deepEqual(validated.configuration, proposal);
    assert.equal(validated.reviewDigest, digest(proposal));
    data(await admin.callTool({ name: "update_configuration", arguments: { configuration: proposal, expectedRevision: 0, reviewDigest: validated.reviewDigest, requestId: "optional-setup" } }));
    const read = data(await reader.callTool({ name: "get_agents", arguments: { expectedRevision: 1 } }));
    assert.deepEqual(read.data.agents, agents);
    assert.equal(read.active, false);
    assert.equal(read.executionEnabled, false);
    assert.deepEqual(data(await admin.callTool({ name: "get_configuration", arguments: {} })).configuration, proposal);
  } finally { await admin.close(); await reader.close(); await f.r.close(); }
});
