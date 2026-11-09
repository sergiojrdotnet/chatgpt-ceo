import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ConfigStore } from "../src/config-store.ts";
import { configuration } from "../src/model.ts";
import { fixture, config, digest } from "./helpers/fixture.ts";

const uncapped = {
  ...config,
  capacity: {
    preferredMin: 3,
    preferredMax: 5,
    activeMax: 5,
    incidentAdmission: "uncapped" as const,
  },
};

test("explicit uncapped policy round-trips without changing legacy content or digest", () => {
  const f = fixture();
  try {
    f.setup();
    const legacy = readFileSync(f.store.path, "utf8");
    assert.deepEqual(configuration(config), config);
    assert.equal(f.store.adminRead().digest, digest(config));
    assert.equal(readFileSync(f.store.path, "utf8"), legacy);
    assert.deepEqual(configuration(uncapped), uncapped);
    assert.throws(
      () => f.store.update(digest(config), digest(config), uncapped),
      /REVIEW_DIGEST_MISMATCH/,
    );
    f.store.update(digest(config), digest(uncapped), uncapped);
    const restarted = new ConfigStore(f.store.path);
    assert.deepEqual(restarted.adminRead().configuration, uncapped);
    const context = restarted.read("context");
    assert.deepEqual(
      restarted.read("selection", context.digest).data.capacity,
      uncapped.capacity,
    );
    assert.throws(
      () => restarted.read("selection", digest(config)),
      /CONFIGURATION_CONFLICT/,
    );
    // A rollback is also an explicit reviewed whole-configuration replacement.
    f.store.update(digest(uncapped), digest(config), config);
    assert.equal(f.store.adminRead().digest, digest(config));
  } finally {
    f.cleanup();
  }
});

test("capacity requires exactly one incident representation and retains numeric safeguards", () => {
  const base = { preferredMin: 3, preferredMax: 5, activeMax: 5 };
  for (const capacity of [
    base,
    { ...base, incidentAdmission: "unlimited" },
    { ...base, incidentAdmission: null },
    { ...base, incidentAdmission: 999999999 },
    { ...base, incidentAdmission: "uncapped", urgentIncidentMax: 6 },
    { ...base, urgentIncidentMax: 5 },
    { ...base, urgentIncidentMax: 7 },
    { ...base, urgentIncidentMax: Number.MAX_SAFE_INTEGER },
    ...["preferredMin", "preferredMax", "activeMax"].flatMap((field) =>
      [0, 1.5, Number.MAX_SAFE_INTEGER + 1].map((value) => ({
        ...uncapped.capacity,
        [field]: value,
      })),
    ),
    { ...uncapped.capacity, preferredMin: 6 },
    { ...uncapped.capacity, preferredMax: 6 },
    { ...uncapped.capacity, unknown: true },
  ])
    assert.throws(() => configuration({ ...config, capacity }));
  assert.deepEqual(
    configuration({ ...config, capacity: { ...base, urgentIncidentMax: 6 } })
      .capacity,
    { ...base, urgentIncidentMax: 6 },
  );
  // The explicit policy has no activeMax + 1 constraint, including at the safe bound.
  assert.doesNotThrow(() =>
    configuration({
      ...uncapped,
      capacity: { ...uncapped.capacity, activeMax: Number.MAX_SAFE_INTEGER },
    }),
  );
});
