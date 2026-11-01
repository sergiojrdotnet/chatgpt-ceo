---
name: setup
description: Configure the CEO plugin's single-company policy after manual installation and authentication, or review and apply an authorized policy change.
---

# Configure CEO

The user connects the CEO plugin in ChatGPT and authenticates its MCP connection manually.
Do not install, activate, provision identities or change security settings as setup.

1. Call `get_configuration`. Unauthorized access requires the operator's existing
   admin route; do not bypass it. `setupRequired=true` means no policy exists and
   `expectedRevision=0`; otherwise preserve current identity and inspect the current
   configuration/revision. Credentials belong in the authenticated connection,
   never in policy values, instructions, issue comments or public source.
2. Gather only missing company bindings, owner/timezone, agents and capacity/selection
   using the supplied
   [schema](../../references/policy.schema.json). No invented IDs, environment
   objects, model selections or business defaults. Each agent has a unique ID,
   selection description, model/effort, optional extra startup instructions and optional exact
   environment string. Omit instructions when the user approves none; do not invent
   placeholders or block setup on their absence. Begin inactive and execution-disabled unless the user has
   explicitly authorized activation; setup alone grants no business authority.
3. Call `validate_configuration` with the complete proposed configuration. Show the
   concrete changed values and impact on existing work; resolve conflicts and
   obtain approval when the change is not already authorized. Validation supplies
   a `reviewDigest`, not authorization. Keep private values in the private session.
4. Save that exact reviewed proposal using `update_configuration`, its digest,
   the previously read revision and a new stable `requestId`. A revision conflict
   requires a fresh read, diff and review; never overwrite a concurrent change.
   After timeout, retry only identical input/request ID or inspect current state.
   Verify current revision/digest with `get_configuration` and subject-tool reads.
5. Explain remaining unavailable bindings/access precisely. Configuration cannot
   establish live tool access or successful deployment. Do not dispatch a pilot,
   activate schedules or resume paused work merely because setup succeeded.

Normal consumers follow the [configuration contract](../../references/configuration.md).

After verified configuration publication, append a `configuration` event through
`append_coordination_event` using the new revision, approved-change reason and
readback evidence. Admin authority does not imply event-write authority. If the
append is unavailable, report the history gap without repeating the policy write.
Follow the [event contract](../../references/coordination-events.md) for payload,
attribution and recovery.
