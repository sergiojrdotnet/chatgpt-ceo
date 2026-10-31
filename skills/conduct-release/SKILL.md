---
name: conduct-release
description: Prepare, execute and verify an authorized exact-version release at intended destinations, including review/CI, recovery and post-publication observation. Not ordinary code preparation.
---

# Conduct release

Owner: release executor, preferably the implementation owner. Inputs: issue ID,
exact revision/artifacts, destinations and publication authority. Outcome: verified
delivery and observation, or precise remaining release/validation gaps.

1. Read the full issue and relevant comments/references, product release/runbook,
   architecture, safety and target-binding instructions. Refresh the
   [private profile contract](../../references/profile.md). Confirm exact scope,
   destinations/dependencies and authority; reading access does not grant writes.
2. Verify required CI and completed independent review cover the exact current
   revision, with findings/conversations addressed and acceptance/docs consistent.
   Zero unresolved threads is not proof a review ran. Do not assume events reach
   the owner. Follow approved merge policy only when authorized; merge is not Done.
3. Assess migrations/configuration, compatibility, backup preconditions and recovery
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
6. On regression compare forward correction versus rollback by recovery time,
   confidence, impact and migration/data constraints; respect recovery already
   performed by the workflow. Verify restoration and continue required observation.
   Do not change security/review settings to force progress or abandon a failed run.

Handoff: [reconcile-execution](../reconcile-execution/SKILL.md) verifies acceptance,
observation and no unresolved critical regression before Done;
[coordinate-incidents](../coordinate-incidents/SKILL.md) owns material service impact.
