import type { CostResource, CostResourceCategory } from '@/hooks/useCostResources';

export type ResourceStatusFilter = 'active' | 'inactive';

export function filterGlobalCostResources(
  resources: CostResource[],
  categories: CostResourceCategory[],
  statuses: ResourceStatusFilter[],
) {
  return resources.filter((resource) => {
    const matchesCategory = categories.length === 0 || categories.includes(resource.category);
    const status: ResourceStatusFilter = resource.is_active ? 'active' : 'inactive';
    const matchesStatus = statuses.length === 0 || statuses.includes(status);
    return matchesCategory && matchesStatus;
  });
}
