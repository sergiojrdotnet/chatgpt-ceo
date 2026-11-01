---
name: conduct-release
description: Coordinate a separate exact-version release batch from Linear Awaiting Release through verified publication and handoff to original implementation sessions for functional validation.
---

# Conduct release

Owner: release coordinator and a separately assigned release executor. Inputs:
current Linear Awaiting Release work, approved publication scope and destinations.
Outcome: evidenced per-issue publication and implementation-validation handoff,
or explicit partial, failed, blocked or uncertain results.

Configuration: call `get_operation_context`, then
`get_selection_policy` and `get_agents` as needed at the same revision.
Follow the [configuration contract](../../references/configuration.md).

Coordinator and executor paths are distinct. The coordinator owns batch selection,
planning, assignment and implementation-session handoff. An already assigned release
executor reads its authorized plan and exact issue scope, verifies current policy and
technical prerequisites, then executes the supplied repository release procedure and
returns publication/observation evidence (step 5). It does not select a new batch,
repeat step 4, or create another release session. It reports changed scope/conflicts
to the coordinator before dependent mutations. The coordinator resumes steps 6–7.

1. Read current Awaiting Release issues in Linear, their full descriptions,
   acceptance, comments and references. Select an authorized bounded batch after
   assessing actual capacity, dependencies, conflicting changes, exact versions,
   application order, destinations and impact. Do not assume every waiting issue
   can ship together. Inspect issue history for an existing active release owner
   before creating another session. Future periodic selection is a user-defined
   external trigger; this skill creates no schedule or scheduler definition.
2. Discover and read root and applicable nested AGENTS.md, repository release-change
   skills and deployment/recovery runbooks, including the procedures they reference.
   Do this even when the selected profile has no optional `instructions`. Read any
   supplied agent instructions as additional context; absence does not imply that
   repository procedures are absent.
   Those instructions own builds, review/CI/merge rules, artifacts, deployment,
   migrations and technical recovery. Do not duplicate or invent those mechanics
   here. Missing guidance blocks dependent publication. Require exact-current-head
   CI and actual independent review evidence; zero unresolved threads alone is not
   proof of review. Configuration/read access supplies no publication authority.
3. Prepare a concrete exact-version/destination plan with per-issue impact,
   dependencies/conflicts and order, compatibility/data/configuration changes,
   backup prerequisites, verification and recovery options. Compare rollout,
   functional validation, required observation and reasoned recovery margin against
   applicable project/repository restrictions and actual traffic. Take observation
   requirements and any authorized exceptions from the task instructions and
   technical procedure; CEO configuration defines no release windows or minimum
   duration. Do not invent defaults or require observation when explicitly waived.
   Use [monitor-system](../monitor-system/SKILL.md) for fresh baseline evidence.
   Prefer small releases when they reduce impact and remain independently testable.
   Append per-issue `release-plan` events with a shared `correlationId`, reason,
   approved plan references and honest outcome. Resolve actual reserved decisions
   using the concrete plan; existing authorization persists.
4. As coordinator, assign the release executor through [delegate](../delegate/SKILL.md), preserving
   the whole selected template and repository instructions. Use a separate release
   session; preserve original implementation session IDs in issue history. Shared
   batch events use one actual release thread ID per event and the common
   correlation ID. Retain Awaiting Release while publication is pending; a standalone
   release task enters In Progress at actual start. Verify Linear state readback.
   A state-write gap does not prevent authorized read-only diagnostics, but must
   be resolved before dependent publication mutations.
5. Follow the authorized execution to actual destination/version and publication
   time. Green workflows, uploaded images or triggers alone do not prove installation.
   The assigned release executor is the primary writer of `publication` events
   for each issue/destination outcome, with exact version, destination, timestamp
   evidence and the shared correlation ID. The coordinator first checks existing
   issue history and executor results; do not append a duplicate publication report.
   Only when the executor cannot append may the authorized coordinator record a
   sourced fallback under its own producer identity, referencing the executor
   evidence and recording the capability gap. Resolve uncertain append outcomes
   before fallback; inaccessible history does not prove no event exists. Keep partial
   releases and unknown outcomes explicit; do not claim the entire batch succeeded. Follow required observation
   after deployment completes; missing intervals are coverage gaps. On regression,
   prefer a quick safe correction when confidence, impact and recovery time justify
   it; otherwise use the better recovery option, including rollback. Image rollback
   cannot undo data/configuration changes. Verify restoration and route material
   impact to [coordinate-incidents](../coordinate-incidents/SKILL.md).
6. Only after confirmed publication, read all pages of
   `list_coordination_events({issueId})` for each published issue. Locate original
   implementation sessions by phase and actual IDs, check linked corrections and
   current runtime availability/ownership, and notify/resume the responsible session
   with exact published version, destination, time and evidence plus remaining
   acceptance. Inspect earlier handoff events and actual session state before
   dispatch to avoid duplicates. The coordinator owns the distinct `handoff` event
   after each observed resume result, preserving the actual target thread and returned turn when available. A timeout
   is `uncertain`; inspect the target before retrying. Unavailable sessions require
   a documented blocked handoff and an authorized replacement via delegate, not
   invented resumption or completion. Real host support/access must be tested.
7. Original implementation owners perform post-publication functional validation
   against each issue's acceptance and publish `validation` events with evidence.
   The responsible implementation executor writes and verifies the transitions in
   [state evidence](../../references/state-evidence.md): In Validation while
   checking, Done only after acceptance and required observation are proved with
   no unresolved critical regression. Batch release success does not validate each
   issue. A coordinator may relay sourced results under its own identity as described
   in the [event contract](../../references/coordination-events.md), never impersonate
   an executor. Missing authenticated event access remains a reported host gate.

Use `append_coordination_event` at the plan, publication, handoff and validation
moments above; the [event contract](../../references/coordination-events.md) owns
payload/retry/attribution rules. [Reconcile execution](../reconcile-execution/SKILL.md)
checks each issue's evidence, remaining ownership and truthful Linear state.
