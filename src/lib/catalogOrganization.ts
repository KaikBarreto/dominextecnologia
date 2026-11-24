import type { EquipmentModel } from '@/hooks/useEquipmentCatalog';
import { slugify } from '@/lib/slugify';

export type CatalogSectionKey = 'split' | 'vrf' | 'industrial' | 'air' | 'appliances' | 'compressors' | 'remotes' | 'other';
export interface CatalogFamily { key: string; name: string; models: EquipmentModel[] }
export interface CatalogSection { key: CatalogSectionKey; families: CatalogFamily[]; models: EquipmentModel[] }
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const ORDER: CatalogSectionKey[] = ['split', 'vrf', 'industrial', 'air', 'appliances', 'compressors', 'remotes', 'other'];

/** A grafia de etiqueta/catálogo pode incluir espaços, barras ou parênteses. */
export function catalogCodeMatches(code: string | null, term: string): boolean {
  const needle = term.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return needle.length >= 3 && /[A-Z]/.test(needle) && /[0-9]/.test(needle)
    && (code?.toUpperCase().replace(/[^A-Z0-9]/g, '').includes(needle) ?? false);
}

/** Arquitetura/tipologia publicada; capacidade e prefixo de SKU não definem aplicação. */
export function catalogSectionKey(model: EquipmentModel): CatalogSectionKey {
  if (model.domain === 'compressor') return 'compressors';
  if (model.domain === 'controle_remoto') return 'remotes';
  const type = normalize(model.category?.name ?? '');
  const line = normalize(model.catalog_reference?.line ?? '');
  const label = `${type} ${line}`;
  if (/chiller|resfriador/.test(type)) return 'industrial';
  if (/\b(vrf|vrv|dvm|gmv)(?:\b|[0-9])|multi[ -]*v(?:\b|\d)/.test(label)) return 'vrf';
  if (/chiller|hidronic|fancoil|fan[ -]*coil|rooftop|self[ -]*contained|multiproposito|bomba de calor|air handler|tratamento de agua/.test(label)) return 'industrial';
  if (/purificador|ventilacao|recupera.*calor|tratamento de ar|\berv\b|\bhrv\b/.test(label)) return 'air';
  if (model.domain === 'linha_branca') return 'appliances';
  if (/split|multi inverter|g[ -]?prime|hi[ -]*wall|cassete|piso|teto|dut[oa]|janela|condensadora/.test(label)) return 'split';
  return 'other';
}

export function organizeCatalog(models: EquipmentModel[]): CatalogSection[] {
  const sections = new Map<CatalogSectionKey, CatalogSection>();
  for (const model of models) {
    const key = catalogSectionKey(model);
    let section = sections.get(key);
    if (!section) { section = { key, models: [], families: [] }; sections.set(key, section); }
    section.models.push(model);
    const name = model.catalog_reference?.line.trim() || model.category?.name || model.brand?.name || 'Equipamentos';
    const familyKey = slugify(name);
    let family = section.families.find(item => item.key === familyKey);
    if (!family) { family = { key: familyKey, name, models: [] }; section.families.push(family); }
    family.models.push(model);
  }
  return ORDER.flatMap(key => {
    const section = sections.get(key);
    if (!section) return [];
    section.families.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true }));
    return [section];
  });
}

/** Mantém a navegação da família ao ir/voltar dos detalhes de diagnóstico. */
export function withCatalogNavigation(path: string, current: URLSearchParams): string {
  // Preserve caminhos relativos do React Router; convertê-los em URL absoluta
  // removeria /area-tecnico/catalogo/:dominio ao abrir uma busca global.
  const [pathname, query = ''] = path.split('?');
  const params = new URLSearchParams(query);
  for (const key of ['categoria', 'familia', 'busca']) {
    const value = current.get(key);
    if (value) params.set(key, value);
  }
  const search = params.toString();
  return pathname + (search ? `?${search}` : '');
}
