// ─────────────────────────────────────────────────────────────────────────────
// i18n — ROTAS DO APP LOGADO traduzidas por idioma (regra CEO 2026-07-18).
//
// As URLs internas do sistema seguem o idioma do USUÁRIO, SEM prefixo de idioma
// (diferente do site público, que usa /:lang). O próprio SLUG é traduzido, e AGORA
// o path INTEIRO (todos os segmentos fixos), não só a raiz:
//   pt-br: /financeiro/relatorio   en: /finance/report   es: /finanzas/informe
//   pt-br: /notas-fiscais/configuracoes   en: /invoices/settings
//
// Decisões-lei (não reabrir):
//  • pt-br é a BASE e o path pt-br continua válido em TODOS os idiomas
//    (bookmarks/deep-links antigos nunca quebram — cada tela responde a todas as
//    variantes de idioma).
//  • A navegação (menu, links) usa o path do idioma do usuário; ao abrir uma tela
//    num path de OUTRO idioma, o AppLayout redireciona (replace) pro path do
//    idioma do usuário (canônico), preservando query/hash.
//  • Tradução por SEGMENTO: cada segmento FIXO do template é traduzido por um
//    dicionário compartilhado (`SEGMENTS`), reutilizado entre telas (DRY). Params
//    (`:id`) e wildcard (`*`) passam INTACTOS. Segmento sem tradução cai no pt-br
//    (fallback). NUNCA 404 numa tela válida.
//  • Segmentos que são IDENTIFICADORES TÉCNICOS (nomes de ferramenta, códigos)
//    NÃO entram no dicionário — ficam intactos em todos os idiomas.
//
// Como funciona: cada TELA tem uma `key` estável e um `base` (o path template
// pt-br, ex. '/financeiro/relatorio'). Cada segmento fixo do base é traduzido
// pelo dicionário `SEGMENTS` (fallback pt-br). As rotas do App.tsx são geradas a
// partir deste registro (todas as variantes de idioma apontam pro MESMO elemento).
// ─────────────────────────────────────────────────────────────────────────────

import { DEFAULT_LOCALE, LOCALES, type LocaleCode } from './locales';

/** Tradução de um segmento pt-br por idioma. Idioma ausente cai no pt-br. */
type SegmentTranslations = Partial<Record<LocaleCode, string>>;

// ── Dicionário compartilhado de SEGMENTOS (DRY) ───────────────────────────────
//
// Chave = segmento pt-br (como aparece no `base`). Valor = tradução por idioma.
// Reutilizado por TODAS as telas: 'financeiro' traduz igual em /financeiro,
// /financeiro/relatorio, /financeiro/movimentacoes. Segmento AUSENTE deste mapa
// fica intacto em todos os idiomas (fallback pt-br) — é assim que params (`:id`,
// `*`) e identificadores técnicos passam sem tradução.
//
// Traduções SEMÂNTICAS (termo de mercado por idioma), não palavra-a-palavra.

const SEGMENTS: Record<string, SegmentTranslations> = {
  // Raízes (1º segmento das telas)
  dashboard: { en: 'dashboard', es: 'panel', fr: 'tableau-de-bord' },
  agenda: { en: 'schedule', es: 'agenda', fr: 'agenda' },
  'ordens-servico': { en: 'work-orders', es: 'ordenes-de-trabajo', fr: 'bons-de-travail' },
  servicos: { en: 'services', es: 'servicios', fr: 'services' },
  checklists: { en: 'checklists', es: 'checklists', fr: 'checklists' },
  clientes: { en: 'customers', es: 'clientes', fr: 'clients' },
  equipamentos: { en: 'equipment', es: 'equipos', fr: 'equipements' },
  crm: { en: 'crm', es: 'crm', fr: 'crm' },
  orcamentos: { en: 'quotes', es: 'presupuestos', fr: 'devis' },
  estoque: { en: 'inventory', es: 'inventario', fr: 'stock' },
  financeiro: { en: 'finance', es: 'finanzas', fr: 'finances' },
  'notas-fiscais': { en: 'invoices', es: 'facturas', fr: 'factures' },
  pmoc: { en: 'maintenance-plans', es: 'planes-mantenimiento', fr: 'plans-maintenance' },
  contratos: { en: 'contracts', es: 'contratos', fr: 'contrats' },
  'configuracoes-contrato': { en: 'contract-settings', es: 'configuracion-contrato', fr: 'parametres-contrat' },
  configuracoes: { en: 'settings', es: 'configuraciones', fr: 'parametres' },
  perfil: { en: 'profile', es: 'perfil', fr: 'profil' },
  funcionarios: { en: 'employees', es: 'empleados', fr: 'employes' },
  'mapa-ao-vivo': { en: 'live-map', es: 'mapa-en-vivo', fr: 'carte-en-direct' },
  'area-tecnico': { en: 'technician-area', es: 'area-tecnico', fr: 'espace-technicien' },
  assinatura: { en: 'subscription', es: 'suscripcion', fr: 'abonnement' },
  changelog: { en: 'changelog', es: 'novedades', fr: 'nouveautes' },

  // Sub-segmentos fixos (2º segmento em diante) — traduzidos por SEGMENTO,
  // reaproveitando o dicionário. Ex.: /financeiro/relatorio → /finance/report.
  relatorio: { en: 'report', es: 'informe', fr: 'rapport' },
  movimentacoes: { en: 'movements', es: 'movimientos', fr: 'mouvements' },
  contas: { en: 'accounts', es: 'cuentas', fr: 'comptes' },
  // 'configuracoes' já está no mapa acima e serve como sub-segmento também
  // (/notas-fiscais/configuracoes → /invoices/settings).
};

/**
 * `en`/`es`/`fr` acabam iguais entre si em alguns segmentos (ex.: 'crm',
 * 'checklists'). Isso é intencional: cada tela responde a TODAS as variantes
 * distintas (dedup mais abaixo) e o fallback pt-br cobre o que faltar.
 */

interface AppRouteDef {
  /** Chave estável da tela (não muda entre idiomas). */
  key: string;
  /**
   * Path template pt-br COMPLETO (a fonte canônica), ex.:
   * '/clientes', '/clientes/:id', '/financeiro/relatorio', '/area-tecnico/*'.
   * Cada segmento fixo é traduzido pelo dicionário `SEGMENTS`; `:id`/`*` ficam.
   */
  base: string;
}

// ── Registro (as ~28 telas do app) ────────────────────────────────────────────
//
// Só a `key` + o `base` pt-br. A tradução vem do dicionário `SEGMENTS` por
// segmento (sem repetir tradução por tela — DRY). Telas da mesma família
// (finance/financeReport/...) têm raiz igual mas templates distintos; a resolução
// casa pelo template mais ESPECÍFICO (ver `resolveAppSlug`).

const ROUTES: AppRouteDef[] = [
  { key: 'dashboard', base: '/dashboard' },
  { key: 'schedule', base: '/agenda' },
  { key: 'serviceOrders', base: '/ordens-servico' },
  { key: 'services', base: '/servicos' },
  { key: 'checklistDetail', base: '/checklists/:id' },
  { key: 'customers', base: '/clientes' },
  { key: 'customerDetail', base: '/clientes/:id' },
  { key: 'equipment', base: '/equipamentos' },
  { key: 'equipmentDetail', base: '/equipamentos/:id' },
  { key: 'crm', base: '/crm' },
  { key: 'quotes', base: '/orcamentos' },
  { key: 'inventory', base: '/estoque' },
  // Financeiro é um GRUPO: raiz + 3 sub-telas. Todos os segmentos traduzem.
  { key: 'finance', base: '/financeiro' },
  { key: 'financeReport', base: '/financeiro/relatorio' },
  { key: 'financeMovements', base: '/financeiro/movimentacoes' },
  { key: 'financeAccounts', base: '/financeiro/contas' },
  { key: 'fiscalSettings', base: '/notas-fiscais/configuracoes' },
  { key: 'fiscalNotes', base: '/notas-fiscais' },
  { key: 'pmoc', base: '/pmoc' },
  { key: 'contracts', base: '/contratos' },
  { key: 'contractDetail', base: '/contratos/:id' },
  { key: 'contractSettings', base: '/configuracoes-contrato' },
  { key: 'settings', base: '/configuracoes' },
  { key: 'profile', base: '/perfil' },
  { key: 'employees', base: '/funcionarios' },
  { key: 'liveMap', base: '/mapa-ao-vivo' },
  { key: 'technicianArea', base: '/area-tecnico/*' },
  { key: 'billing', base: '/assinatura' },
  { key: 'changelog', base: '/changelog' },
];

// ── Helpers de segmento ───────────────────────────────────────────────────────

/** true se o segmento é dinâmico (param `:x`) ou wildcard (`*`) — não traduz. */
function isDynamicSegment(seg: string): boolean {
  return seg.startsWith(':') || seg === '*';
}

/**
 * Traduz UM segmento pro idioma dado. Params/wildcard e segmentos fora do
 * dicionário passam intactos (fallback pt-br). pt-br sempre devolve o próprio seg.
 */
function translateSegment(seg: string, locale: LocaleCode): string {
  if (locale === DEFAULT_LOCALE || isDynamicSegment(seg)) return seg;
  return SEGMENTS[seg]?.[locale] ?? seg;
}

/** Quebra um path em segmentos (sem barras vazias). '/a/b' → ['a','b']. */
function splitPath(path: string): string[] {
  return path.replace(/^\/+/, '').split('/').filter(Boolean);
}

/**
 * Traduz um TEMPLATE inteiro (todos os segmentos fixos) pro idioma dado.
 * '/financeiro/relatorio' + 'en' → '/finance/report'. Params/wildcard intactos.
 */
function translateTemplate(base: string, locale: LocaleCode): string {
  const segs = splitPath(base).map((s) => translateSegment(s, locale));
  return `/${segs.join('/')}`;
}

const BY_KEY = new Map<string, AppRouteDef>();
for (const r of ROUTES) BY_KEY.set(r.key, r);

// ── Índice reverso por TEMPLATE COMPLETO (todos os idiomas) ───────────────────
//
// Pra resolver um pathname → key precisamos casar o TEMPLATE inteiro (não só a
// raiz), porque telas da mesma família compartilham raiz mas diferem no resto
// (/financeiro vs /financeiro/relatorio). Pré-computamos, por idioma, a lista de
// (template traduzido em segmentos, key), ordenada do mais ESPECÍFICO (mais
// segmentos) pro mais genérico — o primeiro que casa o pathname vence.

interface CompiledTemplate {
  /** Segmentos do template traduzido (ex.: ['finance','report']). */
  segs: string[];
  /** Segmentos do template pt-br original (pra também casar bookmarks pt-br). */
  ptSegs: string[];
  key: string;
}

type ReverseIndex = Record<LocaleCode, CompiledTemplate[]>;

const REVERSE: ReverseIndex = LOCALES.reduce((acc, l) => {
  acc[l.code] = [];
  return acc;
}, {} as ReverseIndex);

for (const r of ROUTES) {
  const ptSegs = splitPath(r.base);
  for (const l of LOCALES) {
    const segs = splitPath(translateTemplate(r.base, l.code));
    REVERSE[l.code].push({ segs, ptSegs, key: r.key });
  }
}
// Mais específico primeiro (mais segmentos fixos vence sobre menos).
for (const l of LOCALES) {
  REVERSE[l.code].sort((a, b) => b.segs.length - a.segs.length);
}

/**
 * Um template (lista de segmentos) casa o pathname? Segmento dinâmico (`:x`)
 * casa qualquer valor; wildcard (`*`) casa o RESTO (0+ segmentos). Fixos casam
 * literalmente. Sem wildcard, o comprimento tem que bater.
 */
function templateMatches(tplSegs: string[], pathSegs: string[]): boolean {
  let i = 0;
  for (; i < tplSegs.length; i++) {
    const t = tplSegs[i];
    if (t === '*') return true; // wildcard casa o resto (inclusive vazio)
    if (i >= pathSegs.length) return false;
    if (t.startsWith(':')) continue; // param casa qualquer segmento
    if (t !== pathSegs[i]) return false;
  }
  // Consumiu todo o template sem wildcard: o path não pode ter sobras.
  return i === pathSegs.length;
}

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Path template de uma tela num idioma (todos os segmentos fixos traduzidos,
 * params/wildcard preservados).
 * `appSlug('financeReport', 'en')` → '/finance/report'.
 * `appSlug('customerDetail', 'fr')` → '/clients/:id'.
 * pt-br (ou idioma sem tradução) devolve o `base` intacto.
 */
export function appSlug(key: string, locale: LocaleCode): string {
  const def = BY_KEY.get(key);
  if (!def) return key;
  return translateTemplate(def.base, locale);
}

/**
 * TODAS as variantes de path template de uma tela (uma por template DISTINTO
 * entre os idiomas), pra registrar os `<Route>` do App.tsx. Sempre inclui o base
 * pt-br primeiro (canônico). Dedup por template idêntico.
 * Ex.: `localizedTemplatesFor('financeReport')`
 *   → ['/financeiro/relatorio', '/finance/report', '/finanzas/informe', '/finances/rapport']
 */
export function localizedTemplatesFor(key: string): string[] {
  const def = BY_KEY.get(key);
  if (!def) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  // pt-br primeiro (canônico).
  const pt = def.base;
  seen.add(pt);
  out.push(pt);
  for (const l of LOCALES) {
    if (l.code === DEFAULT_LOCALE) continue;
    const tpl = translateTemplate(def.base, l.code);
    if (seen.has(tpl)) continue;
    seen.add(tpl);
    out.push(tpl);
  }
  return out;
}

/**
 * Reverso: a KEY canônica da tela a partir de um pathname (qualquer idioma).
 * Casa pelo TEMPLATE INTEIRO (não só a raiz), do mais específico pro mais
 * genérico, tanto na variante do idioma dado quanto na variante pt-br (bookmarks).
 * Retorna null se não pertencer a nenhuma tela do registro (admin, redirects,
 * públicas — ignoradas pelo redirect canônico).
 */
export function resolveAppSlug(pathname: string, locale?: LocaleCode): string | null {
  const pathSegs = splitPath(pathname);
  if (pathSegs.length === 0) return null;

  // 1) Tenta no idioma dado (templates traduzidos daquele idioma). Como a lista
  //    está ordenada do mais específico pro genérico, o 1º match é o mais preciso.
  if (locale) {
    for (const t of REVERSE[locale]) {
      if (templateMatches(t.segs, pathSegs)) return t.key;
    }
  }
  // 2) Varre TODOS os idiomas (inclui pt-br), também do mais específico pro
  //    genérico dentro de cada idioma. Cobre bookmarks em qualquer idioma.
  for (const l of LOCALES) {
    if (locale && l.code === locale) continue; // já tentado
    for (const t of REVERSE[l.code]) {
      if (templateMatches(t.segs, pathSegs)) return t.key;
    }
  }
  return null;
}

/**
 * Traduz um PATH do app (com query/hash opcionais) pro idioma dado, reescrevendo
 * TODOS os segmentos fixos (a raiz E os sub-segmentos) e preservando params,
 * ?query e #hash. É o helper que o MENU usa pra montar links no idioma do usuário
 * sem perder subpaths como '/financeiro/relatorio'.
 *
 * Se o pathname não pertencer a nenhuma tela do registro (ex.: '/admin/empresas'),
 * devolve o path intacto. pt-br também devolve intacto.
 *
 * Ex.: localizeAppPath('/financeiro/relatorio', 'en') → '/finance/report'
 *      localizeAppPath('/notas-fiscais/configuracoes', 'es') → '/facturas/configuraciones'
 *      localizeAppPath('/clientes/abc', 'en') → '/customers/abc' (param preservado)
 *      localizeAppPath('/admin/empresas', 'en') → '/admin/empresas' (fora do registro)
 */
export function localizeAppPath(path: string, locale: LocaleCode): string {
  // Separa ?query#hash pra remontar depois.
  const hashIdx = path.indexOf('#');
  const queryIdx = path.indexOf('?');
  const cut =
    hashIdx === -1 && queryIdx === -1
      ? path.length
      : Math.min(...[hashIdx, queryIdx].filter((i) => i !== -1));
  const pathOnly = path.slice(0, cut);
  const suffix = path.slice(cut);

  const pathSegs = splitPath(pathOnly);
  if (pathSegs.length === 0) return path;

  const key = resolveAppSlug(pathOnly, locale);
  if (!key) return path; // fora do registro — intacto

  const def = BY_KEY.get(key);
  if (!def) return path;

  const tplSegs = splitPath(def.base);
  // Reescreve segmento-a-segmento: fixo → traduz; param/wildcard → mantém o
  // VALOR REAL do pathname (não o `:id`/`*` do template). Segmentos do pathname
  // além do template (caso wildcard) são mantidos como estão.
  const out: string[] = [];
  for (let i = 0; i < pathSegs.length; i++) {
    const tplSeg = tplSegs[i];
    if (tplSeg === undefined) {
      // Além do template (só acontece com wildcard consumido): mantém real.
      out.push(pathSegs[i]);
    } else if (tplSeg === '*' || tplSeg.startsWith(':')) {
      out.push(pathSegs[i]); // valor real do param/wildcard
    } else {
      out.push(translateSegment(tplSeg, locale)); // segmento fixo traduzido
    }
  }
  const rebuilt = `/${out.join('/')}`;
  if (rebuilt === pathOnly) return path;
  return `${rebuilt}${suffix}`;
}

/**
 * Path CANÔNICO (no idioma do usuário) equivalente a um pathname atual.
 * Se o pathname pertence a uma tela do registro e difere do path do idioma do
 * usuário, devolve o pathname reescrito (todos os segmentos fixos traduzidos;
 * params/resto preservados). Senão devolve null (nada a fazer). NÃO carrega
 * query/hash (responsabilidade de quem chama).
 *
 * Ex.: usuário 'en' em '/financeiro/relatorio' → '/finance/report'.
 *      usuário 'en' em '/clientes/abc' → '/customers/abc'.
 */
export function canonicalAppPath(pathname: string, locale: LocaleCode): string | null {
  const canonical = localizeAppPath(pathname, locale);
  // localizeAppPath devolve o path (com suffix) intacto se não muda ou está fora
  // do registro. Aqui não há suffix (recebemos só pathname), então comparar direto.
  if (canonical === pathname) return null;
  // Garante que pertence ao registro (senão localizeAppPath teria devolvido igual).
  return canonical;
}
