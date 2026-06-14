/**
 * Status de validade dos documentos de conformidade PMOC (TRT / Certificado).
 *
 * Cada documento gerado ganha um `valid_until` (data de vencimento = data de
 * geração + duração configurável por empresa, default 12 meses). Aqui mora a
 * lógica ÚNICA que classifica esse vencimento, pra que a aba Documentos do
 * contrato e o portal do cliente mostrem o mesmo selo.
 *
 * Régua travada pelo CEO:
 *  - Vencido           → passou da data (faltam < 0 dias).
 *  - Vence em breve     → faltam 0 a 30 dias.
 *  - Vigente            → faltam > 30 dias.
 *  - Sem validade       → `valid_until` ausente (doc antigo / cronograma / dossiê).
 *
 * Timezone: toda comparação é ancorada ao fuso de Brasília (America/Sao_Paulo)
 * pra que "hoje" e o dia do vencimento batam com o calendário do gestor, sem
 * off-by-one quando o navegador está em UTC.
 */

export type DocumentValidityStatus =
  | 'vigente'
  | 'vence_em_breve'
  | 'vencido'
  | 'sem_validade';

/** Limite (em dias) abaixo do qual o documento entra em "vence em breve". */
export const VENCE_EM_BREVE_THRESHOLD_DAYS = 30;

const SAO_PAULO_TZ = 'America/Sao_Paulo';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Retorna o "dia de hoje" (ano/mês/dia) no fuso de Brasília a partir de um
 * instante qualquer. Usa Intl.DateTimeFormat com timeZone pra não depender do
 * fuso do navegador.
 */
function brtYmd(now: Date): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SAO_PAULO_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  return { y: get('year'), m: get('month'), d: get('day') };
}

/**
 * Quantos dias inteiros faltam até `validUntil` (date-only "yyyy-MM-dd"),
 * tomando "hoje" no fuso de Brasília. Negativo = já venceu.
 *
 * Comparação dia-a-dia (meia-noite vs meia-noite em UTC) — independente de hora,
 * então não há off-by-one. Retorna `null` se a data for inválida/ausente.
 */
export function daysUntil(validUntil: string | null | undefined, now: Date = new Date()): number | null {
  if (!validUntil) return null;
  const m = validUntil.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const [, yy, mm, dd] = m;
  const target = Date.UTC(Number(yy), Number(mm) - 1, Number(dd));
  const today = brtYmd(now);
  const todayUtc = Date.UTC(today.y, today.m - 1, today.d);
  return Math.round((target - todayUtc) / MS_PER_DAY);
}

/**
 * Classifica o vencimento de um documento.
 *
 * @param validUntil date-only "yyyy-MM-dd" do `pmoc_documents.valid_until`.
 * @param now        instante de referência (default: agora). Útil pra testes.
 */
export function getDocumentValidityStatus(
  validUntil: string | null | undefined,
  now: Date = new Date(),
): DocumentValidityStatus {
  const days = daysUntil(validUntil, now);
  if (days === null) return 'sem_validade';
  if (days < 0) return 'vencido';
  if (days <= VENCE_EM_BREVE_THRESHOLD_DAYS) return 'vence_em_breve';
  return 'vigente';
}

/** Rótulo PT-BR do status, pra exibir no selo. */
export function getValidityLabel(status: DocumentValidityStatus): string {
  switch (status) {
    case 'vigente':
      return 'Vigente';
    case 'vence_em_breve':
      return 'Vence em breve';
    case 'vencido':
      return 'Vencido';
    case 'sem_validade':
    default:
      return 'Sem validade';
  }
}

/**
 * Mapeia o status pra uma variante de Badge com TOKENS semânticos:
 *  - vigente        → success (verde)
 *  - vence_em_breve → warning (amarelo)
 *  - vencido        → destructive (vermelho)
 *  - sem_validade   → outline (neutro)
 */
export function getValidityBadgeVariant(
  status: DocumentValidityStatus,
): 'success' | 'warning' | 'destructive' | 'outline' {
  switch (status) {
    case 'vigente':
      return 'success';
    case 'vence_em_breve':
      return 'warning';
    case 'vencido':
      return 'destructive';
    case 'sem_validade':
    default:
      return 'outline';
  }
}

/**
 * Adiciona `months` meses a um date-only "yyyy-MM-dd" e devolve outro date-only.
 * Usado SÓ pra fallback de EXIBIÇÃO de documentos legados (sem `valid_until`) e
 * espelha o cálculo da edge function de geração. Lida com overflow de mês
 * (ex: 31/01 + 1 mês → 28/02) clampando pro último dia do mês destino.
 */
export function addMonthsToDateOnly(dateOnly: string, months: number): string | null {
  const m = dateOnly.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const [, yy, mm, dd] = m;
  const baseYear = Number(yy);
  const baseMonthIdx = Number(mm) - 1;
  const baseDay = Number(dd);

  const totalMonths = baseMonthIdx + months;
  const targetYear = baseYear + Math.floor(totalMonths / 12);
  const targetMonthIdx = ((totalMonths % 12) + 12) % 12;
  // Último dia do mês destino (dia 0 do mês seguinte).
  const lastDay = new Date(Date.UTC(targetYear, targetMonthIdx + 1, 0)).getUTCDate();
  const day = Math.min(baseDay, lastDay);

  const yStr = String(targetYear).padStart(4, '0');
  const mStr = String(targetMonthIdx + 1).padStart(2, '0');
  const dStr = String(day).padStart(2, '0');
  return `${yStr}-${mStr}-${dStr}`;
}

/** Default de meses de validade quando a empresa não configurou. */
export const DEFAULT_VALIDITY_MONTHS = 12;

/**
 * Resolve o `valid_until` a usar na EXIBIÇÃO. Se o documento já tem `valid_until`
 * persistido, usa-o. Caso contrário (doc legado gerado antes desta feature),
 * deriva `generated_at + 12 meses` SÓ pra exibir um selo aproximado — NÃO
 * persiste nada.
 *
 * `generatedAt` pode vir como ISO completo ("2026-06-14T12:00:00Z") ou date-only;
 * só os 10 primeiros chars (yyyy-MM-dd) importam pro cálculo.
 */
export function resolveValidUntil(
  validUntil: string | null | undefined,
  generatedAt: string | null | undefined,
  fallbackMonths: number = DEFAULT_VALIDITY_MONTHS,
): string | null {
  if (validUntil) return validUntil;
  if (!generatedAt) return null;
  const dateOnly = generatedAt.slice(0, 10);
  return addMonthsToDateOnly(dateOnly, fallbackMonths);
}
