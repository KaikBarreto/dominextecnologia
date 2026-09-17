/**
 * Carimbo legal da assinatura da OS.
 *
 * Abaixo de cada assinatura (técnico/cliente), na tela de preenchimento e no
 * relatório/PDF, mostramos um carimbo com APENAS a data/hora (fuso DA EMPRESA)
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

import { safeTimeZone } from '@/lib/timezone';

export interface SignatureStampInput {
  /** Instante ISO (timestamptz UTC) da assinatura. */
  at?: string | null;
  /** Geolocalização do aparelho no momento da confirmação. */
  geo?: { lat: number; lng: number } | null | undefined;
  /**
   * Endereço conciso (reverse geocode) do momento da confirmação. Quando
   * presente, é PREFERIDO sobre a coordenada no carimbo (decisão CEO). Em geral
   * vem de `*_signed_location.address`.
   */
  address?: string | null;
  /**
   * Fuso IANA DA EMPRESA (`useAppLocaleContext().timezone`). É documento
   * assinado: o carimbo tem que refletir o horário local da empresa que operou
   * a OS, não sempre Brasília. Vazio/inválido cai em America/Sao_Paulo via
   * `safeTimeZone`, nunca lança.
   */
  timeZone?: string | null;
}

/**
 * Formata "DD/MM/YYYY às HH:MM" no fuso informado. Espelha o formato que a OS
 * já usa pro check-in/check-out (sem segundos), via Intl com timeZone seguro
 * (nunca lança, mesmo com fuso vazio/inválido).
 */
function formatStampDateTime(iso: string | null | undefined, timeZone: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: safeTimeZone(timeZone),
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
 * Monta o carimbo: "Assinado em {data/hora} · {endereço ou geo}".
 * O LOCAL prefere o endereço conciso (`address`) e cai pra coordenada quando
 * não há endereço. Cada parte é omitida quando ausente. Retorna null quando não
 * há nada útil (sem data E sem local) — o chamador não renderiza carimbo.
 */
export function formatSignatureStamp(input: SignatureStampInput): string | null {
  const when = formatStampDateTime(input.at, input.timeZone);
  const address = typeof input.address === 'string' && input.address.trim()
    ? input.address.trim()
    : null;
  const geo = formatStampGeo(input.geo);
  const place = address ?? geo;

  // Nada pra carimbar.
  if (!when && !place) return null;

  const parts: string[] = [];
  if (when) parts.push(`Assinado em ${when}`);
  if (place) parts.push(place);

  return parts.join(' · ');
}
