// Synthetic consumer of the documented contract, not proof of host model behavior.
import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { fixture as storageFixture } from "./helpers/fixture.ts";
import { configuration, digest } from "../src/model.ts";
import type { Capacity } from "../src/model.ts";
import fixture from "../examples/inactive-a.json" with { type: "json" };
const envelope = z
  .object({
    schemaVersion: z.literal(2),
    digest: z.string().regex(/^[a-f0-9]{64}$/),
    complete: z.literal(true),
    readAt: z.iso.datetime(),
    effectiveAt: z.iso.datetime(),
    active: z.boolean(),
    fixtureOnly: z.boolean(),
    executionEnabled: z.boolean(),
    subject: z.string(),
    data: z.record(z.string(), z.unknown()),
  })
  .strict();
function consume(
  read: (
    subject: "context" | "agents" | "selection",
    expectedDigest?: string,
  ) => unknown,
  approved: { digest: string },
  clock = Date.now,
) {
  const outputs = [];
  for (const subject of ["context", "agents", "selection"] as const) {
    const e = envelope.parse(
      read(subject, subject === "context" ? undefined : approved.digest),
    );
    assert.equal(e.subject, subject);
    assert.equal(e.digest, approved.digest);
    const now = clock();
    assert.ok(
      now - Date.parse(e.readAt) >= 0 && now - Date.parse(e.readAt) <= 30000,
    );
    assert.ok(Date.parse(e.effectiveAt) <= now);
    assert.equal(e.active, true);
    assert.equal(e.fixtureOnly, false);
    assert.equal(e.executionEnabled, true);
    assert.ok(Object.keys(e.data).length);
    outputs.push(e);
  }
  return outputs;
}
test("partial, stale, inactive, unauthorized, unavailable and digest-changing reads yield no usable set", () => {
  const f = storageFixture(),
    s = f.store;
  const c = {
    ...fixture,
    active: true,
    fixtureOnly: false,
    executionEnabled: true,
  };
  const approved = { digest: digest(c) };
  s.update(null, approved.digest, c);
  try {
    const read = (subject: "context" | "agents" | "selection", r?: string) =>
      s.read(subject, r);
    assert.equal(consume(read, approved, Date.now).length, 3);
    for (const bad of [
      { complete: false },
      { readAt: "2000-01-01T00:00:00Z" },
      { digest: "a".repeat(64) },
      { active: false },
      { fixtureOnly: true },
      { executionEnabled: false },
      { data: {} },
    ])
      assert.throws(() =>
        consume(
          (subject, r) => ({
            ...read(subject, r),
            ...(subject === "agents" ? bad : {}),
          }),
          approved,
          Date.now,
        ),
      );
    assert.throws(() =>
      consume(
        (subject, r) =>
          subject === "agents" ? { error: "UNAUTHORIZED" } : read(subject, r),
        approved,
        Date.now,
      ),
    );
    assert.throws(() =>
      consume(
        (subject, r) => {
          if (subject === "selection") throw Error("UNAVAILABLE");
          return read(subject, r);
        },
        approved,
        Date.now,
      ),
    );
    assert.throws(
      () =>
        consume(
          (subject, r) => {
            if (subject === "agents")
              s.update(approved.digest, digest({ ...c, ownerRef: "changed" }), {
                ...c,
                ownerRef: "changed",
              });
            return read(subject, r);
          },
          approved,
          Date.now,
        ),
      /CONFIGURATION_CONFLICT/,
    );
  } finally {
    f.cleanup();
  }
});

// Executable reference for docs/incident-capacity.md, not a production scheduler
// or proof that the separately installed skills follow these instructions.
type Response = { owner: string; nextAction: string; executor?: string };
function referenceConsumer(capacity: Capacity, occupied: number) {
  const episodes = new Map<string, Response>();
  return {
    ordinary: () => occupied < capacity.activeMax,
    episodes,
    // Call only after source/impact/episode correlation is verified. This key
    // represents source + resource + fingerprint + occurrence, not alert text.
    incident(episode: string, suitableExecutor?: string) {
      const existing = episodes.get(episode);
      if (existing) return existing;
      if (capacity.incidentAdmission !== "uncapped")
        throw Error("Explicit reviewed migration required");
      const response: Response = {
        owner: "synthetic-coordinator",
        nextAction: suitableExecutor
          ? "Verify dispatch before transferring investigation ownership"
          : "Triage; record executor constraint; sequence or escalate; recheck availability",
        ...(suitableExecutor ? { executor: suitableExecutor } : {}),
      };
      episodes.set(episode, response);
      occupied++;
      return response;
    },
  };
}

test("reference consumer admits distinct responses beyond legacy count while ordinary work stays bounded", () => {
  const f = storageFixture();
  const c = {
    ...fixture,
    active: true,
    fixtureOnly: false,
    executionEnabled: true,
    capacity: {
      preferredMin: 3,
      preferredMax: 5,
      activeMax: 5,
      incidentAdmission: "uncapped",
    },
  };
  try {
    f.store.update(null, digest(c), c);
    const outputs = consume((s, d) => f.store.read(s, d), {
      digest: digest(c),
    });
    const capacity = configuration({
      ...c,
      capacity: outputs[2].data.capacity,
    }).capacity;
    assert.equal(referenceConsumer(capacity, 4).ordinary(), true);
    const consumer = referenceConsumer(capacity, 5);
    assert.equal(consumer.ordinary(), false);
    for (let i = 0; i < 9; i++) {
      const response = consumer.incident(
        `synthetic-source/resource-${i}/fingerprint/occurrence-1`,
      );
      assert.equal(response.owner, "synthetic-coordinator");
      assert.equal(response.executor, undefined);
      assert.match(response.nextAction, /executor constraint/);
      assert.equal(consumer.ordinary(), false);
    }
    assert.equal(consumer.episodes.size, 9);
    assert.equal(referenceConsumer(capacity, 6).ordinary(), false);
    // Count exemption must not be inferred from a legacy numeric value.
    assert.throws(
      () =>
        referenceConsumer(configuration(fixture).capacity, 5).incident(
          "legacy-episode",
        ),
      /migration required/,
    );
    for (const control of [
      { active: false },
      { fixtureOnly: true },
      { executionEnabled: false },
    ]) {
      const controlled = { ...c, ...control };
      const previous = f.store.adminRead().digest;
      f.store.update(previous, digest(controlled), controlled);
      assert.throws(() =>
        consume((s, d) => f.store.read(s, d), { digest: digest(controlled) }),
      );
    }
  } finally {
    f.cleanup();
  }
});

test("reference correlation preserves actual owner on repeat and scarce executors do not duplicate response", () => {
  const capacity: Capacity = {
    preferredMin: 3,
    preferredMax: 5,
    activeMax: 5,
    incidentAdmission: "uncapped",
  };
  const consumer = referenceConsumer(capacity, 5);
  const episode = "synthetic-source/resource-a/fingerprint/occurrence-1";
  const first = consumer.incident(episode, "synthetic-executor-a");
  // Transfer only after verified dispatch; delayed firing/resolved deliveries
  // retain this actual owner and do not establish restoration.
  first.owner = "synthetic-executor-a";
  first.nextAction = "Verify affected service restoration";
  assert.strictEqual(consumer.incident(episode, "synthetic-executor-b"), first);
  assert.equal(consumer.episodes.size, 1);
  assert.equal(first.owner, "synthetic-executor-a");
  assert.equal(first.nextAction, "Verify affected service restoration");
  // A distinct response is admitted but a conflicting mutation must wait.
  const second = consumer.incident(
    "synthetic-source/resource-a/other-fingerprint/occurrence-1",
  );
  assert.equal(second.owner, "synthetic-coordinator");
  assert.equal(second.executor, undefined);
  assert.match(second.nextAction, /sequence or escalate/);
  // Only after proven restoration and verified new occurrence use a new key.
  consumer.incident("synthetic-source/resource-a/fingerprint/occurrence-2");
  assert.equal(consumer.episodes.size, 3);
});
