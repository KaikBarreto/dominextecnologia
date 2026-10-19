/**
 * Motor do CAIXA do PDV (painel do caixa). Função pura, sem React e sem
 * Supabase, de propósito: é a parte onde erro vira dinheiro errado.
 *
 * O que mora aqui:
 *  • `computeExpectedCash` — o ESPERADO da gaveta. Espelha, caractere por
 *    caractere, a conta da RPC `pdv_close_cash_session`:
 *        esperado = abertura + vendas em dinheiro + suprimentos − sangrias
 *    Troco NÃO entra: `pdv_order_payments.amount` já é o valor LÍQUIDO
 *    aplicado ao pedido (o que o cliente entregou é `amount + change_amount`),
 *    então descontar troco aqui contaria duas vezes. A tela só PREVÊ o número
 *    antes de confirmar; quem decide é sempre o servidor.
 *  • `computeSessionResult` — Vendido, CMV, Receitas, Despesas e LUCRO REAL.
 *    Diferente da EcoSistema, que usa "projeção" porque não conhece o custo,
 *    aqui `pdv_order_items.unit_cost` é SNAPSHOT do custo no momento da venda,
 *    então o lucro é medido, não estimado.
 *  • `buildPdvLedger` / `filterPdvLedger` / `paginate` — o histórico único de
 *    transações do caixa (venda, receita, despesa, sangria, suprimento).
 *
 * REGRA DA CASA que este arquivo obedece: movimentação é só REALIZADO.
 * Pendência (lançamento `is_paid = false`) não entra em total de caixa nem no
 * extrato — quem filtra isso é o hook, e os totais aqui assumem entrada já
 * filtrada.
 */

import { fuzzyIncludesAny } from '@/lib/utils';
import { normalizePaymentMethod } from '@/lib/finance-payment-methods';

/**
 * Arredonda pra 2 casas no MESMO critério do `round(numeric, 2)` do Postgres:
 * meio pra LONGE DO ZERO (−1,005 → −1,01), não meio pra cima (que daria
 * −1,00). `toPrecision(12)` antes do `Math.round` tira o ruído binário que faz
 * `1.005 * 100` virar `100.49999999999999` e arredondar pra baixo.
 */
export function round2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const sign = value < 0 ? -1 : 1;
  const scaled = Number((Math.abs(value) * 100).toPrecision(12));
  return (sign * Math.round(scaled)) / 100;
}

// ── ESPERADO DA GAVETA ───────────────────────────────────────────────────────

export interface ExpectedCashInput {
  /** `pdv_cash_sessions.opening_amount`. */
  openingAmount: number;
  /** Σ `pdv_order_payments.amount` com `method = 'dinheiro'` dos pedidos pagos da sessão. */
  cashSales: number;
  /**
   * Σ `pdv_cash_movements.amount` com `kind = 'suprimento'` **e
   * `cancelled_at IS NULL`**.
   *
   * O FILTRO DE CANCELADO NÃO É OPCIONAL: `pdv_revert_cash_movement` desfaz
   * sangria/suprimento marcando `cancelled_at` (a tabela é append-only no
   * privilégio, nada é apagado), e `pdv_close_cash_session` ignora movimento
   * cancelado. Quem monta esta entrada sem o filtro faz a tela prever um
   * esperado diferente do que o servidor vai cobrar no fechamento — divergência
   * de dinheiro na cara do operador.
   */
  supplies: number;
  /** Σ `pdv_cash_movements.amount` com `kind = 'sangria'` **e `cancelled_at IS NULL`** (idem acima). */
  bleeds: number;
}

/**
 * esperado = abertura + vendas em dinheiro + suprimentos − sangrias.
 *
 * Esta função só SOMA o que recebe: ela não conhece `cancelled_at`. Filtrar
 * movimento cancelado é obrigação de quem monta `ExpectedCashInput` (ver o
 * JSDoc de `supplies`).
 */
export function computeExpectedCash(input: ExpectedCashInput): number {
  const { openingAmount = 0, cashSales = 0, supplies = 0, bleeds = 0 } = input || ({} as ExpectedCashInput);
  return round2(openingAmount + cashSales + supplies - bleeds);
}

/**
 * diferença = contado − esperado. Positivo é SOBRA, negativo é FALTA — a RPC
 * lança a sobra como entrada e a falta como saída na conta do cofre.
 */
export function computeCashDifference(countedAmount: number, expectedAmount: number): number {
  return round2((countedAmount || 0) - (expectedAmount || 0));
}

/**
 * A RPC NÃO lança ajuste automático quando o esperado dá negativo: esperado
 * negativo é sintoma de dado faltando (sangria registrada sem a venda que a
 * justifica), e ajuste sobre base negativa é ficção contábil. A tela precisa
 * avisar isso ANTES de o operador confirmar, então a regra vive aqui.
 */
export function willPostCashBreak(args: {
  difference: number;
  expectedAmount: number;
  hasCashAccount: boolean;
}): boolean {
  if (!args.difference) return false;
  if (args.expectedAmount < 0) return false;
  return args.hasCashAccount;
}

// ── RESULTADO DO CAIXA (vendido, CMV, lucro real) ────────────────────────────

export interface SessionSaleLike {
  /** `pdv_orders.total` — já líquido de desconto. */
  total: number;
}

export interface SessionItemLike {
  quantity: number;
  /** `pdv_order_items.unit_cost` — SNAPSHOT do custo na hora da venda. */
  unitCost: number;
  /** Item de serviço avulso (mão de obra de balcão) não tem produto no catálogo. */
  isService?: boolean;
}

export interface SessionFlowLike {
  /** Valor absoluto do lançamento REALIZADO (`is_paid = true`). */
  amount: number;
}

export interface SessionResult {
  /** Σ `pdv_orders.total` dos pedidos pagos da sessão. */
  sold: number;
  /** Custo das mercadorias vendidas: Σ `unit_cost × quantity`. */
  cmv: number;
  /** vendido − CMV. */
  grossMargin: number;
  /** Receitas avulsas lançadas no caixa (não são venda). */
  revenues: number;
  /** Despesas avulsas lançadas no caixa. */
  expenses: number;
  /** LUCRO REAL do caixa: margem bruta das vendas + receitas − despesas. */
  profit: number;
  /** margem bruta ÷ vendido, em %. `null` quando não houve venda. */
  marginPct: number | null;
  /**
   * Quantas linhas de PRODUTO vendidas estão sem custo cadastrado
   * (`unit_cost = 0`). Importa porque custo zero infla o lucro em silêncio —
   * a tela mostra o aviso em vez de deixar o número mentir. Item de serviço
   * avulso não conta: ele não tem custo de mercadoria mesmo.
   */
  itemsWithoutCost: number;
}

/**
 * Lucro REAL do caixa (não projeção):
 *
 *     margem bruta = Σ total dos pedidos − Σ (unit_cost × quantidade)
 *     lucro        = margem bruta + receitas avulsas − despesas avulsas
 *
 * Por que receita/despesa avulsa entra: o card "Lucro" responde "quanto este
 * caixa rendeu", e uma despesa de R$ 50 paga pela gaveta é resultado do caixa
 * tanto quanto a venda. Deixar fora daria um lucro que não existe.
 */
export function computeSessionResult(args: {
  orders: SessionSaleLike[];
  items: SessionItemLike[];
  revenues: SessionFlowLike[];
  expenses: SessionFlowLike[];
}): SessionResult {
  const orders = args?.orders ?? [];
  const items = args?.items ?? [];
  const revenueRows = args?.revenues ?? [];
  const expenseRows = args?.expenses ?? [];

  const sold = round2(orders.reduce((sum, o) => sum + (Number(o?.total) || 0), 0));
  const cmv = round2(
    items.reduce((sum, i) => sum + (Number(i?.quantity) || 0) * (Number(i?.unitCost) || 0), 0),
  );
  const revenues = round2(revenueRows.reduce((sum, r) => sum + (Number(r?.amount) || 0), 0));
  const expenses = round2(expenseRows.reduce((sum, e) => sum + (Number(e?.amount) || 0), 0));

  const grossMargin = round2(sold - cmv);
  const profit = round2(grossMargin + revenues - expenses);

  const itemsWithoutCost = items.filter(
    (i) => !i?.isService && (Number(i?.quantity) || 0) > 0 && !(Number(i?.unitCost) > 0),
  ).length;

  return {
    sold,
    cmv,
    grossMargin,
    revenues,
    expenses,
    profit,
    marginPct: sold > 0 ? round2((grossMargin / sold) * 100) : null,
    itemsWithoutCost,
  };
}

// ── HISTÓRICO ÚNICO DE TRANSAÇÕES ────────────────────────────────────────────

export type PdvLedgerKind = 'venda' | 'receita' | 'despesa' | 'sangria' | 'suprimento';

/** Aba de forma de pagamento do histórico. */
export type PdvMethodGroup = 'todas' | 'dinheiro' | 'pix_transferencia';

/** Linha de item da venda, pro painel expansível. */
export interface PdvLedgerSaleItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

/** Forma de pagamento da venda, pro painel expansível. */
export interface PdvLedgerSalePayment {
  method: string;
  /** Valor LÍQUIDO aplicado ao pedido (não é o que o cliente entregou). */
  amount: number;
  /** Troco devolvido. Só existe em dinheiro. */
  changeAmount: number;
  accountName: string | null;
}

/**
 * O que o expansível mostra, por tipo. Campo vazio simplesmente não aparece na
 * tela — nunca vira travessão de placeholder.
 */
export interface PdvLedgerDetail {
  /** Venda: itens vendidos. */
  items?: PdvLedgerSaleItem[];
  /** Venda: como foi pago (uma linha por forma, pagamento misto tem várias). */
  payments?: PdvLedgerSalePayment[];
  /** Receita/despesa: categoria do Financeiro. */
  category?: string | null;
  /** Receita/despesa: conta que recebeu/pagou. */
  accountName?: string | null;
  /** Receita/despesa: observação do lançamento. */
  notes?: string | null;
  /** Receita/despesa: quantos anexos o lançamento tem. */
  attachmentCount?: number;
  /** Sangria/suprimento: de onde o dinheiro saiu. */
  fromAccountName?: string | null;
  /** Sangria/suprimento: pra onde o dinheiro foi. */
  toAccountName?: string | null;
  /**
   * Sangria/suprimento COM conta informada: o dinheiro trocou de conta, então a
   * RPC criou um PAR em `financial_transactions`. Vem do `to_account_id` (o id,
   * não o nome): conta apagada depois ainda tem o par pra cancelar, e o nome
   * resolveria `null` e esconderia o efeito da confirmação.
   */
  movedBetweenAccounts?: boolean;
  /**
   * Receita/despesa lançada NA CONTA DO COFRE. Importa na exclusão: se o
   * operador espelhou o lançamento na gaveta (ver `cashSync` em PdvCaixa), a
   * linha de sangria/suprimento espelho é OUTRO registro e não some junto.
   */
  onCofreAccount?: boolean;
}

export interface PdvLedgerEntry {
  /** Único na lista (prefixado pelo tipo: o mesmo UUID pode existir em 2 tabelas). */
  key: string;
  id: string;
  kind: PdvLedgerKind;
  /** Nº do pedido (venda) ou vazio nas demais. */
  reference: string;
  /** O que aparece na coluna principal (descrição, motivo). */
  label: string;
  customerName: string | null;
  /** Valor absoluto. */
  amount: number;
  /** Positivo quando entra dinheiro no resultado do caixa, negativo quando sai. */
  signedAmount: number;
  /** Formas de pagamento desta linha (venda com pagamento misto tem mais de uma). */
  methods: string[];
  /** ISO da hora em que a transação aconteceu. */
  occurredAt: string;
  /** Conteúdo do painel expansível. */
  detail: PdvLedgerDetail;
}

/**
 * Em que aba a forma de pagamento cai. O vocabulário do PDV
 * (`pdv_order_payments.method`: dinheiro, pix, transferencia, debito, credito,
 * fiado, pontos) e o do Financeiro (`financial_transactions.payment_method`:
 * dinheiro, pix, cartao_debito, cartao_credito, transferencia, boleto, cheque)
 * convergem por `normalizePaymentMethod`, que já resolve `debito`/`credito`
 * como sinônimos legados.
 */
export function methodGroupOf(method: string | null | undefined): Exclude<PdvMethodGroup, 'todas'> | 'outros' {
  const code = normalizePaymentMethod(method) ?? (method || '').trim().toLowerCase();
  if (code === 'dinheiro') return 'dinheiro';
  if (code === 'pix' || code === 'transferencia') return 'pix_transferencia';
  return 'outros';
}

/**
 * Venda com pagamento misto (metade pix, metade dinheiro) aparece nas DUAS
 * abas: o operador que procura "a venda que entrou em dinheiro" tem que
 * achá-la. Por isso a checagem é por ALGUMA forma da linha, não por uma forma
 * principal inventada.
 */
export function ledgerMatchesMethodGroup(entry: PdvLedgerEntry, group: PdvMethodGroup): boolean {
  if (group === 'todas') return true;
  return (entry.methods || []).some((m) => methodGroupOf(m) === group);
}

export interface BuildLedgerInput {
  orders: Array<{
    id: string;
    number: number | string;
    total: number;
    customerName: string | null;
    occurredAt: string;
    methods: string[];
    items?: PdvLedgerSaleItem[];
    payments?: PdvLedgerSalePayment[];
  }>;
  /** Lançamentos avulsos REALIZADOS do caixa (`origin = 'pdv'`, `is_paid = true`). */
  transactions: Array<{
    id: string;
    description: string;
    amount: number;
    /** 'entrada' = receita, 'saida' = despesa. */
    transactionType: string;
    paymentMethod: string | null;
    customerName: string | null;
    occurredAt: string;
    category?: string | null;
    accountName?: string | null;
    notes?: string | null;
    attachmentCount?: number;
    onCofreAccount?: boolean;
  }>;
  movements: Array<{
    id: string;
    kind: string;
    amount: number;
    reason: string | null;
    /** Nome da conta de destino, quando o dinheiro trocou de conta. */
    toAccountName: string | null;
    /** `!!pdv_cash_movements.to_account_id` — o dinheiro trocou de conta. */
    hasAccount?: boolean;
    occurredAt: string;
    /**
     * `pdv_cash_movements.cancelled_at`. Movimento desfeito NÃO entra na lista
     * (ver o comentário de `buildPdvLedger`).
     */
    cancelledAt?: string | null;
  }>;
  /**
   * Nome da conta do cofre. Vira a ponta "gaveta" das duas pontas de
   * sangria/suprimento — a RPC lança a perna do cofre nessa conta.
   */
  cofreAccountName?: string | null;
  /** Rótulos localizados (o motor não conhece idioma). */
  labels: {
    sale: string;
    bleed: string;
    supply: string;
    /** "Sangria para {conta}" — `{account}` é substituído. */
    bleedTo: string;
    supplyFrom: string;
  };
}

/**
 * Monta a lista única, já ordenada do mais recente pro mais antigo.
 *
 * MOVIMENTO DESFEITO SOME DAQUI, e o filtro vive AQUI de propósito — nunca no
 * `select` do hook. Parece a mesma coisa e não é:
 * `usePdvCashSessionDetail` usa `movements[].financial_transaction_id` pra
 * montar o conjunto `linkedIds`, que impede a perna da sangria de contar DE
 * NOVO como despesa avulsa do caixa. Tirando o movimento cancelado da CONSULTA,
 * o id da perna sai do `linkedIds` e a perna cancelada reaparece no extrato
 * como "despesa avulsa" — exatamente o erro que desfazer deveria apagar.
 *
 * Então: a consulta traz tudo; a EXIBIÇÃO filtra. Por que some em vez de ficar
 * com selo "desfeito": coerência com a decisão do CEO pra venda cancelada, que
 * também sai da lista.
 */
export function buildPdvLedger(input: BuildLedgerInput): PdvLedgerEntry[] {
  const entries: PdvLedgerEntry[] = [];
  const drawerName = input?.cofreAccountName ?? null;

  for (const o of input?.orders ?? []) {
    entries.push({
      key: `venda:${o.id}`,
      id: o.id,
      kind: 'venda',
      reference: `#${o.number}`,
      label: input.labels.sale,
      customerName: o.customerName ?? null,
      amount: round2(Number(o.total) || 0),
      signedAmount: round2(Number(o.total) || 0),
      methods: o.methods ?? [],
      occurredAt: o.occurredAt,
      detail: {
        items: o.items ?? [],
        payments: o.payments ?? [],
      },
    });
  }

  for (const t of input?.transactions ?? []) {
    const isIn = t.transactionType === 'entrada';
    const amount = round2(Number(t.amount) || 0);
    entries.push({
      key: `txn:${t.id}`,
      id: t.id,
      kind: isIn ? 'receita' : 'despesa',
      reference: '',
      label: t.description || '',
      customerName: t.customerName ?? null,
      amount,
      signedAmount: isIn ? amount : -amount,
      methods: t.paymentMethod ? [t.paymentMethod] : [],
      occurredAt: t.occurredAt,
      detail: {
        category: t.category ?? null,
        accountName: t.accountName ?? null,
        notes: t.notes ?? null,
        attachmentCount: t.attachmentCount ?? 0,
        onCofreAccount: t.onCofreAccount === true,
      },
    });
  }

  for (const m of input?.movements ?? []) {
    if (m.cancelledAt) continue;
    const isSupply = m.kind === 'suprimento';
    const amount = round2(Number(m.amount) || 0);
    const base = isSupply ? input.labels.supply : input.labels.bleed;
    const withAccount = m.toAccountName
      ? (isSupply ? input.labels.supplyFrom : input.labels.bleedTo).replace('{account}', m.toAccountName)
      : base;
    entries.push({
      key: `mov:${m.id}`,
      id: m.id,
      kind: isSupply ? 'suprimento' : 'sangria',
      reference: '',
      label: m.reason ? `${withAccount}: ${m.reason}` : withAccount,
      customerName: null,
      amount,
      // Sangria e suprimento movem dinheiro de lugar, NÃO são resultado. O
      // sinal aqui serve só pra a seta/cor da linha do extrato.
      signedAmount: isSupply ? amount : -amount,
      methods: ['dinheiro'],
      occurredAt: m.occurredAt,
      // As DUAS pontas da transferência. Sangria sai da gaveta e entra na
      // conta; suprimento faz o contrário. Sem conta informada, o dinheiro não
      // trocou de conta (só mudou o esperado da gaveta) e a ponta de fora fica
      // vazia — a tela não mostra campo vazio.
      detail: isSupply
        ? {
            fromAccountName: m.toAccountName ?? null,
            toAccountName: drawerName,
            movedBetweenAccounts: m.hasAccount === true,
          }
        : {
            fromAccountName: drawerName,
            toAccountName: m.toAccountName ?? null,
            movedBetweenAccounts: m.hasAccount === true,
          },
    });
  }

  return entries.sort((a, b) => {
    const diff = new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime();
    // Empate de horário (duas linhas no mesmo segundo) resolve por chave, pra
    // a ordem não dançar entre renders.
    return diff !== 0 ? diff : a.key.localeCompare(b.key);
  });
}

export interface LedgerFilter {
  search?: string;
  /** `null` = todos os tipos. */
  kind?: PdvLedgerKind | null;
  methodGroup?: PdvMethodGroup;
  /** Nome exato da conta envolvida em qualquer ponta da transação. */
  account?: string | null;
  minAmount?: number | null;
  maxAmount?: number | null;
}

export function pdvLedgerAccountNames(entry: PdvLedgerEntry): string[] {
  return Array.from(new Set([
    entry.detail.accountName,
    entry.detail.fromAccountName,
    entry.detail.toAccountName,
    ...(entry.detail.payments ?? []).map((payment) => payment.accountName),
  ].filter((name): name is string => !!name)));
}

/** Busca pela régua única (`fuzzyIncludes`: tolera acento e ordem de palavras). */
export function filterPdvLedger(entries: PdvLedgerEntry[], filter: LedgerFilter): PdvLedgerEntry[] {
  const {
    search = '', kind = null, methodGroup = 'todas', account = null,
    minAmount = null, maxAmount = null,
  } = filter || {};
  return (entries ?? []).filter((e) => {
    if (kind && e.kind !== kind) return false;
    if (!ledgerMatchesMethodGroup(e, methodGroup)) return false;
    if (account && !pdvLedgerAccountNames(e).includes(account)) return false;
    if (minAmount != null && e.amount < minAmount) return false;
    if (maxAmount != null && e.amount > maxAmount) return false;
    if (search && search.trim()) {
      return fuzzyIncludesAny([e.label, e.customerName, e.reference], search);
    }
    return true;
  });
}

// ── REVERSÃO: o que dá pra desfazer, e o que exatamente é desfeito ───────────

/**
 * Caminho de reversão da linha. Cada um é um caminho JÁ EXISTENTE do sistema —
 * nenhum estorno novo é inventado aqui, porque meia reversão deixa dinheiro
 * errado parecendo certo.
 */
export type PdvReversalPath =
  /** RPC `pdv_cancel_order`: estoque volta, financeiro recebe `cancelled_at`, fiado ganha linha de ajuste. */
  | 'cancel_order'
  /** `deleteTransactionCascade` do Financeiro: apaga o lançamento (o saldo da conta é derivado, então volta sozinho). */
  | 'delete_transaction'
  /**
   * RPC `pdv_revert_cash_movement`: marca `cancelled_at` no movimento e cancela
   * AS DUAS pernas do par em `financial_transactions` (por `transfer_pair_id`),
   * numa transação só. Não apaga nada.
   */
  | 'revert_movement'
  /** Não existe caminho seguro hoje. A tela mostra a ação desabilitada e diz por quê. */
  | 'unsupported';

/**
 * Efeito que a confirmação tem que LISTAR antes de desfazer. A lista é o
 * contrato com o operador: ele só confirma sabendo o que muda.
 */
export type PdvReversalEffect =
  /** Estoque devolvido por movimento `estorno` (as duas pernas no Kardex). */
  | 'stock'
  /** Lançamento financeiro marcado como cancelado (linha viva, fora do saldo e do DRE). */
  | 'finance_cancelled'
  /** Lançamento financeiro APAGADO (e o saldo da conta volta, porque é derivado). */
  | 'finance_deleted'
  /** Fiado do cliente ajustado com linha nova no ledger. */
  | 'credit_ledger'
  /** O esperado da gaveta cai/sobe porque a venda em dinheiro saiu da conta. */
  | 'drawer'
  /** Espelho na gaveta (sangria/suprimento) NÃO some junto: tem que ser tratado à parte. */
  | 'drawer_mirror_stays'
  /** Sangria/suprimento marcado como desfeito: a linha sai do histórico do caixa. */
  | 'movement_cancelled'
  /** As DUAS pernas da transferência são canceladas e o saldo das duas contas volta. */
  | 'movement_finance_pair'
  /** Desfazer SANGRIA: o dinheiro volta pra gaveta, o esperado SOBE. */
  | 'drawer_restore'
  /** Desfazer SUPRIMENTO: o dinheiro sai da gaveta, o esperado CAI. */
  | 'drawer_reduce';

/** Por que a ação está indisponível. A tela traduz; o motor só classifica. */
export type PdvReversalBlock =
  /** Usuário sem `fn:manage_finance`/`fn:delete_finance`. */
  | 'no_permission'
  /**
   * Sangria e suprimento não se EDITAM: valor e conta já viraram par de
   * lançamentos no Financeiro e já mudaram o esperado da gaveta. O caminho
   * honesto é desfazer (RPC `pdv_revert_cash_movement`, que cancela as duas
   * pernas numa transação) e lançar de novo com o valor certo. Editar in loco
   * reverteria pela metade — foi por isso que `pdv_cash_movements` nasceu
   * append-only no privilégio (só SELECT e INSERT pro cliente).
   */
  | 'movement_edit_undo_and_redo'
  /**
   * Editar venda mexe em item, estoque e pagamento ao mesmo tempo. O caminho
   * honesto é cancelar e refazer: a RPC de cancelamento já reverte tudo numa
   * transação só, e a venda nova nasce com o estoque e o custo certos.
   */
  | 'sale_edit_cancel_and_redo';

export interface PdvReversalPlan {
  path: PdvReversalPath;
  /** Dá pra disparar agora? */
  canDelete: boolean;
  /** Motivo quando `canDelete` é falso. */
  deleteBlock: PdvReversalBlock | null;
  canEdit: boolean;
  editBlock: PdvReversalBlock | null;
  /** Efeitos a listar na confirmação, na ordem de exibição. */
  effects: PdvReversalEffect[];
}

/**
 * O que acontece ao desfazer esta linha, por tipo. Função PURA de propósito: é
 * a régua que a confirmação lê em voz alta pro operador, e régua de dinheiro
 * tem que ser testável sem navegador.
 *
 * VENDA → `pdv_cancel_order`. Cancela, não apaga: `cancelled_at` é o marcador
 * canônico da casa e DELETE bateria na trava da conciliação bancária. Na tela
 * do caixa a venda cancelada SOME da lista por consequência (o histórico só lê
 * pedido `pago`/`entregue`), que é o efeito que o operador espera.
 *
 * RECEITA/DESPESA → exclusão do Financeiro. O saldo da conta é DERIVADO da soma
 * dos lançamentos (`useFinancialAccounts`), então apagar o lançamento devolve o
 * saldo sem precisar de contra-lançamento.
 *
 * SANGRIA/SUPRIMENTO → RPC `pdv_revert_cash_movement`. Marca `cancelled_at` no
 * movimento e cancela AS DUAS pernas do par por `transfer_pair_id`. O servidor
 * recusa, com mensagem PT-BR, se o caixa já foi fechado, se o movimento já foi
 * desfeito ou se alguma perna está conciliada com o extrato bancário — por isso
 * a tela OFERECE a ação e deixa o servidor julgar o caso, em vez de replicar
 * três regras de borda que envelheceriam separadas.
 */
export function planLedgerReversal(
  entry: PdvLedgerEntry,
  opts: { canManageFinance: boolean; canDeleteFinance: boolean },
): PdvReversalPlan {
  const canManage = opts?.canManageFinance === true;
  const canDeleteFin = opts?.canDeleteFinance === true;

  if (entry.kind === 'venda') {
    const effects: PdvReversalEffect[] = ['stock', 'finance_cancelled'];
    const methods = (entry.methods ?? []).map((m) => normalizePaymentMethod(m) ?? m);
    if (methods.includes('fiado')) effects.push('credit_ledger');
    if (methods.includes('dinheiro')) effects.push('drawer');
    return {
      path: 'cancel_order',
      // Cancelar venda é ação de OPERADOR de balcão (ele errou o item e
      // precisa refazer), não de gestor financeiro: a RPC já faz todo o
      // estorno numa transação só, e o `cancelled_at` é auditável.
      canDelete: true,
      deleteBlock: null,
      canEdit: false,
      editBlock: 'sale_edit_cancel_and_redo',
      effects,
    };
  }

  if (entry.kind === 'receita' || entry.kind === 'despesa') {
    const effects: PdvReversalEffect[] = ['finance_deleted'];
    if (entry.detail?.onCofreAccount) effects.push('drawer_mirror_stays');
    return {
      path: 'delete_transaction',
      canDelete: canDeleteFin,
      deleteBlock: canDeleteFin ? null : 'no_permission',
      canEdit: canManage,
      editBlock: canManage ? null : 'no_permission',
      effects,
    };
  }

  if (entry.kind === 'sangria' || entry.kind === 'suprimento') {
    const isSupply = entry.kind === 'suprimento';
    const effects: PdvReversalEffect[] = ['movement_cancelled'];
    if (entry.detail?.movedBetweenAccounts) effects.push('movement_finance_pair');
    effects.push(isSupply ? 'drawer_reduce' : 'drawer_restore');
    return {
      path: 'revert_movement',
      // Mesma régua do cancelamento de venda: quem REGISTRA sangria e
      // suprimento é o operador de balcão (a tela nem pede `fn:manage_finance`
      // pra isso), então quem erra o valor tem que poder desfazer. A RPC é
      // `SECURITY DEFINER`, valida empresa e módulo, só aceita com o caixa
      // aberto e grava `cancelled_by` — é auditável, não é atalho.
      canDelete: true,
      deleteBlock: null,
      canEdit: false,
      editBlock: 'movement_edit_undo_and_redo',
      effects,
    };
  }

  return {
    path: 'unsupported',
    canDelete: false,
    deleteBlock: 'no_permission',
    canEdit: false,
    editBlock: 'no_permission',
    effects: [],
  };
}

export interface Page<T> {
  items: T[];
  page: number;
  totalPages: number;
  total: number;
}

/** Paginação client-side. `page` é 1-based e sempre volta dentro da faixa. */
export function paginate<T>(items: T[], page: number, perPage: number): Page<T> {
  const list = items ?? [];
  const size = perPage > 0 ? perPage : 20;
  const totalPages = Math.max(1, Math.ceil(list.length / size));
  const safePage = Math.min(Math.max(1, Math.trunc(page) || 1), totalPages);
  const start = (safePage - 1) * size;
  return {
    items: list.slice(start, start + size),
    page: safePage,
    totalPages,
    total: list.length,
  };
}
