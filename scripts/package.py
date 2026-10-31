"""Build a private installation from canonical skills and operator connection settings."""
import argparse
import json
from pathlib import Path
import re
import zipfile
from urllib.parse import urlsplit
import yaml

ROOT = Path(__file__).resolve().parents[1]
SKILLS = ('plan', 'select-work', 'delegate', 'reconcile-execution',
          'operate-administration', 'coordinate-incidents', 'prepare-code-change',
          'conduct-release', 'monitor-system', 'setup')
FILES = ('plugin.json', 'references/configuration.md', 'references/state-evidence.md',
         'references/policy.schema.json', *(f'skills/{s}/SKILL.md' for s in SKILLS))

def connection(value):
    if set(value) != {'$schema', 'mcpServers'} or value['$schema'] != 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json':
        raise ValueError('Expected portable MCP configuration')
    servers = value['mcpServers']
    if set(servers) != {'ceo'}:
        raise ValueError('Expected only ceo')
    server = servers['ceo']
    if set(server) != {'type', 'url', 'extensions'} or server['type'] != 'streamable-http':
        raise ValueError('Expected Streamable HTTP connection')
    def url(raw):
        p = urlsplit(raw)
        if p.scheme != 'https' or not p.hostname or p.username or p.password or p.fragment or p.query:
            raise ValueError('Expected HTTPS URL without credentials, query or fragment')
    url(server['url'])
    if set(server['extensions']) != {'com.openai'} or set(server['extensions']['com.openai']) != {'auth'}:
        raise ValueError('Expected per-server auth')
    auth = server['extensions']['com.openai']['auth']
    allowed = {'type', 'client', 'authorizationUrl', 'tokenUrl', 'registrationUrl', 'authorizationServerBase', 'resource', 'baseScopes', 'defaultScopes', 'oidcEnabled', 'oidcConfigurationUrl', 'oidcUserinfoEndpoint', 'oidcScopesSupported'}
    if not set(auth) <= allowed or auth.get('type') != 'oauth':
        raise ValueError('Use OAuth connection settings without secrets')
    for key in set(auth) & {'authorizationUrl','tokenUrl','registrationUrl','authorizationServerBase','resource','oidcConfigurationUrl','oidcUserinfoEndpoint'}:
        url(auth[key])
    for key in set(auth) & {'baseScopes','defaultScopes','oidcScopesSupported'}:
        if not isinstance(auth[key], list) or any(not isinstance(s,str) or not s.strip() for s in auth[key]):
            raise ValueError('Invalid scopes')
    if 'oidcEnabled' in auth and type(auth['oidcEnabled']) is not bool:
        raise ValueError('Invalid OIDC flag')
    client = auth.get('client')
    if client is not None:
        if client.get('mode') in ('dcr','cimd'):
            if set(client) != {'mode'}: raise ValueError('Invalid automatic registration')
        elif client.get('mode') == 'provided':
            if not set(client) <= {'mode','clientId','tokenEndpointAuthMethod'} or not isinstance(client.get('clientId'),str) or not client['clientId'].strip():
                raise ValueError('Invalid provided client')
            if client.get('tokenEndpointAuthMethod','none') not in ('none','client_secret_post','client_secret_basic','private_key_jwt'):
                raise ValueError('Invalid token authentication method')
        else: raise ValueError('Invalid client mode')
    return value

def build(output, settings):
    output = Path(output).resolve()
    if output == ROOT or ROOT in output.parents: raise ValueError('Archive must be outside repository')
    connection(settings)
    manifest = json.loads((ROOT/'plugin.json').read_text())
    assert manifest['$schema'] == 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json'
    assert manifest['version'] == '0.1.0'
    assert manifest['extensions']['com.openai']['onboardingSkill'] == './skills/setup/SKILL.md'
    assert manifest['name'] == 'ceo'
    assert manifest['extensions']['com.openai']['interface']['displayName'] == 'CEO'
    package_root = manifest['name']
    paths = [ROOT / name for name in FILES]
    for path in paths:
        assert path.is_file() and not path.is_symlink() and ROOT in path.resolve().parents
        assert all(not parent.is_symlink() for parent in path.parents if parent != ROOT)
        if path.suffix == '.md':
            content = path.read_text()
            for link in re.findall(r'\]\(([^)]+)\)', content):
                if '://' not in link: assert (path.parent/link.split('#')[0]).resolve() in paths, link
            if path.name == 'SKILL.md':
                meta = yaml.safe_load(content.split('---',2)[1])
                assert meta['name'] == path.parent.name and isinstance(meta['description'],str) and meta['description'].strip()
    with zipfile.ZipFile(output,'x',zipfile.ZIP_DEFLATED) as archive:
        for path in paths: archive.write(path, f"{package_root}/{path.relative_to(ROOT)}")
        archive.writestr(f'{package_root}/mcp.json',json.dumps(settings,indent=2)+'\n')
    output.chmod(0o600)
    with zipfile.ZipFile(output) as archive:
        assert archive.testzip() is None and len(archive.namelist()) == len(FILES)+1
        for path in paths: assert archive.read(f'{package_root}/{path.relative_to(ROOT)}') == path.read_bytes()
    return output

if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--connection',required=True,type=Path)
    parser.add_argument('--output',required=True,type=Path)
    args=parser.parse_args()
    build(args.output,json.loads(args.connection.read_text()))
    print('Private package validated. User installation/authentication remain manual.')
