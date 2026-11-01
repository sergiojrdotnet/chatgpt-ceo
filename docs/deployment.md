# Deployment

Run one CEO server process with a dedicated writable local directory containing
`config.json`. Configuration is current-only; do not run competing writers or live
external editors. Events go directly to the shared ClickHouse service. No local
event database, queue, replay journal or automatic production deployment exists.

## Build and isolated checks

Use Node 24.13+ and `npm ci && npm run check`. Build the reviewed commit:

```sh
docker build --build-arg REVISION="$(git rev-parse HEAD)" -t chatgpt-ceo:reviewed .
CEO_TEST_IMAGE=chatgpt-ceo:reviewed npm run test:container
```

In managed cloud builds, pass `--secret id=proxy_ca,src="$CODEX_PROXY_CERT"` to the
build; TLS verification remains enabled. The container smoke script targets only
the local Docker socket and creates/removes its own synthetic network, containers
and volume. Its ClickHouse 26.8.34.13 LTS image is pinned by digest and can be explicitly overridden
with `CEO_TEST_CLICKHOUSE_IMAGE` to verify the operator's selected server version.

## Operator bootstrap and access

Infrastructure owns shared service `clickhouse` on `aluno-expert-net`, internal HTTP
port 8123 with no public listener and the native protocol disabled. The endpoint/database are configurable via
`CLICKHOUSE_URL` and `CLICKHOUSE_DATABASE`. The application table is always
`coordination_events`; [clickhouse.sql](../deploy/clickhouse.sql) supplies operator
DDL for database `ceo`. If another database is approved, apply the reviewed DDL to
that database and set matching runtime configuration.

An authorized operator applies the DDL and verifies table definition. Runtime never
creates a database/table or provisions a user. Provision the CEO account separately
(`ceo_history_writer`) with SELECT/INSERT only on `ceo.coordination_events`; Grafana gets its own read-only
account. Keep `CLICKHOUSE_USER` and `CLICKHOUSE_PASSWORD` in private secret environment
bindings, not configuration JSON, image, command-line URLs or committed files.
Credential creation and access changes require their own applicable authorization.

Copy [Compose](../deploy/compose.yaml) and a private environment file based on the
[example](../deploy/server.env.example) outside the public checkout. Set `CEO_IMAGE`
to the reviewed immutable image, `CEO_ENV_FILE` to the private mode-0600 environment
file and `CEO_PORT` to a verified unused loopback port. `CEO_NETWORK` defaults to the
existing shared network. Compose does not create or own ClickHouse. It mounts a
dedicated data directory at `/data`; `CONFIG_PATH=/data/config.json`. Mount the
directory, not a single file, so atomic rename can succeed. Preserve nonroot ownership,
read-only root filesystem, capability drops and resource limits.

## Authentication and readiness

Preserve existing Cloudflare Access/Tunnel routing and client authorization. Only
`/mcp` is routed through the authorized hostname. `PUBLIC_ORIGIN`, `CF_ACCESS_ISSUER`
and `CF_ACCESS_AUD` name the actual approved origin/issuer/audience. The server
validates Access signature, issuer, audience, expiry, issued-at, subject and app token
type; it does not trust an unsigned email header or plain bearer token.
`READ_EMAILS`, `ADMIN_EMAILS`, `EVENT_EMAILS` retain separate roles. Writers must also
be readers. Operator binding changes take effect after service reload, and expiry
is checked on every call. The service is not an OAuth authorization server; preserve
the existing integration's discovery/token endpoints and host client binding.

`/healthz` checks process liveness. `/readyz` validates the current configuration when
present and queries the actual history table with runtime read credentials. Missing
configuration allows setup, but malformed/unreadable configuration or inaccessible
history makes readiness fail. Readiness is not evidence of write permission, business
health or installed-host rendering. Verify these separately using authorized tests.

## Breaking cutover

1. Privately read the complete current configuration from the running admin API.
   Preserve the exact approved values, profiles and execution controls. Validate
   using the new schema/model, record its digest privately, and prepare mode-0600
   `config.json` in the new dedicated directory. Do not commit private configuration.
2. Verify shared ClickHouse readiness, operator-applied table DDL, scoped credentials
   and the actual image. Coordinate installed-skill changes with the new API:
   `expectedDigest` replaces revision arguments, request IDs/replay disappear, issue
   identity is UUID and pagination no longer promises transactional snapshots. Old
   callers must not be silently accepted. Do not publish incompatible skills while
   the old server remains active.
3. Stop the old CEO writer and start the reviewed image with the prepared configuration
   directory. Verify configuration digest and all approved values through authenticated
   reads, unchanged execution flags, API role denial, direct event insert/read/correction
   behavior, and the v2 resource in actual ChatGPT. No historical event import is used.
4. Only after new-service validation and explicit exact-target deletion authorization,
   inspect old mounts/paths and delete the obsolete CEO database, its WAL/SHM companions
   and other specifically authorized CEO-only storage artifacts. Do not select targets
   by guessed names, remove unrelated backups or delete a volume containing config.json.
   Record actual targets and outcome privately; no blanket application-wide deletion.

Before old-data deletion, reverting to the old image and preserved old storage is
possible but does not include events written to ClickHouse after cutover. Reconcile
those effects before another action. After permanent deletion, old history is not
recoverable by this server; rollback must preserve the file/ClickHouse contract or
use a separately authorized recovery source. Do not imply a reversible history reset.

Current-file recovery restores an explicitly approved private copy and revalidates
its digest and execution settings; there is no built-in configuration history.
ClickHouse retention/backup/recovery belongs to the shared infrastructure operator.
Inspect leftover `.config-*.tmp` files after an abrupt process exit; they are not
current configuration and must never be automatically promoted.
