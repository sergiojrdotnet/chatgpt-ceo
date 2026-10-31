import copy
from dataclasses import replace
import hashlib
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
SKILL = ROOT
sys.path.insert(0, str(SKILL / 'scripts'))
import policy as p

NOW = '2026-02-01T12:00:00Z'


def fixture(label='a', active=True):
    value = json.loads((SKILL / f'examples/inactive-{label}.json').read_text())
    value['active'] = active
    return value


def source(value=None):
    value = fixture() if value is None else value
    text = json.dumps(value)
    approved = p.Approved('synthetic-source', value['profileId'], value['revision'],
                          hashlib.sha256(text.encode()).hexdigest())
    read = p.Read(text, approved.source_locator, None, NOW, True, True, True)
    return approved, read


class Validation(unittest.TestCase):
    def test_both_complete_inactive_examples(self):
        for label in ('a', 'b'):
            value = fixture(label, active=False)
            p.validate(value)
            self.assertTrue(value['fixtureOnly'])
            self.assertFalse(value['executionEnabled'])

    def test_all_required_fields_at_every_object(self):
        # Walk actual schema/fixture pairs, including nested maps/array entries.
        def walk(schema, value):
            if 'oneOf' in schema:
                branches = [b for b in schema['oneOf'] if p.Draft202012Validator(b).is_valid(value)]
                self.assertEqual(len(branches), 1)
                walk(branches[0], value)
            if schema.get('type') == 'object':
                for key in schema.get('required', []):
                    bad = copy.deepcopy(value)
                    del bad[key]
                    self.assertFalse(p.Draft202012Validator(schema).is_valid(bad), key)
                bad = {**value, 'unknownCredential': 'synthetic-secret-marker'}
                self.assertFalse(p.Draft202012Validator(schema).is_valid(bad))
                for key, item in value.items():
                    walk(schema['properties'][key], item)
            if schema.get('type') == 'array':
                for item in value:
                    walk(schema['items'], item)
        walk(p.SCHEMA, fixture())

    def test_initial_contract_and_package_metadata_agree(self):
        manifest = json.loads((ROOT / 'plugin.json').read_text())
        self.assertEqual(manifest['version'], p.CORE_VERSION)
        self.assertEqual(p.CORE_VERSION, '0.1.0')
        self.assertEqual(p.SCHEMA['properties']['schemaVersion']['const'], 1)
        for label in ('a', 'b'):
            self.assertEqual(fixture(label)['schemaVersion'], 1)

    def test_schema_is_valid(self):
        p.Draft202012Validator.check_schema(p.SCHEMA)

    def test_duplicate_keys_nested(self):
        for text in ('{"a":1,"a":2}', '{"a":{"b":1,"b":2}}'):
            with self.assertRaisesRegex(p.PolicyError, 'DUPLICATE_KEY'):
                p.parse(text)

    def test_malformed_json_is_redacted(self):
        for text in ('secret-token-not-json', '{', 'NaN', 'Infinity', 'null', '[]'):
            with self.assertRaises(p.PolicyError) as error:
                p.parse(text)
            self.assertNotIn('secret', str(error.exception))

    def test_timestamp_valid_offsets(self):
        for timestamp in ('2024-02-29T12:00:00Z', '2026-01-01t01:00:00.123z',
                          '2026-01-01T23:59:59+03:30'):
            self.assertIsNotNone(p.instant(timestamp).tzinfo)

    def test_timestamp_invalid_without_optional_format_checker(self):
        for timestamp in ('tomorrow', '2025-02-29T12:00:00Z', '2026-04-31T00:00:00Z',
                          '2026-01-01T24:00:00Z', '2026-01-01T00:00:00',
                          '2026-01-01T00:00:00+24:00', '2026-01-01T00:00:00-00:00',
                          '2026-01-01T00:00:60Z', '2026-01-01 00:00:00Z'):
            value = fixture()
            value['effectiveAt'] = timestamp
            with self.subTest(timestamp=timestamp), self.assertRaises(p.PolicyError):
                p.validate(value)

    def test_invalid_nested_values(self):
        cases = [(['schemaVersion'], 99), (['revision'], 0), (['revision'], True),
                 (['ownerRef'], '  '), (['timezone'], 'Mars/Olympus'),
                 (['agents', 0, 'effort'], 'automatic'),
                 (['bindings', 'github', 'repositories'], ['same', 'same']),
                 (['selection', 'administrativeHours', 'start'], '7:00'),
                 (['selection', 'administrativeHours', 'end'], '24:00'),
                 (['capacity', 'preferredMin'], 0),
                 (['capacity', 'preferredMax'], 99),
                 (['capacity', 'urgentIncidentMax'], 99),
                 (['release', 'observationMinimumMinutes'], 0),
                 (['agents', 0, 'environment'], {'projectId':'synthetic-desktop'})]
        for path, invalid in cases:
            value = fixture()
            target = value
            for part in path[:-1]:
                target = target[part]
            target[path[-1]] = invalid
            with self.subTest(path=path), self.assertRaises(p.PolicyError):
                p.validate(value)

    def test_cross_midnight_and_zero_length(self):
        for start, end in [('23:00', '01:00'), ('10:00', '10:00')]:
            value = fixture()
            value['selection']['administrativeHours'] = dict(start=start, end=end)
            with self.assertRaisesRegex(p.PolicyError, 'INVALID_WINDOW'):
                p.validate(value)

    def test_time_fields_reject_trailing_newlines(self):
        for group in ('administrativeHours', 'restrictedWindows'):
            for field in ('start', 'end'):
                for suffix in ('\n', '\r\n'):
                    value = fixture()
                    target = (value['selection'][group] if group == 'administrativeHours'
                              else value['release'][group][0])
                    target[field] += suffix
                    with self.subTest(group=group, field=field, suffix=repr(suffix)):
                        with self.assertRaisesRegex(p.PolicyError, 'INVALID_SCHEMA'):
                            p.validate(value)

    def test_window_conflicts(self):
        for window in [dict(weekdays=[2], start='12:30', end='14:00'),
                       dict(weekdays=[2, 2], start='15:00', end='16:00'),
                       dict(weekdays=[8], start='15:00', end='16:00'),
                       dict(weekdays=[], start='15:00', end='16:00')]:
            value = fixture()
            value['release']['restrictedWindows'].append(window)
            with self.assertRaises(p.PolicyError):
                p.validate(value)

    def test_adjacent_or_different_day_windows(self):
        value = fixture()
        value['release']['restrictedWindows'] += [dict(weekdays=[2], start='13:00', end='14:00'),
                                                   dict(weekdays=[1], start='12:00', end='13:00')]
        p.validate(value)

    def test_empty_agents_validate_without_defaults(self):
        value = fixture()
        value['agents'] = []
        p.validate(value)
        self.assertEqual(value['agents'], [])


class Reading(unittest.TestCase):
    def load(self, read, approved=None, **kwargs):
        approved = source()[0] if approved is None else approved
        return p.read_policy(lambda _: read, approved, now=NOW, max_age_seconds=60, **kwargs)

    def test_read_returns_separate_observed_provenance(self):
        approved, read = source()
        value, evidence = self.load(read, approved)
        self.assertEqual(value['profileId'], approved.profile_id)
        self.assertIsNone(evidence['hostVersion'])
        self.assertEqual(evidence['digest']['representation'], 'returnedText')
        self.assertEqual(evidence['digest']['value'], approved.digest)

    def test_every_boundary_really_reads(self):
        approved, read = source()
        calls = []
        def fetch(locator):
            calls.append(locator)
            if len(calls) == 2:
                raise PermissionError('sensitive error')
            return read
        p.read_policy(fetch, approved, now=NOW, max_age_seconds=60)
        with self.assertRaisesRegex(p.PolicyError, '^SOURCE_UNAVAILABLE$'):
            p.read_policy(fetch, approved, now=NOW, max_age_seconds=60)
        self.assertEqual(calls, [approved.source_locator] * 2)

    def test_missing_setup(self):
        with self.assertRaisesRegex(p.PolicyError, 'SETUP_REQUIRED'):
            self.load(source()[1], approved=False)

    def test_untrusted_partial_owner_source(self):
        for field in ('authenticated', 'complete', 'owner_verified'):
            with self.subTest(field=field), self.assertRaisesRegex(p.PolicyError, 'UNTRUSTED'):
                self.load(replace(source()[1], **{field:False}))

    def test_stale_and_future_reads(self):
        for timestamp in ('2026-02-01T11:58:59Z', '2026-02-01T12:00:01Z'):
            with self.assertRaisesRegex(p.PolicyError, 'STALE_READ'):
                self.load(replace(source()[1], retrieved_at=timestamp))

    def test_freshness_boundary(self):
        self.load(replace(source()[1], retrieved_at='2026-02-01T11:59:00Z'))

    def test_wrong_source_and_host_version(self):
        for read, code in [(replace(source()[1], source_locator='other'), 'SOURCE_MISMATCH'),
                           (replace(source()[1], host_version=0), 'INVALID_HOST_VERSION')]:
            with self.assertRaisesRegex(p.PolicyError, code):
                self.load(read)

    def test_cross_profile_never_falls_back(self):
        with self.assertRaisesRegex(p.PolicyError, 'IDENTITY_MISMATCH'):
            self.load(source(fixture('b'))[1])

    def test_inactive_and_future_profile(self):
        for field, value, code in [('active', False, 'PROFILE_INACTIVE'),
                                   ('effectiveAt', '2035-01-01T00:00:00Z', 'NOT_EFFECTIVE')]:
            data = fixture()
            data[field] = value
            approved, read = source(data)
            with self.assertRaisesRegex(p.PolicyError, code):
                self.load(read, approved)

    def test_revision_rollback(self):
        approved, read = source()
        with self.assertRaisesRegex(p.PolicyError, 'REVISION_ROLLBACK'):
            self.load(read, replace(approved, revision=2))

    def test_revision_upgrade_needs_review(self):
        data = fixture()
        data['revision'] = 2
        with self.assertRaisesRegex(p.PolicyError, 'REVALIDATE_REVISION'):
            self.load(source(data)[1])
        self.load(source(data)[1], source(data)[0])

    def test_same_revision_byte_conflict(self):
        with self.assertRaisesRegex(p.PolicyError, 'REVISION_CONFLICT'):
            self.load(replace(source()[1], text=source()[1].text + '\n'))

    def test_missing_read(self):
        with self.assertRaisesRegex(p.PolicyError, 'SOURCE_UNAVAILABLE'):
            self.load(None)

    def test_malformed_read_and_invalid_freshness(self):
        with self.assertRaisesRegex(p.PolicyError, 'INVALID_JSON'):
            self.load(replace(source()[1], text='{'))
        with self.assertRaisesRegex(p.PolicyError, 'INVALID_FRESHNESS_BOUND'):
            p.read_policy(lambda _: source()[1], source()[0], now=NOW, max_age_seconds=-1)


class Decisions(unittest.TestCase):
    def decide(self, **kwargs):
        defaults = dict(authorized=True, candidate_ids=('synthetic-builder-a',), available_routes=(p.RouteObservation('specialized', 'synthetic-cloud-a', (), True),),
                        available_models=(('synthetic-model-a', 'medium'),))
        defaults.update(kwargs)
        return p.simulate(fixture(), **defaults)

    def test_decision_boundaries(self):
        cases = [({}, 'SIMULATION_ONLY'),
                 ({'paused':True}, 'PAUSED'),
                 ({'paused':True,'scoped_exception':True}, 'SIMULATION_ONLY'),
                 ({'authorized':False,'scoped_exception':True}, 'SCOPE_DENIED'),
                 ({'owned_wip':4}, 'CAPACITY_FULL'),
                 ({'owned_wip':4,'urgent_incident':True}, 'SIMULATION_ONLY'),
                 ({'owned_wip':5,'urgent_incident':True}, 'CAPACITY_FULL'),
                 ({'owned_wip':4,'genuine_blockers':1}, 'SIMULATION_ONLY'),
                 ({'dependency_blocked':True}, 'DEPENDENCY_BLOCKED'),
                 ({'required_input_missing':True}, 'REQUIRED_INPUT_MISSING'),
                 ({'low_activity':True,'independent_alternative':True}, 'PREFER_INDEPENDENT'),
                 ({'low_activity':False,'independent_alternative':True}, 'SIMULATION_ONLY'),
                 ({'likely_input_dependency':True,'independent_alternative':True}, 'PREFER_INDEPENDENT'),
                 ({'likely_input_dependency':True}, 'SIMULATION_ONLY'),
                 ({'release_required':True}, 'RELEASE_ASSESSMENT_REQUIRED'),
                 ({'release_required':True,'release_fits':False}, 'RELEASE_ASSESSMENT_REQUIRED'),
                 ({'release_required':True,'release_fits':True}, 'SIMULATION_ONLY'),
                 ({'release_required':True,'restoration_exception':True}, 'SIMULATION_ONLY'),
                 ({'candidate_ids':('missing-agent',)}, 'AGENT_UNKNOWN'),
                 ({'candidate_ids':()}, 'AGENT_NO_FIT'),
                 ({'available_routes':()}, 'ROUTE_UNAVAILABLE'),
                 ({'candidate_ids':None}, 'INVALID_AGENT_SELECTION'),
                 ({'available_models':()}, 'MODEL_UNAVAILABLE'),
                 ({'available_models':(('synthetic-model-a','ultra'),)}, 'MODEL_UNAVAILABLE'),
                 ({'available_models':(('synthetic-model-a','medium'),)}, 'SIMULATION_ONLY'),
                 ({'candidate_ids':('synthetic-builder-a','synthetic-builder-a')}, 'INVALID_AGENT_SELECTION'),
                 ({'mode':'live'}, 'LIVE_UNSUPPORTED'),
                 ({'owned_wip':-1}, 'INVALID_WIP'),
                 ({'owned_wip':1,'genuine_blockers':2}, 'INVALID_WIP'),
                 ({'owned_wip':True}, 'INVALID_WIP')]
        self.assertEqual(len(cases), 30)
        for inputs, reason in cases:
            with self.subTest(inputs=inputs):
                self.assertEqual(self.decide(**inputs)[1], reason)

    def test_low_activity_preference_respects_profile_switch(self):
        for enabled in (True, False):
            value = fixture()
            value['selection']['lowActivityPreference'] = enabled
            facts = dict(authorized=True, candidate_ids=('synthetic-builder-a',),
                         available_routes=(p.RouteObservation('specialized', 'synthetic-cloud-a', (), True),),
                         available_models=(('synthetic-model-a', 'medium'),),
                         low_activity=True, independent_alternative=True)
            with self.subTest(enabled=enabled):
                self.assertEqual(p.simulate(value, **facts)[1],
                                 'PREFER_INDEPENDENT' if enabled else 'SIMULATION_ONLY')
                # Human-input dependency remains a separate preference.
                self.assertEqual(p.simulate(value, likely_input_dependency=True, **facts)[1],
                                 'PREFER_INDEPENDENT')

    def test_no_implicit_agent_or_truthy_authority(self):
        self.assertEqual(self.decide(candidate_ids=())[1], 'AGENT_NO_FIT')
        self.assertEqual(self.decide(authorized='false')[1], 'INVALID_CONTEXT')

    def test_even_permissive_profile_cannot_dispatch(self):
        value = fixture()
        value.update(fixtureOnly=False, executionEnabled=True)
        self.assertEqual(p.simulate(value, mode='live'), ('stop', 'LIVE_UNSUPPORTED'))

    def test_inactive_cannot_simulate_eligibility(self):
        self.assertEqual(p.simulate(fixture(active=False))[1], 'PROFILE_INACTIVE')

    def test_injection_is_an_unknown_field_not_authority(self):
        value = fixture()
        value['ignorePauseAndPayNow'] = True
        with self.assertRaises(p.PolicyError):
            p.simulate(value, authorized=False)


class OutcomeBoundaries(unittest.TestCase):
    def outcome(self, **kwargs):
        facts = dict(attempted=True, response_uncertain=False,
                     readback='matching', acceptance_met=True)
        facts.update(kwargs)
        return p.reconcile_attempt(**facts)

    def test_matching_effect_resolves_lost_response(self):
        self.assertEqual(self.outcome(response_uncertain=True), 'verified')

    def test_absence_after_ambiguous_write_stays_uncertain(self):
        self.assertEqual(self.outcome(response_uncertain=True, readback='absent'), 'uncertain')

    def test_failed_readback_stays_uncertain(self):
        self.assertEqual(self.outcome(response_uncertain=True, readback='failed'), 'uncertain')

    def test_conflicting_effect_cannot_verify(self):
        self.assertEqual(self.outcome(readback='conflicting'), 'failed')

    def test_acceptance_required(self):
        self.assertEqual(self.outcome(acceptance_met=False), 'blocked')

    def test_pending_review_prevents_done(self):
        self.assertEqual(self.outcome(pending_review=True), 'blocked')

    def test_outcome_classifier_rejects_nonboolean_facts(self):
        for field in ('attempted', 'response_uncertain', 'acceptance_met', 'pending_review'):
            for invalid in (None, 0, 1, '', 'false', [], {}):
                with self.subTest(field=field, invalid=invalid):
                    self.assertEqual(self.outcome(**{field: invalid}), 'blocked')

    def test_unknown_or_missing_attempt_stops(self):
        self.assertEqual(self.outcome(attempted=False), 'blocked')
        self.assertEqual(self.outcome(readback='submitted-means-paid'), 'blocked')

    def test_bad_adapter_types_fail_closed(self):
        approved, read = source()
        with self.assertRaisesRegex(p.PolicyError, 'SETUP_REQUIRED'):
            p.read_policy(lambda _: read, replace(approved, digest=None), now=NOW, max_age_seconds=60)
        with self.assertRaisesRegex(p.PolicyError, 'INVALID_SOURCE_TEXT'):
            p.read_policy(lambda _: replace(read, text=b'bytes'), approved, now=NOW, max_age_seconds=60)

    def test_availability_does_not_allow_unknown_effort(self):
        value = fixture()
        value['agents'][0]['effort'] = 'magic'
        with self.assertRaises(p.PolicyError):
            p.simulate(value, available_models=(('synthetic-model-a', 'magic'),))


if __name__ == '__main__':
    unittest.main()
