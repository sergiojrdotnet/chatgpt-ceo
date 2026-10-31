"""Whole-template selection and runtime availability, with synthetic observations."""
import copy
import unittest
from test_policy import fixture
import policy as p


class Agents(unittest.TestCase):
    def resolve(self, value=None, candidates=('synthetic-builder-a',), **kwargs):
        facts=dict(catalog=[p.RouteObservation('specialized','synthetic-cloud-a',('checkout',),True)],
                   available_models=[('synthetic-model-a','medium')],required_capabilities=['checkout'])
        facts.update(kwargs)
        return p.resolve_agent(fixture() if value is None else value,candidates,**facts)

    def test_returns_whole_detached_template_without_recombining(self):
        value=fixture()
        selected=self.resolve(value)
        self.assertEqual(selected,value['agents'][0])
        selected['environment']='changed-copy'
        self.assertEqual(value['agents'][0]['environment'],'synthetic-cloud-a')

    def test_arbitrary_ids_descriptions_without_fixed_company_roles(self):
        value=fixture();value['agents'][0]['id']='custom-auditor'
        value['agents'][0]['description']='Choose for synthetic audit tasks with source verification.'
        self.assertEqual(self.resolve(value,('custom-auditor',))['id'],'custom-auditor')

    def test_no_fit_ambiguity_unknown_and_malformed_selection(self):
        value=fixture('b')
        for candidates,code in [((), 'AGENT_NO_FIT'),
                                (('synthetic-builder-b','synthetic-records'),'AGENT_AMBIGUOUS'),
                                (('missing',),'AGENT_UNKNOWN'),
                                (None,'INVALID_AGENT_SELECTION'),
                                (('synthetic-records','synthetic-records'),'INVALID_AGENT_SELECTION'),
                                (({},),'INVALID_AGENT_SELECTION')]:
            with self.subTest(candidates=candidates),self.assertRaisesRegex(p.PolicyError,code):
                self.resolve(value,candidates)

    def test_duplicate_stable_ids_rejected_even_with_different_settings(self):
        value=fixture();other=copy.deepcopy(value['agents'][0]);other['model']='different'
        value['agents'].append(other)
        with self.assertRaisesRegex(p.PolicyError,'DUPLICATE_AGENT_ID'):p.validate(value)

    def test_closed_required_fields_and_description_bounds(self):
        agent=fixture()['agents'][0]
        for key in ('id','name','description','model','effort','instructions'):
            value=fixture();del value['agents'][0][key]
            with self.subTest(key=key),self.assertRaises(p.PolicyError):p.validate(value)
        for field,bad in [('description',' '),('description','a'*501),('name',''),('id','BAD ID'),('id','valid-id\n'),
                          ('instructions',' '),('instructions',None),('environment',''),('environment',' '),('environment',{}),('environment',None),('environment',{'projectId':'desktop'})]:
            value=fixture();value['agents'][0][field]=bad
            with self.subTest(field=field,bad=bad),self.assertRaises(p.PolicyError):p.validate(value)
        value=fixture();value['agents'][0]['unknown']='unconfigured'
        with self.assertRaises(p.PolicyError):p.validate(value)

    def test_unconfigured_maps_are_not_accepted(self):
        for field in ('routing','models'):
            value=fixture();value[field]={}
            with self.assertRaises(p.PolicyError):p.validate(value)

    def test_environment_optional_but_general_cloud_requires_evidence(self):
        value=fixture('b');record=value['agents'][1]
        self.assertNotIn('environment',record)
        facts=dict(available_models=[('synthetic-record-model','low')],required_capabilities=['erpnext'])
        with self.assertRaisesRegex(p.PolicyError,'ROUTE_UNAVAILABLE'):
            self.resolve(value,('synthetic-records',),catalog=[],**facts)
        observed=p.RouteObservation('generalCloud',None,('erpnext',),True)
        self.assertEqual(self.resolve(value,('synthetic-records',),catalog=[observed],**facts),record)
        with self.assertRaisesRegex(p.PolicyError,'CLOUD_ROUTE_UNPROVEN'):
            self.resolve(value,('synthetic-records',),catalog=[p.RouteObservation('generalCloud',None,('erpnext',),False)],**facts)

    def test_no_template_model_or_environment_substitution(self):
        value=fixture('b')
        with self.assertRaisesRegex(p.PolicyError,'MODEL_UNAVAILABLE'):
            self.resolve(value,('synthetic-builder-b',),available_models=[('synthetic-record-model','low')])
        with self.assertRaisesRegex(p.PolicyError,'ROUTE_UNAVAILABLE'):
            self.resolve(value,('synthetic-builder-b',),available_models=[('synthetic-model-b','medium')],
                         catalog=[p.RouteObservation('specialized','synthetic-observation-cloud',('checkout',),True)])

    def test_exact_effort_and_required_capabilities(self):
        with self.assertRaisesRegex(p.PolicyError,'MODEL_UNAVAILABLE'):
            self.resolve(available_models=[('synthetic-model-a','high')])
        with self.assertRaisesRegex(p.PolicyError,'CAPABILITIES_MISSING'):
            self.resolve(required_capabilities=['release'])

    def test_ambiguous_or_malformed_catalog_stops(self):
        observed=p.RouteObservation('specialized','synthetic-cloud-a',('checkout',),True)
        with self.assertRaisesRegex(p.PolicyError,'ROUTE_AMBIGUOUS'):
            self.resolve(catalog=[observed,observed])
        for catalog in (None,[None],[{'kind':'generalCloud'}],
                        [p.RouteObservation('generalCloud','unexpected',(),True)],
                        [p.RouteObservation('desktop',None,(),True)],
                        [p.RouteObservation('generalCloud',None,(),'yes')]):
            with self.subTest(catalog=catalog),self.assertRaisesRegex(p.PolicyError,'INVALID_CATALOG'):
                self.resolve(catalog=catalog)
        for models in (None,[None],[('only-one',)],[(None,'low')]):
            with self.subTest(models=models),self.assertRaisesRegex(p.PolicyError,'INVALID_MODEL_CATALOG'):
                self.resolve(available_models=models)

    def test_general_simulation_never_dispatches(self):
        facts=dict(authorized=True,candidate_ids=['synthetic-records'],
                   available_routes=[p.RouteObservation('generalCloud',None,('erpnext',),True)],
                   required_capabilities=['erpnext'],available_models=[('synthetic-record-model','low')])
        value=fixture('b')
        self.assertEqual(p.simulate(value,**facts),('eligible','SIMULATION_ONLY'))
        self.assertEqual(p.simulate(value,mode='live',**facts),('stop','LIVE_UNSUPPORTED'))
        facts['candidate_ids']=[]
        self.assertEqual(p.simulate(value,**facts),('needsDecision','AGENT_NO_FIT'))
        facts['candidate_ids']=['synthetic-records','synthetic-observer']
        self.assertEqual(p.simulate(value,**facts),('needsDecision','AGENT_AMBIGUOUS'))
