import manifest from './equipmentCatalogAssets.json';

export interface EquipmentAssetReference {
  model_id: string;
  brand_id: string;
  code: string;
  field: 'image_url' | 'manual_url';
  source_url: string;
  evidence_url: string;
  sha256: string;
  extension: string;
  scope: 'exact' | 'family';
  document: string;
  reviewed_at: string;
  note?: string;
  manual_type?: string;
  pages?: number[];
  replaces_url?: string;
  replacement_reason?: string;
  /** Arquivo compartilhado por variantes da mesma família, identificado por hash. */
  storage_path?: string;
  image_kind?: 'photo' | 'technical_illustration';
}
const references = manifest.assets as EquipmentAssetReference[];
const byId = new Map<string, EquipmentAssetReference[]>();
const byIdentity = new Map<string, EquipmentAssetReference[]>();
const normalizeCode = (code: string | null | undefined) => code?.toUpperCase().replace(/[^A-Z0-9]/g, '') ?? '';
for (const reference of references) {
  const identity = `${reference.brand_id}:${normalizeCode(reference.code)}`;
  byId.set(reference.model_id, [...(byId.get(reference.model_id) ?? []), reference]);
  byIdentity.set(identity, [...(byIdentity.get(identity) ?? []), reference]);
}
interface AssetModel {
  id: string;
  brand_id: string;
  code: string | null;
  image_url: string | null;
  manual_url: string | null;
  manual_type?: string | null;
}

export function equipmentAssetUrl(reference: EquipmentAssetReference, baseUrl = import.meta.env.VITE_SUPABASE_URL): string {
  const path = reference.storage_path ?? `verified/${reference.model_id}/${reference.field}-${reference.sha256.slice(0, 20)}.${reference.extension}`;
  return `${baseUrl?.replace(/\/$/, '')}/storage/v1/object/public/equipment-catalog/${path}`;
}

/** Mesmos bytes do documento citado, disponíveis sem bloqueio do site original. */
export function equipmentDocumentMirror(sha256: string | undefined, baseUrl = import.meta.env.VITE_SUPABASE_URL): string | undefined {
  if (!sha256 || !baseUrl) return undefined;
  const reference = references.find(entry => entry.field === 'manual_url' && entry.sha256 === sha256);
  return reference ? equipmentAssetUrl(reference, baseUrl) : undefined;
}

/** Dados curatoriais complementares: identidade exata e nenhum overwrite do banco. */
export function withEquipmentAssetReferences<T extends AssetModel>(model: T, baseUrl = import.meta.env.VITE_SUPABASE_URL): T {
  if (!baseUrl) return model;
  const applicable = (byId.get(model.id) ?? []).filter(reference => reference.brand_id === model.brand_id && normalizeCode(reference.code) === normalizeCode(model.code) && (!model[reference.field] || (reference.replaces_url && model[reference.field] === reference.replaces_url)));
  if (!applicable.length) return model;
  const result = { ...model };
  for (const reference of applicable) {
    result[reference.field] = equipmentAssetUrl(reference, baseUrl);
    if (reference.field === 'manual_url' && !result.manual_type) result.manual_type = reference.manual_type;
  }
  return result;
}

/** Só identifica o arquivo realmente exibido, nunca uma foto substituída no banco. */
export function getEquipmentAssetReference(model: Pick<AssetModel, 'id' | 'image_url' | 'manual_url'> & Partial<Pick<AssetModel, 'brand_id' | 'code'>>, field: 'image_url' | 'manual_url', baseUrl = import.meta.env.VITE_SUPABASE_URL): EquipmentAssetReference | undefined {
  const candidates = byId.get(model.id) ?? byIdentity.get(`${model.brand_id}:${normalizeCode(model.code)}`) ?? [];
  return candidates.find(reference => reference.field === field && model[field] === equipmentAssetUrl(reference, baseUrl));
}
