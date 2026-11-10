const DIACRITICS = /[\u0300-\u036f]/g;

export function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function normalizeText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).replace(/\s+/g, ' ').trim();
  return normalized || null;
}

export function normalizeDocument(value: unknown): string | null {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits || null;
}

export function normalizePostalCode(value: unknown): string | null {
  const digits = String(value ?? '').replace(/\D/g, '').slice(0, 8);
  return digits || null;
}

export function normalizeState(value: unknown): string | null {
  const state = normalizeText(value)?.toUpperCase() ?? null;
  return state && state.length === 2 ? state : state;
}

/**
 * Converte número nativo e formatos comuns no Brasil sem transformar código em
 * número. O chamador decide quais colunas são quantitativas/monetárias.
 */
export function parseBrazilianNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  let raw = String(value).trim().replace(/\s/g, '').replace(/R\$/gi, '');
  if (!raw) return null;
  raw = raw.replace(/[^0-9,.-]/g, '');
  if (!raw || !/\d/.test(raw)) return null;

  const comma = raw.lastIndexOf(',');
  const dot = raw.lastIndexOf('.');
  if (comma >= 0 && dot >= 0) {
    raw = comma > dot
      ? raw.replace(/\./g, '').replace(',', '.')
      : raw.replace(/,/g, '');
  } else if (comma >= 0) {
    raw = raw.replace(/\./g, '').replace(',', '.');
  } else if ((raw.match(/\./g) ?? []).length > 1) {
    raw = raw.replace(/\./g, '');
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeActive(value: unknown, defaultValue = true): boolean {
  const normalized = normalizeHeader(value);
  if (!normalized) return defaultValue;
  if (['inativo', 'inativa', 'nao', 'nao ativo', 'false', '0', 'arquivado'].includes(normalized)) return false;
  if (['ativo', 'ativa', 'sim', 'true', '1'].includes(normalized)) return true;
  return defaultValue;
}

export function normalizeCustomerType(value: unknown, document: string | null, companyName: string | null): 'pf' | 'pj' {
  const normalized = normalizeHeader(value);
  if (['pf', 'pessoa fisica', 'fisica'].includes(normalized)) return 'pf';
  if (['pj', 'pessoa juridica', 'juridica'].includes(normalized)) return 'pj';
  if (document?.length === 11) return 'pf';
  if (document?.length === 14 || companyName) return 'pj';
  return 'pj';
}

/** Retorna YYYY-MM-DD; datas anteriores a 1900 são reconhecidas como sentinela. */
export function normalizeDate(value: unknown): { value: string | null; legacy: boolean; invalid: boolean } {
  if (value === null || value === undefined || value === '') return { value: null, legacy: false, invalid: false };

  let year: number;
  let month: number;
  let day: number;
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    year = value.getUTCFullYear();
    month = value.getUTCMonth() + 1;
    day = value.getUTCDate();
  } else {
    const raw = String(value).trim();
    const br = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:\s|$)/);
    const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:T|\s|$)/);
    if (br) {
      day = Number(br[1]);
      month = Number(br[2]);
      year = Number(br[3]);
      if (br[3].length === 2) year += year >= 70 ? 1900 : 2000;
    } else if (iso) {
      year = Number(iso[1]);
      month = Number(iso[2]);
      day = Number(iso[3]);
    } else {
      return { value: null, legacy: false, invalid: true };
    }
  }

  if (year < 1900) return { value: null, legacy: true, invalid: false };
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year
    || probe.getUTCMonth() + 1 !== month
    || probe.getUTCDate() !== day
  ) return { value: null, legacy: false, invalid: true };

  return {
    value: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    legacy: false,
    invalid: false,
  };
}

/** Evita que texto exportado pelo usuário vire fórmula ao abrir o template. */
export function sanitizeSpreadsheetText(value: unknown): string {
  const text = String(value ?? '');
  return /^\s*[=+@]/.test(text) || /^\s*-[A-Za-z]/.test(text) ? `'${text}` : text;
}

export function looksLikeFormulaText(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return /^\s*[=+@]/.test(value) || /^\s*-[A-Za-z]/.test(value);
}
