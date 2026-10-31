"""New schema-v2 routing behavior; catalog observations are explicitly synthetic."""
import copy
import unittest
from test_policy import fixture
import policy as p


class Routing(unittest.TestCase):
    def general(self):
        value = fixture()
        value['routing']['general'] = {'kind': 'generalCloud'}
        return value

    def test_no_specialized_binding_is_valid_but_unproven(self):
        value = self.general()
        p.validate(value)
        with self.assertRaisesRegex(p.PolicyError, 'ROUTE_UNAVAILABLE'):
            p.resolve_route(value, 'general')

    def test_explicit_general_cloud_with_required_capabilities(self):
        observed = p.RouteObservation('generalCloud', None, ('linear', 'erpnext'), True)
        self.assertEqual(p.resolve_route(self.general(), 'general', [observed], ['erpnext']), observed)

    def test_omitted_selector_evidence_cannot_prove_cloud(self):
        observed = p.RouteObservation('generalCloud', None, ('linear',), False)
        with self.assertRaisesRegex(p.PolicyError, 'CLOUD_ROUTE_UNPROVEN'):
            p.resolve_route(self.general(), 'general', [observed], ['linear'])

    def test_missing_capability_blocks(self):
        observed = p.RouteObservation('generalCloud', None, ('linear',), True)
        with self.assertRaisesRegex(p.PolicyError, 'CAPABILITIES_MISSING'):
            p.resolve_route(self.general(), 'general', [observed], ['checkout'])

    def test_no_privileged_or_cross_profile_fallback(self):
        catalog = [p.RouteObservation('specialized', 'synthetic-operations', ('erpnext',), True)]
        for value in (fixture(), self.general()):
            with self.assertRaisesRegex(p.PolicyError, 'ROUTE_UNAVAILABLE'):
                p.resolve_route(value, 'general', catalog, ['erpnext'])

    def test_ambiguous_catalog_blocks(self):
        observation = p.RouteObservation('generalCloud', None, (), True)
        with self.assertRaisesRegex(p.PolicyError, 'ROUTE_AMBIGUOUS'):
            p.resolve_route(self.general(), 'general', [observation, observation])

    def test_malformed_catalog_and_truthy_claims_block(self):
        for catalog in (None, [None], [{'kind': 'generalCloud'}],
                        [p.RouteObservation('generalCloud', 'unexpected', (), True)],
                        [p.RouteObservation('desktop', None, (), True)],
                        [p.RouteObservation('generalCloud', None, (), 'yes')],
                        [p.RouteObservation('generalCloud', None, ('',), True)]):
            with self.subTest(catalog=catalog), self.assertRaisesRegex(p.PolicyError, 'INVALID_CATALOG'):
                p.resolve_route(self.general(), 'general', catalog)

    def test_closed_route_variants_and_old_schema_rejected(self):
        for binding in ({}, {'environmentConfigId': 'synthetic-old'},
                        {'kind':'specialized'}, {'kind':'desktop'},
                        {'kind':'generalCloud','environmentConfigId':'synthetic-extra'},
                        {'kind':'generalCloud','projectId':'synthetic-desktop'}):
            value=self.general();value['routing']['general']=binding
            with self.subTest(binding=binding), self.assertRaises(p.PolicyError):p.validate(value)
        value=fixture();value['schemaVersion']=1
        with self.assertRaises(p.PolicyError):p.validate(value)

    def test_general_simulation_still_never_dispatches(self):
        value=self.general()
        facts=dict(authorized=True,route='general',task_class='analysis',
                   available_routes=[p.RouteObservation('generalCloud',None,('linear',),True)],
                   required_capabilities=['linear'],available_models=[('synthetic-model-a','medium')])
        self.assertEqual(p.simulate(value,**facts),('eligible','SIMULATION_ONLY'))
        self.assertEqual(p.simulate(value,mode='live',**facts),('stop','LIVE_UNSUPPORTED'))
        facts['available_routes']=[]
        self.assertEqual(p.simulate(value,**facts),('stop','ROUTE_UNAVAILABLE'))
