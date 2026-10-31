import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
test("canonical private package, link, privacy and schema checks", () => {
  const r = spawnSync(
    "python",
    [
      "-m",
      "unittest",
      "discover",
      "-s",
      "tests",
      "-p",
      "test_package.py",
      "-v",
    ],
    { encoding: "utf8" },
  );
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
