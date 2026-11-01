# CEO MCP server

Current company configuration lives in one validated `config.json`. Coordination
events are appended directly to shared ClickHouse. The server does not dispatch,
schedule, grant operational authority or maintain configuration history.
Skills and procedural references are maintained directly in the installed ChatGPT
plugin, separately from this repository. Server updates do not publish those skills.

| MCP tool | Input | Authority |
| --- | --- | --- |
| `get_operation_context` | Optional `expectedDigest` | read |
| `get_agents` | `expectedDigest` | read |
| `get_selection_policy` | `expectedDigest` | read |
| `get_configuration` | None | admin |
| `validate_configuration` | `configuration` | admin |
| `update_configuration` | `configuration`, `expectedDigest`, `reviewDigest` | admin |
| `append_coordination_event` | `event`, `expectedDigest` | event |
| `list_coordination_events` | Event/issue/scope/action/time filters, bounded cursor/order | read |
| `show_coordination_history` | Optional issue UUID/scope/order | read |

The [configuration API](docs/configuration-api.md) defines current-digest conflicts
and atomic file replacement. The [event API](docs/coordination-events-api.md) defines
direct writes, uncertainty, UUID identity and bounded keyset traversal. Repeated
issue events are allowed. There is no replay guarantee, automatic retry or queue.
The [closed schema](references/policy.schema.json) and [inactive examples](examples/inactive-a.json)
contain no real credentials or company data.

## Development

```sh
npm ci
npx playwright install --with-deps chromium
npm run check
docker build -t ceo-check .
CEO_TEST_IMAGE=ceo-check npm run test:container
git diff --check
```

Unit/SDK/browser tests use isolated temporary files and an explicit event-store test
double. HTTP-adapter tests inject truncated/error responses. `test:container` creates
and removes a disposable local ClickHouse, grants a synthetic SELECT/INSERT account,
runs real SQL/correction/filter/pagination checks with over 1,200 events, then tests
the shipped Compose server, config persistence and authentication denial. It never
uses production endpoints. Local browser screenshots are written under
`/tmp/ceo-ui-evidence`; these are not actual ChatGPT embedding evidence.

[Deployment](docs/deployment.md) covers credentials, the external shared network,
operator table bootstrap, config preservation and coordinated cutover. Production
publication is manual. Access JWT authentication and read/admin/event role bindings
are independent of storage and remain enforced on each call.

## Embedded history

Only `show_coordination_history` has `_meta.ui.resourceUri`; the data tool has no
render metadata. The `v2.html` resource is served by the same MCP server with strict
hash-based CSP and all assets in the image. The authenticated host bridge performs
bounded reads; the frontend has no credentials, polling or mutation controls. Text
is escaped and unverified identifiers are not converted into links.

The implementation uses official SDK v2.4.0 `registerResource`. Protocol references:
[OpenAI MCP Apps UI](https://developers.openai.com/plugins/build/chatgpt-ui),
[Extensions](https://developers.openai.com/plugins/build/extensions), and
[MCP Apps](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx).
Actual installed-host tool discovery, auth and rendering require separate acceptance.
