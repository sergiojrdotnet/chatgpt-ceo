import test from "node:test";
import assert from "node:assert/strict";
import {
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  mkdirSync,
} from "node:fs";
import { join } from "node:path";
import { ConfigStore } from "../src/config-store.ts";
import { configuration } from "../src/model.ts";
import { fixture, config, digest } from "./helpers/fixture.ts";
test("current configuration persists atomically, conflicts on stale digest and has no history/replay", () => {
  const f = fixture();
  try {
    assert.equal(f.store.adminRead().setupRequired, true);
    assert.throws(() => f.store.read("context"), /SETUP_REQUIRED/);
    f.setup();
    const next = { ...config, ownerRef: "synthetic-next" };
    assert.throws(
      () => f.store.update(null, digest(next), next),
      /CONFIGURATION_CONFLICT/,
    );
    assert.throws(
      () => f.store.update(digest(config), digest(config), next),
      /REVIEW_DIGEST_MISMATCH/,
    );
    f.store.update(digest(config), digest(next), next);
    assert.throws(
      () => f.store.read("agents", digest(config)),
      /CONFIGURATION_CONFLICT/,
    );
    assert.deepEqual(
      new ConfigStore(f.store.path).adminRead().configuration,
      next,
    );
    assert.deepEqual(JSON.parse(readFileSync(f.store.path, "utf8")), next);
    assert.deepEqual(readdirSync(f.directory), ["config.json"]);
    assert.equal(statSync(f.store.path).mode & 0o777, 0o600);
    assert.equal("revision" in f.store.adminRead(), false);
  } finally {
    f.cleanup();
  }
});
test("invalid configuration and failed replacement preserve the last valid file", () => {
  const f = fixture();
  try {
    f.setup();
    const before = readFileSync(f.store.path);
    for (const bad of [
      { ...config, unknown: true },
      { ...config, timezone: "Not/AZone" },
      { ...config, agents: [config.agents[0], config.agents[0]] },
      { ...config, capacity: { ...config.capacity, urgentIncidentMax: 99 } },
      {
        ...config,
        capacity: {
          preferredMin: 1,
          preferredMax: 2,
          activeMax: 2 ** 53,
          urgentIncidentMax: 2 ** 53,
        },
      },
      { ...config, active: true, executionEnabled: true, agents: [] },
      {
        ...config,
        selection: {
          ...config.selection,
          administrativeHours: { start: "20:00", end: "10:00" },
        },
      },
    ])
      assert.throws(() => f.store.update(digest(config), digest(bad), bad));
    assert.deepEqual(readFileSync(f.store.path), before);
    const blocked = join(f.directory, "blocked");
    writeFileSync(blocked, "existing");
    assert.throws(() =>
      new ConfigStore(join(blocked, "config.json")).update(
        null,
        digest(config),
        config,
      ),
    );
    assert.equal(readFileSync(blocked, "utf8"), "existing");
    writeFileSync(f.store.path, "broken");
    assert.throws(() => f.store.adminRead());
    assert.throws(() => f.store.update(null, digest(config), config));
  } finally {
    f.cleanup();
  }
});
test("five optional agent instructions round-trip without placeholders", () => {
  const f = fixture();
  try {
    const agents = Array.from({ length: 5 }, (_, i) => {
      const { instructions, ...rest } = config.agents[0];
      return { ...rest, id: `synthetic-${i}` };
    });
    const c = { ...config, agents };
    f.store.update(null, digest(c), c);
    assert.deepEqual(f.store.read("agents", digest(c)).data, { agents });
    for (const instructions of ["", "  "])
      assert.throws(() =>
        configuration({ ...c, agents: [{ ...agents[0], instructions }] }),
      );
    const mixed = {
      ...c,
      agents: [
        ...agents.slice(0, 4),
        { ...agents[4], instructions: "Approved context" },
      ],
    };
    f.store.update(digest(c), digest(mixed), mixed);
    assert.deepEqual(f.store.adminRead().configuration, mixed);
  } finally {
    f.cleanup();
  }
});
test("missing versus invalid file is explicit; directories are not setup", () => {
  const f = fixture();
  try {
    mkdirSync(f.store.path);
    assert.throws(() => f.store.adminRead());
  } finally {
    f.cleanup();
  }
});

test("fsync failure before rename preserves old config; after rename reports uncertainty", async () => {
  const fs = (await import("node:fs")).default;
  const { syncBuiltinESMExports } = await import("node:module");
  const original = fs.fsyncSync;
  const f = fixture();
  try {
    f.setup();
    const c = { ...config, ownerRef: "synthetic-replacement" };
    fs.fsyncSync = () => {
      throw Error("synthetic pre-rename failure");
    };
    syncBuiltinESMExports();
    assert.throws(
      () => f.store.update(digest(config), digest(c), c),
      /pre-rename/,
    );
    assert.deepEqual(f.store.adminRead().configuration, config);
    assert.deepEqual(readdirSync(f.directory), ["config.json"]);
    let calls = 0;
    fs.fsyncSync = (fd) => {
      if (++calls === 2) throw Error("synthetic directory sync failure");
      original(fd);
    };
    syncBuiltinESMExports();
    assert.throws(
      () => f.store.update(digest(config), digest(c), c),
      /CONFIGURATION_WRITE_UNCERTAIN/,
    );
    assert.deepEqual(f.store.adminRead().configuration, c);
  } finally {
    fs.fsyncSync = original;
    syncBuiltinESMExports();
    f.cleanup();
  }
});

test("maximum accepted config remains readable after file replacement", () => {
  const f = fixture();
  try {
    const c = structuredClone(config);
    c.agents[0].instructions = "x";
    const size = Buffer.byteLength(JSON.stringify(c));
    c.agents[0].instructions = "x".repeat(256 * 1024 - size + 1);
    assert.equal(Buffer.byteLength(JSON.stringify(c)), 256 * 1024);
    f.store.update(null, digest(c), c);
    assert.equal(f.store.adminRead().digest, digest(c));
    const tooLarge = structuredClone(c);
    tooLarge.agents[0].instructions += "x";
    assert.throws(
      () => f.store.update(digest(c), digest(tooLarge), tooLarge),
      /INVALID_CONFIGURATION/,
    );
    assert.equal(f.store.adminRead().digest, digest(c));
  } finally {
    f.cleanup();
  }
});

test("new store fails closed on malformed persisted configuration after restart", () => {
  const f = fixture();
  try {
    f.setup();
    assert.deepEqual(f.store.adminRead().configuration, config);
    writeFileSync(f.store.path, '{"schemaVersion":2,');
    const restarted = new ConfigStore(f.store.path);
    assert.throws(() => restarted.adminRead(), SyntaxError);
    assert.throws(() => restarted.read("context"), SyntaxError);
    assert.throws(
      () => restarted.update(null, digest(config), config),
      SyntaxError,
    );
    assert.equal(readFileSync(f.store.path, "utf8"), '{"schemaVersion":2,');
  } finally {
    f.cleanup();
  }
});
