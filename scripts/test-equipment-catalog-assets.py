import hashlib
import importlib.util
import json
from pathlib import Path
import unittest
from urllib.parse import parse_qs, urlsplit

spec = importlib.util.spec_from_file_location("catalog", Path(__file__).with_name("import-equipment-catalog-assets.py"))
catalog = importlib.util.module_from_spec(spec)
spec.loader.exec_module(catalog)


class CatalogImportTest(unittest.TestCase):
    def setUp(self):
        self.body = b"%PDF-1.7\noriginal document"
        self.entry = dict(model_id="00000000-0000-4000-8000-000000000001",
                          brand_id="00000000-0000-4000-8000-000000000002", code="MODEL123",
                          field="manual_url", sha256=hashlib.sha256(self.body).hexdigest(),
                          source_url="https://example.org/original.pdf", evidence_url="https://example.org/model",
                          extension="pdf", scope="exact", document="Manual original", reviewed_at="2026-11-15", manual_type="usuario")
        self.current = dict(brand_id=self.entry["brand_id"], code="MODEL123", manual_url=None)

    def test_reexecution_preserves_existing_assets(self):
        action, url = catalog.plan_entry(self.entry, self.current, "https://example.org")
        self.assertEqual(action, "add")
        self.current["manual_url"] = url
        self.assertEqual(catalog.plan_entry(self.entry, self.current, "https://example.org")[0], "already_imported")
        self.current["manual_url"] = "https://example.org/prior-reviewed.pdf"
        self.assertEqual(catalog.plan_entry(self.entry, self.current, "https://example.org")[0], "preserved")

    def test_identity_and_allowed_fields(self):
        for changes in ({"field": "company_id"}, {"model_id": "../customer"}, {"scope": "unverified"},
                        {"source_url": "http://example.org/file"}, {"extension": "jpg"}, {"brand_id": "bad"}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                catalog.validate_entry({**self.entry, **changes})
        with self.assertRaises(ValueError):
            catalog.plan_entry(self.entry, {**self.current, "code": "DIFFERENT"}, "https://example.org")

    def test_rejects_changed_or_non_pdf_response(self):
        catalog.validate_content(self.entry, self.body)
        with self.assertRaises(ValueError):
            catalog.validate_content(self.entry, b"%PDF-changed")
        html = b"<html>Sign in</html>"
        with self.assertRaises(ValueError):
            catalog.validate_content({**self.entry, "sha256": hashlib.sha256(html).hexdigest()}, html)
        original = b"\x00\x00" + self.body
        catalog.validate_content({**self.entry, "sha256": hashlib.sha256(original).hexdigest()}, original)
        disguised = b"<html>" + self.body
        with self.assertRaises(ValueError):
            catalog.validate_content({**self.entry, "sha256": hashlib.sha256(disguised).hexdigest()}, disguised)

    def test_replacement_requires_evidence_and_exact_prior_url(self):
        replacement = {**self.entry, "replaces_url": "https://example.org/wrong.pdf"}
        with self.assertRaises(ValueError):
            catalog.validate_entry(replacement)
        replacement.update(replacement_reason="Capa identifica outro modelo", replaces_sha256="a" * 64)
        current = {**self.current, "manual_url": replacement["replaces_url"]}
        self.assertEqual(catalog.plan_entry(replacement, current, "https://example.org")[0], "replace_verified_mismatch")
        current["manual_url"] = "https://example.org/later-correct.pdf"
        self.assertEqual(catalog.plan_entry(replacement, current, "https://example.org")[0], "preserved")
        with self.assertRaises(ValueError):
            catalog.validate_previous_content(replacement, b"previous content has changed")

    def test_shared_storage_is_content_addressed_not_arbitrary_path(self):
        shared = {**self.entry, "storage_path": "verified/shared/" + self.entry["sha256"] + ".pdf"}
        self.assertEqual(catalog.object_path(shared), shared["storage_path"])
        with self.assertRaises(ValueError):
            catalog.object_path({**shared, "storage_path": "verified/../../another-bucket/file.pdf"})

    def test_upload_marks_content_addressed_asset_as_immutable(self):
        client = catalog.CatalogClient("https://example.org", "not-a-real-secret")
        captured = []

        def fake(path, method="GET", body=None, headers=None):
            captured.append((path, method, body, headers))
            return b""

        client.request = fake
        client.upload(self.entry, self.body)

        path, method, body, headers = captured[0]
        self.assertEqual(path, "/storage/v1/object/equipment-catalog/" + catalog.object_path(self.entry))
        self.assertEqual(method, "POST")
        self.assertEqual(body, self.body)
        self.assertEqual(headers["cache-control"], "max-age=31536000")
        self.assertEqual(headers["x-upsert"], "false")

    def test_new_references_require_traceable_source_and_correct_proof(self):
        reference = dict(source_url="https://manufacturer.example/manual.pdf", document="Manual original", pages=[5], source_kind="pdf", proof_kind="visual", source_sha256="a" * 64)
        catalog.validate_declared_model({"catalog_reference": reference})
        for changes in ({"source_sha256": ""}, {"pages": []}, {"proof_kind": "html"}, {"source_url": "http://example.org/manual.pdf"}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                catalog.validate_declared_model({"catalog_reference": {**reference, **changes}})
        catalog.validate_declared_model({"catalog_reference": {**reference, "source_kind": "html", "proof_kind": "html", "pages": []}})

    def test_patch_uses_global_table_exact_identity_and_null_guard(self):
        client = catalog.CatalogClient("https://example.org", "not-a-real-secret")
        captured = []
        client.current = lambda _: {"manual_type": None}
        def fake(path, method, body, headers):
            captured.append((path, method, json.loads(body), headers))
            return b"[{\"id\":\"updated\"}]"
        client.request = fake
        self.assertTrue(client.add_if_empty(self.entry, "https://example.org/new.pdf"))
        path, method, patch, _ = captured[0]
        self.assertEqual(urlsplit(path).path, "/rest/v1/equipment_models")
        filters = parse_qs(urlsplit(path).query)
        self.assertEqual(filters["manual_url"], ["is.null"])
        self.assertEqual(filters["manual_type"], ["is.null"])
        self.assertEqual(filters["brand_id"], ["eq." + self.entry["brand_id"]])
        self.assertEqual(method, "PATCH")
        self.assertEqual(patch, {"manual_url": "https://example.org/new.pdf", "manual_type": "usuario"})


if __name__ == "__main__":
    unittest.main()
