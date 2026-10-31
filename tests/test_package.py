import contextlib
import importlib.util
import io
from pathlib import Path
import tempfile
import unittest
import zipfile

from check_package import check, ROOT


class Package(unittest.TestCase):
    def test_archive_is_self_contained_and_excludes_private_canary(self):
        # Synthetic stand-in for an accidentally adjacent private file.
        canary = ROOT / 'skills/ceo-coordinate/private-canary.txt'
        self.assertFalse(canary.exists())
        try:
            canary.write_text('synthetic-private-canary-do-not-package')
            with tempfile.TemporaryDirectory() as folder:
                target = Path(folder) / 'plugin.zip'
                with contextlib.redirect_stdout(io.StringIO()):
                    check(target)
                with zipfile.ZipFile(target) as archive:
                    self.assertFalse(any('private-canary' in n for n in archive.namelist()))
                    self.assertTrue(all(b'synthetic-private-canary-do-not-package' not in archive.read(n)
                                        for n in archive.namelist()))
                    archive.extractall(folder)
                path = Path(folder) / 'chatgpt-ceo-plugin/skills/ceo-coordinate/scripts/policy.py'
                spec = importlib.util.spec_from_file_location('policy', path)
                module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(module)
                module.parse((path.parents[1] / 'examples/inactive-a.json').read_text())
        finally:
            canary.unlink(missing_ok=True)

    def test_package_refuses_archive_inside_source(self):
        with self.assertRaisesRegex(ValueError, 'outside repository'):
            check(ROOT / 'should-not-exist.zip')


if __name__ == '__main__':
    unittest.main()
