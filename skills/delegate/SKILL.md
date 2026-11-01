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
   effort, optional extra startup instructions and optional environment ID string. These are session execution templates, not
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
4. BEFORE dispatch, read all pages of `list_coordination_events({issueId})`
   and inspect actual runtime ownership/effects. Use `append_coordination_event`
   to record a `delegation` event with
   `outcome: planned`, phase, correlation ID, short reason and references to the
   selected template/configuration and authorized issue; verify readback. Keep full
   settings in the configured template and protected handoff, not event prose.
   If recording/readback fails, stop dependent dispatch and reconcile the gap.
   Follow the [event contract](../../references/coordination-events.md) for retries,
   attribution and uncertainty. A planned event is neither dispatch nor a lock.
5. Send the issue ID, required process skill, the selected agent's `instructions`
   when present, and only genuinely additional context. When instructions are absent,
   omit that extra context without inventing placeholders or blocking dispatch. `description` is for choosing the agent;
   `instructions` is executor startup context (role, tools/context, custom guidance).
   Forward supplied instructions without duplicating the issue. Instructions do not prove tool access,
   expand authority or override user/platform constraints, issue scope or required
   process. Resolve conflicts before dependent dispatch; never embed credentials.
   Require the executor to read the entire issue and relevant comments/references.
   Development MUST invoke [prepare-code-change](../prepare-code-change/SKILL.md);
   administration invokes [operate-administration](../operate-administration/SKILL.md);
   publication invokes the already-assigned executor path of
   [conduct-release](../conduct-release/SKILL.md), without redelegating release. Other work
   names its applicable process. Do not repeat objective/acceptance from the issue.
6. Append a new `delegation` event after the actual response using its returned
   `threadId` and optional `turnId`, phase and correlation ID. Record `confirmed`
   only for evidenced submission, `failed` for evidenced rejection, or `uncertain`
   for unknown occurrence. Verify readback. Record observed effective settings only
   when returned. A shared release has per-issue events naming its one actual thread.
   If dispatch succeeds but recording fails, preserve the actual IDs in protected
   task evidence and inspect that existing thread before retrying dispatch.

Handoff: [reconcile-execution](../reconcile-execution/SKILL.md) owns follow-through.
A dispatch acknowledgement neither starts substantive execution nor proves success.
