import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('package_builder', ROOT/'scripts/package.py')
p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
SETTINGS={'$schema':'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json','mcpServers':{'ceo':{'type':'streamable-http','url':'https://synthetic-private.example.test/mcp','extensions':{'com.openai':{'auth':{'type':'oauth','client':{'mode':'dcr'}}}}}}}
class Package(unittest.TestCase):
 def test_private_package_uses_canonical_skills_only(self):
  canary=ROOT/'skills/delegate/private-canary.txt'
  self.assertFalse(canary.exists())
  try:
   canary.write_text('synthetic-private-canary')
   with tempfile.TemporaryDirectory() as directory:
    output=p.build(Path(directory)/'plugin.zip',SETTINGS)
    with zipfile.ZipFile(output) as archive:
     self.assertEqual(len([n for n in archive.namelist() if n.endswith('/SKILL.md')]),10)
     self.assertFalse(any('private-canary' in n or 'src/' in n or 'examples/' in n or '.git/' in n for n in archive.namelist()))
     self.assertEqual(json.loads(archive.read('ceo/mcp.json')),SETTINGS)
     manifest=json.loads(archive.read('ceo/plugin.json'))
     self.assertEqual(manifest['name'],'ceo')
     self.assertEqual(manifest['extensions']['com.openai']['interface']['displayName'],'CEO')
     self.assertTrue(all(n.startswith('ceo/') for n in archive.namelist()))
     for name in archive.namelist():
      data=archive.read(name)
      self.assertNotIn(b'synthetic-private-canary',data)
      if not name.endswith('/mcp.json'):self.assertNotIn(b'synthetic-private.example.test',data)
     for skill in p.SKILLS:self.assertEqual(archive.read(f'ceo/skills/{skill}/SKILL.md'),(ROOT/f'skills/{skill}/SKILL.md').read_bytes())
     archive.extractall(directory)
     self.assertTrue((Path(directory)/'ceo/skills/setup/SKILL.md').exists())
    self.assertEqual(output.stat().st_mode & 0o777,0o600)
  finally:canary.unlink(missing_ok=True)
 def test_credentials_and_invalid_connection_rejected(self):
  for change in ('secret','http','credentials','unknown','none'):
   settings=json.loads(json.dumps(SETTINGS));server=settings['mcpServers']['ceo'];auth=server['extensions']['com.openai']['auth']
   if change=='secret':auth['clientSecret']='synthetic-secret'
   if change=='http':server['url']='http://example.test/mcp'
   if change=='credentials':server['url']='https://user:secret@example.test/mcp'
   if change=='unknown':server['headers']={'Authorization':'secret'}
   if change=='none':auth['type']='none'
   with self.subTest(change=change),self.assertRaises(ValueError):p.connection(settings)
 def test_output_cannot_enter_public_source(self):
  with self.assertRaises(ValueError):p.build(ROOT/'private.zip',SETTINGS)
 def test_each_skill_has_subject_contract_and_preserved_process_scenarios(self):
  for skill in p.SKILLS:
   content=(ROOT/f'skills/{skill}/SKILL.md').read_text()
   self.assertNotIn('references/profile.md',content)
   self.assertNotIn('scripts/policy.py',content)
   if skill!='setup':self.assertIn('get_operation_context',content)
  for name in ('skill_scenarios.json','composition_regressions.json'):
   self.assertTrue(json.loads((ROOT/'tests'/name).read_text()))
