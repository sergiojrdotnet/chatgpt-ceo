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
