# Current configuration API

`CONFIG_PATH` identifies one current JSON file, validated against the closed
[configuration schema](../references/policy.schema.json) and [model](../src/model.ts).
The configuration shape remains `schemaVersion: 2`. There are no revision numbers,
historical configurations, audit tables or request replay records.

## Reads

| Tool | Input | Authority |
| --- | --- | --- |
| `get_operation_context` | `{expectedDigest?}` | read |
| `get_agents` | `{expectedDigest}` | read |
| `get_selection_policy` | `{expectedDigest}` | read |
| `get_configuration` | `{}` | admin |

Subject reads return `schemaVersion`, `digest`, `complete`, `readAt`, `effectiveAt`,
`active`, `fixtureOnly`, `executionEnabled`, `subject` and `data`. Read context first,
then pass its digest to dependent subject calls. A mismatch is
`CONFIGURATION_CONFLICT`; absent configuration is `SETUP_REQUIRED`. Invalid or
unreadable files fail closed, without a cached fallback. Clients check freshness,
effective time and execution controls; configuration never grants authority.

Admin reads return `{schemaVersion, setupRequired, configuration, digest}`. Before
setup, configuration and digest are null. Digest is SHA-256 of canonical current
content, not a version/history identifier: restoring identical content restores
its digest. Optional agent `instructions` remain absent when not supplied; provided
instructions must be nonblank. Release policy is not a configuration field.

## Writes

`validate_configuration({configuration})` requires admin and returns
`{valid: true, reviewDigest, configuration}` without saving.

`update_configuration({configuration, expectedDigest, reviewDigest})` requires admin,
validates the complete proposal and returns `{digest}` after replacement.
`expectedDigest` must match current content; null requires an absent file.
`reviewDigest` must match the exact proposal. There is no partial update, revision
counter, request ID or replay guarantee. Unknown/obsolete arguments are rejected.
After a lost response, read current configuration and compare the proposal; do not
assume either success or failure or blindly repeat an update.

One server process owns the file. Writes are serialized synchronously within that
process: write a unique mode-0600 file in the same directory, fsync, rename over the
current file, then fsync the directory. Failed pre-rename writes preserve the old
file. A failure after rename yields `CONFIGURATION_WRITE_UNCERTAIN`; reread the
current file before deciding the next action. Normal completion leaves no temporary
file; abrupt termination may leave a `.config-*.tmp` file for operator inspection.
No multi-process writer, external live editing or network-filesystem guarantee is
provided. Keep a writable directory mount, not a bind mount of a single file.

Validation retains the 256 KiB bound, closed fields, valid timezone/timestamp,
unique agent IDs, ordered ordinary capacity limits, an explicit incident policy
(or the compatible legacy form described below),
nonempty agents when active and execution-enabled, increasing administrative
start/end times and rejection of recognized credential material. Store service
credentials in private environment bindings, never this file or the repository.

## Incident admission and legacy compatibility

New configurations can express uncapped confirmed incident-response admission:

```json
"capacity": {
  "preferredMin": 3,
  "preferredMax": 5,
  "activeMax": 5,
  "incidentAdmission": "uncapped"
}
```

The three positive safe integers still satisfy
`preferredMin <= preferredMax <= activeMax`. Exactly one incident representation
is required: `incidentAdmission: "uncapped"` or the deprecated positive safe integer
`urgentIncidentMax`. Both together, neither, null, unknown strings and numeric
sentinels for the new policy are invalid. The legacy form still validates only
when `urgentIncidentMax === activeMax + 1`; it is retained for compatibility, not
interpreted as uncapped.

Existing valid schemaVersion 2 files, admin/subject output and canonical digests
remain unchanged. Reads never rewrite or normalize legacy configuration. Switching
policy is an explicit reviewed whole-configuration update: remove
`urgentIncidentMax`, add `incidentAdmission: "uncapped"`, preserve other fields,
validate, review the returned exact proposal/digest, update with the current digest
and read back admin/context/selection results at the new digest. A stale old digest
must conflict. A rollback also needs a reviewed replacement; an old server cannot
read the new form. Restore a reviewed compatible legacy configuration before
rolling the server back. Never edit a live file as a migration shortcut.

The server supplies policy, not a scheduler. Updated consumers must apply the
[incident-capacity contract](incident-capacity.md); server tests and merge do not
prove installed-plugin behavior or publish the separate skill package. Coordinate
consumer publication before activating the new policy and retain authenticated
installed-consumer verification as release acceptance.
