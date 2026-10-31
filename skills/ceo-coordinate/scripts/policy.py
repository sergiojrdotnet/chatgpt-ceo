"""Pure validation and synthetic decision helpers; no transport or action dispatch."""
from dataclasses import dataclass
from datetime import datetime
import hashlib
import json
from pathlib import Path
import re
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from jsonschema import Draft202012Validator, ValidationError

CORE_VERSION = '0.1.0'
SCHEMA = json.loads((Path(__file__).resolve().parents[1] / 'references/policy-v1.schema.json').read_text())


class PolicyError(ValueError):
    """Stable, non-sensitive error code; never includes source payloads."""


def instant(value):
    # Explicit checker: do not depend on optional jsonschema format packages.
    # Bounded RFC3339 subset: seconds 00..59, no leap seconds, explicit offset.
    if not isinstance(value, str) or not re.fullmatch(
        r'\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:[0-5]\d(?:\.\d+)?(?:[Zz]|[+-](?:[01]\d|2[0-3]):[0-5]\d)', value
    ) or value.endswith('-00:00'):
        raise PolicyError('INVALID_TIMESTAMP')
    try:
        return datetime.fromisoformat(value.upper().replace('Z', '+00:00'))
    except ValueError:
        raise PolicyError('INVALID_TIMESTAMP') from None


def _pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise PolicyError('DUPLICATE_KEY')
        result[key] = value
    return result


def parse(text):
    try:
        value = json.loads(text, object_pairs_hook=_pairs,
                           parse_constant=lambda _: (_ for _ in ()).throw(PolicyError('INVALID_JSON')))
    except (ValueError, TypeError, RecursionError) as exc:
        if isinstance(exc, PolicyError):
            raise
        raise PolicyError('INVALID_JSON') from None
    validate(value)
    return value


def validate(value):
    try:
        Draft202012Validator(SCHEMA).validate(value)
    except (ValidationError, RecursionError):
        raise PolicyError('INVALID_SCHEMA') from None
    instant(value['effectiveAt'])
    try:
        ZoneInfo(value['timezone'])
    except (ZoneInfoNotFoundError, ValueError):
        raise PolicyError('INVALID_TIMEZONE') from None
    cap = value['capacity']
    if not (cap['preferredMin'] <= cap['preferredMax'] <= cap['activeMax']
            and cap['urgentIncidentMax'] == cap['activeMax'] + 1):
        raise PolicyError('INVALID_CAPACITY')
    hours = value['selection']['administrativeHours']
    windows = value['release']['restrictedWindows']
    if any(w['start'] >= w['end'] for w in [hours, *windows]):
        raise PolicyError('INVALID_WINDOW')
    for index, first in enumerate(windows):
        for second in windows[index + 1:]:
            if (set(first['weekdays']) & set(second['weekdays']) and
                    max(first['start'], second['start']) < min(first['end'], second['end'])):
                raise PolicyError('OVERLAPPING_WINDOWS')


@dataclass(frozen=True)
class Read:
    """Adapter observations, never fields accepted from the profile itself."""
    text: str
    source_locator: str
    host_version: str | None
    retrieved_at: str
    authenticated: bool
    complete: bool
    owner_verified: bool


@dataclass(frozen=True)
class Approved:
    """Trusted setup/checkpoint, not self-attested source claims or task prose."""
    source_locator: str
    profile_id: str
    revision: int
    digest: str


def read_policy(fetch, approved, *, now, max_age_seconds):
    """Always call the supplied authenticated reader; no cache/fallback.

    Requires an approved exact revision/digest (also on the first read). Changes
    require review and a new checkpoint. Does not prove the adapter's host ACL.
    """
    if (not isinstance(approved, Approved) or not isinstance(approved.source_locator, str) or not approved.source_locator.strip()
            or not isinstance(approved.profile_id, str) or not approved.profile_id.strip() or type(approved.revision) is not int
            or approved.revision < 1 or not isinstance(approved.digest, str) or not re.fullmatch('[0-9a-f]{64}', approved.digest)):
        raise PolicyError('SETUP_REQUIRED')
    if type(max_age_seconds) is not int or max_age_seconds < 0:
        raise PolicyError('INVALID_FRESHNESS_BOUND')
    current = instant(now)
    try:
        read = fetch(approved.source_locator)
    except Exception:
        raise PolicyError('SOURCE_UNAVAILABLE') from None
    if not isinstance(read, Read):
        raise PolicyError('SOURCE_UNAVAILABLE')
    if not (read.authenticated is True and read.complete is True and read.owner_verified is True):
        raise PolicyError('UNTRUSTED_OR_PARTIAL_SOURCE')
    if read.source_locator != approved.source_locator:
        raise PolicyError('SOURCE_MISMATCH')
    if read.host_version is not None and (not isinstance(read.host_version, str) or not read.host_version.strip()):
        raise PolicyError('INVALID_HOST_VERSION')
    age = (current - instant(read.retrieved_at)).total_seconds()
    if age < 0 or age > max_age_seconds:
        raise PolicyError('STALE_READ')
    if not isinstance(read.text, str):
        raise PolicyError('INVALID_SOURCE_TEXT')
    policy = parse(read.text)
    if policy['profileId'] != approved.profile_id:
        raise PolicyError('IDENTITY_MISMATCH')
    if policy['revision'] < approved.revision:
        raise PolicyError('REVISION_ROLLBACK')
    if policy['revision'] > approved.revision:
        raise PolicyError('REVALIDATE_REVISION')
    try:
        digest = hashlib.sha256(read.text.encode('utf-8')).hexdigest()
    except UnicodeEncodeError:
        raise PolicyError('INVALID_SOURCE_TEXT') from None
    if digest != approved.digest:
        raise PolicyError('REVISION_CONFLICT')
    if not policy['active']:
        raise PolicyError('PROFILE_INACTIVE')
    if instant(policy['effectiveAt']) > current:
        raise PolicyError('NOT_EFFECTIVE')
    evidence = {'sourceLocator': read.source_locator, 'hostVersion': read.host_version,
                'retrievedAt': read.retrieved_at, 'digest': {'algorithm': 'sha256',
                'representation': 'returnedText', 'value': digest}}
    return policy, evidence


def simulate(policy, *, authorized=False, paused=False, scoped_exception=False,
             dependency_blocked=False, required_input_missing=False, owned_wip=0,
             genuine_blockers=0, urgent_incident=False, route=None, task_class=None,
             available_environments=(), available_models=(), user_model=None,
             independent_alternative=False, low_activity=False, likely_input_dependency=False,
             release_required=False, release_fits=None, restoration_exception=False,
             mode='simulation'):
    """Evaluate trusted, pre-assessed facts only; never dispatch, even with live flags.

    Owned WIP includes CI/review/observation waiting. Callers must establish actual
    dependency closure, authority, route target and release fit outside this helper.
    """
    validate(policy)
    if mode != 'simulation':
        return 'stop', 'LIVE_UNSUPPORTED'
    if not policy['active']:
        return 'stop', 'PROFILE_INACTIVE'
    facts = (authorized, paused, scoped_exception, dependency_blocked, required_input_missing,
             urgent_incident, independent_alternative, low_activity, likely_input_dependency,
             release_required, restoration_exception)
    if any(type(fact) is not bool for fact in facts) or (release_fits is not None and type(release_fits) is not bool):
        return 'stop', 'INVALID_CONTEXT'
    if not authorized:
        return 'stop', 'SCOPE_DENIED'
    if paused and not scoped_exception:
        return 'stop', 'PAUSED'
    if dependency_blocked:
        return 'defer', 'DEPENDENCY_BLOCKED'
    if required_input_missing:
        return 'needsDecision', 'REQUIRED_INPUT_MISSING'
    if (type(owned_wip) is not int or type(genuine_blockers) is not int or
            not 0 <= genuine_blockers <= owned_wip):
        return 'stop', 'INVALID_WIP'
    limit = policy['capacity']['urgentIncidentMax' if urgent_incident else 'activeMax']
    if owned_wip - genuine_blockers >= limit:
        return 'defer', 'CAPACITY_FULL'
    binding = policy['routing'].get(route)
    if not binding:
        return 'stop', 'ROUTE_MISSING'
    if binding['environmentConfigId'] not in available_environments:
        return 'stop', 'ROUTE_UNAVAILABLE'
    choice = user_model if user_model is not None else policy['models'].get(task_class)
    if not choice:
        return 'needsDecision', 'MODEL_MISSING'
    if (not isinstance(choice, dict) or set(choice) != {'model', 'effort'} or
            not isinstance(choice['model'], str) or not choice['model'].strip() or
            choice['effort'] not in ('low', 'medium', 'high', 'xhigh', 'max', 'ultra') or
            (choice['model'], choice['effort']) not in available_models):
        return 'stop', 'MODEL_UNAVAILABLE'
    if release_required and release_fits is not True and not restoration_exception:
        return 'defer', 'RELEASE_ASSESSMENT_REQUIRED'
    if independent_alternative and (low_activity or likely_input_dependency):
        return 'preferAlternative', 'PREFER_INDEPENDENT'
    return 'eligible', 'SIMULATION_ONLY'


def reconcile_attempt(*, attempted, response_uncertain, readback, acceptance_met,
                      pending_review=False):
    """Simulation-only outcome classification; never retries or mutates.

    readback is a trusted assessed category: matching/absent/conflicting/failed.
    A matching readback may resolve a lost response. Absence never clears an
    uncertain attempt. Callers must recover protected attempt evidence on restart.
    """
    if readback not in ('matching', 'absent', 'conflicting', 'failed'):
        return 'blocked'
    if attempted is not True:
        return 'blocked'
    if readback == 'matching' and acceptance_met is True and not pending_review:
        return 'verified'
    if response_uncertain is True:
        return 'uncertain'
    if readback in ('conflicting', 'failed'):
        return 'failed'
    return 'blocked'
