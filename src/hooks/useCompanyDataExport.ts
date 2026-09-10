import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { getErrorMessage } from '@/utils/errorMessages';
import { formatDate, formatDateTime } from '@/lib/format';
import { MESSAGES } from '@/lib/i18n/messages';
import type { LocaleCode } from '@/lib/i18n/locales';
import { normalizePaymentMethod } from '@/lib/finance-payment-methods';
import {
  generateCompanyBackupExcel,
  type BackupCell,
  type BackupColumn,
  type BackupColumnType,
  type BackupSheet,
} from '@/utils/companyBackupExcelGenerator';

// ─────────────────────────────────────────────────────────────────────────────
// useCompanyDataExport — "Exportar meus dados" (Configurações → Empresa).
//
// Lê os dados estruturados do tenant e gera UM .xlsx com várias abas: backup do
// cliente + portabilidade LGPD (Art. 18, V). Plano:
//   docs/planos/2026-09-10-exportar-dados-empresa-excel.md
//
// REGRAS QUE NÃO PODEM SER RELAXADAS AQUI:
//
// 1. PAGINAÇÃO. O PostgREST corta em 1000 linhas SEM ERRO. Sem `.range()` em
//    páginas, um tenant com 3 mil OS receberia um "backup" com 1000 e não teria
//    como saber. Todo SELECT deste arquivo passa por `fetchAllPaged`. A aba
//    Resumo existe justamente pra tornar o truncamento conferível.
//
// 2. COLUNAS PROIBIDAS. Nunca exportar:
//      • `company_id`, `created_by`, `user_id` e qualquer `*_id` interno
//        (exceto números visíveis: `order_number`, `quote_number`, `matricula`,
//        `sku`). FK vira NOME, resolvida por mapa em memória.
//      • `token`, `public_short_code`, `public_pmoc_token`, `ponto_slug` —
//        credenciais de link público; exportar é vazamento.
//      • `client_signature` / `tech_signature` — base64 de imagem; numa célula
//        estouram o limite do Excel e corrompem o arquivo.
//      • `snapshot_data`, `custom_fields`, `monthly_cost_breakdown`,
//        `parts_used`, `device_info` e demais JSONB — grandes e ilegíveis.
//    Por isso todo SELECT lista as colunas explicitamente. NUNCA usar `*`: além
//    do vazamento, `service_orders.*` baixaria megabytes de assinatura base64.
//
// 3. `is_deleted = true` fica de fora (lixeira não é backup).
//
// 4. ESTOQUE POR LOCAL. `inventory_stock_levels` tem ACL por local
//    (`can_access_stock`, aplicada na RLS de SELECT). Quem só acessa 2 de 5
//    locais não pode ver — nem somar — o saldo dos outros 3. Aqui:
//      • a lista de materiais passa por `get_accessible_inventory_ids()` (RPC
//        que já existe, SECURITY DEFINER, reaplica o gate por local);
//      • o saldo sai SEMPRE das linhas de `inventory_stock_levels` lidas (a RLS
//        já removeu os locais bloqueados);
//      • `inventory.quantity` (espelho global, soma TODOS os locais) só é usado
//        no caso legado de material SEM nenhuma linha de presença — onde não há
//        dimensão de local e portanto não há o que vazar.
//
// 5. Folha de pagamento não tem tabela própria: vive em `financial_transactions`
//    via `payroll_kind`/`payroll_period`, já coberta pela aba Financeiro.
//
// 6. Fronteira do Supabase: todo `supabase.from(...)` desta feature está NESTE
//    arquivo. O gerador recebe dados prontos e não conhece banco.
// ─────────────────────────────────────────────────────────────────────────────

/** Um checkbox no dialog. Pode gerar 1 ou 2 abas no arquivo. */
export type ExportGroupKey =
  | 'customers'          // abas: Clientes + Contatos do Cliente
  | 'equipment'          // aba: Equipamentos
  | 'serviceOrders'      // abas: Ordens de Serviço + Materiais da OS
  | 'quotes'             // abas: Orçamentos + Itens do Orçamento
  | 'contracts'          // abas: Contratos + Itens do Contrato
  | 'financial'          // abas: Financeiro + Contas Bancárias
  | 'inventory'          // aba: Estoque (com saldo por local)
  | 'inventoryMovements' // aba: Movimentações de Estoque
  | 'employees'          // aba: Funcionários
  | 'leads'              // aba: CRM / Leads
  | 'timeRecords';       // aba: Ponto

/** Uma aba no .xlsx. */
export type ExportSheetKey =
  | 'summary' | 'customers' | 'customerContacts' | 'equipment'
  | 'serviceOrders' | 'serviceMaterials' | 'quotes' | 'quoteItems'
  | 'contracts' | 'contractItems' | 'financialTransactions'
  | 'financialAccounts' | 'inventory' | 'inventoryMovements'
  | 'employees' | 'leads' | 'timeRecords';

/** Ordem dos checkboxes no dialog E das abas dentro do arquivo. */
export const EXPORT_GROUPS: readonly ExportGroupKey[] = [
  'customers',
  'equipment',
  'serviceOrders',
  'quotes',
  'contracts',
  'financial',
  'inventory',
  'inventoryMovements',
  'employees',
  'leads',
  'timeRecords',
];

/** Quais abas cada checkbox gera (na ordem em que entram no arquivo). */
export const EXPORT_GROUP_SHEETS: Record<ExportGroupKey, readonly ExportSheetKey[]> = {
  customers: ['customers', 'customerContacts'],
  equipment: ['equipment'],
  serviceOrders: ['serviceOrders', 'serviceMaterials'],
  quotes: ['quotes', 'quoteItems'],
  contracts: ['contracts', 'contractItems'],
  financial: ['financialTransactions', 'financialAccounts'],
  inventory: ['inventory'],
  inventoryMovements: ['inventoryMovements'],
  employees: ['employees'],
  leads: ['leads'],
  timeRecords: ['timeRecords'],
};

/**
 * Marcados por padrão = todos MENOS 'inventoryMovements' e 'timeRecords'
 * (as duas abas de maior volume; o cliente marca se quiser).
 */
export const DEFAULT_EXPORT_SELECTION: Record<ExportGroupKey, boolean> = {
  customers: true,
  equipment: true,
  serviceOrders: true,
  quotes: true,
  contracts: true,
  financial: true,
  inventory: true,
  inventoryMovements: false,
  employees: true,
  leads: true,
  timeRecords: false,
};

export interface ExportProgress {
  sheetKey: ExportSheetKey;
  rows: number;   // linhas já lidas desta aba
  index: number;  // 1-based
  total: number;  // total de abas nesta execução
}

export interface UseCompanyDataExportResult {
  /** Lê, monta o .xlsx e dispara o download. Rejeita com Error em falha. */
  run: (selection: Record<ExportGroupKey, boolean>) => Promise<void>;
  progress: ExportProgress | null;
  isRunning: boolean;
  error: string | null;
  reset: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Leitura paginada
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 1000;

type DbRow = Record<string, unknown>;

/**
 * Subconjunto do builder do PostgREST usado aqui. Tipar assim (em vez de `any`)
 * mantém o encadeamento checado sem depender do union gigante de 170 tabelas
 * do client tipado — que faz o TS explodir quando o nome da tabela é dinâmico.
 */
interface PagedBuilder {
  select(columns: string): PagedBuilder;
  eq(column: string, value: unknown): PagedBuilder;
  order(column: string, options?: { ascending?: boolean }): PagedBuilder;
  range(
    from: number,
    to: number,
  ): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
}

interface FetchAllOptions {
  /** Ordenação. O ÚLTIMO campo precisa ser único (`id`) — sem desempate
   *  determinístico, `.range()` pode repetir/pular linha entre páginas. */
  orderBy?: readonly string[];
  refine?: (query: PagedBuilder) => PagedBuilder;
  onPage?: (loadedSoFar: number) => void;
}

async function fetchAllPaged(
  table: string,
  columns: string,
  options: FetchAllOptions = {},
): Promise<DbRow[]> {
  const orderBy = options.orderBy?.length ? options.orderBy : ['id'];
  const rows: DbRow[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    // Builder novo a cada página: reaproveitar o anterior acumularia `.range()`.
    let query = (supabase.from(table as never) as unknown as PagedBuilder).select(columns);
    for (const column of orderBy) query = query.order(column, { ascending: true });
    if (options.refine) query = options.refine(query);

    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);

    const page = (data ?? []) as DbRow[];
    rows.push(...page);
    options.onPage?.(rows.length);

    // Página menor que o tamanho = acabou. Página cheia = pode ter mais.
    if (page.length < PAGE_SIZE) break;
  }

  return rows;
}

/** Mapa id → rótulo, carregado UMA vez por execução (nunca por linha). */
async function loadLabelMap(
  table: string,
  idColumn: string,
  labelColumn: string,
): Promise<Map<string, string>> {
  const rows = await fetchAllPaged(table, `${idColumn}, ${labelColumn}`, {
    orderBy: [idColumn],
  });
  const map = new Map<string, string>();
  for (const row of rows) {
    const id = row[idColumn];
    if (id == null) continue;
    const label = row[labelColumn];
    map.set(String(id), label == null ? '' : String(label));
  }
  return map;
}

// ─────────────────────────────────────────────────────────────────────────────
// Colunas
// ─────────────────────────────────────────────────────────────────────────────

const col = (key: string, type: BackupColumnType = 'text', width?: number): BackupColumn => ({
  key,
  type,
  width,
});
/** texto (inclui datas, já formatadas no locale) */
const T = (key: string, width?: number) => col(key, 'text', width);
/** número puro */
const N = (key: string, width?: number) => col(key, 'number', width);
/** número com formato de moeda (continua somável no Excel) */
const M = (key: string, width?: number) => col(key, 'money', width);

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useCompanyDataExport(): UseCompanyDataExportResult {
  const { locale, currency, timezone } = useAppLocaleContext();
  const { settings } = useCompanySettings();
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setProgress(null);
    setError(null);
  }, []);

  const run = useCallback(
    async (selection: Record<ExportGroupKey, boolean>) => {
      const groups = EXPORT_GROUPS.filter((g) => selection[g]);
      if (groups.length === 0) {
        const message = 'Selecione pelo menos um conjunto de dados para exportar.';
        setError(message);
        throw new Error(message);
      }

      setError(null);
      setProgress(null);
      setIsRunning(true);

      try {
        const sheets = await collectSheets({
          groups,
          locale,
          currency,
          timezone,
          onProgress: setProgress,
        });

        await generateCompanyBackupExcel({
          companyName: settings?.name || 'Empresa',
          locale,
          currency,
          timezone,
          generatedAt: new Date(),
          sheets,
        });
      } catch (err) {
        const message = getErrorMessage(err);
        setError(message);
        throw err instanceof Error ? err : new Error(message);
      } finally {
        setIsRunning(false);
      }
    },
    [locale, currency, timezone, settings?.name],
  );

  return { run, progress, isRunning, error, reset };
}

// ─────────────────────────────────────────────────────────────────────────────
// Coleta — uma função por aba, com FK já resolvida em nome legível
// ─────────────────────────────────────────────────────────────────────────────

interface CollectParams {
  groups: readonly ExportGroupKey[];
  locale: LocaleCode;
  currency: string;
  timezone: string;
  onProgress: (progress: ExportProgress) => void;
}

async function collectSheets({
  groups,
  locale,
  timezone,
  onProgress,
}: CollectParams): Promise<BackupSheet[]> {
  const common = MESSAGES[locale].app.common;
  const yes = common?.yes ?? 'Sim';
  const no = common?.no ?? 'Não';

  // ── Conversores de célula ──────────────────────────────────────────────────
  /** texto (null vira célula vazia, não a string "null") */
  const s = (v: unknown): BackupCell => (v == null || v === '' ? null : String(v));
  /** número (money ou quantidade) */
  const n = (v: unknown): BackupCell => {
    if (v == null || v === '') return null;
    const num = Number(v);
    return Number.isFinite(num) ? num : null;
  };
  /** data (DATE ou timestamp) formatada no locale/fuso da empresa */
  const d = (v: unknown): BackupCell => (v == null || v === '' ? null : formatDate(String(v), locale, timezone));
  /** data + hora formatadas no locale/fuso da empresa */
  const dt = (v: unknown): BackupCell =>
    v == null || v === '' ? null : formatDateTime(String(v), locale, timezone);
  /** booleano legível */
  const b = (v: unknown): BackupCell => (v == null ? null : v ? yes : no);
  /** FK → nome. Sem match (registro apagado) vira vazio, nunca o UUID. */
  const ref = (map: Map<string, string>, id: unknown): BackupCell =>
    id == null ? null : (map.get(String(id)) || null);

  // ── Enum → rótulo da tela (nunca o valor cru do banco: "em_andamento" vira
  // "Em andamento") ────────────────────────────────────────────────────────
  // Regra: SEMPRE reusar o dicionário que a própria tela já usa pra exibir o
  // mesmo valor — nunca inventar tradução nova que já existe em outro lugar.
  // Fallback (valor sem match no dicionário) = o valor cru, nunca vazio: uma
  // planilha com célula vazia é pior que uma com valor feio.
  const msg = MESSAGES[locale].app;
  const dxValues = msg.settings.dataExport.values;

  /** Aplica um dicionário enum → rótulo. Sem match = valor cru (nunca vazio). */
  const enumLabel = (dict: Record<string, string>, v: unknown): BackupCell => {
    if (v == null || v === '') return null;
    const raw = String(v);
    return dict[raw] ?? raw;
  };

  // os_status (Ordens de Serviço → Status). Fallback do enum legado — mesmo
  // dicionário usado quando a OS não tem o nome customizado do catálogo.
  const osStatusMap: Record<string, string> = msg.os.statusFallback;
  // os_type (Ordens de Serviço → Tipo de OS).
  const osTypeMap: Record<string, string> = msg.os.typeFallback;
  // service_orders.entry_type ('os' | 'tarefa') — mesmo texto do seletor de
  // tipo de entrada na Agenda.
  const entryTypeMap: Record<string, string> = {
    os: msg.os.scheduleHeader.entryTypeOs,
    tarefa: msg.os.scheduleHeader.entryTypeTask,
  };
  // service_orders.origin — sem tela que exiba esse valor como texto hoje;
  // rótulos novos em dataExport.values (ver settings.ts).
  const osOriginMap: Record<string, string> = {
    manual: dxValues.originManual,
    contract: dxValues.originContract,
    portal: dxValues.originPortal,
  };
  // pmoc_conformity_status (Ordens de Serviço → Conformidade PMOC).
  const conformityMap: Record<string, string> = msg.os.viewDialog.conformityLabel;
  // quotes.status (Orçamentos → Status).
  const quoteStatusMap: Record<string, string> = {
    rascunho: msg.crm.quotes.statusDraft,
    enviado: msg.crm.quotes.statusSent,
    aprovado: msg.crm.quotes.statusApproved,
    rejeitado: msg.crm.quotes.statusRejected,
    expirado: msg.crm.quotes.statusExpired,
    convertido: msg.crm.quotes.statusConverted,
  };
  // quotes.discount_type (Orçamentos → Tipo de Desconto) — só símbolo (R$/%)
  // na tela; rótulos por extenso novos em dataExport.values.
  const discountTypeMap: Record<string, string> = {
    valor: dxValues.discountTypeValor,
    percentual: dxValues.discountTypePercentual,
  };
  // quote_items.item_type (Itens dos Orçamentos → Tipo de Item). 'mao_de_obra'
  // é sinônimo legado tratado como serviço em QuoteItemsTable.
  const itemTypeMap: Record<string, string> = {
    servico: dxValues.itemTypeServico,
    material: dxValues.itemTypeMaterial,
    mao_de_obra: dxValues.itemTypeMaoDeObra,
  };
  // contracts.status (Contratos → Status).
  const contractStatusMap: Record<string, string> = msg.pmoc.contracts.status;
  // contracts.frequency_type (Contratos → Tipo de Frequência) — mesmo texto
  // do seletor no formulário de contrato.
  const freqTypeMap: Record<string, string> = {
    months: msg.contracts.contractForm.frequency.freqTypeMonths,
    days: msg.contracts.contractForm.frequency.freqTypeDays,
  };
  // financial_transactions.transaction_type (Financeiro → Tipo) — mesmo texto
  // da legenda do Fluxo de Caixa no dashboard.
  const transactionTypeMap: Record<string, string> = {
    entrada: msg.dashboard.cashFlow.inflows,
    saida: msg.dashboard.cashFlow.outflows,
  };
  // financial_accounts.type (Contas Bancárias → Tipo).
  const accountTypeMap: Record<string, string> = msg.finance.accountForm.types;
  // financial_transactions.payment_method (Financeiro → Forma de Pagamento).
  // Sinônimos gravados por telas antigas (debito/credito/credito_avista/...)
  // passam por normalizePaymentMethod antes de bater no dicionário canônico;
  // 'cartao' cru (achado na exportação, sem tela viva que grave assim) usa o
  // mesmo rótulo do tipo de conta "Cartão de Crédito".
  const paymentMethodLabels: Record<string, string> = msg.finance.receivePayment.paymentMethods;
  const paymentMethod = (v: unknown): BackupCell => {
    if (v == null || v === '') return null;
    const raw = String(v);
    if (raw === 'cartao') return accountTypeMap.cartao ?? raw;
    const canonical = normalizePaymentMethod(raw) ?? raw;
    return paymentMethodLabels[canonical] ?? raw;
  };
  // financial_transactions.payroll_kind (Financeiro → Tipo de Folha). 'salary'
  // e 'vale'/'bonus' reusam o texto dos modais de Funcionários; 'rescission'
  // não tem tela viva ainda — rótulo novo em dataExport.values.
  const payrollKindMap: Record<string, string> = {
    salary: msg.employees.paymentModal.summary.salary,
    vale: msg.employees.movementModal.typeLabels.vale,
    bonus: msg.employees.movementModal.typeLabels.bonus,
    rescission: dxValues.payrollKindRescission,
  };
  // inventory_movements.movement_type (Movimentações de Estoque → Tipo de
  // Movim.) — mesmo dicionário do Kardex de estoque.
  const movementTypeMap: Record<string, string> = msg.inventory.kardex.movementTypes;
  // employees.payment_frequency / payment_day_type (Funcionários → Frequência
  // de Pagamento / Tipo de Dia de Pagamento) — mesmo texto do formulário.
  const paymentFrequencyMap: Record<string, string> = {
    monthly: msg.employees.form.paymentConfig.monthly,
    biweekly: msg.employees.form.paymentConfig.biweekly,
    weekly: msg.employees.form.paymentConfig.weekly,
  };
  const paymentDayTypeMap: Record<string, string> = {
    business: msg.employees.form.paymentConfig.businessDay,
    calendar: msg.employees.form.paymentConfig.calendarDay,
  };
  // time_records.type (Ponto → Tipo) — mesmo texto da timeline do ponto
  // eletrônico público.
  const timeRecordTypeMap: Record<string, string> = msg.timeclock.typeLabels;
  // time_records.source (Ponto → Origem) — sem tela que exiba hoje; rótulos
  // novos em dataExport.values.
  const timeRecordSourceMap: Record<string, string> = {
    app: dxValues.timeRecordSourceApp,
    admin: dxValues.timeRecordSourceAdmin,
    link_publico: dxValues.timeRecordSourceLinkPublico,
  };
  // equipment.status (Equipamentos → Status) — só binário na tela.
  const equipmentStatusMap: Record<string, string> = {
    active: msg.equipment.statusActive,
    inactive: msg.equipment.statusInactive,
  };
  // employees.employment_regime (Funcionários → Regime de Contratação) — o
  // LabeledSwitch do formulário grava com esse texto literal, igual nos 4
  // idiomas (não há dicionário i18n pra esse campo na tela).
  const employmentRegimeMap: Record<string, string> = {
    informal: 'Informal',
    clt: 'CLT',
  };

  // ── Mapas de FK, carregados sob demanda e UMA vez ──────────────────────────
  const cache = new Map<string, Map<string, string>>();
  const lookup = async (
    key: string,
    loader: () => Promise<Map<string, string>>,
  ): Promise<Map<string, string>> => {
    const hit = cache.get(key);
    if (hit) return hit;
    const map = await loader();
    cache.set(key, map);
    return map;
  };

  const customersMap = () => lookup('customers', () => loadLabelMap('customers', 'id', 'name'));
  const profilesMap = () => lookup('profiles', () => loadLabelMap('profiles', 'user_id', 'full_name'));
  const serviceTypesMap = () => lookup('service_types', () => loadLabelMap('service_types', 'id', 'name'));
  const teamsMap = () => lookup('teams', () => loadLabelMap('teams', 'id', 'name'));
  const equipmentMap = () => lookup('equipment', () => loadLabelMap('equipment', 'id', 'name'));
  const equipmentCategoriesMap = () =>
    lookup('equipment_categories', () => loadLabelMap('equipment_categories', 'id', 'name'));
  const accountsMap = () => lookup('financial_accounts', () => loadLabelMap('financial_accounts', 'id', 'name'));
  const employeesMap = () => lookup('employees', () => loadLabelMap('employees', 'id', 'name'));
  const stocksMap = () => lookup('stocks', () => loadLabelMap('stocks', 'id', 'name'));
  const suppliersMap = () => lookup('suppliers', () => loadLabelMap('suppliers', 'id', 'name'));
  const contractsMap = () => lookup('contracts', () => loadLabelMap('contracts', 'id', 'name'));
  const crmStagesMap = () => lookup('crm_stages', () => loadLabelMap('crm_stages', 'id', 'name'));
  const responsibleTechniciansMap = () =>
    lookup('responsible_technicians', () => loadLabelMap('responsible_technicians', 'id', 'full_name'));
  const serviceOrderNumbersMap = () =>
    lookup('service_orders', () => loadLabelMap('service_orders', 'id', 'order_number'));
  const inventoryNamesMap = () => lookup('inventory', () => loadLabelMap('inventory', 'id', 'name'));
  const inventorySkusMap = () => lookup('inventory_sku', () => loadLabelMap('inventory', 'id', 'sku'));

  // ── Progresso ──────────────────────────────────────────────────────────────
  const total = groups.reduce((acc, g) => acc + EXPORT_GROUP_SHEETS[g].length, 0);
  let sheetIndex = 0;

  const readSheet = async (
    sheetKey: ExportSheetKey,
    read: (onPage: (loaded: number) => void) => Promise<DbRow[]>,
  ): Promise<DbRow[]> => {
    sheetIndex += 1;
    const index = sheetIndex;
    onProgress({ sheetKey, rows: 0, index, total });
    const rows = await read((loaded) => onProgress({ sheetKey, rows: loaded, index, total }));
    onProgress({ sheetKey, rows: rows.length, index, total });
    return rows;
  };

  const sheets: BackupSheet[] = [];

  for (const group of groups) {
    switch (group) {
      // ── Clientes + Contatos ────────────────────────────────────────────────
      case 'customers': {
        const rows = await readSheet('customers', (onPage) =>
          fetchAllPaged(
            'customers',
            'id, name, nome_fantasia, company_name, customer_type, document, inscricao_estadual, ' +
              'inscricao_municipal, email, phone, celular, address, address_number, complement, ' +
              'neighborhood, city, state, zip_code, origin, birth_date, notes, created_at',
            {
              orderBy: ['name', 'id'],
              // Lixeira não é backup.
              refine: (q) => q.eq('is_deleted', false),
              onPage,
            },
          ),
        );
        sheets.push({
          key: 'customers',
          columns: [
            T('name', 32), T('nome_fantasia', 28), T('company_name', 28), T('customer_type'),
            T('document', 20), T('inscricao_estadual'), T('inscricao_municipal'),
            T('email', 28), T('phone'), T('celular'),
            T('address', 32), T('address_number'), T('complement'), T('neighborhood'),
            T('city'), T('state'), T('zip_code'),
            T('origin'), T('birth_date'), T('notes', 40), T('created_at'),
          ],
          rows: rows.map((r) => [
            s(r.name), s(r.nome_fantasia), s(r.company_name), s(r.customer_type),
            s(r.document), s(r.inscricao_estadual), s(r.inscricao_municipal),
            s(r.email), s(r.phone), s(r.celular),
            s(r.address), s(r.address_number), s(r.complement), s(r.neighborhood),
            s(r.city), s(r.state), s(r.zip_code),
            s(r.origin), d(r.birth_date), s(r.notes), d(r.created_at),
          ]),
        });

        // Prime o mapa de clientes com o que já foi lido (evita reler a tabela).
        if (!cache.has('customers')) {
          const map = new Map<string, string>();
          for (const r of rows) if (r.id != null) map.set(String(r.id), String(r.name ?? ''));
          cache.set('customers', map);
        }

        const customers = await customersMap();
        const contacts = await readSheet('customerContacts', (onPage) =>
          fetchAllPaged('customer_contacts', 'id, customer_id, name, position, phone, email, notes, created_at', {
            orderBy: ['name', 'id'],
            onPage,
          }),
        );
        sheets.push({
          key: 'customerContacts',
          columns: [
            T('customer', 32), T('name', 28), T('position'), T('phone'), T('email', 28),
            T('notes', 40), T('created_at'),
          ],
          rows: contacts.map((r) => [
            ref(customers, r.customer_id), s(r.name), s(r.position), s(r.phone), s(r.email),
            s(r.notes), d(r.created_at),
          ]),
        });
        break;
      }

      // ── Equipamentos ───────────────────────────────────────────────────────
      case 'equipment': {
        const customers = await customersMap();
        const categories = await equipmentCategoriesMap();
        const rows = await readSheet('equipment', (onPage) =>
          fetchAllPaged(
            'equipment',
            'id, customer_id, category_id, name, brand, model, serial_number, identifier, capacity, ' +
              'location, status, install_date, warranty_until, notes, created_at',
            { orderBy: ['name', 'id'], onPage },
          ),
        );
        sheets.push({
          key: 'equipment',
          columns: [
            T('customer', 32), T('name', 28), T('category'), T('brand'), T('model'),
            T('serial_number'), T('identifier'), T('capacity'), T('location', 24),
            T('status'), T('install_date'), T('warranty_until'), T('notes', 40), T('created_at'),
          ],
          rows: rows.map((r) => [
            ref(customers, r.customer_id), s(r.name), ref(categories, r.category_id), s(r.brand), s(r.model),
            s(r.serial_number), s(r.identifier), s(r.capacity), s(r.location),
            enumLabel(equipmentStatusMap, r.status), d(r.install_date), d(r.warranty_until), s(r.notes), d(r.created_at),
          ]),
        });
        break;
      }

      // ── Ordens de Serviço + Materiais ──────────────────────────────────────
      case 'serviceOrders': {
        const customers = await customersMap();
        const profiles = await profilesMap();
        const serviceTypes = await serviceTypesMap();
        const teams = await teamsMap();
        const equipments = await equipmentMap();
        const contracts = await contractsMap();

        // NUNCA `select('*')` aqui: traria client_signature/tech_signature
        // (base64 de imagem) e snapshot_data/parts_used (JSONB).
        const rows = await readSheet('serviceOrders', (onPage) =>
          fetchAllPaged(
            'service_orders',
            'id, order_number, status, os_type, entry_type, origin, customer_id, equipment_id, ' +
              'service_type_id, technician_id, team_id, contract_id, task_title, description, ' +
              'diagnosis, solution, notes, scheduled_date, scheduled_time, started_at, completed_at, ' +
              'duration_minutes, labor_hours, labor_value, parts_value, total_value, ' +
              'pmoc_conformity_status, service_address, service_address_number, service_neighborhood, ' +
              'service_city, service_state, service_zip_code, created_at',
            { orderBy: ['order_number', 'id'], onPage },
          ),
        );
        sheets.push({
          key: 'serviceOrders',
          columns: [
            N('order_number'), T('status'), T('os_type', 24), T('service_type'), T('entry_type'), T('origin'),
            T('customer', 32), T('equipment', 26), T('technician', 24), T('team'), T('contract', 26),
            T('task_title', 28), T('description', 40), T('diagnosis', 40), T('solution', 40), T('notes', 40),
            T('scheduled_date'), T('scheduled_time'), T('started_at', 18), T('completed_at', 18),
            N('duration_minutes'), N('labor_hours'), M('labor_value'), M('parts_value'), M('total_value'),
            T('pmoc_conformity_status'),
            T('service_address', 32), T('service_address_number'), T('service_neighborhood'),
            T('service_city'), T('service_state'), T('service_zip_code'), T('created_at'),
          ],
          rows: rows.map((r) => [
            n(r.order_number), enumLabel(osStatusMap, r.status), enumLabel(osTypeMap, r.os_type), ref(serviceTypes, r.service_type_id), enumLabel(entryTypeMap, r.entry_type), enumLabel(osOriginMap, r.origin),
            ref(customers, r.customer_id), ref(equipments, r.equipment_id), ref(profiles, r.technician_id),
            ref(teams, r.team_id), ref(contracts, r.contract_id),
            s(r.task_title), s(r.description), s(r.diagnosis), s(r.solution), s(r.notes),
            d(r.scheduled_date), s(r.scheduled_time), dt(r.started_at), dt(r.completed_at),
            n(r.duration_minutes), n(r.labor_hours), n(r.labor_value), n(r.parts_value), n(r.total_value),
            enumLabel(conformityMap, r.pmoc_conformity_status),
            s(r.service_address), s(r.service_address_number), s(r.service_neighborhood),
            s(r.service_city), s(r.service_state), s(r.service_zip_code), d(r.created_at),
          ]),
        });

        if (!cache.has('service_orders')) {
          const map = new Map<string, string>();
          for (const r of rows) if (r.id != null) map.set(String(r.id), String(r.order_number ?? ''));
          cache.set('service_orders', map);
        }

        const orderNumbers = await serviceOrderNumbersMap();
        const materials = await readSheet('serviceMaterials', (onPage) =>
          fetchAllPaged(
            'service_materials',
            'id, service_id, item_name, quantity, unit, purchase_price, sale_price, subtotal, created_at',
            { orderBy: ['created_at', 'id'], onPage },
          ),
        );
        sheets.push({
          key: 'serviceMaterials',
          columns: [
            N('order_number'), T('item_name', 32), N('quantity'), T('unit'),
            M('purchase_price'), M('sale_price'), M('subtotal'), T('created_at'),
          ],
          rows: materials.map((r) => [
            n(ref(orderNumbers, r.service_id)), s(r.item_name), n(r.quantity), s(r.unit),
            n(r.purchase_price), n(r.sale_price), n(r.subtotal), d(r.created_at),
          ]),
        });
        break;
      }

      // ── Orçamentos + Itens ─────────────────────────────────────────────────
      case 'quotes': {
        const customers = await customersMap();
        // `token` NÃO entra: é a credencial do link público da proposta.
        const rows = await readSheet('quotes', (onPage) =>
          fetchAllPaged(
            'quotes',
            'id, quote_number, status, customer_id, prospect_name, prospect_email, prospect_phone, ' +
              'subtotal, discount_type, discount_value, discount_amount, displacement_cost, distance_km, ' +
              'km_cost, total_cost, total_price, total_value, bdi, profit_rate, tax_rate, ' +
              'admin_indirect_rate, card_installments, card_discount_rate, valid_until, view_count, ' +
              'last_viewed_at, terms, notes, created_at',
            { orderBy: ['quote_number', 'id'], onPage },
          ),
        );
        sheets.push({
          key: 'quotes',
          columns: [
            N('quote_number'), T('status'), T('customer', 32),
            T('prospect_name', 26), T('prospect_email', 26), T('prospect_phone'),
            M('subtotal'), T('discount_type'), N('discount_value'), M('discount_amount'),
            M('displacement_cost'), N('distance_km'), M('km_cost'),
            M('total_cost'), M('total_price'), M('total_value'),
            N('bdi'), N('profit_rate'), N('tax_rate'), N('admin_indirect_rate'),
            N('card_installments'), N('card_discount_rate'),
            T('valid_until'), N('view_count'), T('last_viewed_at', 18),
            T('terms', 40), T('notes', 40), T('created_at'),
          ],
          rows: rows.map((r) => [
            n(r.quote_number), enumLabel(quoteStatusMap, r.status), ref(customers, r.customer_id),
            s(r.prospect_name), s(r.prospect_email), s(r.prospect_phone),
            n(r.subtotal), enumLabel(discountTypeMap, r.discount_type), n(r.discount_value), n(r.discount_amount),
            n(r.displacement_cost), n(r.distance_km), n(r.km_cost),
            n(r.total_cost), n(r.total_price), n(r.total_value),
            n(r.bdi), n(r.profit_rate), n(r.tax_rate), n(r.admin_indirect_rate),
            n(r.card_installments), n(r.card_discount_rate),
            d(r.valid_until), n(r.view_count), dt(r.last_viewed_at),
            s(r.terms), s(r.notes), d(r.created_at),
          ]),
        });

        const quoteNumbers = new Map<string, string>();
        for (const r of rows) if (r.id != null) quoteNumbers.set(String(r.id), String(r.quote_number ?? ''));

        const serviceTypes = await serviceTypesMap();
        const items = await readSheet('quoteItems', (onPage) =>
          fetchAllPaged(
            'quote_items',
            'id, quote_id, position, item_type, description, details, service_type_id, quantity, ' +
              'unit_price, price_override, total_price, unit_total_cost, unit_labor_cost, ' +
              'unit_materials_cost, unit_extras_cost, unit_hours, unit_hourly_rate, bdi, profit_rate',
            { orderBy: ['position', 'id'], onPage },
          ),
        );
        sheets.push({
          key: 'quoteItems',
          columns: [
            N('quote_number'), N('position'), T('item_type'), T('description', 36), T('details', 36),
            T('service_type'), N('quantity'), M('unit_price'), M('price_override'), M('total_price'),
            M('unit_total_cost'), M('unit_labor_cost'), M('unit_materials_cost'), M('unit_extras_cost'),
            N('unit_hours'), M('unit_hourly_rate'), N('bdi'), N('profit_rate'),
          ],
          rows: items.map((r) => [
            n(ref(quoteNumbers, r.quote_id)), n(r.position), enumLabel(itemTypeMap, r.item_type), s(r.description), s(r.details),
            ref(serviceTypes, r.service_type_id), n(r.quantity), n(r.unit_price), n(r.price_override), n(r.total_price),
            n(r.unit_total_cost), n(r.unit_labor_cost), n(r.unit_materials_cost), n(r.unit_extras_cost),
            n(r.unit_hours), n(r.unit_hourly_rate), n(r.bdi), n(r.profit_rate),
          ]),
        });
        break;
      }

      // ── Contratos + Itens ──────────────────────────────────────────────────
      case 'contracts': {
        const customers = await customersMap();
        const profiles = await profilesMap();
        const serviceTypes = await serviceTypesMap();
        const teams = await teamsMap();
        const responsibleTechs = await responsibleTechniciansMap();

        // `public_pmoc_token` e `public_short_code` NÃO entram (link público).
        const rows = await readSheet('contracts', (onPage) =>
          fetchAllPaged(
            'contracts',
            'id, name, customer_id, status, is_pmoc, frequency_type, frequency_value, start_date, ' +
              'horizon_months, next_pmoc_generation_date, service_type_id, technician_id, team_id, ' +
              'responsible_technician_id, unidade_nome, unidade_endereco, unidade_numero, ' +
              'unidade_complemento, unidade_bairro, unidade_cidade, unidade_uf, unidade_cep, ' +
              'pmoc_identificacao_ambiente, pmoc_tipo_atividade, pmoc_area_climatizada_m2, ' +
              'pmoc_carga_termica_tr, pmoc_ocupantes_fixos, pmoc_ocupantes_flutuantes, notes, created_at',
            { orderBy: ['name', 'id'], onPage },
          ),
        );
        sheets.push({
          key: 'contracts',
          columns: [
            T('name', 32), T('customer', 32), T('status'), T('is_pmoc'),
            T('frequency_type'), N('frequency_value'), T('start_date'), N('horizon_months'),
            T('next_pmoc_generation_date', 18), T('service_type'), T('technician', 24), T('team'),
            T('responsible_technician', 24),
            T('unidade_nome', 26), T('unidade_endereco', 30), T('unidade_numero'), T('unidade_complemento'),
            T('unidade_bairro'), T('unidade_cidade'), T('unidade_uf'), T('unidade_cep'),
            T('pmoc_identificacao_ambiente', 28), T('pmoc_tipo_atividade', 24),
            N('pmoc_area_climatizada_m2'), N('pmoc_carga_termica_tr'),
            N('pmoc_ocupantes_fixos'), N('pmoc_ocupantes_flutuantes'),
            T('notes', 40), T('created_at'),
          ],
          rows: rows.map((r) => [
            s(r.name), ref(customers, r.customer_id), enumLabel(contractStatusMap, r.status), b(r.is_pmoc),
            enumLabel(freqTypeMap, r.frequency_type), n(r.frequency_value), d(r.start_date), n(r.horizon_months),
            d(r.next_pmoc_generation_date), ref(serviceTypes, r.service_type_id),
            ref(profiles, r.technician_id), ref(teams, r.team_id),
            ref(responsibleTechs, r.responsible_technician_id),
            s(r.unidade_nome), s(r.unidade_endereco), s(r.unidade_numero), s(r.unidade_complemento),
            s(r.unidade_bairro), s(r.unidade_cidade), s(r.unidade_uf), s(r.unidade_cep),
            s(r.pmoc_identificacao_ambiente), s(r.pmoc_tipo_atividade),
            n(r.pmoc_area_climatizada_m2), n(r.pmoc_carga_termica_tr),
            n(r.pmoc_ocupantes_fixos), n(r.pmoc_ocupantes_flutuantes),
            s(r.notes), d(r.created_at),
          ]),
        });

        if (!cache.has('contracts')) {
          const map = new Map<string, string>();
          for (const r of rows) if (r.id != null) map.set(String(r.id), String(r.name ?? ''));
          cache.set('contracts', map);
        }

        const contracts = await contractsMap();
        const equipments = await equipmentMap();
        const items = await readSheet('contractItems', (onPage) =>
          fetchAllPaged(
            'contract_items',
            'id, contract_id, item_name, item_description, equipment_id, pmoc_scope, pmoc_start_visit, sort_order, created_at',
            { orderBy: ['sort_order', 'id'], onPage },
          ),
        );
        sheets.push({
          key: 'contractItems',
          columns: [
            T('contract', 32), T('item_name', 30), T('item_description', 36), T('equipment', 26),
            T('pmoc_scope'), N('pmoc_start_visit'), N('sort_order'), T('created_at'),
          ],
          rows: items.map((r) => [
            ref(contracts, r.contract_id), s(r.item_name), s(r.item_description), ref(equipments, r.equipment_id),
            s(r.pmoc_scope), n(r.pmoc_start_visit), n(r.sort_order), d(r.created_at),
          ]),
        });
        break;
      }

      // ── Financeiro + Contas ────────────────────────────────────────────────
      case 'financial': {
        const customers = await customersMap();
        const accounts = await accountsMap();
        const employees = await employeesMap();
        const contracts = await contractsMap();
        const orderNumbers = await serviceOrderNumbersMap();

        // Folha de pagamento entra AQUI (payroll_kind / payroll_period) — não há
        // tabela de folha separada.
        const rows = await readSheet('financialTransactions', (onPage) =>
          fetchAllPaged(
            'financial_transactions',
            'id, transaction_date, due_date, paid_date, description, transaction_type, category, ' +
              'amount, amount_received, is_paid, payment_method, account_id, customer_id, employee_id, ' +
              'contract_id, service_order_id, installment_number, installment_total, payroll_kind, ' +
              'payroll_period, credit_card_bill_date, cancelled_at, cancelled_reason, notes, created_at',
            { orderBy: ['transaction_date', 'id'], onPage },
          ),
        );
        sheets.push({
          key: 'financialTransactions',
          columns: [
            T('transaction_date'), T('due_date'), T('paid_date'), T('description', 40),
            T('transaction_type'), T('category', 24), M('amount'), M('amount_received'),
            T('is_paid'), T('payment_method'), T('account', 24),
            T('customer', 32), T('employee', 24), T('contract', 26), N('order_number'),
            N('installment_number'), N('installment_total'),
            T('payroll_kind'), T('payroll_period'), T('credit_card_bill_date', 18),
            T('cancelled_at', 18), T('cancelled_reason', 28), T('notes', 40), T('created_at'),
          ],
          rows: rows.map((r) => [
            d(r.transaction_date), d(r.due_date), d(r.paid_date), s(r.description),
            enumLabel(transactionTypeMap, r.transaction_type), s(r.category), n(r.amount), n(r.amount_received),
            b(r.is_paid), paymentMethod(r.payment_method), ref(accounts, r.account_id),
            ref(customers, r.customer_id), ref(employees, r.employee_id), ref(contracts, r.contract_id),
            n(ref(orderNumbers, r.service_order_id)),
            n(r.installment_number), n(r.installment_total),
            enumLabel(payrollKindMap, r.payroll_kind), s(r.payroll_period), d(r.credit_card_bill_date),
            dt(r.cancelled_at), s(r.cancelled_reason), s(r.notes), d(r.created_at),
          ]),
        });

        const accountRows = await readSheet('financialAccounts', (onPage) =>
          fetchAllPaged(
            'financial_accounts',
            'id, name, type, bank_name, institution_name, initial_balance, credit_limit, ' +
              'closing_day, due_day, payment_due_days, is_active, created_at',
            { orderBy: ['name', 'id'], onPage },
          ),
        );
        sheets.push({
          key: 'financialAccounts',
          columns: [
            T('name', 28), T('type'), T('bank_name', 24), T('institution_name', 28),
            M('initial_balance'), M('credit_limit'), N('closing_day'), N('due_day'),
            N('payment_due_days'), T('is_active'), T('created_at'),
          ],
          rows: accountRows.map((r) => [
            s(r.name), enumLabel(accountTypeMap, r.type), s(r.bank_name), s(r.institution_name),
            n(r.initial_balance), n(r.credit_limit), n(r.closing_day), n(r.due_day),
            n(r.payment_due_days), b(r.is_active), d(r.created_at),
          ]),
        });
        break;
      }

      // ── Estoque (saldo POR LOCAL, respeitando a ACL) ────────────────────────
      case 'inventory': {
        const stocks = await stocksMap();

        const rows = await readSheet('inventory', async (onPage) => {
          // Materiais que o usuário PODE ver. A RPC (SECURITY DEFINER, já
          // existente) reaplica `can_access_stock` e é a única forma de
          // distinguir "material legado sem local" de "material que só existe em
          // local bloqueado" — o client não enxerga essa diferença.
          const { data: accessibleRaw, error: accessError } = await supabase.rpc(
            'get_accessible_inventory_ids',
          );
          if (accessError) throw new Error(accessError.message);
          const accessible = new Set<string>(((accessibleRaw ?? []) as string[]).map(String));

          const items = await fetchAllPaged(
            'inventory',
            'id, name, sku, category, unit, supplier, description, cost_price, sale_price, min_quantity, quantity',
            { orderBy: ['name', 'id'], onPage },
          );

          // A RLS de SELECT de inventory_stock_levels já filtra por
          // can_access_stock: o que não chega aqui é local sem acesso, e por
          // isso NUNCA entra em nenhum agregado.
          const levels = await fetchAllPaged(
            'inventory_stock_levels',
            'id, inventory_id, stock_id, quantity, min_quantity, is_present',
            { orderBy: ['id'] },
          );

          const byItem = new Map<string, DbRow[]>();
          for (const level of levels) {
            const key = String(level.inventory_id ?? '');
            const list = byItem.get(key);
            if (list) list.push(level);
            else byItem.set(key, [level]);
          }

          const out: DbRow[] = [];
          for (const item of items) {
            const id = String(item.id ?? '');
            if (!accessible.has(id)) continue;

            const itemLevels = byItem.get(id) ?? [];
            if (itemLevels.length === 0) {
              // Legado/global: material sem NENHUMA linha de presença. Não há
              // dimensão de local, então `inventory.quantity` é o saldo real e
              // não agrega local bloqueado.
              out.push({ ...item, __stock_id: null, __quantity: item.quantity, __min: item.min_quantity });
              continue;
            }
            for (const level of itemLevels) {
              const qty = Number(level.quantity ?? 0);
              if (!level.is_present && qty === 0) continue;
              out.push({
                ...item,
                __stock_id: level.stock_id,
                __quantity: level.quantity,
                __min: level.min_quantity ?? item.min_quantity,
              });
            }
          }
          return out;
        });

        sheets.push({
          key: 'inventory',
          columns: [
            T('name', 32), T('sku'), T('category', 22), T('unit'), T('stock', 22),
            N('quantity'), N('min_quantity'), M('cost_price'), M('sale_price'), M('total_value'),
            T('supplier', 24), T('description', 36),
          ],
          rows: rows.map((r) => {
            const qty = Number(r.__quantity ?? 0);
            const cost = Number(r.cost_price ?? 0);
            return [
              s(r.name), s(r.sku), s(r.category), s(r.unit), ref(stocks, r.__stock_id),
              n(r.__quantity), n(r.__min), n(r.cost_price), n(r.sale_price),
              Number.isFinite(qty * cost) ? qty * cost : null,
              s(r.supplier), s(r.description),
            ];
          }),
        });
        break;
      }

      // ── Movimentações de estoque ───────────────────────────────────────────
      case 'inventoryMovements': {
        const stocks = await stocksMap();
        const inventoryNames = await inventoryNamesMap();
        const inventorySkus = await inventorySkusMap();
        const suppliers = await suppliersMap();
        const orderNumbers = await serviceOrderNumbersMap();

        // A RLS de SELECT desta tabela também aplica can_access_stock: movimento
        // de local sem acesso simplesmente não chega.
        const rows = await readSheet('inventoryMovements', (onPage) =>
          fetchAllPaged(
            'inventory_movements',
            'id, created_at, movement_type, inventory_id, stock_id, quantity, unit_cost, ' +
              'stock_before, stock_after, supplier_id, service_order_id, notes',
            { orderBy: ['created_at', 'id'], onPage },
          ),
        );
        sheets.push({
          key: 'inventoryMovements',
          columns: [
            T('created_at', 18), T('movement_type'), T('item', 32), T('sku'), T('stock', 22),
            N('quantity'), M('unit_cost'), N('stock_before'), N('stock_after'),
            T('supplier', 24), N('order_number'), T('notes', 40),
          ],
          rows: rows.map((r) => [
            dt(r.created_at), enumLabel(movementTypeMap, r.movement_type), ref(inventoryNames, r.inventory_id),
            ref(inventorySkus, r.inventory_id), ref(stocks, r.stock_id),
            n(r.quantity), n(r.unit_cost), n(r.stock_before), n(r.stock_after),
            ref(suppliers, r.supplier_id), n(ref(orderNumbers, r.service_order_id)), s(r.notes),
          ]),
        });
        break;
      }

      // ── Funcionários ───────────────────────────────────────────────────────
      case 'employees': {
        // `user_id`, `ponto_slug`, `public_short_code` e `monthly_cost_breakdown`
        // NÃO entram (id interno, credencial de link público e JSONB).
        const rows = await readSheet('employees', (onPage) =>
          fetchAllPaged(
            'employees',
            'id, name, matricula, cpf, position, cbo, employment_regime, hire_date, is_active, ' +
              'email, phone, address, salary, monthly_cost, dependents_count, payment_frequency, ' +
              'payment_day, payment_day_2, payment_day_type, payment_weekday, vt_enabled, ' +
              'vt_monthly_value, pix_key, created_at',
            { orderBy: ['name', 'id'], onPage },
          ),
        );
        sheets.push({
          key: 'employees',
          columns: [
            T('name', 30), T('matricula'), T('cpf'), T('position', 24), T('cbo'),
            T('employment_regime'), T('hire_date'), T('is_active'),
            T('email', 28), T('phone'), T('address', 32),
            M('salary'), M('monthly_cost'), N('dependents_count'),
            T('payment_frequency'), N('payment_day'), N('payment_day_2'), T('payment_day_type'),
            N('payment_weekday'), T('vt_enabled'), M('vt_monthly_value'), T('pix_key', 26), T('created_at'),
          ],
          rows: rows.map((r) => [
            s(r.name), s(r.matricula), s(r.cpf), s(r.position), s(r.cbo),
            enumLabel(employmentRegimeMap, r.employment_regime), d(r.hire_date), b(r.is_active),
            s(r.email), s(r.phone), s(r.address),
            n(r.salary), n(r.monthly_cost), n(r.dependents_count),
            enumLabel(paymentFrequencyMap, r.payment_frequency), n(r.payment_day), n(r.payment_day_2), enumLabel(paymentDayTypeMap, r.payment_day_type),
            n(r.payment_weekday), b(r.vt_enabled), n(r.vt_monthly_value), s(r.pix_key), d(r.created_at),
          ]),
        });
        break;
      }

      // ── CRM / Leads ────────────────────────────────────────────────────────
      case 'leads': {
        const customers = await customersMap();
        const profiles = await profilesMap();
        const stages = await crmStagesMap();
        const rows = await readSheet('leads', (onPage) =>
          fetchAllPaged(
            'leads',
            'id, title, status, stage_id, customer_id, assigned_to, source, value, probability, ' +
              'expected_close_date, notes, created_at, updated_at',
            { orderBy: ['created_at', 'id'], onPage },
          ),
        );
        sheets.push({
          key: 'leads',
          columns: [
            T('title', 32), T('status'), T('stage', 22), T('customer', 32), T('assigned_to', 24),
            T('source'), M('value'), N('probability'), T('expected_close_date', 18),
            T('notes', 40), T('created_at'), T('updated_at'),
          ],
          rows: rows.map((r) => [
            s(r.title), s(r.status), ref(stages, r.stage_id), ref(customers, r.customer_id),
            ref(profiles, r.assigned_to), s(r.source), n(r.value), n(r.probability),
            d(r.expected_close_date), s(r.notes), d(r.created_at), d(r.updated_at),
          ]),
        });
        break;
      }

      // ── Ponto ──────────────────────────────────────────────────────────────
      case 'timeRecords': {
        const employees = await employeesMap();
        // `device_info` (JSONB) e `user_id` ficam de fora.
        const rows = await readSheet('timeRecords', (onPage) =>
          fetchAllPaged(
            'time_records',
            'id, date, recorded_at, type, employee_id, source, is_valid, address, latitude, longitude, notes',
            { orderBy: ['recorded_at', 'id'], onPage },
          ),
        );
        sheets.push({
          key: 'timeRecords',
          columns: [
            T('date'), T('recorded_at', 18), T('type'), T('employee', 28), T('source'),
            T('is_valid'), T('address', 36), N('latitude'), N('longitude'), T('notes', 36),
          ],
          rows: rows.map((r) => [
            d(r.date), dt(r.recorded_at), enumLabel(timeRecordTypeMap, r.type), ref(employees, r.employee_id), enumLabel(timeRecordSourceMap, r.source),
            b(r.is_valid), s(r.address), n(r.latitude), n(r.longitude), s(r.notes),
          ]),
        });
        break;
      }
    }
  }

  return sheets;
}
