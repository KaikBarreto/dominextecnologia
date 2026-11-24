import { describe, expect, it } from 'vitest';
import manifest from './equipmentCatalogAssets.json';
import { equipmentAssetUrl, equipmentDocumentMirror, getEquipmentAssetReference, withEquipmentAssetReferences, type EquipmentAssetReference } from './equipmentCatalogAssets';

const baseUrl = 'https://catalog.example.org';
const reference = manifest.assets.find(entry => entry.field === 'image_url' && entry.scope === 'family') as EquipmentAssetReference;
const model = { id: reference.model_id, brand_id: reference.brand_id, code: reference.code, image_url: null, manual_url: null };

describe('arquivos documentados do catálogo', () => {
  it('usa apenas o mesmo hash PDF para abrir a cópia da referência de diagnóstico', () => {
    const manual = manifest.assets.find(entry => entry.field === 'manual_url') as EquipmentAssetReference;
    expect(equipmentDocumentMirror(manual.sha256, baseUrl)).toBe(equipmentAssetUrl(manual, baseUrl));
    expect(equipmentDocumentMirror('a'.repeat(64), baseUrl)).toBeUndefined();
    expect(equipmentDocumentMirror(reference.sha256, baseUrl)).toBeUndefined();
  });
  it('complementa somente a identidade exata e preserva arquivos existentes', () => {
    const complemented = withEquipmentAssetReferences(model, baseUrl);
    expect(complemented.image_url).toBe(equipmentAssetUrl(reference, baseUrl));
    expect(getEquipmentAssetReference(complemented, 'image_url', baseUrl)?.scope).toBe('family');
    for (const difference of [{ id: 'another' }, { brand_id: 'another' }, { code: 'another' }]) {
      const different = { ...model, ...difference };
      expect(withEquipmentAssetReferences(different, baseUrl)).toBe(different);
    }
    const saved = { ...model, image_url: 'https://catalog.example.org/existing-photo.jpg', manual_url: 'https://catalog.example.org/existing-manual.pdf' };
    expect(withEquipmentAssetReferences(saved, baseUrl)).toBe(saved);
    expect(getEquipmentAssetReference(saved, 'image_url', baseUrl)).toBeUndefined();
  });

  it('garante destino único, fonte, revisão e hashes em todo o manifesto', () => {
    expect(new Set(manifest.assets.map(entry => `${entry.model_id}:${entry.field}`)).size).toBe(manifest.assets.length);
    for (const entry of manifest.assets) {
      expect(entry.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(entry.source_url).toMatch(/^https:\/\//);
      expect(entry.evidence_url).toMatch(/^https:\/\//);
      expect(entry.reviewed_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(['exact', 'family']).toContain(entry.scope);
      expect(entry.document.length).toBeGreaterThan(5);
      if (entry.scope === 'family') expect(entry.note.length).toBeGreaterThan(10);
    }
  });

  it('corrige apenas a URL antiga auditada, sem substituir uma revisão posterior', () => {
    const replacement = manifest.assets.find(entry => 'replaces_url' in entry) as EquipmentAssetReference;
    const wrong = { id: replacement.model_id, brand_id: replacement.brand_id, code: replacement.code, image_url: null, manual_url: replacement.replaces_url! };
    expect(withEquipmentAssetReferences(wrong, baseUrl).manual_url).toBe(equipmentAssetUrl(replacement, baseUrl));
    const later = { ...wrong, manual_url: 'https://catalog.example.org/later-review.pdf' };
    expect(withEquipmentAssetReferences(later, baseUrl).manual_url).toBe(later.manual_url);
  });

  it('mantém a legenda do arquivo familiar se o servidor usa outro UUID para o mesmo código', () => {
    const hydrated = withEquipmentAssetReferences(model, baseUrl);
    const alias = { ...hydrated, id: 'later-server-id', code: reference.code.toLowerCase() };
    expect(getEquipmentAssetReference(alias, 'image_url', baseUrl)?.sha256).toBe(reference.sha256);
    expect(getEquipmentAssetReference({ ...alias, brand_id: 'another-brand' }, 'image_url', baseUrl)).toBeUndefined();
    expect(getEquipmentAssetReference({ ...alias, image_url: 'https://catalog.example.org/later-photo.jpg' }, 'image_url', baseUrl)).toBeUndefined();
  });
});
