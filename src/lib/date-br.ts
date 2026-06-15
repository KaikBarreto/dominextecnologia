/**
 * Helpers de data ancorada ao fuso de Brasília (America/Sao_Paulo).
 *
 * REGRA CANÔNICA — meio-dia BRT pra evitar off-by-one de fuso:
 * O banco roda em UTC e a coluna transaction_date/paid_at é timestamptz.
 * Se gravarmos um dia "yyyy-MM-dd" cru, o Postgres interpreta como meia-noite
 * UTC (00:00:00+00), que em Brasília (UTC-3) é 21:00 do DIA ANTERIOR → exibe o
 * dia errado (off-by-one). Para blindar isso, toda data escolhida num calendário
 * que vira transaction_date/paid_at é ancorada ao MEIO-DIA de Brasília
 * (15:00:00Z, pois 15:00 UTC = 12:00 BRT). Às 12:00 BRT o instante fica longe
 * o suficiente da meia-noite em qualquer fuso brasileiro (UTC-2 a UTC-5),
 * então o dia exibido é estável em todo o Brasil.
 */

/**
 * Recebe um Date vindo de um calendário (representa o DIA escolhido à meia-noite
 * LOCAL) e retorna a ISO string ancorada ao meio-dia BRT desse dia.
 * Usa os componentes LOCAIS do Date (getFullYear/getMonth/getDate) para não
 * herdar nenhum deslocamento de fuso do horário interno.
 */
export function brtTransactionTimestamp(date: Date): string {
  const y = date.getFullYear();
  const m = date.getMonth();
  const d = date.getDate();
  // 15:00:00Z = 12:00:00 em Brasília (UTC-3).
  return new Date(Date.UTC(y, m, d, 15, 0, 0)).toISOString();
}

/**
 * Recebe um date-only "yyyy-MM-dd" (ex: valor de uma coluna `date`) e retorna a
 * ISO ancorada ao meio-dia BRT desse mesmo dia. Parseia os números do string
 * manualmente — NUNCA usa `new Date('yyyy-MM-dd')`, que o JS interpreta como UTC
 * e reintroduziria o off-by-one.
 */
export function brtDateOnlyToTimestamp(dateOnly: string): string {
  const [y, m, d] = dateOnly.split('-').map(Number);
  // 15:00:00Z = 12:00:00 em Brasília (UTC-3).
  return new Date(Date.UTC(y, m - 1, d, 15, 0, 0)).toISOString();
}

/**
 * Recebe um instante ISO (timestamptz UTC) e devolve "DD/MM/YYYY às HH:MM:SS"
 * no horário de Brasília. Usado, por ex., para exibir quando o usuário aceitou
 * os Termos de Uso. Retorna null se a entrada for vazia/inválida.
 */
export function formatBrtDateTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';

  return `${get('day')}/${get('month')}/${get('year')} às ${get('hour')}:${get('minute')}:${get('second')}`;
}
