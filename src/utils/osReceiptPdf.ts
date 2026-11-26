import type { OsReceipt } from '@/lib/osCommercial';

/** Mesmo documento para OS, financeiro e portal; somente dados confirmados pelo servidor. */
export async function downloadOsReceipt(receipt: OsReceipt, canSave: () => boolean = () => true) {
  const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: receipt.currency || 'BRL' });
  if (!(receipt.received > 0) || !receipt.payments.length) throw new Error('Recebimento ainda não confirmado.');
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF();
  const company = receipt.company;
  const dark = [17, 24, 39] as const;
  const green = [5, 125, 82] as const;
  const date = (value: string) => value.slice(0, 10).split('-').reverse().join('/');
  const width = 174;
  const reference = receipt.order_number ? `Ordem de serviço #${receipt.order_number}` : 'Recebimento financeiro';
  let y = 0;
  const space = (height: number) => { if (y + height > 265) { doc.addPage(); y = 24; } };
  const paragraph = (value: string, size = 10, color: readonly [number, number, number] = dark) => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(size); doc.setTextColor(...color);
    // Linha a linha permite quebra de página mesmo em descrições extensas.
    for (const line of doc.splitTextToSize(value, width)) { space(size * 0.5); doc.text(line, 18, y); y += size * 0.5; }
  };
  const heading = (value: string) => { space(16); doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...dark); doc.text(value, 18, y); y += 6; };
  let logoData: string | null = null;
  if (company.logo_url && /^https:\/\//i.test(company.logo_url)) {
    try {
      const response = await fetch(company.logo_url, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error('Logo indisponível');
      const blob = await response.blob();
      logoData = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob); });
      doc.getImageProperties(logoData);
    } catch { logoData = null; }
  }
  const textX = logoData ? 59 : 18;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(17);
  const brandLines = doc.splitTextToSize(company.name || 'Prestador de serviços', 192 - textX);
  doc.setFontSize(9); doc.setFont('helvetica', 'normal');
  const contacts = doc.splitTextToSize([company.document, company.phone, company.email].filter(Boolean).join('  |  '), 192 - textX);
  const headerHeight = Math.max(44, 22 + brandLines.length * 7 + contacts.length * 4);
  doc.setFillColor(...dark); doc.rect(0, 0, 210, headerHeight, 'F');
  doc.setFillColor(...green); doc.rect(0, headerHeight, 210, 2, 'F');
  if (logoData) {
    const logo = doc.getImageProperties(logoData); const scale = Math.min(32 / logo.width, 26 / logo.height);
    doc.addImage(logoData, 18, 17, logo.width * scale, logo.height * scale, undefined, 'FAST');
  }
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.text(brandLines, textX, 22);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(contacts, textX, 27 + brandLines.length * 7);
  y = headerHeight + 15;
  doc.setTextColor(...green); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
  doc.text(receipt.is_partial ? 'PAGAMENTO PARCIAL' : receipt.scope === 'payment' ? 'PAGAMENTO CONFIRMADO' : 'RECEBIMENTOS CONFIRMADOS', 18, y);
  y += 12; doc.setTextColor(...dark); doc.setFontSize(25); doc.text('Recibo de pagamento', 18, y);
  y += 6; paragraph(reference, 11); y += 4;
  doc.setDrawColor(219, 224, 230); doc.line(18, y, 192, y); y += 8;
  doc.setFontSize(9); doc.setTextColor(86, 97, 112); doc.text('VALOR COMPROVADO NESTE RECIBO', 18, y); y += 10;
  doc.setFont('helvetica', 'bold'); doc.setTextColor(...dark); doc.setFontSize(29);
  doc.text(money(receipt.received), 18, y); y += 9;
  paragraph(`Recebemos de ${receipt.customer?.name || 'cliente'}${receipt.customer?.document ? ` (${receipt.customer.document})` : ''} a quantia de ${money(receipt.received)}, referente ${receipt.scope === 'payment' ? 'ao pagamento identificado' : 'aos pagamentos identificados'} neste documento.`, 10);
  y += 5;
  heading('Referente a');
  if (receipt.source_description && receipt.source_description !== reference) { paragraph(receipt.source_description); y += 3; }
  const items = receipt.items ?? [];
  const hasPrices = items.length > 0 && items.every(item => item.unit_price != null && item.total_price != null);
  const tableBase = { margin: { left: 18, right: 18, top: 24, bottom: 27 }, theme: 'plain' as const, rowPageBreak: 'avoid' as const,
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 3, textColor: [38, 47, 59] as [number, number, number], overflow: 'linebreak' as const },
    headStyles: { fillColor: [239, 242, 245] as [number, number, number], textColor: [17, 24, 39] as [number, number, number], fontStyle: 'bold' as const },
    bodyStyles: { lineColor: [225, 230, 235] as [number, number, number], lineWidth: { bottom: 0.2 } },
  };
  if (items.length) {
    autoTable(doc, { ...tableBase, startY: y,
      head: [hasPrices ? ['Descrição do serviço ou produto', 'Qtd.', 'Preço un.', 'Subtotal'] : ['Descrição do serviço ou produto', 'Qtd.']],
      body: items.map(item => hasPrices ? [item.description, String(item.quantity).replace('.', ','), money(item.unit_price!), money(item.total_price!)] : [item.description, String(item.quantity).replace('.', ',')]),
      columnStyles: hasPrices ? { 0: { cellWidth: 85 }, 1: { cellWidth: 15, halign: 'right' }, 2: { cellWidth: 36, halign: 'right' }, 3: { cellWidth: 38, halign: 'right' } } : { 1: { cellWidth: 20, halign: 'right' } },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
    paragraph('Itens apresentados como referência da contratação. O valor deste recibo corresponde aos pagamentos abaixo.', 8, [86, 97, 112]);
  }
  if (receipt.source_total != null && receipt.remaining != null) {
    y += 4; space(22);
    const adjustment = hasPrices ? receipt.source_total - items.reduce((sum, item) => sum + Number(item.total_price), 0) : 0;
    const lines = [...(Math.abs(adjustment) >= 0.01 ? [[adjustment < 0 ? 'Desconto contratado' : 'Ajustes da contratação', money(adjustment)]] : []), ['Total contratado', money(receipt.source_total)], ['Recebido até o momento', money(receipt.received_total ?? receipt.received)], ['Saldo atual a receber', money(receipt.remaining)]];
    doc.setFontSize(9);
    for (const [label, value] of lines) { doc.setTextColor(...dark); doc.setFont('helvetica', 'normal'); doc.text(label, 18, y); doc.setFont('helvetica', 'bold'); doc.text(value, 192, y, { align: 'right' }); y += 6; }
    y += 3;
  }
  y += 5; space(32); heading(receipt.payments.length === 1 ? 'Pagamento comprovado' : 'Pagamentos comprovados');
  autoTable(doc, { ...tableBase, startY: y,
    head: [['Recebido em', 'Forma de pagamento', 'Referência', 'Valor recebido']],
    body: receipt.payments.map(p => [date(p.paid_date), paymentMethodLabel(p.method), p.reference.replace(/-/g, '').slice(0, 12).toUpperCase(), money(p.amount)]),
    columnStyles: { 0: { cellWidth: 31 }, 1: { cellWidth: 65 }, 2: { cellWidth: 32 }, 3: { cellWidth: 46, halign: 'right' } },
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 9;
  paragraph('Este documento comprova somente os valores recebidos acima. Não substitui documento fiscal. O saldo informado reflete a situação atual da contratação.', 8, [86, 97, 112]);
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page); doc.setDrawColor(219, 224, 230); doc.line(18, 273, 192, 273);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(86, 97, 112);
    if (company.address) { doc.setFontSize(7); doc.text(doc.splitTextToSize(company.address, width), 18, 279); }
    doc.setFontSize(8); doc.text(reference, 18, 292); doc.text(`${page} / ${pages}`, 192, 292, { align: 'right' });
  }
  const suffix = receipt.scope === 'payment' ? `_Pagamento_${receipt.payments[0].reference.slice(0, 8)}` : '';
  if (!canSave()) return;
  doc.save(`Recibo${receipt.order_number ? `_OS_${receipt.order_number}` : ''}${suffix}.pdf`);
}
export function paymentMethodLabel(value?: string | null): string {
  const labels: Record<string, string> = { PIX: 'Pix', pix: 'Pix', BOLETO: 'Boleto', boleto: 'Boleto', CREDIT_CARD: 'Cartão de crédito', cartao_credito: 'Cartão de crédito', cartao_debito: 'Cartão de débito', dinheiro: 'Dinheiro', CASH: 'Dinheiro', transferencia: 'Transferência', transferencia_bancaria: 'Transferência' };
  return value ? labels[value] ?? 'Pagamento confirmado' : 'Pagamento confirmado';
}
