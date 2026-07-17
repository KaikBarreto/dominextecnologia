// ─────────────────────────────────────────────────────────────────────────────
// Tradução dos rótulos do MENU da casca (sidebar / top navbar / bottom nav /
// more-menu drawer). As estruturas de menu vivem cravadas nos componentes (com
// ícone/path/gating) e usam o TÍTULO pt-br como label. Este helper mapeia esse
// título pt-br → a KEY estável de `app.shell.menu`, e devolve o texto no locale.
//
// Por que por título e não refatorar as estruturas: manter o `title` pt-br como
// fonte (icones/paths/gates intactos) e só traduzir o DISPLAY é a mudança de
// menor risco. Título desconhecido cai no próprio título (nunca fica vazio).
// ─────────────────────────────────────────────────────────────────────────────

import type { Messages } from '@/lib/i18n';

type ShellMenu = Messages['app']['shell']['menu'];

/**
 * Mapa TÍTULO pt-br (como está cravado nas estruturas de menu) → key de
 * `shell.menu`. Os títulos são idênticos entre tenant/admin/sidebar/topnav, então
 * um mapa único cobre os 4 componentes. Onde tenant e admin compartilham o mesmo
 * texto pt-br ('Dashboard', 'Financeiro'), a tradução também coincide, então não
 * há ambiguidade de exibição.
 */
const TITLE_TO_KEY: Record<string, keyof ShellMenu> = {
  // Grupos
  Operacional: 'operational',
  Gestão: 'management',
  // 'Financeiro' cobre o grupo (tenant) E o item admin — mesma tradução.
  Financeiro: 'finance',
  // Itens tenant
  Dashboard: 'dashboard',
  Agenda: 'schedule',
  'Ordens de Serviço': 'serviceOrders',
  'Mapa e Rastreamento': 'liveMap',
  'Área do Técnico™': 'technicianArea',
  Orçamentos: 'quotes',
  Serviços: 'services',
  Clientes: 'customers',
  Equipamentos: 'equipment',
  Contratos: 'contracts',
  Funcionários: 'employees',
  Estoque: 'inventory',
  CRM: 'crm',
  'Visão Geral': 'financeOverview',
  'Movimentações Financeiras': 'financeMovements',
  'Contas a Pagar/Receber': 'financeAccounts',
  'Notas Fiscais': 'fiscalNotes',
  // Itens admin Auctus
  'CRM/Tarefas': 'adminCrm',
  Empresas: 'adminCompanies',
  Vendedores: 'adminSalespeople',
  'Health Score': 'adminHealthScore',
  Blog: 'adminBlog',
  Domiflix: 'adminDomiflix',
};

/**
 * Traduz o título pt-br de um item de menu pro locale atual. Recebe o objeto
 * `shell` já resolvido no locale (`MESSAGES[locale].app.shell`). Título sem
 * mapeamento devolve o próprio título (fallback seguro).
 */
export function translateMenuLabel(ptTitle: string, shell: Messages['app']['shell']): string {
  const key = TITLE_TO_KEY[ptTitle];
  return key ? shell.menu[key] : ptTitle;
}
