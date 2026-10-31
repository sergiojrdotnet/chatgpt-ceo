import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Worker } from "node:worker_threads";
import { Store } from "../src/store.ts";
import { digest, eventSchema } from "../src/model.ts";
import type { EventInput } from "../src/model.ts";
import config from "../examples/inactive-a.json" with { type: "json" };
const event: EventInput = {
  action: "delegation",
  scope: { type: "issue", id: "SYN-1" },
  issueId: "SYN-1",
  phase: "implementation",
  reason: "Ready authorized issue",
  result: "Dispatch response lost",
  outcome: "uncertain",
  observedAt: "2026-01-01T00:00:00.000Z",
  evidenceRefs: [],
  threadId: "synthetic-thread",
  turnId: "synthetic-turn",
};
const args = (requestId: string, e: EventInput = event) => ({
  requestId,
  expectedRevision: 1,
  event: e,
});
function setup(path = ":memory:") {
  const s = new Store(path);
  s.update("admin", "setup", 0, digest(config), config);
  return s;
}
test("closed event semantics reject unknowns, arrays, missing evidence/issue/thread and invalid corrections", () => {
  for (const bad of [
    { ...event, sessions: [] },
    { ...event, threadId: ["a"] },
    { ...event, producerId: "forged" },
    { ...event, turnId: "x", threadId: undefined },
    { ...event, issueId: "SYN-2" },
    { ...event, issueId: undefined },
    { ...event, outcome: "done" },
    { ...event, outcome: "confirmed" },
    { ...event, outcome: "failed" },
    { ...event, action: "correction" },
    { ...event, correctsEventId: "00000000-0000-4000-8000-000000000001" },
    { ...event, observedAt: "2026-01-01T00:00:00-00:00" },
    { ...event, evidenceRefs: ["x", "x"] },
    { ...event, reason: "Bearer abcdefghijklmnop" },
  ])
    assert.equal(eventSchema.safeParse(bad).success, false);
});
test("immutable events, linked corrections, restart/idempotency, producer isolation and backup", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ceo-events-"));
  const path = join(dir, "db.sqlite");
  let s = setup(path);
  const other = setup();
  try {
    const original = s.appendEvent("writer", args("first"));
    assert.deepEqual(s.appendEvent("writer", args("first")), original);
    assert.equal(other.listEvents().events.length, 0);
    const correction = s.appendEvent(
      "writer",
      args("correct", {
        ...event,
        action: "correction",
        correctsEventId: original.event.eventId,
        outcome: "confirmed",
        result: "Returned thread confirmed by host lookup",
        evidenceRefs: ["synthetic:lookup"],
      }),
    );
    assert.equal(correction.event.correctsEventId, original.event.eventId);
    assert.equal(s.listEvents().events[0].outcome, "uncertain");
    assert.throws(
      () =>
        s.appendEvent("writer", args("first", { ...event, result: "changed" })),
      /IDEMPOTENCY/,
    );
    assert.notEqual(
      s.appendEvent("another-writer", args("first")).event.eventId,
      original.event.eventId,
    );
    assert.throws(
      () =>
        s.appendEvent(
          "writer",
          args("wrong-scope", {
            ...event,
            action: "correction",
            correctsEventId: original.event.eventId,
            scope: { type: "issue", id: "SYN-2" },
            issueId: "SYN-2",
          }),
        ),
      /SCOPE/,
    );
    assert.throws(
      () =>
        s.appendEvent(
          "writer",
          args("missing", {
            ...event,
            action: "correction",
            correctsEventId: "00000000-0000-4000-8000-000000000001",
          }),
        ),
      /EVENT_NOT_FOUND/,
    );
    s.update("admin", "second", 1, digest(config), config);
    assert.deepEqual(s.appendEvent("writer", args("first")), original);
    assert.throws(
      () => s.appendEvent("writer", args("stale")),
      /REVISION_CONFLICT/,
    );
    await s.backup(join(dir, "backup.sqlite"));
    s.close();
    s = new Store(join(dir, "backup.sqlite"));
    assert.deepEqual(s.appendEvent("writer", args("first")), original);
    assert.equal(s.listEvents().events.length, 3);
    assert.equal(s.listEvents().events[0].configurationRevision, 1);
    assert.equal(s.listEvents().events[0].threadId, "synthetic-thread");
  } finally {
    s.close();
    other.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("snapshot pagination, issue/scope/action/time filters and bounded malformed requests", () => {
  const s = setup(),
    other = setup();
  try {
    for (let i = 0; i < 106; i++)
      s.appendEvent(
        "writer",
        args(`r-${i}`, {
          ...event,
          action: i % 2 ? "execution" : "delegation",
          scope: { type: "issue", id: i % 3 ? "SYN-1" : "SYN-2" },
          issueId: i % 3 ? "SYN-1" : "SYN-2",
          observedAt:
            i % 2 ? "2026-01-02T00:00:00Z" : "2026-01-01T01:00:00+01:00",
        }),
      );
    assert.equal(s.listEvents().events.length, 50);
    assert.equal(s.listEvents({ limit: 100 }).events.length, 100);
    const first = s.listEvents({ issueId: "SYN-1", limit: 7 });
    const found = [...first.events];
    let cursor = first.nextCursor;
    s.appendEvent("writer", args("late"));
    while (cursor) {
      const page = s.listEvents({ issueId: "SYN-1", limit: 7, cursor });
      found.push(...page.events);
      cursor = page.nextCursor;
    }
    assert.equal(found.length, 70);
    assert.equal(new Set(found.map((e) => e.eventId)).size, 70);
    assert.equal(s.listEvents({ issueId: "missing" }).events.length, 0);
    assert.equal(
      s.listEvents({ scopeType: "issue", scopeId: "SYN-2", limit: 100 }).events
        .length,
      36,
    );
    assert.equal(
      s.listEvents({
        action: "execution",
        from: "2026-01-02T00:00:00Z",
        to: "2026-01-02T00:00:00Z",
        limit: 100,
      }).events.length,
      53,
    );
    for (const bad of [
      { limit: 0 },
      { limit: 101 },
      { limit: 1.1 },
      { limit: "10" },
      { scopeId: "SYN-1" },
      { unknown: 1 },
      { from: "bad" },
      { from: "2026-02-01T00:00:00Z", to: "2026-01-01T00:00:00Z" },
      { cursor: "bad" },
      { issueId: "SYN-2", cursor: first.nextCursor },
    ])
      assert.throws(() => s.listEvents(bad));
    assert.throws(
      () => other.listEvents({ issueId: "SYN-1", cursor: first.nextCursor }),
      /INVALID_CURSOR/,
    );
  } finally {
    s.close();
    other.close();
  }
});
test("relational constraints and immutable SQL guards; interrupted append leaves no event, request or evidence", () => {
  const dir = mkdtempSync(join(tmpdir(), "ceo-constraints-")),
    path = join(dir, "db.sqlite"),
    s = setup(path),
    db = new DatabaseSync(path);
  try {
    const original = s.appendEvent(
      "writer",
      args("one", {
        ...event,
        outcome: "confirmed",
        evidenceRefs: ["synthetic:response"],
      }),
    );
    db.exec("PRAGMA foreign_keys=ON");
    for (const table of ["coordination_events", "event_evidence", "requests"])
      for (const op of ["UPDATE", "DELETE"]) {
        assert.throws(
          () =>
            db.exec(
              op === "DELETE"
                ? `DELETE FROM ${table}`
                : `UPDATE ${table} SET ${table === "coordination_events" ? "result=result" : table === "event_evidence" ? "reference=reference" : "digest=digest"}`,
            ),
          /IMMUTABLE/,
        );
      }
    assert.throws(
      () =>
        db
          .prepare("INSERT INTO event_evidence VALUES(?,?,?)")
          .run("missing", 0, "x"),
      /FOREIGN KEY/,
    );
    assert.throws(
      () =>
        db
          .prepare("INSERT INTO event_evidence VALUES(?,?,?)")
          .run(original.event.eventId, 1, "extra"),
      /EVIDENCE_LIMIT/,
    );
    assert.throws(
      () =>
        db
          .prepare("INSERT INTO event_evidence VALUES(?,?,?)")
          .run(original.event.eventId, 0, "other"),
      /UNIQUE/,
    );
    db.exec(
      "CREATE TRIGGER fail_append BEFORE INSERT ON event_evidence BEGIN SELECT RAISE(ABORT,'interrupted'); END;",
    );
    assert.throws(
      () =>
        s.appendEvent(
          "writer",
          args("interrupted", {
            ...event,
            outcome: "confirmed",
            evidenceRefs: ["synthetic:test"],
          }),
        ),
      /interrupted/,
    );
    assert.equal(s.listEvents().events.length, 1);
    assert.equal(
      db
        .prepare("SELECT COUNT(*) n FROM requests WHERE id='interrupted'")
        .get()!.n,
      0,
    );
    db.exec("DROP TRIGGER fail_append");
    s.appendEvent(
      "writer",
      args("interrupted", {
        ...event,
        outcome: "confirmed",
        evidenceRefs: ["synthetic:test"],
      }),
    );
    assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((x) => x.name);
    assert.ok(!tables.includes("sessions"));
    assert.ok(!tables.includes("checkpoints"));
  } finally {
    db.close();
    s.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("simultaneous exact retries commit one event, distinct requests preserve both, altered retry conflicts", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ceo-concurrent-")),
    path = join(dir, "db.sqlite"),
    s = setup(path);
  const code = `import {parentPort,workerData} from 'node:worker_threads';import {Store} from ${JSON.stringify(new URL("../src/store.ts", import.meta.url).href)};const s=new Store(workerData.path);parentPort.postMessage('ready');parentPort.once('message',()=>{try{parentPort.postMessage(s.appendEvent('writer',workerData.args).event.eventId)}catch(e){parentPort.postMessage(e.message)}finally{s.close()}});`;
  async function race(inputs: unknown[]) {
    const workers = inputs.map(
      (a) => new Worker(code, { eval: true, workerData: { path, args: a } }),
    );
    try {
      await Promise.all(
        workers.map(
          (w) =>
            new Promise<void>((res, rej) => {
              w.once("message", () => res());
              w.once("error", rej);
            }),
        ),
      );
      const results = workers.map(
        (w) =>
          new Promise<string>((res, rej) => {
            w.once("message", res);
            w.once("error", rej);
          }),
      );
      workers.forEach((w) => w.postMessage("go"));
      return await Promise.all(results);
    } finally {
      await Promise.all(workers.map((w) => w.terminate()));
    }
  }
  try {
    const same = await race([args("same"), args("same")]);
    assert.equal(same[0], same[1]);
    assert.equal(s.listEvents().events.length, 1);
    const distinct = await race([args("a"), args("b")]);
    assert.notEqual(distinct[0], distinct[1]);
    assert.equal(s.listEvents().events.length, 3);
    const changed = await race([
      args("conflict"),
      args("conflict", { ...event, result: "different" }),
    ]);
    assert.equal(changed.filter((x) => x === "IDEMPOTENCY_CONFLICT").length, 1);
    assert.equal(s.listEvents().events.length, 4);
  } finally {
    s.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("nonempty incompatible database is rejected without migration or deletion", () => {
  const dir = mkdtempSync(join(tmpdir(), "ceo-schema-")),
    path = join(dir, "db.sqlite");
  const db = new DatabaseSync(path);
  try {
    db.exec(
      "CREATE TABLE private_existing(value TEXT); INSERT INTO private_existing VALUES('preserve');",
    );
    assert.throws(() => new Store(path), /CLEAN_DATABASE_REQUIRED/);
    assert.equal(
      db.prepare("SELECT value FROM private_existing").get()!.value,
      "preserve",
    );
    assert.equal(
      db
        .prepare(
          "SELECT COUNT(*) n FROM sqlite_master WHERE name='coordination_events'",
        )
        .get()!.n,
      0,
    );
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("non-issue scope, no session and no configured agents are valid; future observations fail", () => {
  const s = new Store(":memory:");
  try {
    const c = { ...config, agents: [] };
    s.update("admin", "setup", 0, digest(c), c);
    const input = {
      action: "configuration",
      scope: { type: "configuration", id: "policy" },
      reason: "Approved inactive setup",
      result: "Readback confirmed",
      outcome: "confirmed",
      observedAt: "2026-01-01T00:00:00Z",
      evidenceRefs: ["synthetic:config-readback"],
    };
    const saved = s.appendEvent("writer", {
      requestId: "config",
      expectedRevision: 1,
      event: input,
    });
    assert.equal(saved.event.threadId, undefined);
    assert.equal(saved.event.issueId, undefined);
    assert.throws(
      () =>
        s.appendEvent("writer", {
          requestId: "future",
          expectedRevision: 1,
          event: { ...input, observedAt: "2099-01-01T00:00:00Z" },
        }),
      /FUTURE/,
    );
    assert.throws(
      () =>
        s.appendEvent("admin", {
          requestId: "setup",
          expectedRevision: 1,
          event: input,
        }),
      /IDEMPOTENCY_CONFLICT/,
    );
    assert.equal(
      s.listEvents({ scopeType: "configuration", scopeId: "policy" }).events
        .length,
      1,
    );
  } finally {
    s.close();
  }
});
test("interrupted schema initialization rolls back and can restart without reset", () => {
  const dir = mkdtempSync(join(tmpdir(), "ceo-init-")),
    path = join(dir, "db.sqlite");
  const original = DatabaseSync.prototype.exec;
  try {
    DatabaseSync.prototype.exec = function (sql: string) {
      if (sql.includes("immutable_policy_UPDATE"))
        throw Error("synthetic initialization interruption");
      return original.call(this, sql);
    };
    assert.throws(() => new Store(path), /initialization interruption/);
  } finally {
    DatabaseSync.prototype.exec = original;
  }
  try {
    const db = new DatabaseSync(path);
    assert.equal(db.prepare("PRAGMA user_version").get()!.user_version, 0);
    assert.equal(
      db
        .prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table'")
        .get()!.n,
      0,
    );
    db.close();
    const s = setup(path);
    assert.equal(s.adminRead().revision, 1);
    s.appendEvent("writer", args("after-restart"));
    s.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("1205-event snapshots traverse both directions without duplicates or misses during inserts", () => {
  const s = setup();
  try {
    const ids: string[] = [];
    const issueOne: string[] = [];
    for (let i = 0; i < 1205; i++)
      ids.push(
        s.appendEvent(
          "writer",
          args(`bulk-${i}`, {
            ...event,
            result: `Synthetic ${i}`,
            issueId: i % 2 ? "SYN-2" : "SYN-1",
            scope: { type: "issue", id: i % 2 ? "SYN-2" : "SYN-1" },
          }),
        ).event.eventId,
      );
    issueOne.push(...ids.filter((_, i) => i % 2 === 0));
    for (const order of ["asc", "desc"] as const) {
      for (const issueId of [undefined, "SYN-1"]) {
        const filters = {
          order,
          issueId,
          scopeType: "issue",
          action: "delegation",
          from: event.observedAt,
          to: event.observedAt,
          limit: 37,
        };
        const seen: string[] = [];
        const wanted = [...(issueId ? issueOne : ids)];
        let current = s.listEvents(filters);
        const inserted = s.appendEvent(
          "writer",
          args(`concurrent-${order}-${issueId}`),
        ).event.eventId;
        ids.push(inserted);
        issueOne.push(inserted);
        let pages = 0;
        while (true) {
          assert.ok(current.events.length <= 37);
          assert.ok(Buffer.byteLength(JSON.stringify(current)) < 50_000);
          seen.push(...current.events.map((e) => e.eventId));
          pages++;
          if (!current.hasMore) break;
          assert.ok(current.nextCursor);
          assert.throws(
            () =>
              s.listEvents({
                ...filters,
                order: order === "asc" ? "desc" : "asc",
                cursor: current.nextCursor,
              }),
            /INVALID_CURSOR/,
          );
          current = s.listEvents({ ...filters, cursor: current.nextCursor });
        }
        assert.deepEqual(seen, order === "desc" ? wanted.reverse() : wanted);
        assert.equal(new Set(seen).size, seen.length);
        assert.ok(pages > 16);
      }
    }
    for (const cursor of [
      "<script>alert(1)</script>",
      Buffer.from(
        JSON.stringify({ v: 1, after: 0, through: 999999, filterDigest: "x" }),
      ).toString("base64url"),
      "a".repeat(1025),
    ])
      assert.throws(() => s.listEvents({ cursor }));
  } finally {
    s.close();
  }
});
