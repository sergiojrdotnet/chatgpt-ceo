import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  rmSync,
  chmodSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";
const directory = mkdtempSync(join(tmpdir(), "ceo-container-")),
  project = `ceo-test-${process.pid}`,
  network = `${project}-net`,
  clickhouse = `${project}-clickhouse`;
const envFile = join(directory, "server.env");
writeFileSync(
  envFile,
  "PUBLIC_ORIGIN=https://ceo.example.test\nCF_ACCESS_ISSUER=https://synthetic.cloudflareaccess.com\nCF_ACCESS_AUD=synthetic\nREAD_EMAILS=reader@example.test\nADMIN_EMAILS=reader@example.test\nEVENT_EMAILS=reader@example.test\nCLICKHOUSE_URL=http://clickhouse:8123\nCLICKHOUSE_DATABASE=ceo\nCLICKHOUSE_USER=ceo_history_writer\nCLICKHOUSE_PASSWORD=synthetic-test-only\n",
  { mode: 0o600 },
);
const httpOnly = join(directory, "http-only.xml");
writeFileSync(
  httpOnly,
  '<clickhouse><tcp_port remove="1"/><tcp_port_secure remove="1"/></clickhouse>',
);
chmodSync(httpOnly, 0o644);
const env = {
  ...process.env,
  CEO_IMAGE: process.env.CEO_TEST_IMAGE ?? "ceo-check",
  CEO_ENV_FILE: envFile,
  CEO_PORT: "0",
  CEO_NETWORK: network,
};
for (const key of [
  "DOCKER_HOST",
  "DOCKER_CONTEXT",
  "DOCKER_TLS",
  "DOCKER_TLS_VERIFY",
  "DOCKER_CERT_PATH",
])
  delete env[key];
const docker = (args, input) =>
  execFileSync("docker", ["--host=unix:///var/run/docker.sock", ...args], {
    env,
    encoding: "utf8",
    input,
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
async function waitReady(url) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw Error("Test service not ready");
}
try {
  docker(["network", "create", network]);
  docker([
    "run",
    "-d",
    "--name",
    clickhouse,
    "--mount",
    `type=bind,src=${httpOnly},dst=/etc/clickhouse-server/config.d/http-only.xml,readonly`,
    "--network",
    network,
    "--network-alias",
    "clickhouse",
    "-p",
    "127.0.0.1::8123",
    "-e",
    "CLICKHOUSE_USER=default",
    "-e",
    "CLICKHOUSE_PASSWORD=synthetic-admin-only",
    "-e",
    "CLICKHOUSE_DEFAULT_ACCESS_MANAGEMENT=1",
    process.env.CEO_TEST_CLICKHOUSE_IMAGE ??
      "clickhouse/clickhouse-server:26.8.34.13@sha256:8b28eb09479c36c4533eec7a6268917d04ba3a6fd90e3f4205f70e761b6d7779",
  ]);
  const chUrl = "http://" + docker(["port", clickhouse, "8123/tcp"]);
  await waitReady(chUrl + "/ping");
  const sql =
    readFileSync("deploy/clickhouse.sql", "utf8") +
    "\nCREATE USER ceo_history_writer IDENTIFIED BY 'synthetic-test-only'; GRANT SELECT, INSERT ON ceo.coordination_events TO ceo_history_writer;";
  for (const statement of sql
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)) {
    const response = await fetch(chUrl, {
      method: "POST",
      headers: {
        "X-ClickHouse-User": "default",
        "X-ClickHouse-Key": "synthetic-admin-only",
      },
      body: statement,
    });
    const result = await response.text();
    assert.ok(response.ok, result);
    assert.equal(result, "");
  }
  assert.throws(
    () =>
      docker([
        "exec",
        clickhouse,
        "clickhouse-client",
        "--password",
        "synthetic-admin-only",
        "--query",
        "SELECT 1",
      ]),
    /Command failed/,
  );
  execFileSync(
    process.execPath,
    ["--test", "tests/clickhouse.integration.ts"],
    { env: { ...env, CEO_TEST_CLICKHOUSE_URL: chUrl }, stdio: "inherit" },
  );
  compose(["up", "-d"]);
  let url = "http://" + compose(["port", "server", "3000"]);
  await waitReady(url + "/readyz");
  assert.equal(
    (await fetch(url + "/mcp", { method: "POST", body: "{}" })).status,
    401,
  );
  const c = JSON.parse(readFileSync("examples/inactive-a.json", "utf8"));
  const save =
    "import {ConfigStore} from './src/config-store.ts';import {digest} from './src/model.ts';const s=new ConfigStore(process.env.CONFIG_PATH);const c=JSON.parse(process.argv[1]);s.update(null,digest(c),c);";
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
  url = "http://" + compose(["port", "server", "3000"]);
  await waitReady(url + "/readyz");
  const check =
    "import {ConfigStore} from './src/config-store.ts';const s=new ConfigStore(process.env.CONFIG_PATH);const c=JSON.parse(process.argv[1]);if(JSON.stringify(s.adminRead().configuration)!==JSON.stringify(c))process.exit(1);";
  compose([
    "exec",
    "-T",
    "server",
    "node",
    "--input-type=module",
    "-e",
    check,
    JSON.stringify(c),
  ]);
  const id = compose(["ps", "-q", "server"]);
  const host = JSON.parse(
    docker(["inspect", "--format", "{{json .HostConfig}}", id]),
  );
  assert.equal(host.ReadonlyRootfs, true);
  assert.deepEqual(host.CapDrop, ["ALL"]);
  assert.equal(docker(["inspect", "--format", "{{.Config.User}}", id]), "node");
  console.log(
    "PASS: isolated real ClickHouse, SELECT/INSERT account, 1205-event traversal, shipped Compose, persistent config restart, auth denial and nonroot/read-only runtime. No production evidence.",
  );
} catch (error) {
  try {
    console.error(docker(["logs", "--tail", "40", clickhouse]));
  } catch {}
  throw error;
} finally {
  try {
    compose(["down", "-v"]);
  } finally {
    try {
      docker(["rm", "-f", "-v", clickhouse]);
    } finally {
      try {
        docker(["network", "rm", network]);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    }
  }
}
