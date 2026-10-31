---
name: delegate
description: Assign an execution-ready Linear issue using explicit model, effort and capability-based destination. Use for dispatch or resumption, not rewriting the issue specification.
---

# Delegate

Owner: coordinator. Inputs: selected issue ID, approved scope, current capacity,
private profile and current tool/model/environment catalog. Outcome: one evidenced
execution assignment, or a precise dispatch gap.

1. Read the issue and relevant comments. Missing scope or acceptance is an issue
   gap, not permission to invent it. Record material deltas in Linear before dispatch.
   Refresh the [private profile contract](../../references/profile.md) and check
   existing sessions/attempts to prevent duplicate dispatch.
2. Name required capabilities and target: code checkout/tests, operational access,
   device access or ordinary connected tools. Specialized environments are optional
   according to those needs. Resolve private bindings against the current catalog;
   verify access and least necessary capabilities. A general-cloud business route
   is valid configuration but requires an explicitly supported tool route.
   **Omitting a selector is not proof of cloud execution: the current tool defaults
   to desktop.** Block unsupported dispatch; never substitute desktop, operations,
   pilot or whichever environment happens to be attached.
3. Choose model and effort explicitly. Honor the user's choice, otherwise an
   approved policy choice. Verify the exact combination is supported; missing
   choices need a decision, unsupported ones need a concrete alternative.
   Do not silently substitute or infer effective settings, cost or quality.
4. Send the issue ID, required process skill and only genuinely additional context.
   Require the executor to read the entire issue and relevant comments/references.
   Development MUST invoke [prepare-code-change](../prepare-code-change/SKILL.md);
   administration invokes [operate-administration](../operate-administration/SKILL.md);
   publication invokes [conduct-release](../conduct-release/SKILL.md). Other work
   names its applicable process. Do not repeat objective/acceptance from the issue.
5. Record requested model/effort, observed effective metadata (unknown when absent),
   destination evidence, session/attempt identity, owner and next checkpoint in
   protected task evidence. Pass only necessary private context. On ambiguous
   dispatch response, inspect actual sessions before retrying; absence alone is
   not definitive failure.

Handoff: [reconcile-execution](../reconcile-execution/SKILL.md) owns follow-through.
A dispatch acknowledgement neither starts substantive execution nor proves success.
