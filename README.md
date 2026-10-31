# ChatGPT CEO Plugin

Nine independently invocable processes for work coordinated through Linear,
GitHub and ERPNext. This package contains procedures and local synthetic helpers,
not a scheduler, server, permission system or parallel task board.

| Skill | Outcome and handoff |
| --- | --- |
| [plan](skills/plan/SKILL.md) | Prior-period review and top-down direction → select work |
| [select-work](skills/select-work/SKILL.md) | Short ready queue within real capacity → delegate |
| [delegate](skills/delegate/SKILL.md) | Issue-first assignment with explicit model/effort/capabilities → reconcile |
| [reconcile-execution](skills/reconcile-execution/SKILL.md) | Actual sessions and results reconciled with Linear → next accountable action |
| [operate-administration](skills/operate-administration/SKILL.md) | Bounded financial records and customer/supplier administration → verified saved state |
| [coordinate-incidents](skills/coordinate-incidents/SKILL.md) | Impact and investigation/recovery ownership → verified restoration and follow-up |
| [prepare-code-change](skills/prepare-code-change/SKILL.md) | Full issue and repository assessment → implementation/validation |
| [conduct-release](skills/conduct-release/SKILL.md) | Exact-version authorized publication → destination and observation evidence |
| [monitor-system](skills/monitor-system/SKILL.md) | Fresh bounded operational evidence → incident/release/reconciliation owner |

Invoke only the applicable skill, then follow its explicit handoff when needed.
Each works without first loading a coordinator entry skill. Development delegation
requires prepare-code-change; administration and publication have separate paths.
Linear owns objectives, acceptance and material deltas; delegation carries its ID
and additional context instead of duplicating the issue. Commercial/marketing work
is outside this package’s scope.

## Private profile contract

[Profile contract](references/profile.md) and [policy schema](references/policy.schema.json)
keep company identity, source locators, actual policy values and environment
bindings outside this repository. Credentials stay in protected facilities.
[Example A](examples/inactive-a.json) and [example B](examples/inactive-b.json) are
wholly synthetic, inactive, fixture-only and execution-disabled.

Private `agents` entries bundle a stable ID, name, selection description, model,
effort and optional environment. Delegate selects one complete session template by
its description; no suitable entry or unresolved ambiguity stops dispatch. Settings
are never mixed across entries. These templates do not create persistent agents.

An entry without an environment needs no specialized binding, but still requires
an explicitly supported general-cloud launch path. An omitted tool selector
currently defaults to desktop. Fresh availability/access/capability checks apply
to the whole selected template, without silent substitution.

Technical code/build/test/domain/architecture/runbook/safety facts remain in the
product repository. Existing product procedures must remain until the replacement
is discovered and loaded at the expected version in an actual executor.

## Local validation

Python 3.10+ with the declared dependencies is required for the pure helpers.
From a source checkout:

```sh
python -m pip install -r requirements-dev.txt
python -m unittest discover -s tests -v
python tests/check_package.py /tmp/chatgpt-ceo.zip
python -m compileall -q scripts tests
git diff --check
```

The archive includes runtime requirements; source tests and packaging tooling stay
in the repository. The allowlist excludes adjacent files, tests and Git history.
The [helper](scripts/policy.py) strictly validates profiles, checks trusted read
observations/checkpoints, validates a selected whole agent template against simulated catalog evidence and returns synthetic
decisions. It has no transport, dispatcher, persistent state or live-operation API.
Profile flags and mocked observations never establish authority or host ACLs.

Local package extraction, unit tests and dry-run scenario evaluation are distinct
from installed-host discovery/invocation, actual generic-cloud routing, private-source
access revocation, live ERP validation and operational activation. Those require
separate evidence and applicable authorization. Word/byte counts describe files;
they are not model token usage, cost or measured runtime context consumption.
