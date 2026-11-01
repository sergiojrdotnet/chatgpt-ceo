// Run only through test:container against its disposable loopback ClickHouse.
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ClickHouse } from "../src/clickhouse.ts";
import { Store } from "../src/store.ts";
import { fixture, config, digest, sample, issue } from "./helpers/fixture.ts";
const url = process.env.CEO_TEST_CLICKHOUSE_URL!;
assert.equal(new URL(url).hostname, "127.0.0.1");
const options = {
  url,
  database: "ceo",
  username: "ceo_history_writer",
  password: "synthetic-test-only",
};
test("real ClickHouse: scoped direct writes, correction UUIDs, bounded keysets and restart", async () => {
  const f = fixture(),
    db = new ClickHouse(options),
    s = new Store(f.store.path, db);
  try {
    f.setup();
    await s.ready();
    await assert.rejects(
      () => db.query("CREATE TABLE forbidden (x UInt8) ENGINE=Memory"),
      /HISTORY_UNAVAILABLE/,
    );
    const a = await s.appendEvent("synthetic", {
      expectedDigest: digest(config),
      event: sample,
    });
    const b = await s.appendEvent("synthetic", {
      expectedDigest: digest(config),
      event: sample,
    });
    assert.notEqual(a.event.eventId, b.event.eventId);
    const corrected = await s.appendEvent("synthetic", {
      expectedDigest: digest(config),
      event: {
        ...sample,
        action: "correction",
        correctsEventId: a.event.eventId,
      },
    });
    assert.equal(corrected.event.correctsEventId, a.event.eventId);
    assert.deepEqual(
      (await s.listEvents({ eventId: a.event.eventId })).events,
      [a.event],
    );
    const query = new URL(url);
    query.searchParams.set("database", "ceo");
    query.searchParams.set(
      "query",
      "INSERT INTO coordination_events FORMAT JSONEachRow",
    );
    query.searchParams.set("date_time_input_format", "best_effort");
    query.searchParams.set("async_insert", "0");
    query.searchParams.set("wait_end_of_query", "1");
    const rows = Array.from({ length: 1205 }, (_, i) => ({
      event_id: randomUUID(),
      action: "validation",
      scope_type: "issue",
      scope_id: issue,
      issue_id: issue,
      issue_identifier: "SYN-1",
      phase: null,
      reason: "Synthetic bulk fixture",
      result: `Sample ${i}`,
      outcome: "uncertain",
      observed_at: "2026-01-01T00:00:00.000Z",
      recorded_at: new Date(Date.UTC(2026, 0, 1) + i).toISOString(),
      producer_id: "synthetic",
      evidence_refs: [],
      thread_id: null,
      turn_id: null,
      correlation_id: null,
      corrects_event_id: null,
    }));
    const response = await fetch(query, {
      method: "POST",
      headers: {
        "X-ClickHouse-User": options.username,
        "X-ClickHouse-Key": options.password,
      },
      body: rows.map((r) => JSON.stringify(r)).join("\n") + "\n",
    });
    const text = await response.text();
    assert.ok(response.ok, text);
    assert.equal(text, "");
    for (const order of ["asc", "desc"] as const) {
      const filters = {
        order,
        action: "validation" as const,
        issueId: issue,
        limit: 37,
      };
      let page = await s.listEvents(filters);
      const seen: string[] = [];
      while (true) {
        assert.ok(page.events.length <= 37);
        seen.push(...page.events.map((e) => e.eventId));
        if (!page.nextCursor) break;
        page = await s.listEvents({ ...filters, cursor: page.nextCursor });
      }
      assert.equal(seen.length, 1205);
      assert.equal(new Set(seen).size, 1205);
      assert.deepEqual(
        seen,
        (order === "asc" ? rows : [...rows].reverse()).map((r) => r.event_id),
      );
    }

    const largeRows = Array.from({ length: 101 }, () => ({
      ...rows[0],
      event_id: randomUUID(),
      action: "administration",
      reason: "x" + "\u0001".repeat(999),
      result: "x" + "\u0001".repeat(1999),
      evidence_refs: Array.from({ length: 30 }, (_, i) =>
        String(i).padEnd(500, "\u0001"),
      ),
    }));
    const largeBody = largeRows.map((r) => JSON.stringify(r)).join("\n") + "\n";
    assert.ok(Buffer.byteLength(largeBody) > 4 * 1024 * 1024);
    const insertedLarge = await fetch(query, {
      method: "POST",
      headers: {
        "X-ClickHouse-User": options.username,
        "X-ClickHouse-Key": options.password,
      },
      body: largeBody,
    });
    assert.equal(await insertedLarge.text(), "");
    assert.ok(insertedLarge.ok);
    const largePage = await s.listEvents({
      action: "administration",
      limit: 100,
    });
    assert.equal(largePage.events.length, 100);
    assert.equal(largePage.hasMore, true);
    const uppercase = "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA";
    const normalized = await s.appendEvent("synthetic", {
      expectedDigest: digest(config),
      event: {
        ...sample,
        issueId: uppercase,
        scope: { type: "issue", id: uppercase },
      },
    });
    assert.equal(normalized.event.issueId, uppercase.toLowerCase());
    assert.deepEqual(
      (
        await s.listEvents({
          issueId: uppercase,
          scopeType: "issue",
          scopeId: uppercase,
        })
      ).events,
      [normalized.event],
    );
    assert.equal(
      (
        await new Store(f.store.path, new ClickHouse(options)).listEvents({
          eventId: a.event.eventId,
        })
      ).events.length,
      1,
    );
  } finally {
    f.cleanup();
  }
});
