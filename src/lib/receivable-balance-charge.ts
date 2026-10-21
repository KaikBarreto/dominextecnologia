// ─────────────────────────────────────────────────────────────────────────────
// "Cobrar o saldo" de uma CONTA A RECEBER que já existe (Asaas BYO do tenant).
//
// Espelho CLIENT-SIDE da régua que mora no banco, em
// `validate_receivable_charge_target` (chamada pela edge
// `tenant-asaas-create-charge` com `source_type = 'receivable'`). A trava de
// verdade continua sendo o servidor; aqui só evitamos que o gestor clique pra
// tomar erro na cara, e deixamos o MOTIVO visível antes do clique.
//
// Origem (chamado KGIE, 21/10/2026): o cliente recebeu R$ 253,60 de uma conta
// de R$ 352,60 e não tinha como emitir o boleto dos R$ 99,00 que faltavam
// ligado àquela conta. Nasceram cobranças soltas e o mesmo pagamento acabou
// contado duas vezes.
//
// Régua do servidor, na mesma ordem:
//   · a linha tem que ser do tenant e ser a MÃE (`entrada` sem
//     `parent_transaction_id`) — recebimento parcial é um PEDAÇO, não cobra;
//   · conta cancelada não cobra;
//   · conta já recebida não cobra (não há saldo);
//   · tem que haver SALDO em aberto (`amount - amount_received > 0`);
//   · o valor da cobrança TEM que ser exatamente o saldo (tolerância de 1
//     centavo) — por isso o valor é travado na tela, não editável. É este
//     invariante que deixa a baixa parcial ser confiável;
//   · o cliente da cobrança tem que ser o cliente da conta;
//   · não pode haver cobrança VIVA ligada à conta. Diferente das outras
//     origens, aqui isso NÃO é fim de linha: a tela oferece a substituição
//     explícita (cancela a atual, emite a nova). A edge de criação nunca mata
//     cobrança por conta própria, é decisão do gestor.
//
// Tudo aqui é função pura: sem React, sem Supabase, testável direto.
// ─────────────────────────────────────────────────────────────────────────────

/** Por que esta conta a receber não pode virar cobrança do saldo agora. */
export type ReceivableChargeBlockReason =
  | 'notReceivable'
  | 'cancelled'
  | 'paid'
  | 'noBalance'
  | 'noCustomer'
  | 'chargeOwnsReceivable';

/** Recorte de `financial_transactions` que a regra precisa enxergar. */
export interface ReceivableChargeCandidate {
  is_paid?: boolean | null;
  cancelled_at?: string | null;
  amount?: number | string | null;
  amount_received?: number | string | null;
  transaction_type?: string | null;
  parent_transaction_id?: string | null;
  customer_id?: string | null;
  /** Âncora de contrato: conta de contrato nunca morre com a cobrança. */
  contract_id?: string | null;
}

export type ReceivableChargeAvailability =
  /** Dá pra cobrar o saldo agora. `balance` é o valor TRAVADO da cobrança. */
  | { kind: 'chargeable'; customerId: string; balance: number }
  /**
   * Dá pra cobrar, MAS já existe cobrança viva ligada à conta: a ação vira
   * "substituir a cobrança" (cancelar a atual e emitir a do saldo), com
   * confirmação dizendo os dois valores. Nunca criar por cima.
   */
  | { kind: 'replace'; customerId: string; balance: number }
  /**
   * Não dá pra cobrar. `silent = true` quando a própria linha já explica o
   * motivo (selo "Recebida"/"Cancelada", linha que nem é conta a receber) — aí
   * a ação some. `silent = false` quando o motivo NÃO está visível: a tela
   * mostra a ação desabilitada + o texto do motivo, porque `title` de tooltip
   * não existe no toque.
   */
  | { kind: 'blocked'; reason: ReceivableChargeBlockReason; silent: boolean; balance: number };

/**
 * Status de cobrança que NÃO conta como cobrança viva.
 *
 * Espelha a lista do `validate_receivable_charge_target`. 'DELETED' entra aqui
 * (e NÃO entra no espelho de parcela de contrato, que nasceu antes) porque a
 * cobrança não existe mais no gateway: foi apagada no painel da Asaas e o
 * webhook só carimbou o status aqui. Tratá-la como viva prenderia a conta pra
 * sempre, sem saída na tela.
 */
const DEAD_CHARGE_STATUSES = new Set([
  'CANCELLED',
  'CANCELED',
  'REFUNDED',
  'CHARGEBACK',
  'DELETED',
]);

/** Status de cobrança que significa "esse dinheiro já entrou". */
const PAID_CHARGE_STATUSES = new Set([
  'RECEIVED',
  'CONFIRMED',
  'RECEIVED_IN_CASH',
]);

export function isLiveReceivableChargeStatus(status?: string | null): boolean {
  const normalized = (status ?? '').trim().toUpperCase();
  // Sem status legível, trata como VIVA: melhor pedir a substituição explícita
  // do que arriscar duas cobranças em aberto pro mesmo dinheiro.
  if (!normalized) return true;
  return !DEAD_CHARGE_STATUSES.has(normalized);
}

/** Como o selo de status da cobrança ligada deve ser pintado na conta. */
export type ReceivableChargeTone = 'paid' | 'overdue' | 'open' | 'dead';

export function getReceivableChargeTone(status?: string | null): ReceivableChargeTone {
  const normalized = (status ?? '').trim().toUpperCase();
  if (PAID_CHARGE_STATUSES.has(normalized)) return 'paid';
  if (DEAD_CHARGE_STATUSES.has(normalized)) return 'dead';
  if (normalized === 'OVERDUE') return 'overdue';
  return 'open';
}

/** Número tolerante a string do PostgREST (numeric vira string em alguns casos). */
function toNumber(value: number | string | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Saldo em aberto da conta: `amount - amount_received`, em 2 casas.
 *
 * É ESTE número que vai no `value` da cobrança (a edge recusa qualquer outro,
 * com tolerância de 1 centavo). Arredondar aqui, e não só na exibição, evita
 * que a soma em ponto flutuante (352.60 - 253.60 = 98.99999999999999) viaje pro
 * servidor e caia em `value_mismatch`.
 */
export function getReceivableBalance(receivable: ReceivableChargeCandidate): number {
  const balance = toNumber(receivable.amount) - toNumber(receivable.amount_received);
  return Number(balance.toFixed(2));
}

export interface ReceivableChargeOptions {
  /** Já existe cobrança viva ligada a esta conta (ver `isLiveReceivableChargeStatus`). */
  hasLiveCharge?: boolean;
  /**
   * A cobrança viva é a MESMA que a conta aponta em `tenant_charge_id`, isto é,
   * esta conta é o ESPELHO dela. Só nesse caso cancelar a cobrança pode apagar
   * a conta (ver `survivesChargeCancellation`).
   */
  liveChargeIsReceivableMirror?: boolean;
}

/**
 * A conta SOBREVIVE ao cancelamento da cobrança que ela espelha?
 *
 * Espelho de `tenant_charge_mirror_classification` (a régua `keep_it` do
 * banco): o espelho financeiro de uma cobrança só é preservado quando tem
 * dinheiro, nota, orçamento ou contrato em cima. Sem âncora nenhuma, cancelar a
 * cobrança APAGA a conta — e aí "substituir a cobrança" sumiria justamente com
 * a conta que o gestor está tentando cobrar.
 *
 * Deliberadamente CONSERVADOR: NFS-e e orçamento também ancoram no banco, mas
 * esses vínculos não vêm na linha (moram em `nfse_emissions.financial_transaction_id`
 * e `quotes.financial_transaction_id`). Na dúvida respondemos "não sobrevive",
 * porque bloquear uma substituição que seria segura custa um clique a mais,
 * enquanto liberar uma que não é custa a conta do cliente.
 */
export function survivesChargeCancellation(receivable: ReceivableChargeCandidate): boolean {
  return receivable.is_paid === true
    || toNumber(receivable.amount_received) > 0
    || !!receivable.contract_id;
}

export function getReceivableChargeAvailability(
  receivable: ReceivableChargeCandidate,
  options: ReceivableChargeOptions = {},
): ReceivableChargeAvailability {
  const { hasLiveCharge = false, liveChargeIsReceivableMirror = false } = options;
  const balance = getReceivableBalance(receivable);

  // 1) Linha que não é conta a receber (saída, ou filha de recebimento
  //    parcial). Ligar a filha quebraria
  //    `ux_financial_transactions_one_mother_per_charge`. Motivo já visível.
  if (receivable.transaction_type !== 'entrada' || receivable.parent_transaction_id) {
    return { kind: 'blocked', reason: 'notReceivable', silent: true, balance };
  }

  // 2) Conta cancelada — a linha já mostra "Cancelada".
  if (receivable.cancelled_at) {
    return { kind: 'blocked', reason: 'cancelled', silent: true, balance };
  }

  // 3) Conta já recebida — a linha já mostra o selo "Recebida".
  if (receivable.is_paid === true) {
    return { kind: 'blocked', reason: 'paid', silent: true, balance };
  }

  // 4) Sem saldo em aberto. Não é óbvio na linha quando `amount_received`
  //    alcançou o `amount` e a conta ainda não foi fechada.
  if (balance <= 0) {
    return { kind: 'blocked', reason: 'noBalance', silent: false, balance };
  }

  // 5) Cliente. A edge exige que a cobrança seja do cliente DA CONTA, e sem
  //    cliente não há ninguém pra cobrar. Vem antes da cobrança viva de
  //    propósito: cancelar a atual não resolveria nada aqui.
  const customerId = receivable.customer_id ?? null;
  if (!customerId) {
    return { kind: 'blocked', reason: 'noCustomer', silent: false, balance };
  }

  // 6) Cobrança viva: dá pra cobrar o saldo, mas só substituindo a atual.
  if (hasLiveCharge) {
    // ...exceto quando a conta é o ESPELHO dessa cobrança e não tem nada que a
    // ancore: cancelar apagaria a conta junto (régua `keep_it` do banco), e a
    // cobrança nova nasceria apontando pra uma linha que não existe mais.
    // Nesse estado a substituição também não resolveria nada: nada foi
    // recebido, então o "saldo" é o valor inteiro, que a cobrança em aberto já
    // cobra. O caminho certo é editar ou excluir a cobrança na aba Cobranças.
    if (liveChargeIsReceivableMirror && !survivesChargeCancellation(receivable)) {
      return { kind: 'blocked', reason: 'chargeOwnsReceivable', silent: false, balance };
    }
    return { kind: 'replace', customerId, balance };
  }

  return { kind: 'chargeable', customerId, balance };
}

/**
 * Vencimento com que a cobrança do saldo nasce: o da conta, ou HOJE quando a
 * conta já venceu (a edge recusa vencimento no passado). Datas em `yyyy-mm-dd`,
 * comparadas como texto — formato ISO ordena igual a calendário.
 */
export function resolveReceivableChargeDueDate(
  receivableDueDate: string | null | undefined,
  todayIso: string,
): string {
  const due = (receivableDueDate ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return todayIso;
  return due < todayIso ? todayIso : due;
}
