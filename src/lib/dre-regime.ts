/**
 * Motor de REGIME da DRE — caixa vs competência.
 *
 * Estas funções moravam dentro de `FinanceDRE.tsx` como funções privadas, sem
 * teste nenhum. São o coração do relatório de resultado: se elas erram, o
 * cliente manda pro contador um número errado e ninguém percebe. Vivem aqui
 * fora, puras, pra terem rede de proteção.
 *
 * ⚠️ NÃO UNIFIQUE COM `@/lib/finance-date`.
 * `getEffectiveTransactionDate`/`isTransactionInDateRange` de lá começam com
 * `if (txn.credit_card_bill_date) return txn.credit_card_bill_date;` — ou seja,
 * jogam toda compra de cartão no mês da FATURA. Essa é a data certa pras telas
 * de Movimentações/Contas a Pagar (é quando o cliente precisa ter o dinheiro),
 * mas é uma TERCEIRA data do ponto de vista da DRE: não é a da compra
 * (Competência) nem a do pagamento (Caixa).
 *
 * Cartão que fecha dia 20: compra em 25/08 → fatura de setembro → paga em
 * 15/09. O helper genérico diz "setembro"; a DRE em Competência precisa de
 * "agosto". O corte da DRE é o daqui, regido pelo regime ativo.
 */

import { PARTIAL_RECEIPT_CATEGORY } from '@/lib/finance-constants';
import { todayInTz } from '@/lib/timezone';

/**
 * Regime da DRE:
 * - 'caixa'       — o mês é o mês em que o dinheiro saiu/entrou (paid_date).
 *                   Só entra o que já foi pago/recebido.
 * - 'competencia' — o mês é o mês do fato gerador (transaction_date). Entra
 *                   pago ou não.
 */
export type DreRegime = 'caixa' | 'competencia';

/** Só o que o motor precisa ler — evita amarrar o módulo ao type completo. */
export interface DreTransactionLike {
  transaction_date?: string | null;
  paid_date?: string | null;
  amount?: number | string | null;
  amount_received?: number | string | null;
  /**
   * Valor de COMPETÊNCIA da folha (bruto do ciclo, antes do abatimento de
   * vales). Só a folha preenche; em todo o resto do banco é null e a DRE
   * continua lendo `amount`. Ver `getDreAmount`.
   */
  accrual_amount?: number | string | null;
  category?: string | null;
  transaction_type?: string | null;
  parent_transaction_id?: string | null;
  payroll_kind?: string | null;
}

export interface DreDateRange {
  from?: Date;
  to?: Date;
}

/**
 * Data que define em qual mês o lançamento entra na DRE.
 *
 * Usada nos TRÊS pontos que dependem de data (corte por `dre_start_date`,
 * filtro do período e agrupamento mensal do gráfico) — se o agrupamento usasse
 * outra data que o filtro, o gráfico discordaria da tabela no mesmo período.
 *
 * No regime Caixa cai pra `transaction_date` quando `paid_date` está vazio:
 * hoje toda transação paga tem `paid_date`, mas o fallback impede que uma linha
 * suma da DRE caso algum caminho futuro esqueça de gravar a data.
 */
export function getDreEffectiveDate(t: DreTransactionLike, regime: DreRegime): string | null {
  if (regime === 'caixa') return t.paid_date || t.transaction_date || null;
  return t.transaction_date || null;
}

/**
 * Parse local ao meio-dia pra `YYYY-MM-DD` não sofrer shift de fuso (compra do
 * dia 02 virar 01).
 */
export function parseDreDate(raw: string): Date {
  return raw.length === 10 ? new Date(raw + 'T12:00:00') : new Date(raw);
}

/**
 * Corte de período da DRE. Range vazio (preset "Todos os tempos") passa tudo.
 * Bordas são INCLUSIVAS — o `DateRangeFilter` entrega `from` no começo do dia e
 * `to` no fim do dia.
 */
export function isInDreRange(effective: string | null, range?: DreDateRange): boolean {
  if (!range?.from && !range?.to) return true;
  if (!effective) return false;
  const d = parseDreDate(effective);
  if (isNaN(d.getTime())) return false;
  if (range?.from && d < range.from) return false;
  if (range?.to && d > range.to) return false;
  return true;
}

/**
 * Linha FILHA de "Recebimento parcial"? Mesmo predicado triplo do gatilho
 * `trg_recalc_amount_received` no banco (categoria + tipo + tem mãe).
 */
export function isPartialReceiptChild(t: DreTransactionLike): boolean {
  return (
    !!t.parent_transaction_id &&
    t.category === PARTIAL_RECEIPT_CATEGORY &&
    t.transaction_type === 'entrada'
  );
}

/**
 * Linha de VALE (adiantamento de salário)?
 *
 * O vale é dinheiro que sai hoje por conta de uma folha futura: é EVENTO DE
 * CAIXA contra uma obrigação, não fato gerador novo — exatamente o papel da
 * filha de "Recebimento parcial", só que do lado da saída. O fato gerador é a
 * folha do ciclo, que vale o BRUTO (ver `accrual_amount`).
 *
 * Em Competência ele é excluído: contar vale + folha bruta dobraria o custo do
 * funcionário. Em Caixa ele fica (é o dinheiro que saiu no mês dele) e a folha
 * entra pelo líquido, que é o que sobrou pra sair.
 *
 * Predicado deliberadamente simples (`payroll_kind` + tipo), sem depender de
 * vínculo com a folha: o vale nasce antes de a folha do ciclo existir em vários
 * casos, e amarrar a exclusão a um `parent_transaction_id` faria o corte falhar
 * em silêncio justamente nesses.
 */
export function isPayrollAdvance(t: DreTransactionLike): boolean {
  return t.payroll_kind === 'vale' && t.transaction_type === 'saida';
}

/**
 * Valor que a linha vale NA DRE, por regime.
 *
 * Existe por causa do recebimento parcial. Modelo do banco: a conta MÃE guarda
 * o valor cheio (`amount`) pra sempre; cada recebimento vira uma linha filha
 * "Recebimento parcial" e o gatilho só acumula a soma delas em
 * `amount_received` (e liga `is_paid` quando cobrem o total). Ou seja, quando
 * há filhas o mesmo dinheiro está representado DUAS vezes.
 *
 * - Competência: o fato gerador é a mãe. Ela vale `amount` cheio e as filhas
 *   são excluídas do conjunto (não são fato novo, são caixa).
 * - Caixa: o que conta é o dinheiro que se moveu. Cada filha vale o que ela
 *   recebeu; a mãe vale só o RESTO que não veio por filha
 *   (`amount - amount_received`). Sem esse desconto:
 *     · mãe quitada por filhas → mãe 1000 + filhas 1000 = 2000 (dobra);
 *     · mãe com 300 em filhas e o resto quitado pelo botão "marcar como pago"
 *       (que NÃO cria filha) → excluir a mãe inteira perderia os 700.
 *   O desconto acerta os dois casos com a mesma conta.
 *
 * Linha sem recebimento parcial (`amount_received` ausente ou 0) devolve
 * exatamente `amount` — nada muda pra 99% do banco.
 *
 * FOLHA DE PAGAMENTO — mesma doença, remédio espelhado. Aqui o campo que muda
 * de valor é o `amount`: ele nasce com o salário previsto e, no pagamento, é
 * reescrito pro LÍQUIDO (salário + bônus − faltas − vales; no CLT, o líquido do
 * holerite). Isso é o certo pro CAIXA — é o dinheiro que de fato saiu da conta,
 * e é o mesmo número que o saldo bancário e o extrato leem. Mas é errado pra
 * COMPETÊNCIA: o custo do ciclo não diminui porque parte dele já saiu como
 * vale. Por isso a folha grava o bruto do ciclo em `accrual_amount`, e a
 * Competência lê esse campo quando ele existe:
 *
 *   vale 800 (out) + folha líquida 2.200 (nov)     → Caixa       = 3.000 ✓
 *   vale excluído  + folha accrual 3.000 (nov)     → Competência = 3.000 ✓
 *
 * `accrual_amount` ausente (todo o resto do banco, e toda folha que ainda não
 * foi paga — que já carrega o bruto no próprio `amount`) devolve `amount`.
 *
 * `hasPartialReceiptChild`: quem chama precisa provar que existe, no conjunto
 * TODO (sem filtro de período/regime), pelo menos uma filha
 * `isPartialReceiptChild` com este `id` como `parent_transaction_id`. Sem essa
 * prova, `amount_received` é tratado como não-confiável e o desconto NUNCA é
 * aplicado — mesmo que o campo esteja preenchido. Existe porque pelo menos uma
 * baixa fora deste módulo (RPC `apply_tenant_charge_payment`, cobrança via
 * Asaas) grava `amount_received = amount` na quitação total, sem nunca criar a
 * filha — violando o contrato documentado da coluna no banco ("soma das
 * filhas... sempre 0 em filhas"). Sem esta prova, a mãe zerava e sumia do
 * Caixa mesmo com `paid_date` certo.
 */
/**
 * Trava de ENTRADA de data de pagamento, no FUSO DA EMPRESA.
 *
 * "Já foi pago" (ou "já foi recebido") é sempre PASSADO, por definição: não
 * existe dinheiro que já se moveu amanhã. Trava única dos 3 lugares que capturam
 * uma data de pagamento JÁ EFETIVADO: o campo "Data do pagamento" do
 * `TransactionFormDialog` (com "Já foi pago" ligado), o "Confirmar pagamento" de
 * despesa (`FinanceContas`) e o "Confirmar recebimento" de receita
 * (`ReceivePaymentModal`). Print do sócio: 16/10/2026 (futuro) aceito nos dois, e
 * o pagamento futuro já aparecia como realizado na DRE em Regime de Caixa, num
 * período que ainda não aconteceu.
 *
 * `previousDateIso`: dado GRAVADO antes desta trava existir (e existe, em
 * produção) não pode travar uma edição que a pessoa não pediu. Abrir um
 * lançamento antigo com `paid_date` no futuro só pra corrigir a descrição não
 * pode empacar num erro que o usuário não criou. Por isso: se a data não MUDOU
 * em relação à que já estava salva, ela passa mesmo estando no futuro. Só uma
 * mudança PARA uma data futura (nova ou diferente da gravada) é barrada.
 * Comparação lexicográfica funciona porque o formato é sempre YYYY-MM-DD.
 *
 * Por que o fuso entra por PARÂMETRO: a versão antiga
 * (`isPaidDateAllowed`, do extinto `@/lib/today-brazil`) comparava contra "hoje em
 * America/Sao_Paulo" chumbado. Empresa em Cuiabá (UTC-4) às 23h15 do dia 30 tem
 * "hoje" = dia 30, e São Paulo já está no 31: a trava ficava frouxa. Pior no
 * outro sentido, e o app oferece esses fusos na config Regional: empresa em
 * Europe/Lisbon (UTC+1) à 01h do dia 1º tem "hoje" = dia 1º enquanto São Paulo
 * ainda marca 30, e a trava BARRAVA o próprio dia de hoje, deixando o botão
 * "Confirmar" morto por 4 horas por dia. Fuso vazio ou inválido cai em
 * America/Sao_Paulo sem lançar (ver `safeTimeZone`).
 *
 * Mora aqui, e não num módulo de data genérico, porque é REGRA DE NEGÓCIO
 * financeira, não primitiva de fuso. O antigo `@/lib/today-brazil` foi
 * aposentado em 2026-09-17 justamente por chumbar America/Sao_Paulo. É o gêmeo de ENTRADA do
 * `isFutureCashDate` logo abaixo, que é o fail-safe de LEITURA da mesma regra.
 */
export function isPaidDateAllowedInTz(
  dateIso: string | null | undefined,
  timeZone: string | null | undefined,
  previousDateIso?: string | null,
): boolean {
  if (!dateIso) return true;
  if (dateIso <= todayInTz(timeZone)) return true;
  return !!previousDateIso && dateIso === previousDateIso;
}

/**
 * Caixa é dinheiro que JÁ se moveu — por definição não existe "caixa do mês
 * que vem". `isPaidDateAllowedInTz` (acima) trava a ENTRADA de uma data de
 * pagamento futura na tela; esta função é o fail-safe do lado da
 * LEITURA: mesmo que um `paid_date` no futuro já esteja gravado no banco (dado
 * anterior à trava, ou uma brecha que passou por ela), a DRE em Caixa não pode
 * contar esse dinheiro antes do dia chegar.
 *
 * Achado real: filtro até 30/10, pagamento marcado pra 16/10 (ainda no
 * futuro na data em que o relatório foi aberto) contando como resultado
 * realizado do período — um mês que ainda não tinha acontecido.
 *
 * Não se aplica à Competência: lá o fato PODE ser futuro por natureza (conta
 * agendada, parcela que ainda vai vencer) — é assim que a Competência sempre
 * funcionou (`entra pago ou não`), e essa não foi a reclamação.
 *
 * `today` entra por parâmetro (em vez de ler o relógio aqui dentro) pra função
 * continuar pura e testável. Quem chama usa `todayInTz(timezone)`, com o fuso
 * DA EMPRESA vindo do `useAppLocaleContext`.
 */
export function isFutureCashDate(effective: string | null, regime: DreRegime, today: string): boolean {
  if (regime !== 'caixa' || !effective) return false;
  return parseDreDate(effective) > parseDreDate(today);
}

export function getDreAmount(
  t: DreTransactionLike,
  regime: DreRegime,
  hasPartialReceiptChild: boolean
): number {
  const amount = Number(t.amount ?? 0);
  if (regime !== 'caixa') {
    const accrual = Number(t.accrual_amount ?? NaN);
    return Number.isFinite(accrual) && accrual > 0 ? accrual : amount;
  }
  // O desconto só existe pra não contar o mesmo dinheiro duas vezes (mãe +
  // filha "Recebimento parcial"). Sem uma filha REAL no conjunto, `amount_received`
  // não representa dinheiro contado em outro lugar — é só um campo espelho que
  // uma baixa (ex.: pagamento de cobrança via Asaas) pode ter preenchido igual
  // ao `amount` sem nunca criar a filha. Descontar mesmo assim zera a mãe
  // inteira e ela some do Caixa, ainda que Competência mostre o valor cheio —
  // achado real: recebível de cobrança paga no mesmo dia (Aldebaran, R$3.133,00,
  // `amount_received = amount`, zero filhas) sumindo do Caixa. Ver
  // `apply_tenant_charge_payment` — RPC de fora deste módulo que grava o campo
  // errado; aqui só paramos de CONFIAR cegamente nele.
  if (!hasPartialReceiptChild) return amount;
  const received = Number(t.amount_received ?? 0);
  if (!Number.isFinite(received) || received <= 0) return amount;
  const net = Number((amount - received).toFixed(2));
  return net > 0 ? net : 0;
}

/** As três "linhas de despesa" da DRE, abaixo da Receita Líquida. */
export type DreExpenseGroup = 'impostos' | 'cmv' | 'opex';

/**
 * Classifica uma categoria de SAÍDA num dos três grupos da DRE. Extraída de
 * `FinanceDRE.tsx` (era função privada de lá) pra poder ser testada isolada e
 * reusada — o 3º nível da DRE (quebra de UMA categoria por centro de custo)
 * agrupa as transações usando a MESMA chave `grupo:categoria` que esta função
 * decide, então categoria e quebra nunca podem divergir sobre "de qual grupo"
 * uma linha é.
 *
 * `dreGroup` é o campo `dre_group` já cadastrado na categoria (fonte
 * primária). Sem cadastro, cai no fallback por regex — mantém compatibilidade
 * com categoria antiga criada antes do campo existir.
 */
export function classifyDreCategory(
  category: string | null | undefined,
  dreGroup: string | null | undefined
): DreExpenseGroup {
  if (dreGroup === 'impostos') return 'impostos';
  if (dreGroup === 'cmv') return 'cmv';
  const lower = (category || '').toLowerCase();
  if (/imposto|taxa|tributo|icms|iss|pis|cofins/.test(lower)) return 'impostos';
  if (/custo|material|peça|peca|fornecedor|insumo/.test(lower)) return 'cmv';
  return 'opex';
}
