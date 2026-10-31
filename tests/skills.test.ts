import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("canonical skills, contained references and process scenarios", () => {
  const result = spawnSync("python", ["-m", "unittest", "discover", "-s", "tests", "-p", "test_skills.py", "-v"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
