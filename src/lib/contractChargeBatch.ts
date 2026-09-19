// ─────────────────────────────────────────────────────────────────────────────
// Gerar cobrança online de VÁRIAS parcelas de contrato de uma vez.
//
// Por que existe um módulo puro pra isso, e não só um laço na tela:
//
// 1. **A operação é irreversível.** Cada volta do laço cria uma cobrança de
//    verdade na Asaas. Errar quem entra no lote não é um bug de UI, é uma
//    cobrança indevida na cara do cliente do nosso cliente. Decidir QUEM entra
//    tem que ser testável sem navegador.
//
// 2. **As regras já existem e não podem ser copiadas.** Quem decide se uma
//    parcela vira cobrança é `getInstallmentChargeAvailability`
//    (src/lib/contract-installment-charge.ts), espelho das validações da edge
//    `tenant-asaas-create-charge`. Reescrever "se não está paga e tem valor"
//    aqui criaria uma SEGUNDA regra que envelheceria sozinha — e o lote é
//    justamente o caminho onde um furo se multiplica por 24. Este módulo não
//    tem nenhuma regra de elegibilidade própria: ele só ORGANIZA o que aquela
//    função responde.
//
// 3. **O usuário precisa saber o que vai acontecer ANTES.** A confirmação diz
//    "gerar N cobranças, R$ X no total" e lista quantas foram puladas e por
//    quê. Esses números saem daqui, da mesma função que monta a fila — nunca
//    de uma contagem paralela que pode divergir da execução.
//
// Tudo aqui é puro: sem React, sem Supabase, sem rede.
// ─────────────────────────────────────────────────────────────────────────────
import {
  getInstallmentChargeAvailability,
  type InstallmentChargeBlockReason,
  type InstallmentChargeCandidate,
} from './contract-installment-charge';

/**
 * Teto de cobranças por rodada.
 *
 * 24 é o MESMO número do lote por rodada do cron de cobrança contínua
 * (`v_max_new` em 20260919250000), e não por coincidência: um contrato
 * contínuo mantém ~24 parcelas futuras materializadas, então 24 cobre
 * "cobrar tudo que existe" num clique só no caso normal.
 *
 * Existe porque o caso normal não é o único: um contrato fechado de 10 anos
 * tem 120 parcelas, e 120 chamadas sequenciais a um gateway são minutos de aba
 * aberta numa operação que não tem desfazer. Acima do teto o lote NÃO descarta
 * nada em silêncio — cobra as 24 de vencimento mais próximo e diz na tela
 * quantas ficaram pra próxima rodada.
 */
export const MAX_CHARGES_PER_BATCH = 24;

/**
 * Falhas CONSECUTIVAS que abortam a rodada.
 *
 * O lote continua depois de uma falha (ver `shouldAbortBatch`), mas três
 * seguidas não são azar de parcela: é a conta/gateway (token inválido, conta
 * suspensa, rate limit). Insistir 120 vezes contra um gateway quebrado é
 * exatamente como se toma bloqueio no meio de uma operação irreversível.
 */
export const CONSECUTIVE_FAILURES_TO_ABORT = 3;

/** Por que uma parcela ficou de fora do lote. */
export type BatchSkipReason =
  /** Já existe cobrança viva ligada a ela (a edge devolveria a mesma). */
  | 'alreadyCharged'
  /** Acima do teto da rodada. Não é recusa: é "fica pra próxima". */
  | 'overCap'
  | InstallmentChargeBlockReason;

/** O que o lote precisa enxergar de cada parcela. */
export type BatchInstallment = InstallmentChargeCandidate & {
  id: string;
  due_date?: string | null;
  description?: string | null;
};

export interface BatchQueueEntry<T> {
  installment: T;
  /** Cliente que a edge vai exigir — vem da própria regra, não do palpite. */
  customerId: string;
  /** Valor da parcela. TRAVADO: a edge recusa cobrança de valor diferente. */
  value: number;
}

export interface BatchSkipEntry<T> {
  installment: T;
  reason: BatchSkipReason;
}

export interface BatchPartition<T> {
  /** Fila na ordem em que será executada: vencimento mais antigo primeiro. */
  queue: BatchQueueEntry<T>[];
  /** Fora da rodada, com o motivo. Inclui as que passaram do teto. */
  skipped: BatchSkipEntry<T>[];
  /** Soma dos valores da fila. É o "R$ X no total" da confirmação. */
  total: number;
  /** Quantas ficaram pra próxima rodada só por causa do teto. */
  deferredCount: number;
}

function toNumber(value: number | string | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Separa as parcelas escolhidas entre "vira cobrança agora" e "fica de fora,
 * por este motivo".
 *
 * A elegibilidade é 100% de `getInstallmentChargeAvailability`. O que este
 * módulo acrescenta é só ordem (vencimento mais antigo primeiro, pra o teto
 * cortar o menos urgente e não o mais) e o teto em si.
 */
export function partitionInstallmentsForBatch<T extends BatchInstallment>(
  installments: T[],
  options: {
    /** Cliente do contrato — fallback quando a parcela nasceu sem `customer_id`. */
    contractCustomerId?: string | null;
    /** Mesma função que a tela já usa pra travar edição de valor. */
    hasLiveCharge: (installment: T) => boolean;
    cap?: number;
  },
): BatchPartition<T> {
  const cap = Math.max(1, Math.floor(options.cap ?? MAX_CHARGES_PER_BATCH));
  const eligible: BatchQueueEntry<T>[] = [];
  const skipped: BatchSkipEntry<T>[] = [];

  for (const installment of installments) {
    const availability = getInstallmentChargeAvailability(installment, {
      contractCustomerId: options.contractCustomerId ?? null,
      hasLiveCharge: options.hasLiveCharge(installment),
    });
    if (availability.kind === 'chargeable') {
      eligible.push({
        installment,
        customerId: availability.customerId,
        // Valor da parcela, sem arredondar nem ajustar: a edge recusa valor
        // diferente, e cobrar a menos daria baixa na parcela INTEIRA.
        value: toNumber(installment.amount),
      });
      continue;
    }
    skipped.push({
      installment,
      reason: availability.kind === 'charged' ? 'alreadyCharged' : availability.reason,
    });
  }

  // Vencimento mais antigo primeiro. Parcela sem data vai pro fim (não tem
  // urgência conhecida, e é a que menos dói ficar pra próxima rodada).
  eligible.sort((a, b) => {
    const da = (a.installment.due_date ?? '').slice(0, 10) || '9999-12-31';
    const db = (b.installment.due_date ?? '').slice(0, 10) || '9999-12-31';
    return da < db ? -1 : da > db ? 1 : 0;
  });

  const queue = eligible.slice(0, cap);
  const deferred = eligible.slice(cap);
  for (const entry of deferred) {
    skipped.push({ installment: entry.installment, reason: 'overCap' });
  }

  return {
    queue,
    skipped,
    total: round2(queue.reduce((sum, entry) => sum + entry.value, 0)),
    deferredCount: deferred.length,
  };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Contagem de parcelas puladas por motivo, pra a confirmação explicar. */
export function countSkipReasons<T>(skipped: BatchSkipEntry<T>[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const entry of skipped) {
    counts[entry.reason] = (counts[entry.reason] ?? 0) + 1;
  }
  return counts;
}

export interface BatchFailure {
  installmentId: string;
  /** Descrição da parcela, pra o resumo dizer QUAL falhou e não só "uma". */
  label: string;
  /** Mensagem que veio da Asaas/edge, sem reescrever. */
  message: string;
}

export interface BatchRunResult {
  created: number;
  /** Criadas na Asaas mas sem registro nosso (HTTP 207). Sucesso PARCIAL. */
  orphans: number;
  failures: BatchFailure[];
  /** A rodada parou antes do fim por falhas consecutivas. */
  aborted: boolean;
  /** Quantas da fila nem chegaram a ser tentadas (só com `aborted`). */
  notAttempted: number;
}

/**
 * Parar ou continuar depois de uma falha?
 *
 * **Continua** — decisão escrita aqui pra não virar discussão de novo. Cada
 * parcela é uma cobrança independente: parar na 7a deixa 6 criadas e 6 não,
 * que é EXATAMENTE o mesmo estado parcial de continuar, só que sem o trabalho
 * feito e sem o usuário saber onde parou. Continuando, uma rodada devolve o
 * quadro completo (o que entrou, o que falhou e por quê) e o botão pode ser
 * clicado de novo: o dedupe por `source_id` na edge pula as que já existem, em
 * vez de duplicar.
 *
 * **Menos quando não é azar de parcela.** Três falhas SEGUIDAS não são três
 * parcelas ruins, é a conta ou o gateway (token inválido, conta suspensa,
 * rate limit). A partir daí insistir só piora, então a rodada aborta e diz
 * quantas nem foram tentadas.
 */
export function shouldAbortBatch(consecutiveFailures: number): boolean {
  return consecutiveFailures >= CONSECUTIVE_FAILURES_TO_ABORT;
}

/** Rótulo curto da parcela pro resumo de falhas (nunca string vazia). */
export function batchFailureLabel(
  installment: { description?: string | null; due_date?: string | null },
  fallback: string,
): string {
  const desc = (installment.description ?? '').trim();
  if (desc) return desc;
  const due = (installment.due_date ?? '').slice(0, 10);
  return due || fallback;
}
