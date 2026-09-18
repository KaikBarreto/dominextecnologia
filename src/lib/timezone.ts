// ─── Fuso do ponto eletrônico ────────────────────────────────────────────────
//
// Casa única das conversões de fuso do ponto. O fuso é o da EMPRESA
// (`company_settings.timezone`, exposto pelo `useAppLocaleContext`), NUNCA o do
// aparelho de quem está batendo, lançando ou exportando.
//
// Por quê: o dia da batida é documento. O espelho de ponto e a folha agrupam
// por ele, então dois usuários da mesma empresa em fusos diferentes precisam
// ver e gravar o MESMO dia. Com `format(new Date(), 'yyyy-MM-dd')` (fuso do
// aparelho) o técnico com o celular em outro fuso gravava a batida no dia
// errado, e o admin via o painel de um dia que não era o da empresa.
//
// `en-CA` é OBRIGATÓRIO no dia, não é estilo: é o único locale que o Intl
// formata exatamente como ISO YYYY-MM-DD. Remontar com getFullYear()/getMonth()
// usaria o fuso do aparelho de novo e traria o defeito de volta por outro
// caminho.
//
// Fuso vazio, nulo ou inválido (string que não é nome IANA) faz o Intl lançar
// RangeError na construção do formatador, o que derrubaria a tela inteira do
// ponto. Por isso todo caminho cai no padrão sem lançar.

/** Fuso padrão quando a empresa não tem um configurado ou o valor é inválido. */
export const DEFAULT_TIME_ZONE = 'America/Sao_Paulo';

function resolveTimeZone(timeZone: string | null | undefined): string {
  return typeof timeZone === 'string' && timeZone.trim() ? timeZone.trim() : DEFAULT_TIME_ZONE;
}

/**
 * Devolve um nome de fuso que o Intl aceita, sempre. Vazio, nulo ou string que
 * não é nome IANA cai no padrão em vez de lançar RangeError.
 *
 * Use quando precisar passar o fuso direto pro Intl (por exemplo num
 * `toLocaleDateString` com formato que estas funções não cobrem).
 */
export function safeTimeZone(timeZone: string | null | undefined): string {
  const tz = resolveTimeZone(timeZone);
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

function toDate(value: Date | string | number): Date {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error('Data e hora inválidas');
  return d;
}

/**
 * Formata no fuso pedido. Se o fuso não for um nome IANA válido, o Intl lança
 * RangeError ao construir o formatador, e aí refazemos no fuso padrão.
 */
function formatInTz(
  date: Date,
  timeZone: string | null | undefined,
  locale: string,
  options: Intl.DateTimeFormatOptions,
): string {
  try {
    return new Intl.DateTimeFormat(locale, { timeZone: resolveTimeZone(timeZone), ...options }).format(date);
  } catch {
    return new Intl.DateTimeFormat(locale, { timeZone: DEFAULT_TIME_ZONE, ...options }).format(date);
  }
}

/**
 * Dia (YYYY-MM-DD) do instante informado NO FUSO DA EMPRESA.
 *
 * Use quando o instante é arbitrário, por exemplo a data e hora que o admin
 * escolheu ao lançar uma batida manual: o dia tem que ser o da empresa naquele
 * instante, não o dia de hoje nem o dia do aparelho do admin.
 */
export function dateInTz(date: Date | string | number, timeZone: string | null | undefined): string {
  return formatInTz(toDate(date), timeZone, 'en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

/** "Hoje" (YYYY-MM-DD) no fuso da empresa. */
export function todayInTz(timeZone: string | null | undefined): string {
  return dateInTz(new Date(), timeZone);
}

/**
 * Hora (HH:mm, 24h) do instante informado no fuso da empresa.
 *
 * `hourCycle: 'h23'` é proposital: sem ele, meia-noite pode sair como "24:00"
 * em alguns motores.
 */
export function timeInTz(date: Date | string | number, timeZone: string | null | undefined): string {
  return formatInTz(toDate(date), timeZone, 'pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
}

/**
 * Hora com segundos (HH:mm:ss, 24h) no fuso da empresa.
 *
 * Existe porque a timeline de batidas do ponto mostra o segundo — é o que
 * diferencia duas batidas do mesmo minuto quando o gestor confere a jornada.
 */
export function timeWithSecondsInTz(
  date: Date | string | number,
  timeZone: string | null | undefined,
): string {
  return formatInTz(toDate(date), timeZone, 'pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
}

// ─── Caminho inverso: hora do relógio da empresa  →  instante UTC ────────────

/**
 * Lê o relógio de parede de um instante num fuso e devolve esse relógio como se
 * fosse UTC. Serve pra comparar "o que eu queria" com "o que apareceu" usando
 * um número só.
 */
function wallClockAsUtcMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  }).formatToParts(instant);

  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find(p => p.type === type)?.value ?? NaN);

  const ms = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'));
  if (Number.isNaN(ms)) throw new Error('Não foi possível ler a hora no fuso informado');
  return ms;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Converte um dia e uma hora DO RELÓGIO DA EMPRESA no instante UTC equivalente
 * (string ISO, pronta pro banco).
 *
 * Exemplo: ('2026-09-17', '08:00', 'America/Sao_Paulo') => '2026-09-17T11:00:00.000Z',
 * não importa em que fuso está o aparelho de quem lançou.
 *
 * Por que existe: `new Date('2026-09-17T08:00')` (sem Z) é interpretado no fuso
 * do APARELHO. Um admin em Lisboa lançando a batida das 08:00 de um funcionário
 * em São Paulo gravava 07:00Z, que no espelho vira 04:00. E montar o dia com
 * `toISOString()` pegava o dia UTC, então às 22:00 de Brasília a batida ia parar
 * no dia seguinte.
 *
 * Como funciona, já que o Intl não tem o caminho inverso pronto:
 * 1. monta o instante candidato tratando o relógio pedido como se fosse UTC;
 * 2. pergunta ao Intl que relógio esse candidato mostra no fuso alvo;
 * 3. a diferença entre o pedido e o que apareceu é o deslocamento do fuso, e é
 *    aplicada ao candidato.
 *
 * A SEGUNDA PASSADA não é zelo: o deslocamento usado no passo 2 é o do instante
 * candidato, que pode cair do outro lado de uma virada de horário de verão em
 * relação ao instante final. Ex.: 03:30 de 08/03/2026 em America/New_York. O
 * primeiro palpite cai ainda no horário padrão (-5), o resultado pula pro
 * horário de verão (-4) e sobra 1 hora de erro, que só a repetição corrige. O
 * Brasil não tem mais horário de verão, mas a lista de fusos inclui
 * America/New_York e Europe/*, que têm. O laço para assim que converge; horas
 * que não existem (a hora pulada na virada) não convergem e são resolvidas na
 * última passada, sem laço infinito.
 *
 * Fuso vazio, nulo ou inválido cai em America/Sao_Paulo, nunca lança.
 */
export function zonedDateTimeToUtc(
  dateStr: string,
  timeStr: string,
  timeZone: string | null | undefined,
): string {
  const date = DATE_RE.exec(String(dateStr ?? '').trim());
  const time = TIME_RE.exec(String(timeStr ?? '').trim());
  if (!date || !time) throw new Error('Data e hora inválidas');

  const tz = safeTimeZone(timeZone);

  const wanted = Date.UTC(
    Number(date[1]),
    Number(date[2]) - 1,
    Number(date[3]),
    Number(time[1]),
    Number(time[2]),
    Number(time[3] ?? 0),
  );
  if (Number.isNaN(wanted)) throw new Error('Data e hora inválidas');

  let candidate = wanted;
  // Três passadas no máximo: a primeira acha o deslocamento, a segunda corrige
  // a virada de horário de verão, a terceira confirma.
  for (let i = 0; i < 3; i++) {
    const diff = wanted - wallClockAsUtcMs(new Date(candidate), tz);
    if (diff === 0) break;
    candidate += diff;
  }

  return new Date(candidate).toISOString();
}
