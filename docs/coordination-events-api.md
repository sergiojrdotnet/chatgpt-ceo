# Coordination event API

The server writes directly to ClickHouse `ceo.coordination_events`. Each invocation
makes one synchronous insert attempt. There is no queue, outbox, retry, replay or
deduplication layer. Multiple entries for the same issue, including accidental
repetitions, are allowed. Storage acknowledgement does not establish an external
action or task acceptance.

## Append and identity

`append_coordination_event({expectedDigest, event})` requires event-write authority
and the current configuration digest. Input is validated before sending. New events
contain no configuration revision or historical configuration digest.

| Event field | Type and constraint |
| --- | --- |
| `action` | `planning`, `selection`, `delegation`, `execution`, `release-plan`, `publication`, `handoff`, `validation`, `incident`, `administration`, `configuration`, `correction` |
| `scope` | `{type: "issue" \| "project" \| "configuration" \| "incident", id: string}` |
| `issueId` | Optional Linear UUID; required and equal to `scope.id` for issue scope |
| `issueIdentifier` | Optional human display label, 1–160 nonblank characters; requires `issueId` |
| `phase` | Optional `implementation`, `release`, `validation` |
| `reason` / `result` | Nonblank text, at most 1000 / 2000 characters |
| `outcome` | `planned`, `confirmed`, `failed`, `uncertain`, `blocked`, `deferred` |
| `observedAt` | ISO timestamp with known offset, normalized UTC; not future |
| `evidenceRefs` | 0–30 unique nonblank references, at most 500 characters each; required for confirmed/failed outcomes |
| `threadId` / `turnId` | One optional actual thread and turn; turn requires thread |
| `correlationId` | Optional operation/batch identifier |
| `correctsEventId` | Required only for correction; existing event UUID with matching scope and issue UUID |

Scope/thread/turn/correlation identifiers are 1–160 characters, start with an ASCII
letter/digit and contain only letters, digits, `.`, `_`, `:`, `/`, `-`. Display labels
are recorded text, not aliases or lookup keys; no identifier-prefix conversion is
performed. UUID inputs are normalized to lowercase. Objects reject unknown fields and recognized credential material.

The confirmed response is `{event}` with accepted fields plus server-generated
`eventId`, `recordedAt` and authenticated `producerId`. Corrections are new linked
events; neither row is rewritten. Target lookup and insert are separate queries,
not a ClickHouse transaction. Runtime permissions do not allow deleting targets.
No configured agent is needed to record evidence; recording does not activate work.

Only a fully consumed successful insert response yields `{event}`. Transport,
timeout, HTTP or unexpected response failures after attempting insertion produce
`isError: true` and `{error: "EVENT_WRITE_UNCERTAIN", attemptedEventId}`: the row may
or may not exist. The server never retries. Use the event ID read filter to inspect
later; absence in one read does not prove rejection. Validation/configuration/target
lookup failures occur before insert and do not create a saved event.

## Bounded reads

`list_coordination_events({eventId?, issueId?, scopeType?, scopeId?, action?, from?,
to?, limit?, cursor?, order?})` requires read authority. `scopeId` requires `scopeType`;
filters combine with AND. `eventId` and `issueId` are UUIDs. `from`/`to` inclusively
bound observed time. `limit` defaults to 50, minimum 1, maximum 100. Output is
`{events, hasMore, nextCursor}`. Queries retrieve at most `limit + 1` rows.

Ordering is `(recordedAt, eventId)` with `asc` default or `desc`; it is not a global
insertion sequence. The first request selects an upper tuple bound; following pages
use strict keyset comparisons. Signed opaque cursors bind filters, order, limit,
position and upper bound. They expire on server restart; invalid cursors require a
fresh traversal. There is no persistent cursor registry or key store.

**This is not a transactional snapshot.** A delayed concurrent insert below the
upper bound may appear on a later page or require refreshing if its position has
already been passed. Clock changes can also affect traversal position. Refresh
starts a new traversal. No strict cross-page completeness under concurrent writes
is promised. Read failure returns an error, never a fabricated empty history.

## Storage and UI

[Operator DDL](../deploy/clickhouse.sql) uses ordinary MergeTree, not a replacing or
unique-key table. Runtime credentials have SELECT/INSERT only on this table; DDL is
separate. SQL uses typed query parameters. HTTP requests disable async insertion,
consume the full response, limit response bytes and time out without retry. See
[ClickHouse HTTP semantics](https://clickhouse.com/docs/interfaces/http).

`show_coordination_history({issueId?, scopeType?, scopeId?, order?})` remains a read-only
render tool. The new `ui://ceo/coordination-history/v2.html` resource has MIME
`text/html;profile=mcp-app`. Dashboard calls the existing read tool through the
host bridge, renders at most 50 events and refreshes only manually. Issue filters
use UUID; display uses `issueIdentifier` with UUID fallback. No configuration-history
fields, credentials, private direct fetches or mutation controls are exposed.
