import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Store } from "../src/store.ts";
import { configuration, digest } from "../src/model.ts";
import example from "../examples/inactive-a.json" with { type: "json" };

const tables = ["policy", "bindings", "repositories", "agents", "coordination_events", "event_evidence", "requests", "audit", "store_identity"];
function snapshot(db: DatabaseSync) {
  return Object.fromEntries(tables.map(t => [t, db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()]));
}
const eventArgs = {
  requestId: "original-event", expectedRevision: 2,
  event: {
    action: "execution", scope: { type: "issue", id: "SYN-61" }, issueId: "SYN-61",
    reason: "Synthetic migration evidence", result: "Recorded before upgrade", outcome: "confirmed",
    observedAt: "2026-01-01T00:00:00Z", evidenceRefs: ["synthetic-evidence"],
  },
};
function legacy(path: string) {
  const db = new DatabaseSync(path);
  db.exec(readFileSync(new URL("./fixtures/schema3.sql", import.meta.url), "utf8"));
  // Seed through unchanged data-writing code, without migrating the frozen old DDL.
  db.exec("PRAGMA user_version=4");
  const s = new Store(path);
  const empty = { ...example, agents: [] };
  s.update("admin", "empty-config", 0, digest(empty), empty);
  s.update("admin", "populated-config", 1, digest(example), example);
  s.appendEvent("writer", eventArgs);
  s.appendEvent("writer", { ...eventArgs, requestId: "second-event" });
  const config = s.adminRead(), events = s.listEvents(), cursor = s.listEvents({ limit: 1 }).nextCursor!;
  s.close();
  db.exec("PRAGMA user_version=3");
  return { db, config, events, cursor, rows: snapshot(db) };
}

test("optional instructions: five absent and mixed templates round-trip without placeholders", () => {
  const s = new Store(":memory:");
  try {
    const c = configuration(example);
    c.agents = Array.from({ length: 5 }, (_, i) => {
      const a = { ...c.agents[0], id: `agent-${i}` };
      delete a.instructions;
      return a;
    });
    assert.deepEqual(configuration(c), c);
    s.update("admin", "five", 0, digest(c), c);
    assert.deepEqual(s.adminRead().configuration, c);
    assert.deepEqual(s.read("agents", 1).data, { agents: c.agents });
    assert.ok(c.agents.every(a => !Object.hasOwn(a, "instructions")));
    for (const instructions of ["", "   ", null, 42, "Bearer abcdefghijklmnop"])
      assert.throws(() => configuration({ ...c, agents: [{ ...c.agents[0], instructions }] }));
    c.agents[2].instructions = "Approved extra context";
    s.update("admin", "mixed", 1, digest(c), c);
    assert.deepEqual(s.adminRead().configuration, c);
  } finally { s.close(); }
});

test("schema 3 migration preserves all rows, digests, events, retry keys and snapshot cursors", () => {
  const dir = mkdtempSync(join(tmpdir(), "ceo-migrate-")), path = join(dir, "db.sqlite");
  const before = legacy(path);
  let s: Store | undefined;
  try {
    s = new Store(path);
    assert.equal(before.db.prepare("PRAGMA user_version").get()!.user_version, 4);
    assert.deepEqual(snapshot(before.db), before.rows);
    assert.deepEqual(s.adminRead(), before.config);
    assert.deepEqual(s.listEvents(), before.events);
    assert.equal(s.listEvents({ limit: 1, cursor: before.cursor }).events[0].eventId, before.events.events[1].eventId);
    assert.deepEqual(s.update("admin", "populated-config", 1, digest(example), example), { revision: 2, digest: digest(example) });
    assert.deepEqual(s.appendEvent("writer", eventArgs).event, before.events.events[0]);
    for (const op of ["UPDATE agents SET name='changed'", "DELETE FROM agents"])
      assert.throws(() => before.db.exec(op), /IMMUTABLE_RECORD/);
    assert.equal(before.db.prepare("PRAGMA foreign_key_check").all().length, 0);
    assert.equal(before.db.prepare("PRAGMA integrity_check").get()!.integrity_check, "ok");
    const c = configuration(example);
    delete c.agents[0].instructions;
    s.update("admin", "optional", 2, digest(c), c);
    s.close(); s = new Store(path);
    assert.deepEqual(s.adminRead().configuration, c);
    assert.equal(before.db.prepare("SELECT instructions FROM agents WHERE revision=3").get()!.instructions, null);
    assert.equal(s.listEvents().events[0].configurationDigest, digest(example));
  } finally { s?.close(); before.db.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("interrupted migration rolls back old table, guards, version and every row", () => {
  const dir = mkdtempSync(join(tmpdir(), "ceo-migrate-fail-")), path = join(dir, "db.sqlite");
  const before = legacy(path), original = DatabaseSync.prototype.exec;
  try {
    DatabaseSync.prototype.exec = function (sql: string) {
      if (sql.includes("immutable_agents_UPDATE")) throw Error("synthetic migration interruption");
      return original.call(this, sql);
    };
    assert.throws(() => new Store(path), /migration interruption/);
  } finally { DatabaseSync.prototype.exec = original; }
  try {
    assert.equal(before.db.prepare("PRAGMA user_version").get()!.user_version, 3);
    assert.deepEqual(snapshot(before.db), before.rows);
    assert.equal(before.db.prepare("PRAGMA table_info(agents)").all().find(c => c.name === "instructions")!.notnull, 1);
    assert.throws(() => before.db.exec("DELETE FROM agents"), /IMMUTABLE_RECORD/);
    const s = new Store(path);
    assert.deepEqual(s.adminRead(), before.config);
    s.close();
  } finally { before.db.close(); rmSync(dir, { recursive: true, force: true }); }
});
