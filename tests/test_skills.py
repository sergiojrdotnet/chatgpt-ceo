import json
from pathlib import Path
import re
import unittest

import yaml

ROOT = Path(__file__).resolve().parents[1]
SKILLS = {'plan', 'select-work', 'delegate', 'reconcile-execution',
          'operate-administration', 'coordinate-incidents', 'prepare-code-change',
          'conduct-release', 'monitor-system', 'setup'}


class Skills(unittest.TestCase):
    def test_canonical_skills_and_contained_references(self):
        paths = list((ROOT / 'skills').glob('*/SKILL.md'))
        self.assertEqual({path.parent.name for path in paths}, SKILLS)
        for path in paths:
            content = path.read_text()
            self.assertTrue(content.startswith('---\n'))
            metadata = yaml.safe_load(content.split('---', 2)[1])
            self.assertEqual(metadata['name'], path.parent.name)
            self.assertIsInstance(metadata['description'], str)
            self.assertTrue(metadata['description'].strip())
            self.assertNotIn('references/profile.md', content)
            self.assertNotIn('scripts/policy.py', content)
            if path.parent.name != 'setup':
                self.assertIn('get_operation_context', content)
        for path in paths + list((ROOT / 'references').glob('*.md')):
            for link in re.findall(r'\]\(([^)]+)\)', path.read_text()):
                if '://' in link:
                    continue
                target = (path.parent / link.split('#')[0]).resolve()
                self.assertTrue(target.is_file(), link)
                self.assertTrue(target.is_relative_to(ROOT / 'references') or
                                target.is_relative_to(ROOT / 'skills'), link)

    def test_preserved_process_scenarios(self):
        for name in ('skill_scenarios.json', 'composition_regressions.json'):
            self.assertTrue(json.loads((ROOT / 'tests' / name).read_text()))

    def test_history_and_release_boundaries(self):
        for path in list((ROOT / 'skills').glob('*/SKILL.md')) + list((ROOT / 'references').glob('*.md')):
            content = path.read_text()
            self.assertNotIn('get_checkpoint', content)
            self.assertNotIn('save_checkpoint', content)
        prepare = (ROOT / 'skills/prepare-code-change/SKILL.md').read_text()
        self.assertNotIn('review/CI/merge', prepare)
        self.assertNotIn('conduct-release', prepare)
        release = (ROOT / 'skills/conduct-release/SKILL.md').read_text()
        for boundary in ('Awaiting Release', 'separate release', 'original implementation',
                         'list_coordination_events', 'append_coordination_event',
                         'correlationId', 'uncertain', 'Real host', 'no schedule',
                         'already assigned release', 'repeat step 4'):
            self.assertIn(boundary, release)
        for name in ('plan', 'select-work', 'delegate', 'reconcile-execution',
                     'conduct-release', 'coordinate-incidents', 'operate-administration', 'setup'):
            self.assertIn('append_coordination_event', (ROOT / f'skills/{name}/SKILL.md').read_text())

    def test_handoff_contract_and_scenario_coverage(self):
        state = (ROOT / 'references/state-evidence.md').read_text()
        for stage, writer in (
            ('Triage qualification', 'Coordinator using plan'),
            ('Backlog → Todo', 'Coordinator using select-work'),
            ('Actual start → In Progress', 'Responsible executor'),
            ('Ready deliverable → In Review', 'Implementer'),
            ('Merge requiring publication → Awaiting Release', 'Implementer'),
            ('Actual acceptance checking → In Validation', 'Responsible validation executor'),
            ('Verified issue acceptance → Done', 'Responsible executor'),
        ):
            row = next(line for line in state.splitlines() if line.startswith('| ' + stage))
            self.assertEqual(row.split('|')[2].strip(), writer)
        self.assertIn('closure always requires explicit user approval', state)
        self.assertIn('Preserve the last truthful phase', state)
        self.assertIn('state-evidence.md', (ROOT / 'references/configuration.md').read_text())
        cases = json.loads((ROOT / 'tests/composition_regressions.json').read_text())
        by_name = {case['name']: case for case in cases}
        self.assertEqual(len(by_name), len(cases))
        for name in ('explicit-status-writers', 'nonhuman-blocker-phase',
                     'project-initiative-closure-approval', 'meaningful-execution-events',
                     'snapshot-versus-timed-observation', 'initiative-event-scope',
                     'publication-writer-and-handoff', 'release-guidance-without-extra-instructions'):
            case = by_name[name]
            self.assertTrue(case['steps'])
            self.assertGreaterEqual(len(case['expected']), 2)
            self.assertTrue(set(case['skills']).issubset(SKILLS))
