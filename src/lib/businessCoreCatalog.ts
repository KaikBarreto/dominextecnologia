import { coreIncludesModule, type BusinessCore } from './businessCore';

export const BUSINESS_CORE_BUNDLES = {
  services: {
    label: 'Kit Serviços',
    description: 'Ordens de serviço, agenda, clientes, equipamentos, serviços, estoque, orçamentos e financeiro.',
    features: ['Ordens de serviço e agenda', 'Clientes, equipamentos e serviços', 'Estoque, orçamentos e financeiro', 'Portal do cliente e Área do Técnico™'],
  },
  retail: {
    label: 'Kit Loja',
    description: 'PDV (Loja), caixa, orçamentos de balcão, pedidos, retirada, produtos, clientes, fornecedores e financeiro.',
    features: ['PDV (Loja) e controle de caixa', 'Orçamentos de balcão, pedidos e retirada', 'Produtos, estoque, clientes e fornecedores', 'Financeiro completo'],
  },
} as const;

export function buildCoreCommercialFeatures(core: BusinessCore, codes: readonly string[], catalog: ReadonlyArray<{code: string; name: string}>) {
  const names = new Map(catalog.map(module => [module.code, module.name]));
  const included = new Set(['basic', 'customer_portal', 'finance_advanced', 'pricing_advanced', 'video_questions', 'extra_user']);
  return [...new Set([
    ...BUSINESS_CORE_BUNDLES[core].features,
    ...codes.flatMap(code => included.has(code) || coreIncludesModule(core, code) ? [] : names.has(code) ? [names.get(code)!] : []),
  ])];
}

/** Códigos legados de planos permanecem estáveis; somente o catálogo Loja tem prefixo. */
export function planBelongsToCore(plan: {code: string; business_core?: unknown; businessCore?: unknown}, core: BusinessCore) {
  if (plan.code === 'personalizado') return true;
  const declared = plan.business_core ?? plan.businessCore;
  if (declared != null) return declared === core;
  return plan.code.startsWith('retail_') === (core === 'retail');
}

export function corePlanFeatures(core: BusinessCore, planCode: string) {
  const code = planCode.replace(/^retail_/, '');
  if (code === 'excecao') return core === 'services'
    ? ['Ordens de serviço e rastreamento', 'Agenda e tarefas', 'Clientes e equipamentos', 'Sem orçamentos, Portal do Cliente e financeiro']
    : ['PDV (Loja) e controle de caixa', 'Produtos, estoque, clientes e fornecedores', 'Sem financeiro'];
  return [
    ...BUSINESS_CORE_BUNDLES[core].features,
    ...(['avancado', 'master'].includes(code) ? [
      ...(core === 'services' ? ['Gestão de contratos e PMOC'] : []),
      'Funcionários / RH e ponto eletrônico',
    ] : []),
    ...(code === 'master' ? ['CRM', 'Emissão de notas fiscais', 'White label'] : []),
  ];
}
