/**
 * Carimbo legal da assinatura da OS.
 *
 * Abaixo de cada assinatura (técnico/cliente), na tela de preenchimento e no
 * relatório/PDF, mostramos um carimbo com APENAS a data/hora (fuso de Brasília)
 * e a geolocalização do aparelho no momento da confirmação.
 *
 * Decisão CEO: o NOME de quem assinou NÃO é registrado nem exibido. Motivo: a
 * pergunta de assinatura pode ser do CLIENTE (o técnico entrega o celular pro
 * cliente assinar), então gravar o nome do usuário logado seria enganoso. Por
 * honestidade/segurança, o carimbo guarda só "quando" e "onde".
 *
 * Este helper é a FONTE ÚNICA do formato — tela e relatório consomem o mesmo
 * texto pra não divergir. Retorna uma string já montada (ou null se não há nem
 * data nem geo, ou seja, não há o que carimbar).
 */

export interface SignatureStampInput {
  /** Instante ISO (timestamptz UTC) da assinatura. */
  at?: string | null;
  /** Geolocalização do aparelho no momento da confirmação. */
  geo?: { lat: number; lng: number } | null | undefined;
}

/**
 * Formata "DD/MM/YYYY às HH:MM" no horário de Brasília. Espelha o formato que a
 * OS já usa pro check-in/check-out (sem segundos), via Intl com timeZone fixo.
 */
function formatStampDateTime(iso: string | null | undefined): string | null {
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
    hour12: false,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';

  return `${get('day')}/${get('month')}/${get('year')} às ${get('hour')}:${get('minute')}`;
}

/** "-22.898947, -43.263629" (6 casas), ou null se não houver geo. */
function formatStampGeo(geo: SignatureStampInput['geo']): string | null {
  if (!geo || typeof geo.lat !== 'number' || typeof geo.lng !== 'number') return null;
  if (Number.isNaN(geo.lat) || Number.isNaN(geo.lng)) return null;
  return `${geo.lat.toFixed(6)}, ${geo.lng.toFixed(6)}`;
}

/**
 * Monta o carimbo: "Assinado em {data/hora} · {geo}".
 * Cada parte é omitida quando ausente. Retorna null quando não há nada útil
 * (sem data E sem geo) — nesse caso o chamador não renderiza carimbo.
 */
export function formatSignatureStamp(input: SignatureStampInput): string | null {
  const when = formatStampDateTime(input.at);
  const geo = formatStampGeo(input.geo);

  // Nada pra carimbar.
  if (!when && !geo) return null;

  const parts: string[] = [];
  if (when) parts.push(`Assinado em ${when}`);
  if (geo) parts.push(geo);

  return parts.join(' · ');
}
