import type { NfeParseResult, NfeParsedTax } from '@/lib/nfeParser';

const filePart = (value: string | null | undefined) =>
  (value || 'sem-numero').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');

const money = (value: number | null | undefined) =>
  value == null ? '—' : value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const number = (value: number | null | undefined, suffix = '') =>
  value == null ? '—' : `${value.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}${suffix}`;

const tax = (value: NfeParsedTax) =>
  `BC ${money(value.base)} | ${number(value.rate, '%')} | ${money(value.amount)}`;

export function downloadNfeXml(xml: string, accessKey?: string | null) {
  const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `nfe-${filePart(accessKey)}.xml`;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * Gera uma representação local dos dados do XML. Não substitui a consulta de
 * autenticidade no portal da SEFAZ e não inventa campos ausentes.
 */
export async function generateNfeDanfe(parsed: NfeParseResult) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('DANFE — Documento Auxiliar da NF-e', 14, 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Representação gerada a partir do XML autorizado. Consulte a chave no portal da SEFAZ.', 14, 19);

  doc.setFontSize(9);
  const header = [
    `NF-e nº ${parsed.number || '—'} | Série ${parsed.series || '—'} | Emissão ${parsed.issueDate || '—'}`,
    `Natureza da operação: ${parsed.nature || '—'}`,
    `Emitente: ${parsed.supplier.name || '—'} | CNPJ/CPF ${parsed.supplier.cnpj || '—'}`,
    `Destinatário: ${parsed.recipient.name || '—'} | CNPJ/CPF ${parsed.recipient.cnpj || '—'}`,
    `Chave de acesso: ${parsed.accessKey || '—'}`,
    `Protocolo de autorização: ${parsed.protocol || '—'} | Recebimento ${parsed.authorizationDate || '—'}`,
  ];
  header.forEach((line, index) => doc.text(line, 14, 27 + index * 5, { maxWidth: pageWidth - 28 }));

  autoTable(doc, {
    startY: 60,
    head: [[
      'Item', 'Descrição', 'NCM', 'CEST', 'CFOP', 'CST/CSOSN', 'Orig.', 'Qtd.', 'Un.', 'V. unit.', 'V. total',
      'ICMS (BC | % | valor)', 'IPI (BC | % | valor)', 'PIS (BC | % | valor)', 'COFINS (BC | % | valor)',
    ]],
    body: parsed.items.map((item, index) => [
      String(index + 1), item.name, item.ncm || '—', item.cest || '—', item.cfop || '—',
      item.cst || item.csosn || '—', item.origem || '—', number(item.quantity), item.unit.toUpperCase(),
      money(item.unitCost), money(item.total), tax(item.icms), tax(item.ipi), tax(item.pis), tax(item.cofins),
    ]),
    styles: { fontSize: 6, cellPadding: 1.2, overflow: 'linebreak' },
    headStyles: { fillColor: [24, 24, 27], textColor: [255, 255, 255] },
    columnStyles: { 1: { cellWidth: 34 }, 11: { cellWidth: 24 }, 12: { cellWidth: 24 }, 13: { cellWidth: 24 }, 14: { cellWidth: 24 } },
    margin: { left: 8, right: 8 },
  });

  const finalY = (doc as typeof doc & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 60;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(`Valor total da NF-e: ${money(parsed.total)}`, pageWidth - 14, Math.min(finalY + 8, 195), { align: 'right' });
  doc.save(`danfe-nfe-${filePart(parsed.number || parsed.accessKey)}.pdf`);
}
