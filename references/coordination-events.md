# Immutable coordination events

Linear owns current objectives, acceptance and task state. History records meaningful
coordination decisions/actions and their observed results, not a second board,
transcripts, hidden reasoning or every tool query. Record a short objective reason,
an honest result and audience-safe evidence references. Never copy secrets, raw
financial records, complete issue bodies or private agent instructions.

## Typed API

`append_coordination_event({requestId, expectedRevision, event})` requires separate
**event-write** authority, a current configuration revision, and a stable request ID.
All objects reject unknown fields. The event has:

| Field | Type and constraint |
| --- | --- |
| `action` | `planning`, `selection`, `delegation`, `execution`, `release-plan`, `publication`, `handoff`, `validation`, `incident`, `administration`, `configuration`, `correction` |
| `scope` | `{type: "issue" \| "project" \| "configuration" \| "incident", id: string}`; canonical identifier |
| `issueId` | Optional canonical Linear issue identifier; required and equal to `scope.id` for issue scope |
| `phase` | Optional `implementation`, `release`, `validation` |
| `reason` | Factual decision/action reason, 1–1000 characters |
| `result` | Observed result or explicit remaining uncertainty, 1–2000 characters |
| `outcome` | `planned`, `confirmed`, `failed`, `uncertain`, `blocked`, `deferred` |
| `observedAt` | ISO timestamp with known offset, normalized to UTC; no future observations |
| `evidenceRefs` | 0–30 unique references, 1–500 characters each; confirmed/failed require evidence |
| `threadId` / `turnId` | ONE optional actual thread ID and ONE optional actual turn ID; turn requires thread |
| `correlationId` | Optional shared operation/release-batch identifier |
| `correctsEventId` | Required only for `correction`; existing event in the same scope and issue |

Identifiers are 1–160 characters, begin with an ASCII letter or digit and contain
only letters, digits, `.`, `_`, `:`, `/`, `-`; correction IDs are server UUIDs.
The result is `{event}` containing the accepted fields plus server-owned `eventId`,
`recordedAt`, `producerId`, `configurationRevision`, `configurationDigest`.
The producer is the authenticated principal, not a client-supplied executor identity.
No configured agent is required to record evidence; inactive policy does not authorize
operations. Event acknowledgement confirms storage only. `confirmed` describes the
stated action/result, never automatically an issue being Done. `planned` describes an
agreed future action, not an observed external effect. Use `uncertain` for unknown
occurrence, `failed` for evidenced failure, `blocked` for a known unmet prerequisite,
and `deferred` for an evidenced decision to postpone.

Corrections append a new linked event. They do not delete, rewrite or silently
supersede the original; consumers retain both and inspect the correction's evidence.
A later outcome of an action is a new normal event with the same correlation ID;
it needs a correction link only when correcting an earlier factual record.

`list_coordination_events({issueId?, scopeType?, scopeId?, action?, from?, to?,
limit?, cursor?})` requires read authority. `scopeId` requires `scopeType`; filters
combine with AND. `from` and `to` are inclusive observed-time bounds. Default limit
is 50, minimum 1, maximum 100. The result is `{events, hasMore, nextCursor}`.
Events are ordered by immutable insertion sequence, not caller timestamps. Follow
`nextCursor` until null, preserving filters; pages pin a snapshot high-water mark,
so concurrent new events appear only in a fresh traversal. Cursors are opaque,
store-bound, filter-bound and invalid after a clean reset. Do not infer absence from
one page. This bounded listing is also the future dashboard's read API.

## Recovery and attribution

The same authenticated producer/request ID and normalized input return the original
event, including after restart or a later policy revision. Changed input rejects
with `IDEMPOTENCY_CONFLICT`; stale new writes reject with `REVISION_CONFLICT`.
Configuration writes and event writes share this request namespace. After a timeout,
retry only that exact request, or inspect history before choosing a new request ID.
SQLite transactions make event/evidence/idempotency storage atomic, not an external
dispatch/payment/publication. There is no distributed lock or exactly-once claim.

For dispatch/resumption, first read all relevant issue history and authoritative
runtime state. Retain one actual returned thread/turn pair per event. Multiple events
can name the same thread, and per-issue events can share a release thread and
correlation ID. Never replace previous implementation evidence or build a sessions
array. Missing IDs remain absent, not guessed. Empty/inaccessible history does not
prove rejection; resolve actual effects before another dispatch.

Executors must prove their authenticated event-write capability in the real host.
Mocked SDK tests and a coordinator's access do not establish executor access. If an
executor cannot append, preserve its actual returned IDs/results in protected task
evidence and report the gap. An authorized coordinator may record a sourced report
under its own producer identity, with a reference to the executor's evidence; it
must not impersonate the executor or claim firsthand validation. Missing resumption
support is a real handoff blocker, not permission to fabricate completion.
