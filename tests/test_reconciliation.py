"""Synthetic trusted-observation cases; no connector or live execution."""
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] /
                       'skills/ceo-coordinate/scripts'))
from policy import reconcile_execution


class Reconciliation(unittest.TestCase):
    def decide(self, **changes):
        facts = dict(association_matches=True, checkpoint_current=True,
                     scope_allowed=True, duplicate_reconciled=False,
                     execution='ended', state_matches=True, attempted=True,
                     response_uncertain=False, readback='matching',
                     acceptance_met=True, pending_review=False,
                     owner='synthetic-executor')
        facts.update(changes)
        return reconcile_execution(**facts)

    def test_verified_stage_is_not_done(self):
        self.assertEqual(self.decide(), dict(outcome='verified',
                         nextAction='record_verified_stage', owner='synthetic-executor'))

    def test_duplicate_reuses_verified_record(self):
        self.assertEqual(self.decide(duplicate_reconciled=True)['nextAction'],
                         'retain_prior_result')

    def test_duplicate_does_not_hide_new_uncertainty(self):
        result = self.decide(duplicate_reconciled=True, response_uncertain=True,
                             readback='absent')
        self.assertEqual(result['outcome'], 'uncertain')
        self.assertEqual(result['nextAction'], 'inspect_effect_without_retry')

    def test_stale_or_wrong_task_result_cannot_complete(self):
        for changes in ({'association_matches': False}, {'checkpoint_current': False}):
            with self.subTest(changes=changes):
                self.assertEqual(self.decide(**changes)['outcome'], 'blocked')

    def test_pause_prevents_duplicate_reuse(self):
        self.assertEqual(self.decide(scope_allowed=False, duplicate_reconciled=True)
                         ['nextAction'], 'revalidate_scope_and_checkpoint')

    def test_integration_mismatch_requires_fresh_read(self):
        self.assertEqual(self.decide(state_matches=False)['nextAction'],
                         'reread_state_and_integration')

    def test_disconnect_is_not_finished_even_with_matching_effect(self):
        self.assertEqual(self.decide(execution='disconnected')['outcome'], 'uncertain')

    def test_active_selection_inspects_existing_execution(self):
        self.assertEqual(self.decide(execution='running')['nextAction'],
                         'inspect_existing_execution')

    def test_failure_and_denial_retain_owner_and_next_step(self):
        for execution, outcome, action in (
            ('failed', 'failed', 'inspect_failure_and_effect'),
            ('denied', 'blocked', 'escalate_denial'),
        ):
            result = self.decide(execution=execution)
            self.assertEqual(result, dict(outcome=outcome, nextAction=action,
                                          owner='synthetic-executor'))

    def test_review_or_acceptance_gate_remains_open(self):
        for changes in ({'pending_review': True}, {'acceptance_met': False}):
            self.assertEqual(self.decide(**changes)['outcome'], 'blocked')

    def test_lost_response_resolved_only_by_matching_acceptance(self):
        self.assertEqual(self.decide(response_uncertain=True)['outcome'], 'verified')
        for readback in ('absent', 'failed', 'conflicting'):
            self.assertEqual(self.decide(response_uncertain=True, readback=readback)
                             ['outcome'], 'uncertain')

    def test_malformed_observations_fail_closed(self):
        for field in ('association_matches', 'checkpoint_current', 'scope_allowed',
                      'duplicate_reconciled', 'state_matches', 'attempted',
                      'response_uncertain', 'acceptance_met', 'pending_review'):
            for invalid in (None, 1, 'true', [], {}):
                with self.subTest(field=field, invalid=invalid):
                    self.assertEqual(self.decide(**{field: invalid})['outcome'], 'blocked')
        for changes in ({'execution': 'callback-success'}, {'readback': None},
                        {'owner': ''}, {'owner': None}):
            self.assertEqual(self.decide(**changes)['outcome'], 'blocked')


if __name__ == '__main__':
    unittest.main()
