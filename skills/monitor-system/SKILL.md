---
name: monitor-system
description: Observe system operation for a bounded purpose using fresh logs, metrics, traces and connectivity. Use independently, for incident evidence or release observation; dry runs do not start monitoring.
---

# Monitor system

Owner: observation executor. Inputs: purpose, affected components/destination,
optional duration, baseline and release-completion time. Outcome: timestamped
coverage and findings with explicit evidence limits. Observation is read-only;
it does not authorize remediation, device actions or schedules.

Configuration: call `get_operation_context`.
Use the same revision for all configuration reads; follow the linked contract.

1. Read relevant issue/comments when task-bound, product monitoring and target-binding
   runbooks, and the [configuration contract](../../references/configuration.md).
   Choose a bounded snapshot/baseline evidence review or timed monitoring from
   the authorized purpose. Snapshot/baseline review reads an explicit bounded
   source/time range and reports freshness/coverage; it requires no wait duration.
   Only timed monitoring requires an explicit positive duration or an approved
   runbook default. If neither exists, report the missing duration for that timed
   request; do not invent one or block an independently authorized snapshot.
   A snapshot never proves continuous release observation. Release observation
   follows applicable project/repository procedures
   and explicit authorized task instructions, including authorized exceptions. CEO
   configuration defines no observation minimum; an explicit waiver does not start
   a timed wait. Baseline-only and dry-run requests do not
   start a timed observation period or live calls merely by loading this skill.
   For authorized substantive monitoring on a standalone issue, establish In
   Progress and verify readback. If that write or readback fails or is uncertain,
   already-authorized read-only discovery, baseline collection and observation
   may continue within their existing scope. Report the bookkeeping gap without
   claiming a state change; reconcile actual state later before retrying an
   uncertain write. This exception grants no mutation or recovery authority. For release observation, preserve and verify an evidenced
   In Validation phase instead of regressing it; likewise retain an evidenced
   Awaiting Release phase for a pre-publication baseline. Record active owner and
   next condition/action. Follow [state evidence](../../references/state-evidence.md)
   for the responsible executor's transitions and meaningful `execution` start event.
   Consultation and synthetic dry runs do not start execution
   or mutate status.
2. Discover current sources through all pages. Record role, relevance, access and
   freshness, distinguishing configured, read, inaccessible and untested. Select
   relevant logs/metrics/traces/connectivity; every connector is not mandatory for
   every task. Missing necessary telemetry remains unknown, never healthy.
3. Establish timestamped baseline and expected traffic/cadence. Use bounded ranges,
   exact source/target filters and useful correlations from product runbooks.
   Avoid raw personal/credential/biometric/secret payloads and expensive broad scans.
4. For timed monitoring, compare at a cadence matching export intervals,
   traffic and risk: new versus pre-existing errors, latency, resource pressure,
   connectivity and affected outcomes. Use short bounded waits. Correlate exemplars,
   trace IDs and permitted audit evidence; scrape success, provider acceptance and
   end-user success prove different things. Respect retention/sampling/access limits.
5. Report the mode, bounded sample range or actual timed start/end and covered
   duration, version/scope evidence, sources,
   freshness, baseline comparison, findings and remaining acceptance limits.
   Interruptions, quiet traffic and elapsed timers do not prove continuous health.
   Surface critical findings promptly within authorized communication scope.
   For a material task-bound observation outcome, append a `validation` event
   with the bounded result, gaps and references under the
   [event contract](../../references/coordination-events.md). Preserve the real issue
   or supported scope; no invented issue for an unscoped query. Snapshot findings
   describe only the sampled evidence, never a continuous healthy interval.

Handoff: [coordinate-incidents](../coordinate-incidents/SKILL.md) for impact;
[conduct-release](../conduct-release/SKILL.md) for release evidence;
[reconcile-execution](../reconcile-execution/SKILL.md) for task status. Monitoring
alone never marks Done or replaces deterministic instrumentation and alerts.
