# Configuration API

The runtime validates the closed [configuration schema](../references/policy.schema.json)
and additional constraints in [model.ts](../src/model.ts). Configuration format is
`schemaVersion: 2`; the SQLite storage schema is independently versioned. Database
upgrade and recovery requirements are in [deployment](deployment.md).

## Consistent subject reads

`get_operation_context({expectedRevision?})` returns context and bindings.
`get_agents({expectedRevision})` returns complete agent templates;
`get_selection_policy({expectedRevision})` returns capacity, selection and timezone.
All require current read authority. Each successful response contains
`schemaVersion`, `revision`, `digest`, `complete`, `readAt`, `effectiveAt`, `active`,
`fixtureOnly`, `executionEnabled`, `subject` and `data`.

Read context first and pass its revision on dependent subject calls. Compare
revision and digest across responses; do not combine partial or conflicting reads.
No configuration yields `SETUP_REQUIRED`; a stale expected revision yields
`REVISION_CONFLICT`. Revisions and their children are immutable. Clients must
check response freshness and effective time before dependent decisions.
Configuration is data, not an operational authorization grant. Execution flags do
not cause the server to dispatch or activate work.

Agent `instructions` and `environment` are optional. Omitted instructions read back
without that property; supplied instructions must be nonblank. No placeholder is
required. Release windows and observation minimums are not configuration fields.

## Reviewed writes

`get_configuration({})` requires admin authority and returns `schemaVersion`,
`revision`, `setupRequired`, `configuration` and `digest`. Before setup, revision is
zero and configuration/digest are null.

`validate_configuration({configuration})` requires admin authority and returns
`{valid: true, reviewDigest, configuration}` for a valid complete proposal. It does
not save. `update_configuration({configuration, expectedRevision, reviewDigest,
requestId})` requires admin authority and atomically saves the reviewed complete
replacement, returning `{revision, digest}`. Initial setup uses expected revision
zero. The digest must match that exact proposal; conflicts require rereading and
reviewing the current proposal. There is no partial update endpoint.

Configuration is limited to 256 KiB. In addition to schema constraints, the server
checks a valid timezone and timestamp, unique agent IDs, ordered capacity bounds,
`urgentIncidentMax = activeMax + 1`, a nonempty agent list when both active and
execution-enabled, and increasing administrative start/end times. Recognized
credential material is rejected; this is not a credential vault.

The authenticated producer and request ID identify an idempotent write. An identical
retry returns the original revision/digest; changed input produces
`IDEMPOTENCY_CONFLICT`. Configuration and event writes share the request namespace.
Revisions, child records, retry records and audit are stored transactionally.
After an uncertain response, retry the identical request rather than inventing a
new write. Reads and writes recheck their required authority on every call.
