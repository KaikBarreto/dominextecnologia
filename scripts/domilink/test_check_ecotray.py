import importlib.util
import json
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from io import StringIO
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("check_ecotray", Path(__file__).with_name("check_ecotray.py"))
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)


class EcoTrayComparisonTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.source = self.root / "ecotray"
        self.target = self.root / "dominex"
        self.source.mkdir()
        self.target.mkdir()
        for name in ["print_manager.py", "scale_reader.py", "protocols/upx.py"]:
            p = self.source / name
            p.parent.mkdir(exist_ok=True)
            p.write_text("# driver inicial\n")
        for name in checker.TARGET_FILES:
            p = self.target / name
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text("# destino inicial\n")
        self.baseline = {
            "schemaVersion": 1,
            "source": {"files": checker.snapshots(self.source, checker.SOURCE_FILES, checker.SOURCE_DIRECTORIES)},
            "target": {"files": checker.snapshots(self.target, checker.TARGET_FILES, checker.TARGET_DIRECTORIES)},
        }

    def check(self):
        return checker.inspect(self.source, self.baseline, self.target)

    def test_same_files_ignore_git_only_change(self):
        with patch.object(checker, "git_revision", return_value="new-revision"):
            self.assertEqual(self.check()["status"], "unchanged")

    def test_detects_source_and_target_changes_independently(self):
        (self.source / "print_manager.py").write_text("# impressão corrigida\n")
        local = self.target / checker.TARGET_FILES[0]
        local.write_text("# leitor corrigido\n")
        report = self.check()
        self.assertEqual(report["status"], "review_required")
        self.assertEqual(report["sourceChanges"]["modified"], ["print_manager.py"])
        self.assertEqual(report["targetChanges"]["modified"], [checker.TARGET_FILES[0]])

    def test_added_and_removed_protocols(self):
        (self.source / "protocols/upx.py").unlink()
        (self.source / "protocols/new_scale.py").write_text("# protocolo\n")
        report = self.check()
        self.assertEqual(report["sourceChanges"]["added"], ["protocols/new_scale.py"])
        self.assertEqual(report["sourceChanges"]["removed"], ["protocols/upx.py"])

    def test_ignores_real_config_and_secrets(self):
        for name in ["config.json", "config.toml", ".env", "protocols/private.env"]:
            (self.source / name).write_text("fake-private-value")
        report = self.check()
        self.assertEqual(report["status"], "unchanged")
        self.assertNotIn("fake-private-value", json.dumps(report))

    def test_refuses_to_follow_symlink_outside_source(self):
        outside = self.root / "unrelated.py"
        outside.write_text("# privado\n")
        (self.source / "protocols/link.py").symlink_to(outside)
        self.assertEqual(self.check()["status"], "unchanged")

    def test_missing_drivers_fail_closed(self):
        (self.source / "scale_reader.py").unlink()
        with self.assertRaises(ValueError):
            self.check()

    def test_unknown_baseline_schema_rejected(self):
        self.baseline["schemaVersion"] = 99
        with self.assertRaises(ValueError):
            self.check()

    def test_accept_requires_explicit_review_and_does_not_touch_source(self):
        baseline_path = self.root / "baseline.json"
        baseline_path.write_text(json.dumps(self.baseline))
        before = baseline_path.read_bytes()
        output, errors = StringIO(), StringIO()
        with redirect_stdout(output), redirect_stderr(errors):
            code = checker.main(["--source", str(self.source), "--baseline", str(baseline_path), "--accept"])
        self.assertEqual(code, 2)
        self.assertEqual(before, baseline_path.read_bytes())
        self.assertEqual((self.source / "print_manager.py").read_text(), "# driver inicial\n")

    def test_cli_reports_and_accepts_only_after_review(self):
        baseline_path = self.root / "baseline.json"
        baseline_path.write_text(json.dumps(self.baseline))
        source_file = self.source / "print_manager.py"
        source_file.write_text("# correção nova\n")
        arguments = ["--source", str(self.source), "--baseline", str(baseline_path), "--json"]
        before = baseline_path.read_bytes()
        with patch.object(checker, "ROOT", self.target), redirect_stdout(StringIO()):
            self.assertEqual(checker.main(arguments), 1)
            self.assertEqual(baseline_path.read_bytes(), before)
            self.assertEqual(checker.main(arguments + ["--accept", "--reviewed", "Drivers revistos e testes aprovados"]), 0)
            self.assertEqual(checker.main(arguments), 0)
        self.assertEqual(source_file.read_text(), "# correção nova\n")
        accepted = json.loads(baseline_path.read_text())
        self.assertEqual(accepted["review"]["summary"], "Drivers revistos e testes aprovados")


if __name__ == "__main__":
    unittest.main()
