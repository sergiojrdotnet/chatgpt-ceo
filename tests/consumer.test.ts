// Synthetic consumer of the documented contract, not proof of host model behavior.
import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { fixture as storageFixture } from "./helpers/fixture.ts";
import { digest } from "../src/model.ts";
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
