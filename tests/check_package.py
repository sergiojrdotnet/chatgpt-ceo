"""Allowlisted local package validation; no host install or integration claims."""
import json
from pathlib import Path
import re
import sys
import zipfile

import yaml

ROOT = Path(__file__).resolve().parents[1]
SKILLS = ('plan', 'select-work', 'delegate', 'reconcile-execution',
          'operate-administration', 'coordinate-incidents', 'prepare-code-change',
          'conduct-release', 'monitor-system')
ALLOWED = ('plugin.json', 'README.md', 'requirements.txt',
           'references/profile.md', 'references/state-evidence.md',
           'references/policy-v2.schema.json', 'scripts/policy.py',
           'examples/inactive-a.json', 'examples/inactive-b.json',
           *(f'skills/{name}/SKILL.md' for name in SKILLS))


def check(output):
    output = Path(output).resolve()
    if output == ROOT or ROOT in output.parents:
        raise ValueError('Archive must be outside repository')
    manifest = json.loads((ROOT / 'plugin.json').read_text())
    assert manifest['$schema'] == 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json'
    assert re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', manifest['name'])
    assert len(manifest['name']) <= 64
    assert re.fullmatch(r'(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)', manifest['version'])
    assert set(manifest) == {'$schema', 'name', 'version', 'description'}
    assert isinstance(manifest['description'], str) and manifest['description'].strip()
    skills = sorted((ROOT / 'skills').glob('*/SKILL.md'))
    assert {p.parent.name for p in skills} == set(SKILLS)
    paths = [ROOT / name for name in ALLOWED]
    for path in paths:
        assert path.is_file() and ROOT in path.resolve().parents
        relative = path.relative_to(ROOT)
        assert all(not (ROOT / parent).is_symlink() for parent in relative.parents)
        assert not path.is_symlink()
        if path.suffix == '.md':
            for link in re.findall(r'\]\(([^)]+)\)', path.read_text()):
                if '://' not in link:
                    target = (path.parent / link.split('#')[0]).resolve()
                    assert target in paths, f'Unpackaged reference: {link}'
    for skill in skills:
        content = skill.read_text()
        assert content.startswith('---\n')
        metadata = yaml.safe_load(content.split('---', 2)[1])
        assert metadata['name'] == skill.parent.name
        assert isinstance(metadata['description'], str) and metadata['description'].strip()
        assert len(content.encode()) < 1024 * 1024
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(paths):
            archive.write(path, f"{manifest['name']}/{path.relative_to(ROOT)}")
    with zipfile.ZipFile(output) as archive:
        assert archive.testzip() is None
        assert len(archive.namelist()) == len(paths)
        assert all(not n.startswith('/') and '..' not in n.split('/') for n in archive.namelist())
        for path in paths:
            assert archive.read(f"{manifest['name']}/{path.relative_to(ROOT)}") == path.read_bytes()
    counts = {p.parent.name: len(p.read_text().split()) for p in skills}
    print(f'Package PASS: {len(paths)} files, {len(skills)} skills; archive {output}')
    print(f'Entry word counts (not model tokens): {counts}')
    print('Local structural validation only; host ingestion is a separate gate.')


if __name__ == '__main__':
    check(sys.argv[1])
