// ─────────────────────────────────────────────────────────────────────────────
// i18n do APP LOGADO — lista de fusos IANA pra config Regional.
//
// Fonte primária: Intl.supportedValuesOf('timeZone') (lista COMPLETA e atualizada
// do runtime). Fallback: lista curada dos fusos mais usados pelos mercados que o
// Dominex atende. O valor SALVO é sempre o nome IANA (ex.: 'America/Sao_Paulo').
// O usuário busca por texto no Select (a lista completa é grande demais pra rolar).
// ─────────────────────────────────────────────────────────────────────────────

/** Fusos priorizados no topo da lista (aparecem primeiro, sem depender de busca). */
export const COMMON_TIMEZONES: string[] = [
  'America/Sao_Paulo',
  'America/Manaus',
  'America/Fortaleza',
  'America/Recife',
  'America/Bahia',
  'America/Cuiaba',
  'America/Belem',
  'America/Rio_Branco',
  'America/Noronha',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Mexico_City',
  'America/Bogota',
  'America/Lima',
  'America/Santiago',
  'America/Argentina/Buenos_Aires',
  'America/Montevideo',
  'America/Asuncion',
  'America/La_Paz',
  'America/Toronto',
  'Europe/Lisbon',
  'Europe/Madrid',
  'Europe/Paris',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Rome',
  'Europe/Zurich',
  'UTC',
];

/**
 * Lista de todos os fusos disponíveis, common primeiro (sem duplicar), depois o
 * resto em ordem alfabética. Best-effort: se Intl.supportedValuesOf não existir
 * (runtime antigo), cai só na lista curada.
 */
export function getAllTimezones(): string[] {
  let all: string[] = [];
  try {
    const supported = (
      Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
    ).supportedValuesOf?.('timeZone');
    if (Array.isArray(supported) && supported.length > 0) {
      all = supported;
    }
  } catch {
    all = [];
  }

  if (all.length === 0) {
    // Fallback: só a lista curada, já ordenada com common no topo.
    return [...COMMON_TIMEZONES];
  }

  const commonSet = new Set(COMMON_TIMEZONES);
  const rest = all
    .filter((tz) => !commonSet.has(tz))
    .sort((a, b) => a.localeCompare(b));
  // Garante que só entram no topo os common que o runtime de fato reconhece.
  const knownCommon = COMMON_TIMEZONES.filter((tz) => all.includes(tz) || tz === 'UTC');
  return [...knownCommon, ...rest];
}

/** Rótulo amigável: "America/Sao_Paulo" → "America/Sao Paulo" (underscore vira espaço). */
export function timezoneLabel(tz: string): string {
  return tz.replace(/_/g, ' ');
}

/**
 * Retorna o offset GMT atual do fuso no formato "(GMT-03:00)".
 * Usa Intl.DateTimeFormat com timeZoneName: 'longOffset'. SSR-safe (try/catch → '').
 * O offset reflete o horário de verão vigente no momento da chamada.
 */
export function timezoneOffsetLabel(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'longOffset',
    }).formatToParts(new Date());
    const tzPart = parts.find((p) => p.type === 'timeZoneName');
    if (!tzPart) return '';
    // longOffset devolve "GMT+00:00" ou "GMT-03:00" — já no formato desejado.
    // Envolve em parênteses: "(GMT-03:00)".
    const raw = tzPart.value; // ex: "GMT-3" em alguns engines, "GMT-03:00" em outros
    // Normaliza para sempre ter os dois dígitos de hora e os minutos.
    const match = raw.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/);
    if (match) {
      const sign = match[1];
      const hh = match[2].padStart(2, '0');
      const mm = match[3] ?? '00';
      return `(GMT${sign}${hh}:${mm})`;
    }
    // UTC / GMT sem offset numérico
    if (raw === 'GMT' || raw === 'UTC') return '(GMT+00:00)';
    return `(${raw})`;
  } catch {
    return '';
  }
}

/** Os 5 fusos mais relevantes para os idiomas suportados + Brasil. */
const FEATURED_TIMEZONES: string[] = [
  'America/Sao_Paulo',
  'America/New_York',
  'Europe/London',
  'Europe/Madrid',
  'Europe/Paris',
];

/**
 * Retorna as opções de fuso horário em duas seções:
 *  - "Mais usados": os 5 fusos prioritários (FEATURED_TIMEZONES).
 *  - "Todos os fusos": o restante de getAllTimezones(), sem duplicar os 5, em ordem alfabética.
 *
 * Cada opção tem `value` = nome IANA e `label` = "(GMT±HH:MM) Nome Do Fuso".
 */
export function getTimezoneOptions(): {
  heading: string;
  options: { value: string; label: string }[];
}[] {
  const makeOption = (tz: string) => ({
    value: tz,
    label: `${timezoneOffsetLabel(tz)} ${timezoneLabel(tz)}`.trim(),
  });

  const featuredSet = new Set(FEATURED_TIMEZONES);

  const all = getAllTimezones();
  const restOptions = all
    .filter((tz) => !featuredSet.has(tz))
    .sort((a, b) => a.localeCompare(b))
    .map(makeOption);

  return [
    {
      heading: 'Mais usados',
      options: FEATURED_TIMEZONES.map(makeOption),
    },
    {
      heading: 'Todos os fusos',
      options: restOptions,
    },
  ];
}
