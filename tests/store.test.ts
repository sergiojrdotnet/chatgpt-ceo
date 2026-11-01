import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { Store } from "../src/store.ts";
import { configuration, digest } from "../src/model.ts";

import example from "../examples/inactive-a.json" with { type: "json" };
const fixture = () => configuration(example);
test("validation rejects incomplete, unknown, duplicate, invalid capacity/time/window and credentials", () => {
  const good = fixture();
  for (const bad of [
    { ...good, secret: "no" },
    { ...good, timezone: "not/a/zone" },
    { ...good, agents: [good.agents[0], good.agents[0]] },
    { ...good, capacity: { ...good.capacity, activeMax: 0 } },
    { ...good, effectiveAt: "bad" },
    { ...good, agents: [{ ...good.agents[0], environment: { id: "bad" } }] },
    {
      ...good,
      agents: [{ ...good.agents[0], instructions: "Bearer abcdefghijklmnop" }],
    },
    { ...good, release: {} },
    { ...good, schemaVersion: 1 },
    { ...good, selection: { ...good.selection, administrativeHours: { start: "12:00", end: "11:00" } } },
  ])
    assert.throws(() => configuration(bad));
  for (const key of Object.keys(good)) {
    const bad: Record<string, unknown> = { ...good };
    delete bad[key];
    assert.throws(() => configuration(bad));
  }
});
test("atomic updates, stale reads, identical retry, identity and rollback guards survive restart", () => {
  const dir = mkdtempSync(join(tmpdir(), "ceo-"));
  let s = new Store(join(dir, "policy.sqlite"));
  try {
    assert.equal(s.adminRead().setupRequired, true);
    assert.throws(() => s.read("context"), /SETUP_REQUIRED/);
    const c = fixture(),
      hash = digest(c);
    assert.throws(
      () => s.update("admin", "bad", 0, "0".repeat(64), c),
      /DIGEST/,
    );
    assert.deepEqual(s.update("admin", "initial", 0, hash, c), {
      revision: 1,
      digest: hash,
    });
    assert.deepEqual(s.update("admin", "initial", 0, hash, c), {
      revision: 1,
      digest: hash,
    });
    assert.throws(
      () => s.update("admin", "initial", 1, hash, c),
      /IDEMPOTENCY/,
    );
    assert.throws(
      () => s.update("other", "stale", 0, hash, c),
      /REVISION_CONFLICT/,
    );
    const changed = { ...c, profileId: "different" };
    assert.throws(
      () => s.update("admin", "identity", 1, digest(changed), changed),
      /IDENTITY/,
    );
    assert.equal(s.adminRead().revision, 1);
    s.close();
    s = new Store(join(dir, "policy.sqlite"));
    assert.equal(s.read("agents", 1).revision, 1);
    s.update("admin", "second", 1, hash, c);
    assert.throws(() => s.read("selection", 1), /REVISION_CONFLICT/);
    assert.deepEqual(s.update("admin", "initial", 0, hash, c), {
      revision: 1,
      digest: hash,
    });
  } finally {
    s.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("two simultaneous SQLite writers cannot both accept the same revision", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ceo-"));
  const path = join(dir, "db.sqlite");
  const s = new Store(path);
  const c = fixture();
  s.update("admin", "setup", 0, digest(c), c);
  try {
    const code = `import {parentPort,workerData} from 'node:worker_threads';import {Store} from ${JSON.stringify(new URL("../src/store.ts", import.meta.url).href)};import {digest} from ${JSON.stringify(new URL("../src/model.ts", import.meta.url).href)};const s=new Store(workerData.path);parentPort.postMessage('ready');parentPort.once('message',()=>{try{s.update('admin',workerData.id,1,digest(workerData.c),workerData.c);parentPort.postMessage('saved');}catch(e){parentPort.postMessage(e.message);}finally{s.close();}});`;
    const workers = ["one", "two"].map(
      (id) => new Worker(code, { eval: true, workerData: { path, id, c } }),
    );
    await Promise.all(
      workers.map(
        (w) =>
          new Promise<void>((resolve, reject) => {
            w.once("message", () => resolve());
            w.once("error", reject);
          }),
      ),
    );
    const results = workers.map(
      (w) =>
        new Promise<string>((resolve, reject) => {
          w.once("message", resolve);
          w.once("error", reject);
        }),
    );
    workers.forEach((w) => w.postMessage("go"));
    assert.deepEqual((await Promise.all(results)).sort(), [
      "REVISION_CONFLICT",
      "saved",
    ]);
    assert.equal(s.adminRead().revision, 2);
    await Promise.all(workers.map((w) => w.terminate()));
  } finally {
    s.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("relational children round-trip, FK/unique constraints hold and a mid-update failure rolls back every table", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const dir = mkdtempSync(join(tmpdir(), "ceo-"));
  const path = join(dir, "db.sqlite");
  const s = new Store(path),
    db = new DatabaseSync(path);
  try {
    const c = fixture();
    c.agents.push({ ...c.agents[0], id: "second-agent" });
    delete c.agents[1].environment;
    c.bindings.github.repositories.push("synthetic/second");
    s.update("admin", "initial", 0, digest(c), c);
    assert.deepEqual(s.adminRead().configuration, c);
    db.exec("PRAGMA foreign_keys=ON");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM agents").get()!.n, 2);
    assert.equal(
      db.prepare("SELECT COUNT(*) AS n FROM repositories").get()!.n,
      2,
    );
    assert.throws(
      () =>
        db.prepare("INSERT INTO repositories VALUES(999,0,?)").run("orphan"),
      /FOREIGN KEY/,
    );
    assert.throws(
      () =>
        db
          .prepare("INSERT INTO repositories VALUES(1,2,?)")
          .run("synthetic/second"),
      /UNIQUE/,
    );
    db.exec(
      "CREATE TRIGGER fail_children BEFORE INSERT ON agents WHEN NEW.revision=2 BEGIN SELECT RAISE(ABORT,'synthetic transaction interruption'); END;",
    );
    assert.throws(
      () => s.update("admin", "interrupted", 1, digest(c), c),
      /interruption/,
    );
    assert.equal(s.adminRead().revision, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM bindings").get()!.n, 1);
    assert.equal(
      db
        .prepare("SELECT COUNT(*) AS n FROM requests WHERE id='interrupted'")
        .get()!.n,
      0,
    );
    db.exec("DROP TRIGGER fail_children");
    s.update("admin", "interrupted", 1, digest(c), c);
    assert.equal(s.adminRead().revision, 2);
    assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
  } finally {
    db.close();
    s.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("unsafe JSON integers never commit an unreadable configuration revision", () => {
  const s = new Store(":memory:");
  try {
    const c = fixture();
    s.update("admin", "initial", 0, digest(c), c);
    for (const key of [
      "preferredMin",
      "preferredMax",
      "activeMax",
      "urgentIncidentMax",
    ] as const) {
      const invalid = structuredClone(c);
      invalid.capacity[key] = Number.MAX_SAFE_INTEGER + 1;
      assert.throws(
        () => s.update("admin", `unsafe-${key}`, 1, digest(invalid), invalid),
        /INVALID_CONFIGURATION/,
      );
    }
    assert.equal(s.adminRead().revision, 1);
    assert.equal(s.read("selection", 1).revision, 1);
    s.update("admin", "valid-followup", 1, digest(c), c);
    assert.equal(s.adminRead().revision, 2);
  } finally {
    s.close();
  }
});

test("clean schema 4 excludes release storage and restores only inactive schema 2 policy", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const dir = mkdtempSync(join(tmpdir(), "ceo-clean-"));
  const oldPath = join(dir, "old.sqlite");
  const old = new DatabaseSync(oldPath);
  old.exec("CREATE TABLE policy(revision INTEGER PRIMARY KEY); INSERT INTO policy VALUES(1); PRAGMA user_version=2");
  try {
    assert.throws(() => new Store(oldPath), /CLEAN_DATABASE_REQUIRED/);
    assert.equal(old.prepare("PRAGMA user_version").get()!.user_version, 2);
    assert.equal(old.prepare("SELECT revision FROM policy").get()!.revision, 1);
    const path = join(dir, "new.sqlite");
    const s = new Store(path);
    const db = new DatabaseSync(path);
    try {
      assert.equal(db.prepare("PRAGMA user_version").get()!.user_version, 4);
      assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='table' AND name LIKE 'release_%'").get()!.n, 0);
      assert.ok(!db.prepare("PRAGMA table_info(policy)").all().some(c => c.name === "observation_minutes"));
      assert.deepEqual(s.adminRead(), { schemaVersion: 2, revision: 0, setupRequired: true, configuration: null, digest: null });
      const c = { ...fixture(), active: false, executionEnabled: false, agents: [] };
      assert.deepEqual(s.update("admin", "restored", 0, digest(c), c), { revision: 1, digest: digest(c) });
      assert.deepEqual(s.adminRead().configuration, c);
      assert.deepEqual(s.listEvents().events, []);
      assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
    } finally { db.close(); s.close(); }
  } finally { old.close(); rmSync(dir, { recursive: true, force: true }); }
});
