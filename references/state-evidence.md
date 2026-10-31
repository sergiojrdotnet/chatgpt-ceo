# State and evidence contract

Linear is the canonical work/decision record; runtime sessions, GitHub and ERPNext
provide evidence. Read actual state before a needed transition and verify readback.
Use the selected workspace's real statuses rather than guessing IDs.

| Stage | Evidence |
| --- | --- |
| Triage / Backlog / Todo | Qualification / refined retained work / ready near-term selection. Selection does not mean execution. |
| In Progress | Actual execution; draft PR remains here. |
| In Review | Deliverable ready for genuine independent review. |
| Awaiting Release | Merged code with actual publication still pending. |
| In Validation | Intended publication confirmed, or administrative result undergoing acceptance verification. |
| Done | Acceptance and intended outcome evidenced; required observation complete; no unresolved critical regression. |
| Canceled / Duplicate | Recorded reason / canonical issue link; neither is delivered work. |

Nonrepository work normally goes Todo → In Progress → In Validation → Done.
Review/publication states apply only when real. A session ending, callback, green
CI, merge or package upload alone never establishes completion. Correct automated
transitions that contradict evidence. Unknown effect remains uncertain.

Keep issue comments concise: action/result and time, exact version or bounded
record evidence, acceptance comparison, remaining gap, next owner/action. Distinguish
requested from observed model/effort and failed/denied/pending/uncertain effects.
Use audience-safe references, never full private profiles, source documents,
credentials or sensitive raw payloads. Opaque IDs can still be sensitive.
