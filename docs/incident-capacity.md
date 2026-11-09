# Incident admission contract

`capacity.incidentAdmission: "uncapped"` exempts confirmed incident response from
ordinary workload and incident-count admission ceilings. It does not promise an
unlimited pool of executors. The MCP server validates and returns this policy; it
does not schedule, dispatch, correlate incidents or enforce consumer decisions.

## Ordinary work

Keep `preferredMin`, `preferredMax` and `activeMax` for ordinary admission. Count
all applicable owned in-flight work, including response work, review, CI, release,
validation and observation waits, using actual execution evidence. An incident
exemption creates no spare ordinary-work slot. Do not start another ordinary task
at or above `activeMax`, refill an unapproved queue or free capacity from status
alone. Preserve current owner scope, planning, dependencies and pause controls.

## Confirmed incidents

Before acting, verify the source, actual impact and affected target. Correlate by
source identity, resource, fingerprint and occurrence chronology against the
existing incident, comments, coordination history and actual executor. Repeated,
delayed or out-of-order deliveries of one episode retain the same incident and
accountable owner. Missing correlation evidence requires reconciliation before a
duplicate-sensitive action. A later verified occurrence after proven restoration
is a distinct linked episode; a resolved alert or closed status alone is not proof.

With the explicit uncapped policy, respond to every distinct confirmed episode
even when ordinary work is full or other incidents already exceed the former
numeric limit. Do not compare either count with `activeMax`, `activeMax + 1` or
`urgentIncidentMax` to reject or defer incident admission. Do not restrict this
policy to a particular native priority or severity; both remain evidence-based.

Record one accountable response coordinator, known impact, truthful phase and a
visible next action for each episode. Reuse an existing investigator before
starting another session. When no suitable executor is free, the coordinator
retains the admitted response, performs authorized bounded triage, records the
specific resource/access constraint and next check, and arranges safe sequencing
or escalation. Never claim dispatch or execution that did not occur. A resource
wait is distinct from refusing response because a workload count was reached.

Serialize conflicting mutations of the same resource. Incident admission does
not bypass activation, execution-disabled or paused controls, authorization,
privacy, capability matching, repository/release gates, cycle tracking, reserved
human decisions or restoration verification. No automatic preemption, new
credential, production test or permission expansion follows from this policy.

## Required separately maintained consumer changes

The installed plugin owns these instructions; this repository does not publish
them. Use the following text as the coordinated change specification, preserving
the surrounding authority, ownership and evidence procedures:

| Consumer | Required change |
| --- | --- |
| Configuration/setup references | Synchronize every packaged `references/policy.schema.json` copy with the reviewed server schema. Describe the exclusive incident representations, unchanged legacy digests and explicit reviewed migration from the [configuration API](configuration-api.md#incident-admission-and-legacy-compatibility). Do not infer uncapped admission from a numeric value or default. |
| Selection and reconciliation | Keep all applicable owned in-flight work in ordinary admission accounting. Apply preferred/normal limits to ordinary new work. Route confirmed incident response through the explicit incident policy; never use a numeric ceiling when it is uncapped. Preserve existing owner follow-up and paused work. |
| Delegation | Separate response admission from available execution resources. Recheck correlation and existing attempts before dispatch. Do not reject a confirmed incident for workload count under the explicit policy. If no capability-matched executor is available, preserve coordinator ownership and visible resource wait/next action without duplicate dispatch or invented capacity. |
| Incident coordination | Apply the confirmed-incident procedure above to every distinct episode, regardless of workload, count, severity or native priority. Repeated delivery updates the same episode/owner; insufficient correlation is reconciled first. Sequence unsafe concurrent changes, and verify actual restoration. |
| Shared capacity references and other copies | Remove unconditional numeric-incident formulas from new-policy guidance. Keep bounded legacy compatibility explicitly labeled until reviewed migration. Keep copies consistent and retain existing activation, authorization and evidence controls. |

For the legacy form, preserve existing configured bounded behavior and report the
specific migration gap to the authorized owner. It cannot prove uncapped-response
acceptance. Do not silently reinterpret or rewrite it; existing separately
authorized incident actions remain within their original authority. Unknown policy
forms or stale/partial/conflicting reads are a contract gap, not a usable default.

## Coordinated publication and acceptance handoff

1. Review and merge server changes with exact-head checks. Prepare the separate
   consumer changes above. A server-only merge cannot complete this delivery.
2. The release coordinator identifies the responsible server and installed-plugin
   publication owners. Publish the reviewed server revision and consumer package
   through their own authorized procedures. Verify the installed instructions and
   tool discovery actually expose the new contract before switching live policy.
3. The authorized configuration owner reviews a complete proposal replacing only
   the legacy incident field with `incidentAdmission: "uncapped"`. Validate, save
   using current/review digests and read back admin/context/selection at the new
   digest. Preserve unrelated fields and controls. Do not include private config
   or credentials in source, public review material or synthetic evidence.
4. The original validation owner checks the installed consumers with synthetic
   scenario inputs, without creating live incidents or real physical-access tests.
   Record actual installed server revision, consumer version, authenticated tool
   readback, decisions, limits of the evidence and remaining owner/actions.

| Synthetic scenario | Required installed-consumer observation |
| --- | --- |
| Ordinary workload below, at and above its maximum | Ordinary selection obeys the preferred range and normal maximum; incidents do not create ordinary spare slots. |
| Ordinary work full plus more distinct episodes than the former ceiling | Every confirmed episode gets a response coordinator and next action; none is refused because of either count. |
| Repeated/delayed firing and resolved delivery for an existing episode | Same incident, correlation and actual owner; no duplicate investigation, false restoration or new occurrence. |
| Proven restoration followed by a verified new occurrence | New linked episode with its own timeline, evidence, response owner and next action. |
| Zero free suitable executors; two responses need the same mutation target | Both responses remain visible and owned; record actual scarcity, sequence conflicting actions and escalate within authority. No fictional dispatch or unlimited resource claim. |
| Inactive, execution-disabled, paused, unauthorized or stale/conflicting input | Preserve the applicable control. Capacity exemption grants no activation, mutation or publication authority. |
| Legacy configuration, then reviewed explicit migration | Legacy content/digest preserved until update; fresh authenticated readback exposes the new policy. No hidden normalization or numeric sentinel. |

Repository unit/SDK tests cover representation, persistence, migration and a
synthetic reference consumer. Chromium and local Compose tests cover their stated
technical boundaries. These are not installed-host model-behavior evidence. Keep
publication, live configuration readback and installed-consumer scenarios pending
on the original delivery until their responsible owners provide evidence.
