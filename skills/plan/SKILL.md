---
name: plan
description: Review prior outcomes and set top-down initiatives, projects, milestones and priorities. Use for planning or retrospectives, not dispatch or status reconciliation.
---

# Plan

Owner: coordinator. Inputs: requested planning horizon, current Linear hierarchy,
prior-period outcomes and available business/flow evidence. Outcome: a reasoned,
current direction and next milestones in Linear.

Configuration: call `get_operation_context`, then `get_selection_policy` as needed.
Use the same revision for all configuration reads; follow the linked contract.

1. Read the applicable [configuration contract](../../references/configuration.md).
   Confirm scope and decisions reserved for the user. Existing authorization
   persists; planning does not authorize spending, new services or activation.
2. Review completed and pending work, incidents, blockers and available outcome
   and flow metrics for the prior period. Separate missing data from poor results;
   issue counts alone do not measure value. Use [reconcile-execution](../reconcile-execution/SKILL.md)
   when delivery or status evidence conflicts.
3. Work top-down from business outcomes through initiatives, projects and
   meaningful milestones to executable issues. Projects need an initiative;
   project issues need a milestone. Justified standalone incidents/requests need
   no artificial project. Search for duplication and obsolete assumptions.
4. Revisit priorities, dependency constraints, capacity, start expectations and
   target forecasts. Dates are evidence-based forecasts, not unconditional
   promises. Preserve real dependency links; do not manufacture ordering blockers.
5. Make issues self-contained: problem, intended outcome, scope/exclusions,
   acceptance and verification, constraints, related sources and required decisions.
   Include priority, type and area. Material decisions belong in the owning issue;
   research findings go in comments, without extra research documents.
6. Record meaningful project/initiative changes and recommendations, with reasons
   and remaining uncertainty. Escalate only actual reserved decisions with a
   concrete recommendation; avoid repetitive empty updates.

Handoff: [select-work](../select-work/SKILL.md) selects ready work within current
capacity. Planning does not dispatch executors or create schedules.
