---
name: delegate
description: Assign an execution-ready Linear issue using explicit model, effort and capability-based destination. Use for dispatch or resumption, not rewriting the issue specification.
---

# Delegate

Owner: coordinator. Inputs: selected issue ID, approved scope, current capacity,
private configuration and current tool/model/environment catalog. Outcome: one evidenced
execution assignment, or a precise dispatch gap.

Configuration: call `get_operation_context`, then `get_agents`, `get_selection_policy` as needed.
Use the same revision for all configuration reads; follow the linked contract.

1. Read the issue and relevant comments. Missing scope or acceptance is an issue
   gap, not permission to invent it. Record material deltas in Linear before dispatch.
   Refresh the [configuration contract](../../references/configuration.md) and check
   existing sessions/attempts to prevent duplicate dispatch.
2. Read the private configuration's entire `agents` list and use each description to
   assess fit for the issue's outcome, constraints and required capabilities.
   Choose one configured agent by stable ID and use its WHOLE template: model,
   effort, startup instructions and optional environment ID string. These are session execution templates, not
   persistent autonomous agents. If no entry fits, report the missing configuration;
   if several remain equally suitable, resolve the ambiguity before dispatch.
   Do not choose the first entry arbitrarily or recombine settings across entries.
3. Honor explicit user choices by selecting a complete matching template. If none
   matches, resolve the private configuration/choice instead of overriding individual
   fields. Check the selected model/effort and intended environment against current
   catalog availability, access and required capabilities. Specialized environments
   are optional; absence of `environment` requires a supported explicit general-cloud
   path. Omitting a tool selector currently defaults to desktop and is NOT proof of
   cloud execution. Missing/mismatched/unavailable capabilities block dispatch;
   never silently substitute model, effort, template or privileged destination.
   Do not infer effective settings, cost or quality from requested configuration.
4. BEFORE dispatch, use `get_checkpoint` and `save_checkpoint` to persist and
   verify recoverable protected attempt evidence:
   intended-attempt identity, issue ID, selected agent ID and full template,
   approved configuration revision/digest checkpoint,
   requested model/effort, verified destination, owner and next check. If recording
   or readback fails or is uncertain, stop dispatch and reconcile that checkpoint.
   An intended attempt is not proof of submission. Its storage transaction does not make dispatch atomic
   or provide an exactly-once guarantee; interruption around sending
   can still leave occurrence unknown. Recover the checkpoint after restart and
   inspect authoritative sessions/results before considering another attempt.
5. Send the issue ID, required process skill, the selected agent's `instructions`
   and only genuinely additional context. `description` is for choosing the agent;
   `instructions` is executor startup context (role, tools/context, custom guidance).
   Forward it without duplicating the issue. Instructions do not prove tool access,
   expand authority or override user/platform constraints, issue scope or required
   process. Resolve conflicts before dependent dispatch; never embed credentials.
   Require the executor to read the entire issue and relevant comments/references.
   Development MUST invoke [prepare-code-change](../prepare-code-change/SKILL.md);
   administration invokes [operate-administration](../operate-administration/SKILL.md);
   publication invokes [conduct-release](../conduct-release/SKILL.md). Other work
   names its applicable process. Do not repeat objective/acceptance from the issue.
6. Append returned session identity, response and observed effective metadata
   (unknown when absent) to that attempt; verify the record. Pass only necessary
   private context. A known rejection is not submission; a timeout, missing response
   or failed post-send record leaves dispatch uncertain until reconciled. Inspect
   actual sessions/results before retrying; an empty session list alone is not
   definitive failure. If checkpoint recovery is unavailable, stop dependent retry
   or resumption and report the gap.

Handoff: [reconcile-execution](../reconcile-execution/SKILL.md) owns follow-through.
A dispatch acknowledgement neither starts substantive execution nor proves success.
