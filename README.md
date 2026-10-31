# ChatGPT CEO

A work-in-progress plugin for coordinating work across Linear, GitHub, and ERPNext.

## MVP direction

- Reusable skills for planning, selecting, delegating, and verifying work.
- Concise, configurable operating policies.
- Research findings and decisions recorded in the owning Linear issue, with implementation tracked in GitHub and administrative work handled through ERPNext.

## Public core, private profiles

This repository is intended for generic skills, schemas, documentation, and synthetic examples only. Organization-specific policies, environment bindings, credentials, and operational records belong in separate private profiles and must not be committed here.

## Status

The initial skills-only core is available for review and synthetic validation. Private-profile access and installed-host behavior remain gated; this is not a production-ready plugin.

## Reviewable core

The portable `plugin.json` now exposes one entry skill, `ceo-coordinate`. It covers
planning, selection, bounded delegation and outcome reconciliation, loading the
profile contract first and administration only for ERPNext work. Existing authorized
Linear, GitHub and ERPNext connections are prerequisites for future live workflows;
this package bundles no connections, server, hook, OAuth or event automation.

The Python helper is a pure prototype for strict policy reads and simulated
decisions. It has no live action dispatcher. Both sample profiles are inactive;
never replace them with private company data. Private-source ACL revocation and
host-installed behavior require separate validation before operational use.

### Local validation

Use Python 3.12+ with system IANA timezone data, then:

```sh
python -m pip install -r requirements-dev.txt
python -m unittest discover -s tests -v
python tests/check_package.py /tmp/chatgpt-ceo.zip
```

The last command checks the portable manifest, parses skill YAML, checks local
references and builds/inspects an allowlisted ZIP outside the source tree. It does
not install or publish a plugin. The helper requires `jsonschema`; `PyYAML` is used
only by package checks. Tests make no network or live service calls.

### Editing and review

Edit the concise entry skill or its focused references, keep examples synthetic,
and run both checks. Audit all tracked files and the diff for private data before
publication. Bump plugin SemVer for a release; schema changes require explicit
compatibility handling. Policy rollback is a new approved higher profile revision,
not selection of an older permissive source. Installation, enablement and host
update/rollback verification require separate authorization and are not demonstrated
by a local ZIP test. No license has been selected.

Format references checked for this MVP:
[plugin packaging](https://developers.openai.com/plugins/build/plugins),
[skills](https://learn.chatgpt.com/docs/build-skills), and
[plugin overview](https://learn.chatgpt.com/docs/plugins).
