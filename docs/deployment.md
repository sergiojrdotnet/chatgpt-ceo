# Manual deployment

One company, one service instance, one dedicated local SQLite volume. SQLite WAL,
FULL synchronization and immediate transactions fit the low-write configuration
workload. Do not use a network filesystem or independently writable replicas.
Policy, idempotency responses, checkpoint history and audit metadata persist on
`/data`. This database contains private plaintext policy/evidence; protect the host,
volume and backups. It is not a credential vault. There is no automatic CI deploy.

## Build and install

1. Check out the reviewed commit; run `npm ci && npm run check` with Node 24.13+.
   Python 3 with `requirements-dev.txt` is required by skill checks. Build
   `docker build --build-arg REVISION="$(git rev-parse HEAD)" -t chatgpt-ceo:reviewed .`.
   In a managed cloud build, supply the platform CA using
   `--secret id=proxy_ca,src="$CODEX_PROXY_CERT"`; never disable TLS verification.
   Run `CEO_TEST_IMAGE=chatgpt-ceo:reviewed npm run test:container` for the isolated
   shipped-Compose restart/auth-denial/backup smoke test (local Docker socket only).
2. On the authorized host, record existing services/ports and choose an unused
   loopback port. Copy `deploy/compose.yaml` and a private environment file based on
   `deploy/server.env.example` outside the public checkout. Set `CEO_IMAGE` to the
   inspected image ID/digest, `CEO_ENV_FILE` to that mode-0600 file and `CEO_PORT` to
   the selected unused port. Do not reuse the alerts volume, Access audience or port.
3. Set `PUBLIC_ORIGIN`, `CF_ACCESS_ISSUER`, `CF_ACCESS_AUD` from the actual dedicated
   authenticated route. `READ_EMAILS` permits company reads; `ADMIN_EMAILS` permits
   policy changes; `CHECKPOINT_EMAILS` permits checkpoint changes. Every writer must
   also be a reader. These role bindings are private operator configuration, not
   writable MCP policy. Removing an identity takes effect on requests after the
   operator reloads service configuration. JWT expiry is checked on every request.
4. Inspect `docker compose -f compose.yaml config` privately, then run
   `docker compose -f compose.yaml up -d`. Verify image revision, volume, loopback
   binding, nonroot user, read-only root, health/readiness and restart policy.
   `/readyz` checks database availability, not completed setup or business health.
5. Route only the dedicated hostname's `/mcp` through the existing authorized
   Tunnel to that loopback port, requiring Access and the dedicated audience.
   Preserve other routes and fallback denial. Do not register in a Cloudflare MCP
   portal. Server verifies the Access assertion signature via issuer JWKS, RS256,
   audience, issuer, required expiry/issued-at/subject, app token type and allowed
   email. It does not trust an unsigned identity header or a plain bearer token.
6. Use the existing approved client OAuth/Access integration. Provider discovery,
   authorization/token endpoints and the host callback/client binding belong to
   that integration; this server is not an OAuth authorization server. If discovery
   routing under `/.well-known/` is needed, route it to the actual existing provider,
   not to this server (which returns 404 there). Never expose `/mcp` unauthenticated
   to compensate for a failed client flow. Verify allowed and denied identities,
   real client authentication, read/write separation and public-origin behavior.

The reference is the TypeScript/official SDK, Access JWT/JWKS and SQLite WAL pattern
in [chatgpt-alerts](https://github.com/sergiojrdotnet/chatgpt-alerts/tree/a0b066a032424e6dcb9e35684e9c058420cb80e4).
No alert callbacks, subscriptions, event retention or encryption-key machinery is
needed here. Production discovery details remain in the private issue.

## Backup, recovery and upgrade

Use the online SQLite backup API, not a copy of only the live main DB:
`docker compose -f compose.yaml exec server node src/backup.ts /data/backups/unique-name.sqlite`.
The command refuses an existing target and verifies integrity. Copy completed
snapshots to protected off-host storage using the operator's approved procedure;
set retention and backup cadence there. No automatic backup scheduler is installed.
Exercise restore into a separate private volume with no production ingress, then
check policy revision, checkpoints and idempotent retry results before acceptance.

Before upgrade, take and verify a backup, record the immutable old image and stop
new dispatch at a safe checkpoint. Never run two versions against this volume.
An image rollback does not reverse configuration or external effects. A snapshot
restore can lose newer evidence: reconcile actual sessions and effects before any
retry, and explicitly revalidate the restored revision/digest against task evidence.
A policy correction is a reviewed new revision, never an in-place revision rewrite.
Do not delete the volume during container replacement. Existing checkpoint/audit
history has no automatic pruning; observe disk usage and choose an explicit private
retention policy before long-term growth becomes material.

## ChatGPT connection

The installed CEO plugin and its registered MCP connection are managed in ChatGPT.
The user connects and authenticates manually. Apply canonical skills and their
references to that same plugin without replacing its identity, connection or
presentation. Invoke setup after authentication and verify both skills and tools
in a fresh conversation. Local SDK tests do not establish installed-host behavior.

See [OpenAI connection testing](https://developers.openai.com/plugins/deploy/connect-chatgpt)
for the client connection and verification flow.
