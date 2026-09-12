/**
 * Data de HOJE no fuso do Brasil (`America/Sao_Paulo`), em `YYYY-MM-DD`.
 *
 * Por que existe
 * -------------
 * `new Date().toISOString().split('T')[0]` devolve a data em **UTC**. Como o
 * Brasil é UTC-3, qualquer ação feita a partir das 21h locais grava a data de
 * AMANHÃ. Num lançamento financeiro isso não é cosmético: `paid_date` é o campo
 * que define em qual MÊS a movimentação entra no regime de Caixa da DRE e nos
 * relatórios. Pagamento feito às 21h30 do dia 31 vira dia 1º do mês seguinte —
 * um mês já fechado deixa de bater e o seguinte ganha uma despesa que não é
 * dele. Já aconteceu em produção duas vezes (R$ 614,57).
 *
 * Por que `Intl` e não offset fixo
 * --------------------------------
 * Ancorar em `America/Sao_Paulo` mantém a data correta mesmo quando o navegador
 * do usuário está em outro fuso (técnico viajando, notebook com relógio em UTC,
 * job rodando em servidor UTC). Subtrair "-3" na mão só funciona se a máquina
 * já estiver no Brasil — exatamente a suposição que produziu o bug.
 *
 * `en-CA` é o truque canônico pra `Intl.DateTimeFormat` emitir `YYYY-MM-DD`
 * direto, sem remontar partes à mão.
 *
 * Use SEMPRE que precisar do "hoje" de um campo de data financeira
 * (`paid_date`, data de pagamento de fatura, default de input `type="date"`).
 */
export function todayInBrazil(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
