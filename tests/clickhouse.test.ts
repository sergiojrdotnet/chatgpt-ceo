import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { ClickHouse, MAX_HISTORY_BYTES } from "../src/clickhouse.ts";
import { Store, EventWriteUncertain } from "../src/store.ts";
import { fixture, config, digest, sample } from "./helpers/fixture.ts";
test("HTTP adapter consumes complete responses, uses parameters and never retries uncertain insert", async () => {
  let mode = "ok",
    calls = 0;
  const server = createServer(async (req, res) => {
    calls++;
    const url = new URL(req.url!, "http://localhost");
    assert.equal(req.headers["x-clickhouse-user"], "synthetic");
    assert.equal(url.searchParams.get("async_insert"), "0");
    assert.equal(url.searchParams.get("wait_end_of_query"), "1");
    if (mode === "disconnect") {
      res.writeHead(200);
      res.write("");
      res.destroy();
      return;
    }
    if (mode === "late-error") {
      res.writeHead(200);
      res.end("Code: 999. Synthetic failure");
      return;
    }
    if (mode === "denied") {
      res.writeHead(403);
      res.end("denied");
      return;
    }
    if (mode === "oversize") {
      res.end("x".repeat(MAX_HISTORY_BYTES + 1));
      return;
    }
    res.end(url.searchParams.get("query")!.startsWith("SELECT") ? "{}\n" : "");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const a = server.address();
  assert.ok(a && typeof a !== "string");
  const database = new ClickHouse({
    url: `http://127.0.0.1:${a.port}`,
    database: "ceo",
    username: "synthetic",
    password: "synthetic",
  });
  const f = fixture(),
    store = new Store(f.store.path, database);
  try {
    f.setup();
    await store.appendEvent("writer", {
      expectedDigest: digest(config),
      event: sample,
    });
    assert.equal(calls, 1);
    for (mode of ["late-error", "denied", "disconnect", "oversize"]) {
      const before: number = calls;
      await assert.rejects(
        () =>
          store.appendEvent("writer", {
            expectedDigest: digest(config),
            event: sample,
          }),
        (e: unknown) =>
          e instanceof EventWriteUncertain && !!e.attemptedEventId,
      );
      assert.equal(calls, before + 1);
    }
    mode = "late-error";
    await assert.rejects(
      () => database.query("SELECT event_id FROM coordination_events LIMIT 1"),
      /HISTORY_UNAVAILABLE/,
    );
    assert.throws(
      () =>
        new ClickHouse({
          url: "http://user:secret@localhost",
          database: "ceo",
          username: "x",
          password: "x",
        }),
    );
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    f.cleanup();
  }
});
