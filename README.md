# CEO

A single-company configuration and immutable coordination-history MCP server.
ChatGPT manages the installed CEO plugin, its connection and presentation. Skills
and their procedural references are maintained directly in that plugin, separately
from this server repository. Server changes do not publish or overwrite them.
Linear owns objectives, acceptance, decisions and delivery state. The server stores
configuration and immutable coordination events; it does not schedule, dispatch,
grant operational authority or guarantee exactly-once external effects.

| MCP tool | Input | Access |
| --- | --- | --- |
| `get_operation_context` | Optional `expectedRevision` | Read context/bindings and revision |
| `get_agents` | `expectedRevision` | Read complete templates |
| `get_selection_policy` | `expectedRevision` | Read selection/capacity |
| `get_configuration` | None | Admin read/setup status |
| `validate_configuration` | `configuration` | Admin validation/review digest |
| `update_configuration` | `configuration`, `expectedRevision`, `reviewDigest`, `requestId` | Admin write |
| `list_coordination_events` | Optional issue/scope/action/time filters, `limit`, `cursor` | Read bounded immutable history |
| `show_coordination_history` | Optional issue/scope filters and order | Read-only embedded ChatGPT view |
| `append_coordination_event` | `event`, `expectedRevision`, `requestId` | Separate event write |

Follow the [configuration contract](docs/configuration-api.md) for consistent
subject reads and fail-closed behavior. The [event contract](docs/coordination-events-api.md)
defines immutable outcomes, producer attribution, corrections and pagination. Configuration follows
a closed [schema](references/policy.schema.json); revisions are server-owned.
The [examples](examples/inactive-a.json) are synthetic, inactive and execution-disabled.
No company IDs, endpoints, credentials or business values belong in public source.

## Development

```sh
npm ci
npx playwright install --with-deps chromium
npm run check
git diff --check
```

Tests cover authenticated official-SDK requests, separate authorities, transactions,
concurrent writers, restart, backup restore, incomplete/conflicting reads, schema
contracts and the bounded history UI. Local synthetic tests do not establish
installed-host discovery, actual private access, production deployment or activation.

[Manual server deployment](docs/deployment.md) covers Docker, SQLite recovery and
Access/Tunnel requirements. There is no automatic production deployment. The user
connects and authenticates the MCP in ChatGPT; the installed CEO plugin contains
the authenticated tools and its separately maintained skills. Keep account-specific
plugin metadata outside this repository. Server deployment and plugin editing are
independent workflows; verify API compatibility when either changes.

## Embedded history

`show_coordination_history` opens the same server's `ui://ceo/coordination-history/v1.html`
resource (`text/html;profile=mcp-app`). Only this render tool has `_meta.ui.resourceUri`;
`list_coordination_events` remains a standalone data tool. The render result exposes
only a short acknowledgement to the model, with initial filters in `_meta`.
The view initializes the MCP Apps bridge, then calls the existing data tool through
the authenticated host. Every tool/resource request requires current read authority.
No frontend credentials, private URLs, external assets, direct fetches, polling,
mutation controls or installation manifests are involved.

The UI holds and renders one page of at most 50 events. Next preserves snapshot and
filters; First page, Refresh and Apply filters begin a fresh snapshot. Recorded
insertion chronology supports both directions; observed timestamps remain visible.
Evidence and identifiers are escaped text, with navigation explicitly unavailable
because the API does not establish verified canonical URLs. Corrections and release
correlation identifiers remain visible without rewriting original events.

Source is in `ui/`, embedded with hash-based CSP by `src/history-ui.ts` and copied
into the server image. Bump the resource URI when incompatible UI changes require
cache invalidation. The implementation uses SDK v2.4.0 `registerResource`, without
legacy SDK imports. Controlling documentation: [OpenAI MCP Apps UI](https://developers.openai.com/plugins/build/chatgpt-ui),
[OpenAI Extensions](https://developers.openai.com/plugins/build/extensions), and the
[MCP Apps protocol](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx).
No optional sidebar or plugin settings extension is needed for this inline view.

Browser tests use a local synthetic bridge and isolated 1,205-event database; they
produce light, dark/mobile and empty-state screenshots under `/tmp/ceo-ui-evidence`.
They are not actual ChatGPT embedding evidence. After reviewed deployment and tool
refresh, acceptance still requires the existing installed CEO plugin to render the
resource in ChatGPT, authenticate page requests, show empty/history/filter/error
states and preserve manual-only navigation.
