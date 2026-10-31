"""Local packaging check. No host install or integration claims."""
import json
from pathlib import Path
import re
import sys
import zipfile

import yaml

ROOT = Path(__file__).resolve().parents[1]


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
    assert len(skills) == 1
    allowed = ['plugin.json', 'skills/ceo-coordinate/SKILL.md',
               'skills/ceo-coordinate/references/profile.md',
               'skills/ceo-coordinate/references/administration.md',
               'skills/ceo-coordinate/references/policy-v1.schema.json',
               'skills/ceo-coordinate/scripts/policy.py',
               'skills/ceo-coordinate/examples/inactive-a.json',
               'skills/ceo-coordinate/examples/inactive-b.json']
    paths = [ROOT / name for name in allowed]
    assert all(path.is_file() and not path.is_symlink() for path in paths)
    for skill in skills:
        content = skill.read_text()
        assert content.startswith('---\n')
        metadata = yaml.safe_load(content.split('---', 2)[1])
        assert metadata['name'] == skill.parent.name
        assert isinstance(metadata['description'], str) and metadata['description'].strip()
        assert len(content.encode()) < 1024 * 1024
        for path in skill.parent.rglob('*'):
            assert not path.is_symlink()
            if path in paths:
                if path.suffix == '.md':
                    for link in re.findall(r'\]\(([^)]+)\)', path.read_text()):
                        if '://' not in link:
                            target = (path.parent / link).resolve()
                            assert ROOT in target.parents and target.is_file(), link
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(paths):
            archive.write(path, f"{manifest['name']}/{path.relative_to(ROOT)}")
    with zipfile.ZipFile(output) as archive:
        assert archive.testzip() is None
        assert len(archive.namelist()) == len(paths)
        assert all(not name.startswith('/') and '..' not in name.split('/') for name in archive.namelist())
        for path in paths:
            assert archive.read(f"{manifest['name']}/{path.relative_to(ROOT)}") == path.read_bytes()
    words = len(skills[0].read_text().split())
    print(f'Package PASS: {len(paths)} files, one skill, {words} entry words; archive {output}')
    print('Local structural validation only; host ingestion and fresh-session behavior untested.')


if __name__ == '__main__':
    check(sys.argv[1])
