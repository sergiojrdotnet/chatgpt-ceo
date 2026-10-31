---
name: conduct-release
description: Prepare, execute and verify an authorized exact-version release at intended destinations, including review/CI, recovery and post-publication observation. Not ordinary code preparation.
---

# Conduct release

Owner: release executor, preferably the implementation owner. Inputs: issue ID,
exact revision/artifacts, destinations and publication authority. Outcome: verified
delivery and observation, or precise remaining release/validation gaps.

Configuration: call `get_operation_context`, then `get_release_policy` as needed.
Use the same revision for all configuration reads; follow the linked contract.

1. Read the full issue and relevant comments/references, product release/runbook,
   architecture, safety and target-binding instructions. Refresh the
   [configuration contract](../../references/configuration.md). Confirm exact scope,
   destinations/dependencies and authority; reading access does not grant writes.
   Follow applicable technical publication instructions supplied by the configured
   agent or project, including a repository skill when those instructions require
   one. This plugin does not assume every repository has a release skill. Keep
   application-specific versioning/build/publication mechanics in those technical
   instructions; do not duplicate them here. Missing required technical guidance
   blocks dependent publication rather than authorizing an invented procedure.
   At actual execution start, read the current Linear state. For a standalone
   release task, establish In Progress before substantive work and verify readback.
   For an already merged issue awaiting publication, preserve and verify Awaiting
   Release instead of regressing its delivery phase; record the active release
   owner/checkpoint in its comment. Likewise retain an evidenced In Validation
   phase during observation. Consultation alone does not start execution. If a
   required state write/readback fails or is uncertain, report the gap and resolve
   actual state before dependent release mutations; never claim a successful transition.
   Already-authorized read-only diagnostics/monitoring may continue within scope;
   report the bookkeeping gap and reconcile it later without duplicating an uncertain write.
2. Follow configured agent and repository review/CI/merge policy, resolving conflicts
   before dependent publication; do not impose a global provider or merge method.
   Verify required CI and completed independent review cover the exact current
   revision, with findings/conversations addressed and acceptance/docs consistent.
   Zero unresolved threads is not proof a review ran. Do not assume events reach
   the owner. Follow approved merge policy only when authorized; merge is not Done.
3. Prefer small incremental releases when they reduce impact and can be validated
   independently; this is a planning preference, not a mandatory size gate.
   Assess migrations/configuration, compatibility, backup preconditions and recovery
   limits. Image rollback does not revert database/configuration. Obtain a fresh
   baseline with [monitor-system](../monitor-system/SKILL.md); investigate unhealthy
   or stale evidence. Check private restricted windows, actual traffic, rollout,
   validation, observation minimum and reasoned recovery margin fit. No invented
   duration constants. Isolation/restoration exceptions require applicable evidence.
4. Follow the authorized workflow and actual destination together: migrations,
   services, versions, errors, latency/connectivity and alerts. A trigger, green
   workflow, uploaded artifact or image is not destination installation. Respect
   test authority; do not invent live physical-access actions.
5. Confirm actual destination/version and unambiguous publication time in Linear;
   apply [state evidence](../../references/state-evidence.md) with readback. Artifact-only
   publication retains its narrower outcome. Monitor throughout rollout and for the
   required minimum AFTER deployment completes. Functional validation may overlap;
   interruptions and missing intervals are coverage gaps, not elapsed-time success.
6. On regression prefer a corrective deploy when it can safely restore service
   faster than rollback. Compare impact, confidence, recovery time, data/migration
   constraints and rollback limits; use rollback when it is the better recovery.
   Respect recovery already performed by the workflow. Verify restoration and
   continue required observation.
   Do not change security/review settings to force progress or abandon a failed run.

Handoff: [reconcile-execution](../reconcile-execution/SKILL.md) verifies acceptance,
observation and no unresolved critical regression before Done;
[coordinate-incidents](../coordinate-incidents/SKILL.md) owns material service impact.
