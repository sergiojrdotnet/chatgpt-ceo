---
name: prepare-code-change
description: Prepare a code change or bug fix by reading the full issue, checking revision, domain/docs/ADRs and planning safe reproduction and validation before implementation.
---

# Prepare code change

Owner: code executor. Input: Linear issue ID plus genuinely new delegation context.
Outcome: a scoped implementation and validation approach grounded in current code.
Consultation alone does not start execution.

1. FIRST read the entire current issue and relevant comments/references, including
   acceptance and newer decisions. Missing essentials are explicit gaps. Establish
   In Progress before substantive execution, only if needed, and verify readback;
   report a failed transition truthfully without activating unrelated work.
2. Refresh the [private profile contract](../../references/profile.md) for dependent
   work. Establish repository, target revision, branch/worktree and dirty state.
   Verify the session actually targets the intended checkout; preserve user changes
   and isolate parallel implementation. Read root and applicable nested AGENTS.md.
3. Identify affected components/domain concepts. Read repository specs, glossary,
   design, architecture and ADR log, including amendments/successors. Compare with
   implementation and tests; surface contradictions before choosing behavior.
4. Assess API, data/migration, authorization, UI/localization, device and operational
   impacts. Decide which technical docs/contracts/runbooks change with code. Ordinary
   implementation of an existing decision does not automatically need a new ADR;
   new/reversed decisions follow the repository's accepted-history/numbering rules.
5. Reproduce a bug safely in local/isolated context; establish a useful failing
   regression when feasible. If unsafe or unrepresentative, explain the limitation
   and choose meaningful evidence. Never reproduce destructive or physical-access
   effects in production as setup. Test-first is not a universal ceremony.
6. Choose setup/checks from CONTRIBUTING and component docs, including broader
   required gates. State affected behavior, controlling sources, documentation
   impact, verification and unavailable/skipped coverage before editing. Continue
   routine authorized implementation without ceremonial approval.

Technical facts stay in the product repository. Maintain guidance only for concrete
findings. Preserve existing source procedures until replacement discovery/loading
and exact version are verified in an actual executor.
Handoff: implementation/review evidence goes to
[reconcile-execution](../reconcile-execution/SKILL.md); publication separately invokes
[conduct-release](../conduct-release/SKILL.md). Preparation grants no release authority.
