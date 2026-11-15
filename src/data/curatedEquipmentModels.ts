import daikin from './daikinCatalog.json';
import additional from './additionalCatalog.json';
import type { EquipmentModel } from '@/hooks/useEquipmentCatalog';

export interface CatalogModelProvenance {
  line: string;
  unit_kind: 'indoor' | 'outdoor' | 'system';
  record_scope: 'model' | 'series' | 'combination' | 'configuration';
  source_url: string;
  document: string;
  document_bytes?: number;
  pages: number[];
  source_kind?: 'pdf' | 'html';
  proof_kind?: 'text' | 'visual' | 'html';
  source_sha256?: string;
  commercial_brand?: string;
  reviewed_at: string;
  note?: string;
}

type Identity = Pick<EquipmentModel, 'id' | 'brand_id' | 'code' | 'domain'>;
interface CatalogScope { brandId?: string; domain?: string; term?: string }
const curated = [...daikin.models, ...additional.models] as unknown as EquipmentModel[];
const normalize = (code: string | null) => code?.toUpperCase().replace(/[^A-Z0-9]/g, '') ?? '';
const identity = (model: Identity) => `${model.brand_id}:${model.domain}:${normalize(model.code)}`;

export function curatedEquipmentModels(scope: CatalogScope = {}): EquipmentModel[] {
  return curated.filter(model => (!scope.brandId || model.brand_id === scope.brandId)
    && (!scope.domain || model.domain === scope.domain)
    && (!scope.term || normalize(model.code).includes(normalize(scope.term))));
}

export function curatedEquipmentModel(id: string | null | undefined): EquipmentModel | undefined {
  return curated.find(model => model.id === id);
}

/** Fonte remota tem precedência; código completo/marca/domínio impedem duplicações. */
export function mergeCuratedEquipmentModels<T extends Identity>(existing: T[], scope: CatalogScope = {}): Array<T | EquipmentModel> {
  const supplements = curatedEquipmentModels(scope);
  const byIdentity = new Map(supplements.map(model => [identity(model), model]));
  const present = new Set(existing.map(identity));
  const merged = existing.map(model => {
    const source = model.code ? byIdentity.get(identity(model)) : undefined;
    if (!source) return model;
    // Campos não selecionados na query também podem ser hidratados. Nenhum valor
    // remoto preenchido é substituído; o UUID remoto acompanha recentes/favoritos.
    const result = { ...source, ...model } as T & EquipmentModel;
    for (const field of ['image_url', 'manual_url', 'manual_type', 'category_id', 'category', 'brand'] as const) {
      if (!result[field] && source[field]) Object.assign(result, { [field]: source[field] });
    }
    result.catalog_reference = source.catalog_reference;
    return result;
  });
  return [...merged, ...supplements.filter(model => !present.has(identity(model)))];
}
