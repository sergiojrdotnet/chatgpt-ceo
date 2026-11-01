import { ClickHouse } from "./clickhouse.ts";
import { app } from "./app.ts";
function required(name: string) {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}
function emails(name: string) {
  return required(name)
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}
const issuer = new URL(required("CF_ACCESS_ISSUER"));
const origin = new URL(required("PUBLIC_ORIGIN"));
if (
  issuer.protocol !== "https:" ||
  origin.protocol !== "https:" ||
  issuer.username ||
  issuer.password ||
  origin.username ||
  origin.password ||
  issuer.pathname !== "/" ||
  origin.pathname !== "/" ||
  issuer.search ||
  issuer.hash ||
  origin.search ||
  origin.hash
)
  throw new Error("Expected HTTPS origins");
const application = app({
  issuer: issuer.origin,
  publicOrigin: origin.origin,
  audience: required("CF_ACCESS_AUD"),
  readers: emails("READ_EMAILS"),
  admins: emails("ADMIN_EMAILS"),
  eventWriters: emails("EVENT_EMAILS"),
  configPath: required("CONFIG_PATH"),
  eventDatabase: new ClickHouse({
    url: required("CLICKHOUSE_URL"),
    database: required("CLICKHOUSE_DATABASE"),
    username: required("CLICKHOUSE_USER"),
    password: required("CLICKHOUSE_PASSWORD"),
  }),
});
const port = Number(process.env.PORT ?? "3000");
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("Invalid PORT");
application.server.listen(port, "0.0.0.0");
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    void application.close().then(() => process.exit(0));
  });
