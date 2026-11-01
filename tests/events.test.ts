import test from "node:test";
import assert from "node:assert/strict";
import {
  fixture,
  sample,
  config,
  digest,
  issue,
  otherIssue,
} from "./helpers/fixture.ts";
import { EventWriteUncertain } from "../src/store.ts";
const args = (event: object = sample) => ({
  expectedDigest: digest(config),
  event,
});
test("direct inserts allow multiple entries per issue, retain corrections and reject obsolete inputs", async () => {
  const f = fixture();
  try {
    f.setup();
    const a = await f.store.appendEvent("writer", args()),
      b = await f.store.appendEvent("writer", args());
    assert.notEqual(a.event.eventId, b.event.eventId);
    assert.equal(f.database.inserts, 2);
    const correction = await f.store.appendEvent(
      "writer",
      args({
        ...sample,
        action: "correction",
        correctsEventId: a.event.eventId,
      }),
    );
    assert.equal(correction.event.correctsEventId, a.event.eventId);
    assert.equal("configurationDigest" in a.event, false);
    assert.equal(
      (await f.store.listEvents({ eventId: a.event.eventId })).events.length,
      1,
    );
    for (const input of [
      { ...args(), requestId: "old" },
      { ...args(), expectedRevision: 1 },
      { ...args(), expectedDigest: "a".repeat(64) },
      args({ ...sample, issueId: "SYN-1" }),
      args({ ...sample, issueId: otherIssue }),
      args({ ...sample, turnId: "turn" }),
      args({ ...sample, outcome: "confirmed" }),
      args({ ...sample, observedAt: "2099-01-01T00:00:00Z" }),
      args({
        ...sample,
        action: "correction",
        correctsEventId: a.event.eventId,
        scope: { type: "issue", id: otherIssue },
        issueId: otherIssue,
      }),
    ])
      await assert.rejects(() => f.store.appendEvent("writer", input));
    assert.equal(f.database.inserts, 3);
  } finally {
    f.cleanup();
  }
});
test("uncertain insertion returns attempted ID without retry or saved claim", async () => {
  const f = fixture();
  try {
    f.setup();
    f.database.insert = async (row) => {
      f.database.inserts++;
      f.database.rows.push(row);
      throw Error("response lost");
    };
    let id = "";
    await assert.rejects(
      () => f.store.appendEvent("writer", args()),
      (e: unknown) => {
        assert.ok(e instanceof EventWriteUncertain);
        id = e.attemptedEventId;
        return true;
      },
    );
    assert.equal(f.database.inserts, 1);
    assert.equal((await f.store.listEvents({ eventId: id })).events.length, 1);
  } finally {
    f.cleanup();
  }
});
test("1205 events: bounded keyset traversal, filters, upper bound and hostile cursor", async () => {
  const f = fixture();
  try {
    f.setup();
    for (let i = 0; i < 1205; i++)
      await f.store.appendEvent(
        "writer",
        args({
          ...sample,
          issueId: i % 2 ? otherIssue : issue,
          scope: { type: "issue", id: i % 2 ? otherIssue : issue },
        }),
      );
    for (const order of ["asc", "desc"] as const) {
      const filters = { order, issueId: issue, limit: 37 };
      const expectedCount = f.database.rows.filter(
        (r) => r.issue_id === issue,
      ).length;
      let page = await f.store.listEvents(filters);
      await new Promise((r) => setTimeout(r, 2));
      await f.store.appendEvent(
        "writer",
        args({
          ...sample,
          issueId: issue,
          scope: { type: "issue", id: issue },
        }),
      );
      const ids: string[] = [];
      while (true) {
        assert.ok(page.events.length <= 37);
        ids.push(...page.events.map((e) => e.eventId));
        if (!page.nextCursor) break;
        await assert.rejects(
          () =>
            f.store.listEvents({
              ...filters,
              issueId: otherIssue,
              cursor: page.nextCursor!,
            }),
          /INVALID_CURSOR/,
        );
        page = await f.store.listEvents({
          ...filters,
          cursor: page.nextCursor,
        });
      }
      assert.equal(ids.length, expectedCount);
      assert.equal(new Set(ids).size, expectedCount);
    }
    for (const cursor of [
      "<script>",
      "a".repeat(1025),
      Buffer.from("{}").toString("base64url"),
    ])
      await assert.rejects(() => f.store.listEvents({ cursor }));
    for (const input of [
      { limit: 101 },
      { scopeId: "x" },
      { from: "2026-02-01T00:00:00Z", to: "2026-01-01T00:00:00Z" },
    ])
      await assert.rejects(() => f.store.listEvents(input));
    assert.equal(
      (await f.store.listEvents({ scopeType: "project" })).events.length,
      0,
    );
  } finally {
    f.cleanup();
  }
});

test("late insertion behind a keyset position requires a fresh traversal", async () => {
  const f = fixture();
  try {
    f.setup();
    for (let i = 0; i < 3; i++) await f.store.appendEvent("writer", args());
    f.database.rows.forEach((r, i) => {
      r.recorded_at = new Date(Date.UTC(2026, 0, 2) + i * 1000).toISOString();
    });
    const first = await f.store.listEvents({ limit: 1, order: "asc" });
    const added = await f.store.appendEvent("writer", args());
    f.database.rows.at(-1)!.recorded_at = "2026-01-01T00:00:00.000Z";
    const second = await f.store.listEvents({
      limit: 1,
      order: "asc",
      cursor: first.nextCursor!,
    });
    assert.notEqual(second.events[0].eventId, added.event.eventId);
    assert.equal(
      (await f.store.listEvents({ limit: 1, order: "asc" })).events[0].eventId,
      added.event.eventId,
    );
  } finally {
    f.cleanup();
  }
});
