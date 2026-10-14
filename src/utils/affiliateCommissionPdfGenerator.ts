import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { DOMINEX_LOGO_BLACK_BASE64 } from '@/utils/dominexLogoBase64';
import { openPdfInTab } from '@/utils/openPdfInTab';
import type { AffiliateCommissionKind, AffiliateCommissionStatus } from '@/hooks/useAffiliateData';

/**
 * Fechamento de comissões de UM afiliado, num mês de competência. Port do
 * EcoSistema seguindo as convenções de PDF do Dominex (jsPDF + autoTable +
 * `openPdfInTab`, ver `src/utils/stockPositionPdfGenerator.ts`).
 *
 * Diferença de contexto: isto roda dentro do painel master Auctus (não é
 * documento de um tenant), então não há company header nem toggle de
 * white-label — o rodapé é SEMPRE Dominex (Auctus nunca aparece pro usuário,
 * regra-lei do projeto), e o afiliado-only também pode exportar o PRÓPRIO
 * fechamento a partir da própria ficha.
 */

const KIND_LABELS: Record<AffiliateCommissionKind, string> = {
  first: 'Venda',
  recurring: 'Renovação',
};

const STATUS_LABELS: Record<AffiliateCommissionStatus, string> = {
  pending: 'Pendente',
  paid: 'Pago',
  voided: 'Estornado',
};

export interface AffiliateCommissionPdfRow {
  kind: AffiliateCommissionKind;
  company_name: string | null;
  base_amount: number;
  pct_applied: number;
  commission_amount: number;
  status: AffiliateCommissionStatus;
}

export interface GenerateAffiliateCommissionMonthPdfParams {
  affiliateName: string;
  /** Mês de competência, já montado como Date LOCAL pelo chamador (dia 1). */
  referenceMonth: Date;
  commissions: AffiliateCommissionPdfRow[];
  total: number;
  /** Ex.: "a pagar em outubro/2026". Omitido quando o PDF é só um extrato. */
  payMonthLabel?: string;
}

const sanitizeFilenamePart = (name: string): string =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'afiliado';

const brl = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Falha ao carregar imagem'));
    img.src = src;
  });
}

export async function generateAffiliateCommissionMonthPdf(
  params: GenerateAffiliateCommissionMonthPdfParams,
): Promise<void> {
  const { affiliateName, referenceMonth, commissions, total, payMonthLabel } = params;

  // Abre a aba ANTES do await (gesto do usuário → driblar popup-blocker).
  const targetWindow = window.open('', '_blank');

  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const greenRgb: [number, number, number] = [22, 163, 74];
  const redRgb: [number, number, number] = [220, 38, 38];
  const grayRgb: [number, number, number] = [108, 117, 125];

  const competencia = format(referenceMonth, 'MMMM/yyyy', { locale: ptBR });

  let y = 16;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(20, 20, 20);
  doc.text('Fechamento de Comissões - Afiliado', pageWidth / 2, y, { align: 'center' });
  y += 8;

  doc.setFontSize(11);
  doc.setTextColor(40, 40, 40);
  doc.text(affiliateName, pageWidth / 2, y, { align: 'center' });
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...grayRgb);
  doc.text(`Competência: ${competencia}`, pageWidth / 2, y, { align: 'center' });
  y += 5;

  if (payMonthLabel) {
    doc.text(payMonthLabel, pageWidth / 2, y, { align: 'center' });
    y += 5;
  }
  y += 4;

  const body = commissions.map((c) => [
    KIND_LABELS[c.kind] ?? c.kind,
    c.company_name || '—',
    brl(c.base_amount),
    `${(Number(c.pct_applied) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`,
    brl(c.commission_amount),
    STATUS_LABELS[c.status] ?? c.status,
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Tipo', 'Cliente', 'Base', '%', 'Comissão', 'Status']],
    body,
    foot: [
      [
        { content: 'Total do mês', colSpan: 4, styles: { halign: 'right', fontStyle: 'bold' } },
        { content: brl(total), styles: { halign: 'right', fontStyle: 'bold', textColor: greenRgb } },
        '',
      ],
    ],
    theme: 'striped',
    styles: { fontSize: 9, cellPadding: 2.5 },
    headStyles: { fillColor: [40, 40, 40], textColor: 255, fontStyle: 'bold' },
    footStyles: { fillColor: [240, 240, 240], textColor: 30 },
    columnStyles: {
      0: { cellWidth: 24 },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 28, halign: 'right' },
      3: { cellWidth: 18, halign: 'right' },
      4: { cellWidth: 30, halign: 'right' },
      5: { cellWidth: 26 },
    },
    didParseCell: (hookData) => {
      if (hookData.section !== 'body') return;
      const row = commissions[hookData.row.index];
      if (!row) return;
      if (hookData.column.index === 4) {
        hookData.cell.styles.fontStyle = 'bold';
        hookData.cell.styles.textColor = row.status === 'voided' ? grayRgb : greenRgb;
      }
      if (hookData.column.index === 5) {
        hookData.cell.styles.fontStyle = 'bold';
        if (row.status === 'paid') hookData.cell.styles.textColor = greenRgb;
        else if (row.status === 'voided') hookData.cell.styles.textColor = redRgb;
        else hookData.cell.styles.textColor = grayRgb;
      }
    },
  });

  // Rodapé Dominex — sempre (painel master é interno, nunca white-label; e
  // Auctus nunca aparece pro usuário, regra-lei do projeto).
  let footerImg: HTMLImageElement | null = null;
  try {
    footerImg = await loadImage(DOMINEX_LOGO_BLACK_BASE64);
  } catch {
    footerImg = null;
  }
  const footerY = pageHeight - 12;
  if (footerImg) {
    const fw = 22;
    const fh = fw / (footerImg.width / footerImg.height || 5);
    doc.addImage(footerImg, 'PNG', (pageWidth - fw) / 2, footerY - fh, fw, fh);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(153, 153, 153);
    doc.text('Desenvolvido por Dominex · dominex.app', pageWidth / 2, footerY + 2.5, { align: 'center' });
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(153, 153, 153);
    doc.text('Desenvolvido por Dominex · dominex.app', pageWidth / 2, footerY, { align: 'center' });
  }

  const fileMonth = format(referenceMonth, 'yyyy-MM');
  const filename = `comissoes-afiliado-${sanitizeFilenamePart(affiliateName)}-${fileMonth}`;
  const blob = doc.output('blob');
  openPdfInTab(blob, filename, targetWindow);
}
