import { jsPDF } from 'jspdf';
import autoTable, { type CellDef, type RowInput } from 'jspdf-autotable';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { LucideIcon } from 'lucide-react';

export interface DrePdfPeriodValue {
  value: number;
  impactPercent: number;
}

export type DrePdfRowLevel = 'section' | 'group' | 'category' | 'subcategory' | 'result';

export interface DrePdfRow {
  code: string;
  label: string;
  level: DrePdfRowLevel;
  values: DrePdfPeriodValue[];
  color?: string;
  icon?: LucideIcon;
  isFinalResult?: boolean;
}

export interface DrePdfData {
  company: {
    name: string;
    document?: string;
    phone?: string;
    email?: string;
    address?: string;
    city?: string;
    state?: string;
  };
  brandName: string;
  brandLogoUrl: string;
  periodLabels: string[];
  regime: 'caixa' | 'competencia';
  currency?: string | null;
  rows: DrePdfRow[];
}

const COLORS = {
  navy: [23, 32, 51] as [number, number, number],
  group: [226, 232, 240] as [number, number, number],
  child: [248, 250, 252] as [number, number, number],
  border: [203, 213, 225] as [number, number, number],
  muted: [100, 116, 139] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  text: [15, 23, 42] as [number, number, number],
  positive: [21, 128, 61] as [number, number, number],
  negative: [185, 28, 28] as [number, number, number],
};

const loadImage = async (url: string): Promise<string | undefined> => {
  try {
    const response = await fetch(url);
    if (!response.ok) return undefined;
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : undefined);
      reader.onerror = () => resolve(undefined);
      reader.readAsDataURL(blob);
    });
  } catch {
    return undefined;
  }
};

const fitImage = (document: jsPDF, dataUrl: string, maxWidth: number, maxHeight: number) => {
  const properties = document.getImageProperties(dataUrl);
  const ratio = Math.min(maxWidth / properties.width, maxHeight / properties.height);
  return { width: properties.width * ratio, height: properties.height * ratio };
};

const formatPercent = (value: number) => `${value.toLocaleString('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})}%`;

const currencyFormatter = (currency?: string | null) => new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: currency?.trim().toUpperCase() || 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const parseHexColor = (value?: string): [number, number, number] => {
  const normalized = value?.trim().replace(/^#/, '');
  const hex = normalized?.length === 3
    ? normalized.split('').map((part) => `${part}${part}`).join('')
    : normalized;
  if (!hex || !/^[0-9a-f]{6}$/i.test(hex)) return COLORS.muted;
  return [Number.parseInt(hex.slice(0, 2), 16), Number.parseInt(hex.slice(2, 4), 16), Number.parseInt(hex.slice(4, 6), 16)];
};

const iconToPng = async (Icon: LucideIcon): Promise<string | undefined> => {
  if (typeof window === 'undefined' || !globalThis.document) return undefined;
  try {
    const svg = renderToStaticMarkup(createElement(Icon, {
      width: 64,
      height: 64,
      color: '#ffffff',
      strokeWidth: 2.4,
    }));
    const source = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = reject;
      element.src = source;
    });
    const canvas = globalThis.document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    if (!context) return undefined;
    context.drawImage(image, 0, 0, 64, 64);
    return canvas.toDataURL('image/png');
  } catch {
    return undefined;
  }
};

const rowLabel = (row: DrePdfRow) => {
  const indentation = row.level === 'subcategory' ? '      ' : row.level === 'category' ? '   ' : '';
  const operator = row.level === 'result' ? '= ' : '';
  const iconSpace = row.icon && (row.level === 'category' || row.level === 'subcategory') ? '       ' : '';
  return `${indentation}${row.code}${iconSpace}  ${operator}${row.label}`;
};

export async function buildDrePdf(data: DrePdfData): Promise<jsPDF> {
  const compared = data.periodLabels.length > 1;
  const orientation = compared ? 'landscape' : 'portrait';
  const document = new jsPDF({ orientation, unit: 'mm', format: 'a4', compress: true });
  document.setProperties({
    title: `DRE — ${data.company.name}`,
    subject: `Demonstrativo de Resultado — ${data.periodLabels.join(' × ')}`,
    author: data.brandName,
    creator: data.brandName,
  });

  const pageWidth = document.internal.pageSize.getWidth();
  const pageHeight = document.internal.pageSize.getHeight();
  const margin = 10;
  const contentWidth = pageWidth - margin * 2;
  const formatter = currencyFormatter(data.currency);
  const iconImages = new Map<LucideIcon, string>();
  await Promise.all([...new Set(data.rows.map((row) => row.icon).filter(Boolean) as LucideIcon[])].map(async (Icon) => {
    const image = await iconToPng(Icon);
    if (image) iconImages.set(Icon, image);
  }));

  document.setFillColor(...COLORS.navy);
  document.roundedRect(margin, margin, contentWidth, 20, 1.5, 1.5, 'F');
  document.setTextColor(...COLORS.white);
  document.setFont('helvetica', 'bold');
  document.setFontSize(15);
  document.text('DEMONSTRATIVO DE RESULTADO DO EXERCÍCIO', margin + 5, margin + 8.5);
  document.setFont('helvetica', 'normal');
  document.setFontSize(8);
  document.text(`${data.company.name} · ${data.regime === 'competencia' ? 'Regime de competência' : 'Regime de caixa'}`, margin + 5, margin + 14.5);

  const logo = await loadImage(data.brandLogoUrl);
  if (logo) {
    const fitted = fitImage(document, logo, 42, 11);
    document.addImage(logo, 'PNG', pageWidth - margin - fitted.width - 5, margin + (20 - fitted.height) / 2, fitted.width, fitted.height, undefined, 'FAST');
  }

  const companyDetails = [
    data.company.document ? `CNPJ/CPF: ${data.company.document}` : undefined,
    data.company.phone ? `Telefone: ${data.company.phone}` : undefined,
    data.company.email ? `E-mail: ${data.company.email}` : undefined,
    [data.company.address, data.company.city, data.company.state].filter(Boolean).join(' · ') || undefined,
  ].filter(Boolean) as string[];
  const periodsText = data.periodLabels.length === 1
    ? `Período: ${data.periodLabels[0]}`
    : `Períodos: ${data.periodLabels.join(' · ')}`;
  document.setTextColor(...COLORS.text);
  document.setFontSize(8);
  document.setFont('helvetica', 'bold');
  document.text(periodsText, margin, margin + 25.5);
  document.setFont('helvetica', 'normal');
  document.setTextColor(...COLORS.muted);
  document.text(companyDetails.join('  |  ') || 'Dados cadastrais não informados', margin, margin + 30.5, { maxWidth: contentWidth });

  const body: RowInput[] = data.rows.map((row) => {
    const resultSigned = row.level === 'result';
    const cells: CellDef[] = [{ content: rowLabel(row) }];
    data.periodLabels.forEach((_, index) => {
      const period = row.values[index] ?? { value: 0, impactPercent: 0 };
      const value = resultSigned ? period.value : Math.abs(period.value);
      cells.push({ content: `${formatter.format(value)}   ${formatPercent(period.impactPercent)}` });
    });
    return cells;
  });

  const accountWidth = compared ? Math.max(64, contentWidth * 0.34) : Math.max(82, contentWidth * 0.5);
  const periodWidth = (contentWidth - accountWidth) / data.periodLabels.length;
  const columnStyles: Record<number, { cellWidth: number; halign: 'left' | 'right' }> = {
    0: { cellWidth: accountWidth, halign: 'left' },
  };
  data.periodLabels.forEach((_, index) => {
    columnStyles[index + 1] = { cellWidth: periodWidth, halign: 'right' };
  });

  autoTable(document, {
    startY: margin + 34,
    margin: { top: margin, right: margin, bottom: 12, left: margin },
    head: [[
      'ESTRUTURA DO DRE',
      ...data.periodLabels.map((label) => `${label}\nVALOR · % RECEITA`),
    ]],
    body,
    theme: 'plain',
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    pageBreak: 'auto',
    tableWidth: contentWidth,
    styles: {
      font: 'helvetica',
      fontSize: compared ? 7.2 : 8,
      textColor: COLORS.text,
      cellPadding: { top: 2.2, right: 2.3, bottom: 2.2, left: 2.3 },
      valign: 'middle',
      lineColor: COLORS.border,
      lineWidth: { bottom: 0.12 },
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: COLORS.text,
      fontStyle: 'bold',
      fontSize: compared ? 6.8 : 7.4,
      minCellHeight: 13,
      halign: 'center',
      lineColor: COLORS.border,
      lineWidth: 0.15,
    },
    columnStyles,
    didParseCell: (hook) => {
      if (hook.section === 'head') {
        hook.cell.styles.halign = hook.column.index === 0 ? 'left' : 'right';
        return;
      }
      if (hook.section !== 'body') return;
      const row = data.rows[hook.row.index];
      if (!row) return;
      if (row.level === 'section') {
        hook.cell.styles.fillColor = COLORS.navy;
        hook.cell.styles.textColor = COLORS.white;
        hook.cell.styles.fontStyle = 'bold';
        hook.cell.styles.fontSize = compared ? 7.4 : 8.2;
      } else if (row.level === 'group') {
        hook.cell.styles.fillColor = COLORS.group;
        hook.cell.styles.fontStyle = 'bold';
      } else if (row.level === 'subcategory') {
        hook.cell.styles.fillColor = COLORS.child;
        hook.cell.styles.textColor = COLORS.muted;
        hook.cell.styles.fontSize = compared ? 6.8 : 7.5;
      } else if (row.level === 'result') {
        hook.cell.styles.fillColor = row.isFinalResult
          ? (row.values[0]?.value ?? 0) >= 0 ? COLORS.positive : COLORS.negative
          : COLORS.navy;
        hook.cell.styles.textColor = COLORS.white;
        hook.cell.styles.fontStyle = 'bold';
      }
    },
    didDrawCell: (hook) => {
      if (hook.section !== 'body' || hook.column.index !== 0) return;
      const row = data.rows[hook.row.index];
      if (!row?.icon || (row.level !== 'category' && row.level !== 'subcategory')) return;
      const indentation = row.level === 'subcategory' ? '      ' : '   ';
      document.setFont('helvetica', row.level === 'subcategory' ? 'normal' : 'normal');
      document.setFontSize(row.level === 'subcategory' ? (compared ? 6.8 : 7.5) : (compared ? 7.2 : 8));
      const prefixWidth = document.getTextWidth(`${indentation}${row.code}`);
      const centerX = hook.cell.x + 2.3 + prefixWidth + 2.35;
      const centerY = hook.cell.y + hook.cell.height / 2;
      document.setFillColor(...parseHexColor(row.color));
      document.circle(centerX, centerY, 1.85, 'F');
      const icon = iconImages.get(row.icon);
      if (icon) document.addImage(icon, 'PNG', centerX - 1.15, centerY - 1.15, 2.3, 2.3, undefined, 'FAST');
    },
    didDrawPage: () => {
      const current = document.getNumberOfPages();
      document.setFont('helvetica', 'normal');
      document.setFontSize(7);
      document.setTextColor(...COLORS.muted);
      document.text(`${data.brandName} · DRE · Página ${current}`, margin, pageHeight - 5);
      document.text('Valores e percentuais calculados sobre a receita bruta', pageWidth - margin, pageHeight - 5, { align: 'right' });
    },
  });

  return document;
}

export async function generateDrePdf(data: DrePdfData): Promise<void> {
  const document = await buildDrePdf(data);
  const company = data.company.name.replace(/[^a-zA-Z0-9À-ÿ]+/g, '-').replace(/^-|-$/g, '');
  document.save(`DRE-${company}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
