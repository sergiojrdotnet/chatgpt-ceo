import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";
const directory = mkdtempSync(join(tmpdir(), "ceo-container-"));
const project = `ceo-test-${process.pid}`;
const envFile = join(directory, "server.env");
writeFileSync(
  envFile,
  "PUBLIC_ORIGIN=https://ceo.example.test\nCF_ACCESS_ISSUER=https://synthetic.cloudflareaccess.com\nCF_ACCESS_AUD=synthetic\nREAD_EMAILS=reader@example.test\nADMIN_EMAILS=reader@example.test\nEVENT_EMAILS=reader@example.test\n",
  { mode: 0o600 },
);
const env = {
  ...process.env,
  CEO_IMAGE: process.env.CEO_TEST_IMAGE ?? "ceo-alu66:local",
  CEO_ENV_FILE: envFile,
  CEO_PORT: "0",
};
const docker = (args) =>
  execFileSync("docker", ["--host=unix:///var/run/docker.sock", ...args], {
    env,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
const compose = (args) =>
  docker([
    "compose",
    "-p",
    project,
    "-f",
    resolve("deploy/compose.yaml"),
    ...args,
  ]);
async function ready() {
  const address = compose(["port", "server", "3000"]);
  const url = `http://${address}`;
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(url + "/readyz")).ok) return url;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw Error("Container did not become ready");
}
try {
  compose(["up", "-d"]);
  let url = await ready();
  assert.equal(
    (await fetch(url + "/mcp", { method: "POST", body: "{}" })).status,
    401,
  );
  const c = JSON.parse(readFileSync("examples/inactive-a.json", "utf8"));
  const save =
    "import {Store} from './src/store.ts';import {digest} from './src/model.ts';const s=new Store(process.env.DATABASE_PATH);const c=JSON.parse(process.argv[1]);s.update('synthetic','setup',0,digest(c),c);s.close();";
  compose([
    "exec",
    "-T",
    "server",
    "node",
    "--input-type=module",
    "-e",
    save,
    JSON.stringify(c),
  ]);
  compose(["restart", "server"]);
  url = await ready();
  assert.equal(
    (await fetch(url + "/mcp", { method: "POST", body: "{}" })).status,
    401,
  );
  const check =
    "import {Store} from './src/store.ts';const s=new Store(process.env.DATABASE_PATH);if(s.adminRead().revision!==1)process.exit(1);await s.backup('/data/recovery.sqlite');s.close();";
  compose(["exec", "-T", "server", "node", "--input-type=module", "-e", check]);
  const id = compose(["ps", "-q", "server"]);
  const inspected = JSON.parse(
    docker(["inspect", "--format", "{{json .HostConfig}}", id]),
  );
  assert.equal(inspected.ReadonlyRootfs, true);
  assert.deepEqual(inspected.CapDrop, ["ALL"]);
  assert.equal(docker(["inspect", "--format", "{{.Config.User}}", id]), "node");
  console.log(
    "Container PASS: shipped Compose, nonroot/read-only isolation, auth denial, persistent restart and online backup. Synthetic only.",
  );
} catch (error) {
  console.error(compose(["logs", "--tail", "30", "server"]));
  throw error;
} finally {
  try {
    compose(["down", "-v"]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
