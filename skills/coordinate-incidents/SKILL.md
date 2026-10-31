---
name: coordinate-incidents
description: Coordinate an incident by impact, urgency, investigation and recovery ownership, verified restoration and linked prevention. Use for incident response, not routine monitoring.
---

# Coordinate incidents

Owner: incident coordinator; named investigators/recovery executors own actions.
Inputs: report or alert, affected scope and current evidence. Outcome: coordinated
response with verified restoration and visible follow-up in one Linear incident.

Configuration: call `get_operation_context`, then `get_selection_policy`, `get_release_policy` as needed.
Use the same revision for all configuration reads; follow the linked contract.

1. Read the current incident and relevant comments if one exists; correlate repeated
   alerts and related reports before creating another investigation. Establish
   current impact, affected users/destinations, urgency and timestamped evidence.
   Incident is a work type, not an assumption that every cause is a code bug.
2. Refresh the [configuration contract](../../references/configuration.md), scope and
   available access. An urgent capacity/release exception is scoped to justified
   restoration, not blanket authority or general resumption of paused work.
3. Assign investigation, recovery and communication ownership with next checkpoints.
   Use [monitor-system](../monitor-system/SKILL.md) for fresh evidence and
   [delegate](../delegate/SKILL.md) for capability-bound execution. Keep the Linear
   timeline, hypotheses and known facts distinct; unknown telemetry is not health.
4. Assess recovery options against impact, confidence, time to restoration and
   data/migration constraints. Code corrections invoke
   [prepare-code-change](../prepare-code-change/SKILL.md); publication invokes
   [conduct-release](../conduct-release/SKILL.md). Observe platform and task authority.
   Do not introduce credentials, services or disruptive tests as an investigation
   shortcut. Escalate actual missing authority with a concrete recommendation.
5. Verify intended service recovery and required observation with fresh operational
   evidence. A successful command or quiet alert stream is insufficient. Report
   critical changes promptly within authorized communication scope; no new schedule
   or alert subscription is implied.
6. Preserve impact, timeline, restoration and verification in the incident issue.
   Link separately scoped preventive bugs/improvements, with ownership and acceptance,
   so restoration does not erase unfinished prevention. No separate postmortem
   document is required unless requested.

Handoff: [reconcile-execution](../reconcile-execution/SKILL.md) checks outcome and
state; [plan](../plan/SKILL.md) considers reliability lessons and priorities.

Append `incident` events through `append_coordination_event` at material triage,
recovery decisions and verified restoration. Reference impact/recovery evidence and
keep failed or uncertain outcomes explicit; do not log every telemetry query.
Follow the [event contract](../../references/coordination-events.md) for payload,
attribution and recovery.
