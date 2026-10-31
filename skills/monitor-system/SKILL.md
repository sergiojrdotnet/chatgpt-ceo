---
name: monitor-system
description: Observe system operation for a bounded purpose using fresh logs, metrics, traces and connectivity. Use independently, for incident evidence or release observation; dry runs do not start monitoring.
---

# Monitor system

Owner: observation executor. Inputs: purpose, affected components/destination,
optional duration, baseline and release-completion time. Outcome: timestamped
coverage and findings with explicit evidence limits. Observation is read-only;
it does not authorize remediation, device actions or schedules.

1. Read relevant issue/comments when task-bound, product monitoring and target-binding
   runbooks, and the [private profile contract](../../references/profile.md).
   For independent observation use the explicit positive duration or an approved
   private/runbook default. If neither exists, state the missing duration; do not
   invent one. Release observation must meet its private minimum after completion;
   a shorter request cannot satisfy it. Baseline-only and dry-run requests do not
   start a timed observation period or live calls merely by loading this skill.
   For authorized substantive monitoring on a standalone issue, establish In
   Progress and verify readback. If that write or readback fails or is uncertain,
   already-authorized read-only discovery, baseline collection and observation
   may continue within their existing scope. Report the bookkeeping gap without
   claiming a state change; reconcile actual state later before retrying an
   uncertain write. This exception grants no mutation or recovery authority. For release observation, preserve and verify an evidenced
   In Validation phase instead of regressing it; likewise retain an evidenced
   Awaiting Release phase for a pre-publication baseline. Record active owner and
   next checkpoint. Consultation and synthetic dry runs do not start execution
   or mutate status.
2. Discover current sources through all pages. Record role, relevance, access and
   freshness, distinguishing configured, read, inaccessible and untested. Select
   relevant logs/metrics/traces/connectivity; every connector is not mandatory for
   every task. Missing necessary telemetry remains unknown, never healthy.
3. Establish timestamped baseline and expected traffic/cadence. Use bounded ranges,
   exact source/target filters and useful correlations from product runbooks.
   Avoid raw personal/credential/biometric/secret payloads and expensive broad scans.
4. During authorized observation compare at a cadence matching export intervals,
   traffic and risk: new versus pre-existing errors, latency, resource pressure,
   connectivity and affected outcomes. Use short bounded waits. Correlate exemplars,
   trace IDs and permitted audit evidence; scrape success, provider acceptance and
   end-user success prove different things. Respect retention/sampling/access limits.
5. Report actual start/end and covered duration, version/scope evidence, sources,
   freshness, baseline comparison, findings and remaining acceptance limits.
   Interruptions, quiet traffic and elapsed timers do not prove continuous health.
   Surface critical findings promptly within authorized communication scope.

Handoff: [coordinate-incidents](../coordinate-incidents/SKILL.md) for impact;
[conduct-release](../conduct-release/SKILL.md) for release evidence;
[reconcile-execution](../reconcile-execution/SKILL.md) for task status. Monitoring
alone never marks Done or replaces deterministic instrumentation and alerts.
