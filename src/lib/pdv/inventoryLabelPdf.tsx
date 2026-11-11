import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import jsPDF from 'jspdf';
import { QRCodeSVG } from 'qrcode.react';

export interface InventoryIdentifierLabel {
  materialName: string;
  code: string;
  unitLabel: string;
  unitFactor: number;
  sku?: string | null;
}

export type InventoryLabelFormat = 'a4' | '60x40';

const CODE128_PATTERNS = [
  '212222','222122','222221','121223','121322','131222','122213','122312','132212','221213','221312','231212',
  '112232','122132','122231','113222','123122','123221','223211','221132','221231','213212','223112','312131',
  '311222','321122','321221','312212','322112','322211','212123','212321','232121','111323','131123','131321',
  '112313','132113','132311','211313','231113','231311','112133','112331','132131','113123','113321','133121',
  '313121','211331','231131','213113','213311','213131','311123','311321','331121','312113','312311','332111',
  '314111','221411','431111','111224','111422','121124','121421','141122','141221','112214','112412','122114',
  '122411','142112','142211','241211','221114','413111','241112','134111','111242','121142','121241','114212',
  '124112','124211','411212','421112','421211','212141','214121','412121','111143','111341','131141','114113',
  '114311','411113','411311','113141','114131','311141','411131','211412','211214','211232','2331112',
] as const;

/** Code 128 conjunto B; retorna larguras alternadas barra/espaço, incluindo quiet zone. */
export function encodeCode128B(value: string): number[] {
  if (!value || [...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) > 126)) {
    throw new Error('O Code 128 aceita apenas caracteres imprimíveis ASCII.');
  }
  const values = [...value].map((char) => char.charCodeAt(0) - 32);
  const checksum = (104 + values.reduce((sum, item, index) => sum + item * (index + 1), 0)) % 103;
  const symbols = [104, ...values, checksum, 106];
  return [10, ...symbols.flatMap((symbol) => [...CODE128_PATTERNS[symbol]].map(Number)), 10];
}

function drawCode128(document: jsPDF, value: string, x: number, y: number, width: number, height: number) {
  const widths = encodeCode128B(value);
  const moduleWidth = width / widths.reduce((sum, item) => sum + item, 0);
  let cursor = x;
  widths.forEach((modules, index) => {
    const segmentWidth = modules * moduleWidth;
    // O primeiro segmento e quiet zone. Depois dele, pares sao barras.
    if (index > 0 && index % 2 === 1) document.rect(cursor, y, segmentWidth, height, 'F');
    cursor += segmentWidth;
  });
}

async function qrPng(value: string, size = 240): Promise<string> {
  if (typeof document === 'undefined') throw new Error('A geração de etiqueta precisa ser iniciada no navegador.');
  const svg = renderToStaticMarkup(createElement(QRCodeSVG, {
    value,
    size,
    level: 'M',
    marginSize: 2,
    bgColor: '#ffffff',
    fgColor: '#000000',
  }));
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const next = new Image();
      next.onload = () => resolve(next);
      next.onerror = () => reject(new Error('Não foi possível desenhar o QR Code.'));
      next.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('O navegador não oferece suporte à geração da etiqueta.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, size, size);
    context.drawImage(image, 0, 0, size, size);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

function fitText(document: jsPDF, value: string, maxWidth: number) {
  if (document.getTextWidth(value) <= maxWidth) return value;
  let result = value;
  while (result.length > 1 && document.getTextWidth(`${result}…`) > maxWidth) result = result.slice(0, -1);
  return `${result}…`;
}

async function renderLabel(
  document: jsPDF,
  label: InventoryIdentifierLabel,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const padding = 2.5;
  const qrSize = Math.min(14, height - padding * 2);
  const qr = await qrPng(label.code);
  document.setDrawColor(215);
  document.rect(x, y, width, height);
  document.addImage(qr, 'PNG', x + width - qrSize - padding, y + padding, qrSize, qrSize);
  const contentWidth = width - qrSize - padding * 3;
  document.setTextColor(10);
  document.setFont('helvetica', 'bold');
  document.setFontSize(8.5);
  document.text(fitText(document, label.materialName, contentWidth), x + padding, y + 5);
  document.setFont('helvetica', 'normal');
  document.setFontSize(6.5);
  const unit = label.unitFactor === 1 ? label.unitLabel : `${label.unitLabel} = ${label.unitFactor} un.`;
  document.text(fitText(document, unit, contentWidth), x + padding, y + 8.5);
  if (label.sku) document.text(fitText(document, `SKU ${label.sku}`, contentWidth), x + padding, y + 11.5);
  const barcodeY = y + Math.max(13, height - 13);
  drawCode128(document, label.code, x + padding, barcodeY, contentWidth, 7);
  document.setFontSize(6);
  document.text(fitText(document, label.code, contentWidth), x + padding + contentWidth / 2, barcodeY + 9.5, { align: 'center' });
}

/** Gera o PDF sem abrir janela nem imprimir; o chamador decide salvar/visualizar. */
export async function generateInventoryIdentifierLabelPdf(
  labels: InventoryIdentifierLabel[],
  format: InventoryLabelFormat,
): Promise<jsPDF> {
  if (!labels.length) throw new Error('Selecione ao menos uma etiqueta.');
  if (format === '60x40') {
    const document = new jsPDF({ unit: 'mm', format: [60, 40], orientation: 'landscape', compress: true });
    for (let index = 0; index < labels.length; index += 1) {
      if (index > 0) document.addPage([60, 40], 'landscape');
      await renderLabel(document, labels[index], 0, 0, 60, 40);
    }
    return document;
  }
  const document = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  const marginX = 8;
  const marginY = 12;
  const width = (210 - marginX * 2) / 3;
  const height = (297 - marginY * 2) / 8;
  for (let index = 0; index < labels.length; index += 1) {
    const pageIndex = index % 24;
    if (index > 0 && pageIndex === 0) document.addPage('a4', 'portrait');
    const column = pageIndex % 3;
    const row = Math.floor(pageIndex / 3);
    await renderLabel(document, labels[index], marginX + column * width, marginY + row * height, width, height);
  }
  return document;
}
