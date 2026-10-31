// Synthetic consumer of the documented contract, not proof of host model behavior.
import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { Store } from "../src/store.ts";
import { digest } from "../src/model.ts";
import fixture from "../examples/inactive-a.json" with { type: "json" };
const envelope = z
  .object({
    schemaVersion: z.literal(1),
    revision: z.number().int().positive(),
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
    subject: "context" | "agents" | "selection" | "release",
    revision?: number,
  ) => unknown,
  approved: { revision: number; digest: string },
  clock = Date.now,
) {
  const outputs = [];
  for (const subject of [
    "context",
    "agents",
    "selection",
    "release",
  ] as const) {
    const e = envelope.parse(
      read(subject, subject === "context" ? undefined : approved.revision),
    );
    assert.equal(e.subject, subject);
    assert.equal(e.revision, approved.revision);
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
test("partial, stale, inactive, unauthorized, unavailable and revision-changing reads yield no usable set", () => {
  const s = new Store(":memory:");
  const c = {
    ...fixture,
    active: true,
    fixtureOnly: false,
    executionEnabled: true,
  };
  const approved = { revision: 1, digest: digest(c) };
  s.update("admin", "setup", 0, approved.digest, c);
  try {
    const read = (
      subject: "context" | "agents" | "selection" | "release",
      r?: number,
    ) => s.read(subject, r);
    assert.equal(consume(read, approved, Date.now).length, 4);
    for (const bad of [
      { complete: false },
      { readAt: "2000-01-01T00:00:00Z" },
      { digest: "a".repeat(64) },
      { revision: 2 },
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
          if (subject === "release") throw Error("UNAVAILABLE");
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
              s.update("admin", "change", 1, approved.digest, c);
            return read(subject, r);
          },
          approved,
          Date.now,
        ),
      /REVISION_CONFLICT/,
    );
  } finally {
    s.close();
  }
});
