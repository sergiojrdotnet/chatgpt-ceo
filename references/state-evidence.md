# State and evidence contract

Linear is the canonical work/decision record; runtime sessions, GitHub and ERPNext
provide evidence. Read actual state before a needed transition and verify readback.
Use the selected workspace's real statuses rather than guessing IDs.

Failed or uncertain Linear bookkeeping does not block already-authorized read-only
monitoring or diagnostic collection within its existing scope. Report the failure
or uncertainty without claiming a transition; preserve evidence for later
reconciliation and inspect actual state before retrying an uncertain write.
This exception grants no mutation, recovery, dispatch or publication authority.

| Transition / stage | Status writer | Evidence and handoff |
| --- | --- | --- |
| Triage qualification → Backlog | Coordinator using plan | Qualified scope, duplicates and decisions recorded; retain refined work for selection. |
| Backlog → Todo | Coordinator using select-work | Ready near-term work, dependencies and capacity checked. Selection does not start execution; hand off to delegate. |
| Actual start → In Progress | Responsible executor | Substantive authorized execution begins; verify readback. A draft PR remains here. Preserve a later truthful phase when resuming. |
| Ready deliverable → In Review | Implementer | Deliverable is ready for genuine independent review; repository procedures own PR/reviewer mechanics. |
| Merge requiring publication → Awaiting Release | Implementer | Exact merge confirmed, publication still pending; hand off to the release coordinator. Merge without a publication requirement proceeds to actual validation. |
| Actual acceptance checking → In Validation | Responsible validation executor | Original implementer after confirmed publication, or administrative/other executor verifying the intended result. No fictional publication for work that needs none. |
| Verified issue acceptance → Done | Responsible executor | Every acceptance criterion and intended outcome evidenced, applicable observation complete, no unresolved critical regression. Coordinator reconciles missing/conflicting bookkeeping from sourced evidence. |
| Concrete user action required → Needs Input | Current owner; coordinator reconciles | Name the exact user action, impact, attempts and recommendation. It is not a generic waiting state. |
| Nonhuman blocker / uncertain effect | Current owner; coordinator reconciles | Preserve the last truthful phase, named owner and next condition/action. Record dependencies and uncertainty; do not regress to Todo or use Needs Input without a user action. |
| Canceled / Duplicate | Current owner or coordinator within authority | Recorded reason / canonical issue link; neither is delivered work. |

The named writer reads current state before each needed transition and verifies
readback. The coordinator checks ownership, evidence and missed transitions rather
than duplicating a completed writer action. Reviewer feedback is evidence for the
implementer; review and CI waiting do not transfer ownership automatically.

Project and initiative closure always requires explicit user approval for that
closure. Completing issues, all-green evidence, a broad instruction to finish work,
or a coordinator recommendation does not supply that approval. Keep the project or
initiative open and present the concrete closure proposal when approval is absent.
This boundary does not prevent evidence-based issue completion.

Nonrepository work normally goes Todo → In Progress → In Validation → Done.
Review/publication states apply only when real. A session ending, callback, green
CI, merge or package upload alone never establishes completion. Correct automated
transitions that contradict evidence. Unknown effect remains uncertain.

Keep issue comments concise: action/result and time, exact version or bounded
record evidence, acceptance comparison, remaining gap, next owner/action. Distinguish
requested from observed model/effort and failed/denied/pending/uncertain effects.
Use audience-safe references, never full private configurations, source documents,
credentials or sensitive raw payloads. Opaque IDs can still be sensitive.

Confirmed coordination events are evidence of their stated actions only. Publication
returns validation ownership to the original implementation session; release-batch
completion cannot close individual issues without their own acceptance proof.

Use the [event contract](coordination-events.md) for meaningful lifecycle evidence:
`execution` at actual start, material review-ready or gate decisions, and
`validation` for observed acceptance or bounded verification outcomes. Record the
reason, actual result and references after verifying the effect; use honest
blocked/failed/uncertain outcomes when a gate does not pass. Do not append events
for every query, unchanged CI poll or routine bookkeeping read. Status writes and
event storage are separate effects; a missing/uncertain write remains a reported
gap, not fabricated success or permission to repeat an external action.
