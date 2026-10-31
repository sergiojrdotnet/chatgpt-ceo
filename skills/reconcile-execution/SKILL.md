---
name: reconcile-execution
description: Compare Linear with actual sessions, PR/review and outcome evidence; recover interrupted, stale, duplicate or uncertain execution without blind retries.
---

# Reconcile execution

Owner: coordinator, with the execution owner. Inputs: issue ID, session/attempt
identity and available repository or administrative outcome evidence. Outcome:
truthful Linear state, accountable next action and a verified/blocked/failed/uncertain
result, never a parallel work board.

1. Read the complete current issue and relevant comments; refresh the
   [private profile contract](../../references/profile.md) before dependent
   resumption, consequential action or completion. Preserve pause and authority.
2. Compare actual session state and timestamps with claimed progress. Inspect exact
   PR head, completed independent review, findings and CI when applicable; for
   administration inspect bounded saved-state evidence. Read the authoritative
   result, not just a callback, tool success or executor narrative.
3. Handle interrupted/stale sessions by establishing last evidenced effect and
   remaining acceptance. Reuse the responsible context where viable; a replacement
   receives the issue ID and only new recovery instructions via
   [delegate](../delegate/SKILL.md). Check in-flight ownership before another attempt.
4. Correlate duplicate sessions/results to the same issue and operation. Do not
   delete evidence or cancel records to conceal duplication. Unknown occurrence
   remains uncertain until authoritative readback resolves it. A matching effect
   may resolve a lost response; empty/inaccessible readback does not justify retry.
   Recover protected attempt/checkpoint evidence after restart; no exactly-once
   or durable-lock guarantee is provided by this package.
5. Apply [state evidence](../../references/state-evidence.md). A draft PR stays In
   Progress; an administrative draft can satisfy a draft-only acceptance outcome.
   Merge is not publication; publication is not acceptance. Compare every
   criterion and unresolved regression. Correct mismatched automated transitions
   and verify readback. Review/CI/observation waiting remains owned capacity.
6. Record concise findings, precise gaps, owner and next check in the issue.
   Distinguish failed, denied, pending and uncertain actions; Needs Input only when
   the user must actually act. Continue independent authorized work.

Handoff: [conduct-release](../conduct-release/SKILL.md) for real publication;
[coordinate-incidents](../coordinate-incidents/SKILL.md) for service impact;
[select-work](../select-work/SKILL.md) when capacity truly becomes available.
