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
