import type { EquipmentModel } from '@/hooks/useEquipmentCatalog';
import { catalogSectionKey } from '@/lib/catalogOrganization';

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function isPhysicalModel(model: EquipmentModel): boolean {
  const scope = model.catalog_reference?.record_scope;
  return scope === undefined || scope === 'model';
}

function isOutdoor(model: EquipmentModel): boolean {
  const kind = model.catalog_reference?.unit_kind;
  if (kind) return kind === 'outdoor';
  // Only explicit published labels; never infer a component from its SKU/capacity.
  return [model.category?.name ?? '', model.name]
    .some(label => /^(condensadora|unidade externa|outdoor)\b/.test(normalize(label).trim()));
}

function applicationRank(model: EquipmentModel): number {
  const section = catalogSectionKey(model);
  if (section === 'split') {
    const label = normalize(`${model.category?.name ?? ''} ${model.catalog_reference?.line ?? ''} ${model.name}`);
    return /multi[ -]*(split|inverter)|cassete|cassette|piso|teto|dut[oa]|comercial/.test(label) ? 1 : 0;
  }
  if (section === 'vrf') return 2;
  if (section === 'industrial') return 3;
  return 4;
}

/** Editorial discovery order, never a popularity score or equipment specification. */
export function catalogDiscoveryRank(model: EquipmentModel): number {
  if (model.domain !== 'ar_condicionado') return 0;
  const scope = isPhysicalModel(model) ? 0 : 1000;
  // Existing complete fiches and explicit systems precede supplementary indoor/outdoor units.
  const unit = isOutdoor(model) ? 20 : model.catalog_reference?.unit_kind === 'indoor' ? 10 : 0;
  return scope + applicationRank(model) * 100 + unit;
}

/** Stable copy: every original model survives, and non-AC domains keep their positions. */
export function prioritizeCatalogModels<T extends EquipmentModel>(models: T[]): T[] {
  const airConditioners = models
    .map((model, index) => ({ model, index }))
    .filter(({ model }) => model.domain === 'ar_condicionado')
    .sort((a, b) => catalogDiscoveryRank(a.model) - catalogDiscoveryRank(b.model) || a.index - b.index)
    .map(({ model }) => model);
  let next = 0;
  return models.map(model => model.domain === 'ar_condicionado' ? airConditioners[next++] : model);
}

/** Physical residential/light-commercial choices, available in full for pagination. */
export function everydayCatalogModels(models: EquipmentModel[]): EquipmentModel[] {
  const basicModels = models.filter(model => model.domain === 'ar_condicionado'
    && catalogSectionKey(model) === 'split' && isPhysicalModel(model));
  const hasCompleteOrIndoor = basicModels.some(model => !isOutdoor(model));
  const prioritized = prioritizeCatalogModels(hasCompleteOrIndoor
    ? basicModels.filter(model => !isOutdoor(model))
    : basicModels);

  // Round-robin brand queues: each brand retains the stable editorial order above.
  // This is display variety, not a claim about sales, usage or popularity.
  const brands = new Map<string, EquipmentModel[]>();
  for (const model of prioritized) {
    const brand = model.brand_id || model.brand?.id || model.brand?.name || '';
    const queue = brands.get(brand);
    if (queue) queue.push(model);
    else brands.set(brand, [model]);
  }
  const result: EquipmentModel[] = [];
  const queues = [...brands.values()];
  const longest = queues.reduce((length, queue) => Math.max(length, queue.length), 0);
  for (let row = 0; row < longest; row++) {
    for (const queue of queues) if (row < queue.length) result.push(queue[row]);
  }
  return result;
}
