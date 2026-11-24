import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile

SPEC = importlib.util.spec_from_file_location("build_bundle", Path(__file__).with_name("build_bundle.py"))
builder = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(builder)


class BundleTest(unittest.TestCase):
    def test_reproducible_allowlisted_sources_and_setup_without_hardware(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            manifest = builder.build(directory)
            archive = directory / manifest["filename"]
            first = archive.read_bytes()
            self.assertEqual(builder.build(directory), manifest)
            self.assertEqual(archive.read_bytes(), first)
            self.assertEqual(hashlib.sha256(first).hexdigest(), manifest["sha256"])
            with zipfile.ZipFile(archive) as handle:
                names = handle.namelist()
                self.assertNotIn("config.toml", names)
                self.assertFalse(any(".env" in name or ".venv" in name or "__pycache__" in name for name in names))
                internal = json.loads(handle.read("manifest.json"))
                for name, digest in internal["files"].items():
                    self.assertEqual(hashlib.sha256(handle.read(name)).hexdigest(), digest)
                extracted = directory / "extracted"
                handle.extractall(extracted)
            command = [sys.executable, str(extracted / "configurar.py")]
            rejected = subprocess.run(command + ["--origin", "https://user:fake@example.invalid"], capture_output=True)
            self.assertNotEqual(rejected.returncode, 0)
            self.assertFalse((extracted / "config.toml").exists())
            configured = subprocess.run(command + ["--origin", "https://pdv.example.invalid"], capture_output=True)
            self.assertEqual(configured.returncode, 0)
            initial = (extracted / "config.toml").read_bytes()
            retry = subprocess.run(command + ["--origin", "https://other.example.invalid"], capture_output=True)
            self.assertNotEqual(retry.returncode, 0)
            self.assertEqual((extracted / "config.toml").read_bytes(), initial)
            # Nenhum import do servidor, abertura de socket/serial ou spooler.
            self.assertIn(b"https://pdv.example.invalid", initial)
            shutil.rmtree(extracted)


if __name__ == "__main__":
    unittest.main()
