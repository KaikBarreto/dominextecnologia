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

/** Nome legivel do PDF tradicional da OS, preservando acentos do cliente. */
export function buildServiceReportPdfFilename(input: {
  orderNumber: number | string | null | undefined;
  customerName: string | null | undefined;
}): string {
  const orderNumber = readableOrderNumber(input.orderNumber);
  const customerName = safeFilenamePart(input.customerName, 'Cliente');
  return `Relatório de Serviço - OS ${orderNumber} - ${customerName}.pdf`;
}

/** Nome canônico do Certificado PMOC emitido pela OS. */
export function buildCertificateConformityPdfFilename(input: {
  orderNumber: number | string | null | undefined;
  customerName: string | null | undefined;
}): string {
  const orderNumber = readableOrderNumber(input.orderNumber);
  const customerName = safeFilenamePart(input.customerName, 'Cliente');
  return `Certificado de Conformidade - OS ${orderNumber} - ${customerName}.pdf`;
}
