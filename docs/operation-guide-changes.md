# Proposed operational guide update

Apply only these agreed history/release boundaries to the existing operational guide
after the deployed contract and installed skills are aligned. The owning coordinator
must review the target Space before writing; this file does not edit that Space.
Preserve all unrelated operational policies.

- Linear remains the source of current work state. Immutable coordination events
  record meaningful decisions/actions, short factual reasons, observed outcomes and
  evidence. Each event may carry one actual thread ID and one turn ID. Corrections
  append linked events; paginated issue history recovers related sessions.
- Code preparation ends at current issue/context/domain/ADR understanding and an
  implementation/validation approach. Repository instructions own contribution
  mechanics. Merged work needing publication waits in Awaiting Release; work that
  needs no publication moves to actual acceptance validation.
- Release coordination selects a bounded Awaiting Release batch from Linear,
  evaluates impact/dependencies/conflicts, versions/order, capacity and windows,
  and delegates a separate release session using configured technical instructions.
  Plan, publication and handoff evidence remain per issue, correlated by batch.
- Verified publication returns functional validation to original implementation
  sessions using history IDs and exact destination/version/time evidence. Missing
  sessions, partial publication, failed authentication or uncertain delivery remain
  explicit gaps. A batch release cannot establish every issue's acceptance.
- Done requires each issue's functional acceptance and required observation evidence.
  Real host tests establish who can append events and whether actual session
  notification/resumption works. No scheduler, agent setup or operational activation
  is introduced by this change.
