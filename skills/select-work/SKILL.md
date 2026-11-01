---
name: select-work
description: Choose ready work from Linear using priority, capacity, dependencies and real validation conditions. Use when replenishing Todo or deciding the next task.
---

# Select work

Owner: coordinator. Inputs: current Linear work, actual execution ownership,
private policy and current validation/access conditions. Outcome: a short,
actionable Todo queue and reasons for selection or deferral.

Configuration: call `get_operation_context`, then `get_selection_policy` as needed.
Use the same revision for all configuration reads; follow the linked contract.

1. Freshly check the [configuration contract](../../references/configuration.md),
   current scope/pause and actual work evidence. Use
   [reconcile-execution](../reconcile-execution/SKILL.md) for stale session/status
   claims before counting capacity.
2. Select top-down within the agreed direction; favor finishing over opening
   more work. Check issue outcome, acceptance, classification and direct/transitive
   dependencies. Keep Todo short without inventing a numeric cap or rigid order.
3. Count owned execution including CI, review, validation and required observation
   waiting. Exclude only evidenced genuine blockers, retaining owner, next action
   and recheck. Apply private preferred/maximum capacity and a justified urgent
   incident exception; this is not a weekly throughput quota or an atomic lock.
4. Distinguish actual dependency, required user input and other concrete blockers.
   Use native dependencies for the first; apply the verified existing Needs Input
   label only for an actual user action, with impact, attempts, recommendation and
   exact need. Preserve the truthful phase; the current owner removes the label
   only after the need is resolved, with readback. Needs Input is not a status. Continue eligible
   independent work, never dependents of blocked work.
5. Compare time and validation conditions. Low-activity periods favor independently
   verifiable tasks when real events are predictably unavailable. Actual traffic
   overrides calendar guesses; weekday overnight work can await next-day evidence.
   Administrative hours are a preference, not a ban. Missing required input is a
   blocker; likely input delay merely lowers preference when alternatives exist.
6. As coordinator, move selected ready Backlog issues to Todo, verify readback and
   record rationale and unresolved conditions in Linear. Preserve truthful phases
   and ownership for blocked work under [state evidence](../../references/state-evidence.md). Recheck
   capacity just before dispatch; simultaneous coordinators require ownership
   reconciliation, not an assumed distributed admission guarantee.

Handoff: [delegate](../delegate/SKILL.md) resolves capabilities and dispatches;
[coordinate-incidents](../coordinate-incidents/SKILL.md) owns urgent response.
Selection alone does not establish In Progress.

Append a `selection` event through `append_coordination_event` for meaningful
selection or deferral, recording the capacity/dependency reason and observed result.
An unchanged poll does not need an event.
Follow the [event contract](../../references/coordination-events.md) for payload,
attribution and recovery.
