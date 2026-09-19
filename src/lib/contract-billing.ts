/**
 * Regras da COBRANÇA de contrato (a receber), incluindo a cobrança CONTÍNUA.
 *
 * Por que este módulo existe (e por que é puro):
 *
 * 1. **A tela precisa concordar com o banco, ao dia.** A extensão da janela
 *    rolante roda no Postgres (`extend_indeterminate_contract_billing`, cron
 *    `extend-contract-billing-daily`, migration 20260919250000). Se a conta de
 *    "quantas parcelas nascem agora" ficasse solta no componente, a tela
 *    prometeria um número e o cron entregaria outro na manhã seguinte. Aqui a
 *    conta é uma só, testada.
 *
 * 2. **Duas telas geram a MESMA série.** A etapa Financeiro do
 *    `ContractFormDialog` (criação) e o modal "Nova receita" do
 *    `ContractDetail` (contrato que já existe) montam parcelas do mesmo jeito.
 *    Antes cada uma repetia o mapa de frequências e o formato da descrição.
 *
 * 3. **Os três campos da regra nunca podem viajar separados.** O banco tem
 *    `CHECK contracts_finance_indeterminate_requires_rule`: marcar
 *    `finance_indeterminate` sem `finance_interval_months` +
 *    `finance_anchor_date` é erro de gravação. `buildContractFinanceRule` é o
 *    único jeito de montar esse trio, e ele falha ALTO (throw) antes de chegar
 *    no banco — silêncio em faturamento é o pior desfecho possível.
 *
 * Tudo aqui é puro: sem React, sem Supabase, sem `Date.now()` implícito. Datas
 * são strings `YYYY-MM-DD` (dia de calendário de Brasília).
 */
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { addMonthsISO } from './finance-installments';

/**
 * Cadência de COBRANÇA (passo em MESES DE CALENDÁRIO). Fonte única das duas
 * telas que geram parcela de contrato. `unica` = 0 = não repete.
 *
 * NÃO confundir com a frequência das VISITAS (`frequency_type`/
 * `frequency_value` + `horizon_months`): um contrato pode ter visita
 * trimestral e cobrança mensal, e o horizonte de visitas continua mandando nas
 * OSs mesmo com a cobrança contínua ligada.
 */
export const FINANCE_FREQUENCY_MONTHS: Record<string, number> = {
  unica: 0,
  mensal: 1,
  bimestral: 2,
  trimestral: 3,
  semestral: 6,
  anual: 12,
};

/**
 * Horizonte da janela rolante, em meses. Tem que ser IDÊNTICO ao
 * `v_horizon_months` da função no Postgres (migration 20260919250000): é ele
 * que decide até onde o cron materializa parcela.
 */
export const CONTINUOUS_BILLING_HORIZON_MONTHS = 24;

/**
 * Quantas parcelas o LOTE INICIAL cria quando a cobrança contínua é ligada.
 *
 * `floor(24 / passo) + 1`. Mensal 25, bimestral 13, trimestral 9, semestral 5,
 * anual 3.
 *
 * O `+1` NÃO é arredondamento defensivo, é o que faz tela e cron concordarem
 * no dia 1: o horizonte do cron é relativo a HOJE (`hoje + 24 meses`) e a
 * grade de datas é relativa à ÂNCORA (o primeiro vencimento). Com a âncora
 * caindo hoje ou depois, o ponto `âncora + 24 meses` ainda está DENTRO do
 * horizonte — sem o `+1` o usuário criaria 24 parcelas e veria 25 na manhã
 * seguinte, sem ter pedido nada. Com ele, a primeira rodada do cron sai por
 * `window_covered` e não insere nada.
 */
export function continuousInitialCount(intervalMonths: number): number {
  const step = Math.floor(Number(intervalMonths) || 0);
  if (step < 1) return 1;
  return Math.floor(CONTINUOUS_BILLING_HORIZON_MONTHS / step) + 1;
}

/**
 * Última data da grade de `count` parcelas ancorada em `anchorDate`.
 * Mês de CALENDÁRIO com clamp de fim de mês (31/01 → 28/02), medido sempre
 * DESDE a âncora — igual ao `anchor + (k * step) months` do Postgres.
 */
export function continuousLastDueDate(
  anchorDate: string,
  intervalMonths: number,
  count: number,
): string {
  const step = Math.max(0, Math.floor(Number(intervalMonths) || 0));
  const n = Math.max(1, Math.floor(Number(count) || 1));
  return addMonthsISO(anchorDate, (n - 1) * step);
}

/** `'2026-09-30'` → `'set/2026'` (pt-BR, minúsculo, sem ponto). */
export function billingMonthLabel(isoDate: string): string {
  return format(new Date(`${isoDate}T12:00:00`), 'MMM/yyyy', { locale: ptBR });
}

/**
 * Descrição de uma parcela de contrato.
 *
 * - Série FECHADA (o usuário escolheu quantas): `"Mensalidade - set/2026 (3/12)"`.
 *   O `(n/total)` só faz sentido porque o total é conhecido.
 * - Série CONTÍNUA: `"Mensalidade - set/2026"`, SEM `(n/total)` — numerar sobre
 *   um total que não existe é mentira, e o cron (que continua a série) também
 *   não sabe numerar. O formato do mês é exatamente o mesmo que o Postgres
 *   escreve (`v_month_abbr`), senão o regex que o cron usa pra extrair a base
 *   da descrição não casaria e a série passaria a duplicar o rótulo.
 * - Lançamento único (1 parcela, série fechada): só a base, sem mês.
 *
 * O mês é sempre pt-BR, independente do idioma da interface: é DADO gravado em
 * `financial_transactions.description`, lido pelo cron, não copy de tela.
 */
export function contractInstallmentDescription(args: {
  base: string;
  date: string;
  number: number;
  total: number;
  continuous: boolean;
}): string {
  const base = (args.base ?? '').trim();
  if (!args.continuous && args.total <= 1) return base;
  const month = billingMonthLabel(args.date);
  if (args.continuous) return `${base} - ${month}`;
  return `${base} - ${month} (${args.number}/${args.total})`;
}

export interface ContractFinanceRule {
  finance_indeterminate: boolean;
  finance_interval_months: number | null;
  finance_anchor_date: string | null;
}

export type ContractFinanceRuleInput =
  | { indeterminate: false }
  | { indeterminate: true; intervalMonths: number; anchorDate: string };

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Monta o trio da regra de cobrança contínua. É o ÚNICO lugar do front que
 * produz esses três campos — por construção eles nunca viajam separados.
 *
 * Falha ALTO quando pedem "contínuo" sem passo ou sem âncora: o `CHECK` do
 * banco recusaria de qualquer jeito, e estourar aqui dá uma mensagem em PT-BR
 * em vez de um erro cru de constraint. Na prática é inalcançável — a tela
 * desabilita o interruptor em frequência "única" (passo 0) e o primeiro
 * vencimento sempre tem valor.
 *
 * Desligar grava só `false`: os outros dois ficam como estavam (o `CHECK` só
 * exige a regra quando a flag está ligada), e preservá-los deixa o histórico
 * de qual era o dia de vencimento combinado.
 */
export function buildContractFinanceRule(input: ContractFinanceRuleInput): ContractFinanceRule {
  if (!input.indeterminate) {
    return {
      finance_indeterminate: false,
      finance_interval_months: null,
      finance_anchor_date: null,
    };
  }
  const step = Math.floor(Number(input.intervalMonths) || 0);
  if (!Number.isFinite(step) || step < 1 || step > 12) {
    throw new Error(
      'Cobrança contínua exige uma frequência de cobrança que se repita (mensal a anual).',
    );
  }
  if (!input.anchorDate || !ISO_DAY.test(input.anchorDate)) {
    throw new Error('Cobrança contínua exige a data do primeiro vencimento.');
  }
  return {
    finance_indeterminate: true,
    finance_interval_months: step,
    finance_anchor_date: input.anchorDate,
  };
}

/**
 * A DECISÃO inteira da regra de cobrança, a partir do que a tela tem em mão.
 *
 * As duas telas que geram parcela de contrato (etapa Financeiro do wizard e
 * modal da aba Financeiro) chamam ESTA função, nunca `buildContractFinanceRule`
 * direto: é aqui que mora a guarda de que frequência "única" jamais vira
 * contínuo, e é isso que garante que a flag nunca chegue ao banco sem o passo
 * e a âncora.
 *
 * `frequency` é a chave de `FINANCE_FREQUENCY_MONTHS` ('mensal', 'anual'...).
 */
export function resolveContractBillingRule(args: {
  /** O usuário pediu pra gerar parcelas agora? Sem isso não há série nenhuma. */
  generate: boolean;
  /** O interruptor "sem prazo para terminar" está ligado? */
  continuous: boolean;
  frequency: string;
  /** Primeiro vencimento (`YYYY-MM-DD`) — vira a âncora da grade. */
  firstDue: string;
}): ContractFinanceRule {
  const step = FINANCE_FREQUENCY_MONTHS[args.frequency] ?? 0;
  // Cobrança única não repete: não existe "próxima" pra renovar. O interruptor
  // fica desabilitado na tela, e aqui a decisão é reforçada pra um estado de
  // UI velho (rascunho salvo com contínuo + frequência trocada depois) não
  // conseguir montar uma regra impossível.
  if (!args.generate || !args.continuous || step < 1 || !args.firstDue) {
    return buildContractFinanceRule({ indeterminate: false });
  }
  return buildContractFinanceRule({
    indeterminate: true,
    intervalMonths: step,
    anchorDate: args.firstDue,
  });
}

/**
 * Primeiro vencimento que NÃO nasce vencido.
 *
 * Contrato ligado à cobrança meses (ou anos) depois de criado não pode virar
 * uma enxurrada de parcelas retroativas de uma vez: 19 contratos ativos da
 * base estão exatamente nessa situação, e um deles é de 2 anos atrás. Esta
 * função mantém o DIA do vencimento combinado (o dia de `startDate`, com clamp
 * de fim de mês) e empurra a grade pra frente até alcançar hoje.
 *
 * É só o DEFAULT da tela: o campo continua editável, então quem realmente quer
 * cobrar o período passado escolhe a data à mão, de propósito.
 */
export function nextNonRetroactiveDue(args: {
  startDate: string;
  intervalMonths: number;
  today: string;
}): string {
  const { startDate, today } = args;
  if (!ISO_DAY.test(startDate ?? '')) return today;
  if (startDate >= today) return startDate;
  const step = Math.floor(Number(args.intervalMonths) || 0);
  // Frequência "única" (passo 0) não tem grade pra avançar: o dia é hoje.
  if (step < 1) return today;
  // Chute pela diferença de meses e correção curta — evita laço longo em
  // contrato antigo (mesma estratégia do `v_k` no Postgres).
  const months =
    (Number(today.slice(0, 4)) * 12 + Number(today.slice(5, 7))) -
    (Number(startDate.slice(0, 4)) * 12 + Number(startDate.slice(5, 7)));
  let k = Math.max(0, Math.floor(months / step) - 1);
  let candidate = addMonthsISO(startDate, k * step);
  // Guarda dura: 600 passos cobrem 50 anos de mensalidade.
  for (let i = 0; i < 600 && candidate < today; i += 1) {
    k += 1;
    candidate = addMonthsISO(startDate, k * step);
  }
  return candidate;
}
