import { usePublicSubscriptionCatalog } from '@/hooks/usePublicSubscriptionPlans';

export interface SubscriptionModuleRow {
  code: string;
  name: string;
  price: number | null;
  description: string | null;
  sort_order: number | null;
  is_active: boolean | null;
}

/**
 * Catálogo de módulos da assinatura, compartilhado com `/proposta`.
 *
 * Fonte da verdade pra NOME e PREÇO de cada módulo — mudança de preço no banco
 * reflete no produto sem editar código. Descrições ricas em PT-BR continuam
 * locais (MODULE_INFO em ModuleGateModal.tsx), usadas como fallback/complemento
 * sem copiar preços para o bundle.
 *
 * O preço do WhatsApp vem de `whatsapp_tiers`, igual ao simulador comercial;
 * os demais continuam vindo de `subscription_modules`.
 */
export function useModuleCatalog() {
  const { data, isLoading } = usePublicSubscriptionCatalog();
  const catalog: SubscriptionModuleRow[] = (data?.allModules ?? []).map((module) => ({
    code: module.code,
    name: module.name,
    price: module.price,
    description: module.description,
    sort_order: module.sortOrder,
    is_active: true,
  }));

  const getModule = (code?: string | null): SubscriptionModuleRow | null =>
    code ? catalog.find((m) => m.code === code) ?? null : null;

  return { catalog, getModule, isLoading };
}
