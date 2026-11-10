import type { ServiceOrder } from '@/types/database';
import { isServiceOrderEntry } from '@/lib/serviceOrderAccess';
import { companyHasSegment } from '@/utils/companySegments';

type OsPmocEligibilityOrder = Pick<ServiceOrder, 'status' | 'entry_type'>;

/**
 * Regra unica da UI para oferecer documentos PMOC avulsos de uma OS.
 *
 * A associacao com contrato e propositalmente irrelevante: uma OS manual da
 * empresa de refrigeracao tambem pode gerar os documentos. A validacao de
 * tenant/permissao e dos dados do documento continua obrigatoria no servidor.
 */
export function canGenerateOsPmocDocuments(
  order: OsPmocEligibilityOrder | null | undefined,
  segments: readonly string[] | null | undefined,
  legacySegment?: string | null,
): boolean {
  if (!order || !isServiceOrderEntry(order)) return false;
  if (order.status !== 'concluida') return false;
  return companyHasSegment(segments, 'refrigeracao', legacySegment);
}

function safeFilenamePart(value: string | null | undefined, fallback: string): string {
  const sanitized = (value ?? '')
    .replace(/\p{Cc}/gu, ' ')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return sanitized || fallback;
}

function readableOrderNumber(value: number | string | null | undefined): string {
  if (value === null || value === undefined || String(value).trim() === '') return 'sem-numero';
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? String(Math.trunc(parsed)).padStart(6, '0')
    : 'sem-numero';
}

const FILE_MONTHS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'] as const;

function readableFileDate(value: Date | string | number | null | undefined, timeZone?: string): string {
  const date = value instanceof Date ? value : new Date(value ?? Date.now());
  const validDate = Number.isNaN(date.getTime()) ? new Date() : date;
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone || undefined,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(validDate);
  } catch {
    parts = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(validDate);
  }
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  const month = Number(part('month'));
  return `${part('day')} ${FILE_MONTHS[month - 1] ?? 'DATA'} ${part('year')}`;
}

/** Nome legivel do PDF tradicional da OS, preservando acentos do cliente. */
export function buildServiceReportPdfFilename(input: {
  orderNumber: number | string | null | undefined;
  customerName: string | null | undefined;
  generatedAt?: Date | string | number | null;
  timeZone?: string;
}): string {
  const orderNumber = readableOrderNumber(input.orderNumber);
  const customerName = safeFilenamePart(input.customerName, 'Cliente');
  const generatedOn = readableFileDate(input.generatedAt, input.timeZone);
  return `Relatório de Serviço - OS ${orderNumber} - ${customerName} - ${generatedOn}.pdf`;
}

/** Nome canônico do Certificado PMOC emitido pela OS. */
export function buildCertificateConformityPdfFilename(input: {
  orderNumber: number | string | null | undefined;
  customerName: string | null | undefined;
  generatedAt?: Date | string | number | null;
  timeZone?: string;
}): string {
  const orderNumber = readableOrderNumber(input.orderNumber);
  const customerName = safeFilenamePart(input.customerName, 'Cliente');
  const generatedOn = readableFileDate(input.generatedAt, input.timeZone);
  return `Certificado de Conformidade - OS ${orderNumber} - ${customerName} - ${generatedOn}.pdf`;
}
