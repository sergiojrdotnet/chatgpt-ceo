---
name: reconcile-execution
description: Compare Linear with actual sessions, PR/review and outcome evidence; recover interrupted, stale, duplicate or uncertain execution without blind retries.
---

# Reconcile execution

Owner: coordinator, with the execution owner. Inputs: issue ID, session/attempt
identity and available repository or administrative outcome evidence. Outcome:
truthful Linear state, accountable next action and a verified/blocked/failed/uncertain
result, never a parallel work board.

Configuration: call `get_operation_context`, then `get_agents` as needed.
Use the same revision for all configuration reads; follow the linked contract.

1. Read the complete current issue and relevant comments; refresh the
   [configuration contract](../../references/configuration.md) before dependent
   resumption, consequential action or completion. Preserve pause and authority.
2. Discover current work in Linear, then read every page of
   `list_coordination_events({issueId})`. Use `phase` and actual `threadId` values
   to inspect existing implementation/release/validation sessions through available
   runtime tools. `turnId` identifies one turn, not another session. Read linked
   corrections and correlate batch events without treating batch success as each
   issue's acceptance. IDs do not guarantee continued access or transcript retention.
   Failed reads do not authorize replacement. Inspect authoritative effects and
   timestamps, exact PR head, actual completed independent review/findings and CI,
   or bounded administrative saved-state evidence; narrative alone is insufficient.
3. Handle interrupted/stale sessions by establishing last evidenced effect and
   remaining acceptance. Reuse the responsible context where viable; a replacement
   receives the issue ID and only new recovery instructions via
   [delegate](../delegate/SKILL.md). Check in-flight ownership before another attempt.
4. Correlate duplicate sessions/results to the same issue and operation. Do not
   delete evidence or cancel records to conceal duplication. Unknown occurrence
   remains uncertain until authoritative readback resolves it. A matching effect
   may resolve a lost response; empty/inaccessible readback does not justify retry.
   Follow the [event contract](../../references/coordination-events.md); no exactly-once
   or durable-lock guarantee is provided.
5. Apply [state evidence](../../references/state-evidence.md). A draft PR stays In
   Progress; an administrative draft can satisfy a draft-only acceptance outcome.
   Merge is not publication; publication is not acceptance. Compare every
   criterion and unresolved regression. Correct mismatched automated transitions
   and verify readback. Review/CI/observation waiting remains owned capacity.
6. Append `execution` events for meaningful blocked/recovered/reconciled outcomes
   and `validation` events for acceptance outcomes using `append_coordination_event`;
   preserve the actual producing session and evidence. Record concise findings,
   precise gaps, owner and next check in the issue.
   Distinguish failed, denied, pending and uncertain actions; Needs Input only when
   the user must actually act. Continue independent authorized work.

Handoff: [conduct-release](../conduct-release/SKILL.md) for real publication;
[coordinate-incidents](../coordinate-incidents/SKILL.md) for service impact;
[select-work](../select-work/SKILL.md) when capacity truly becomes available.
