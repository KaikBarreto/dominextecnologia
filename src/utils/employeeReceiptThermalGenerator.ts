import jsPDF from 'jspdf';
import type { CompanySettings } from '@/hooks/useCompanySettings';
import { DOMINEX_LOGO_BLACK_BASE64 } from '@/utils/dominexLogoBase64';
import { cpfCnpjMask, phoneMask } from '@/utils/masks';

// ---------------------------------------------------------------------------
// Recibo térmico (80mm) de funcionário — pagamento ou vale.
// Portado do EcoSistema (2-pass measure/render), adaptado pra:
//  - schema do Dominex (CompanySettings) + flags show_*_in_documents
//  - rodapé com a marca Dominex (some em white-label)
// ---------------------------------------------------------------------------

const formatReceiptCurrency = (value: number): string => {
  const rounded = Math.round(((value ?? 0) + Number.EPSILON) * 100) / 100;
  return `R$ ${rounded.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const sanitizeSlug = (s: string): string =>
  (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'funcionario';

// ---------------------------------------------------------------------------
// Compressão de imagem (logo) — downscale ≤maxDim e converte pra JPEG.
// Precaução conhecida: logo de tenant pesado estoura a memória do PDF.
// ---------------------------------------------------------------------------
const compressedImageCache = new Map<string, string>();

const getCompressedImage = async (src: string, maxDim = 512): Promise<{ dataUrl: string; width: number; height: number }> => {
  const cacheKey = `${src}_${maxDim}`;

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    const timeout = setTimeout(() => reject(new Error('Logo load timeout')), 5000);
    image.onload = () => { clearTimeout(timeout); resolve(image); };
    image.onerror = () => { clearTimeout(timeout); reject(new Error('Failed to load logo')); };
    image.src = src;
  });

  let w = img.width;
  let h = img.height;
  if (w > maxDim || h > maxDim) {
    const scale = maxDim / Math.max(w, h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }

  const cached = compressedImageCache.get(cacheKey);
  if (cached) return { dataUrl: cached, width: img.width, height: img.height };

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);

  const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
  compressedImageCache.set(cacheKey, dataUrl);
  return { dataUrl, width: img.width, height: img.height };
};

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
export interface ThermalPaymentBreakdown {
  salary: number;
  totalBonus: number;
  totalFaltas: number;
  totalVales: number;
  valesDescontados: number;
  valesRestantes: number;
  valorPago: number;
  paymentMethod: string;
  description?: string;
}

export interface ThermalValeData {
  amount: number;
  paymentMethod: string;
  date: string;
  description?: string;
}

export interface GenerateEmployeeThermalReceiptParams {
  company: CompanySettings | null | undefined;
  whiteLabel?: boolean;
  employee: {
    name: string;
    position?: string | null;
    cpf?: string | null;
  };
  responsibleName?: string;
  kind: 'pagamento' | 'vale';
  /** Obrigatório quando kind='vale'. */
  vale?: ThermalValeData;
  /** Obrigatório quando kind='pagamento'. */
  payment?: ThermalPaymentBreakdown;
}

const composeAddress = (c: CompanySettings): string => {
  if (!c.address) return '';
  let a = c.address;
  if (c.address_number) a += `, ${c.address_number}`;
  if (c.complement) a += ` ${c.complement}`;
  if (c.neighborhood) a += ` - ${c.neighborhood}`;
  if (c.city) a += ` - ${c.city}`;
  if (c.state) a += `/${c.state}`;
  if (c.zip_code) a += ` | CEP: ${c.zip_code}`;
  return a;
};

// ---------------------------------------------------------------------------
// Cabeçalho da empresa (logo + dados) respeitando show_*_in_documents.
// ---------------------------------------------------------------------------
const renderCompanyHeader = async (doc: jsPDF, company: CompanySettings, startY: number): Promise<number> => {
  let y = startY;

  const logoUrl = company.white_label_enabled
    ? (company.white_label_logo_url || company.logo_url)
    : company.logo_url;
  const hasLogo = !!(logoUrl && logoUrl.trim() !== '');

  const logoColX = 5;
  const logoColWidth = 23;
  const infoColX = logoColX + logoColWidth + 2;
  const infoColWidth = 70 - logoColWidth - 2;

  let infoStartX = logoColX;
  let infoStartWidth = 70;

  if (hasLogo) {
    try {
      const { dataUrl, width, height } = await getCompressedImage(logoUrl!, 512);
      const maxLogoSize = 20;
      const aspect = width / height;
      let logoWidth = maxLogoSize;
      let logoHeight = maxLogoSize;
      if (aspect > 1) logoHeight = maxLogoSize / aspect;
      else if (aspect < 1) logoWidth = maxLogoSize * aspect;

      const logoX = logoColX + (logoColWidth - logoWidth) / 2;
      doc.addImage(dataUrl, 'JPEG', logoX, y + 1, logoWidth, logoHeight);
      infoStartX = infoColX;
      infoStartWidth = infoColWidth;
    } catch (err) {
      console.error('[EmployeeThermalReceipt] Erro ao adicionar logo:', err);
    }
  }

  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  let infoY = y + 3;

  if (company.show_name_in_documents !== false && company.name) {
    const nameLines = doc.splitTextToSize(company.name, infoStartWidth);
    nameLines.forEach((line: string) => {
      doc.text(line, infoStartX, infoY);
      infoY += 4.5;
    });
  }

  if (company.show_cnpj_in_documents && company.document) {
    doc.setFontSize(6.5);
    const clean = company.document.replace(/\D/g, '');
    const label = clean.length <= 11 ? 'CPF: ' : 'CNPJ: ';
    doc.setFont('helvetica', 'bold');
    const labelWidth = doc.getTextWidth(label);
    doc.text(label, infoStartX, infoY);
    doc.setFont('helvetica', 'normal');
    doc.text(cpfCnpjMask(company.document), infoStartX + labelWidth, infoY);
    infoY += 3.5;
  }

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');

  if (company.show_address_in_documents) {
    const addr = composeAddress(company);
    if (addr) {
      doc.setFont('helvetica', 'bold');
      const addrLabel = 'Endereço: ';
      const addrLabelWidth = doc.getTextWidth(addrLabel);
      doc.text(addrLabel, infoStartX, infoY);
      doc.setFont('helvetica', 'normal');
      const addrLines = doc.splitTextToSize(addr, infoStartWidth - addrLabelWidth);
      doc.text(addrLines[0], infoStartX + addrLabelWidth, infoY);
      infoY += 3.5;
      for (let i = 1; i < addrLines.length; i++) {
        doc.text(addrLines[i], infoStartX, infoY);
        infoY += 3.5;
      }
    }
  }

  if (company.show_phone_in_documents && company.phone) {
    doc.setFont('helvetica', 'bold');
    const phoneLabel = 'Telefone: ';
    const phoneLabelWidth = doc.getTextWidth(phoneLabel);
    doc.text(phoneLabel, infoStartX, infoY);
    doc.setFont('helvetica', 'normal');
    doc.text(phoneMask(company.phone), infoStartX + phoneLabelWidth, infoY);
    infoY += 3.5;
  }

  if (company.show_email_in_documents && company.email) {
    doc.setFont('helvetica', 'bold');
    const emailLabel = 'E-mail: ';
    const emailLabelWidth = doc.getTextWidth(emailLabel);
    doc.text(emailLabel, infoStartX, infoY);
    doc.setFont('helvetica', 'normal');
    const emailLines = doc.splitTextToSize(company.email, infoStartWidth - emailLabelWidth);
    doc.text(emailLines[0], infoStartX + emailLabelWidth, infoY);
    infoY += 3.5;
    for (let i = 1; i < emailLines.length; i++) {
      doc.text(emailLines[i], infoStartX, infoY);
      infoY += 3.5;
    }
  }

  y += Math.max(hasLogo ? 22 : 6, infoY - y) + 3;
  return y;
};

// Linha "Label .... Valor" (label esquerda, valor direita, com divisória)
const drawInfoRow = (doc: jsPDF, label: string, value: string, y: number): number => {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(90, 90, 90);
  doc.text(label, 5, y);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(0, 0, 0);
  doc.text(value, 75, y, { align: 'right' });
  doc.setDrawColor(225, 225, 225);
  doc.line(5, y + 1.5, 75, y + 1.5);
  doc.setDrawColor(0, 0, 0);
  return y + 5.5;
};

const drawSectionTitle = (doc: jsPDF, title: string, y: number): number => {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(0, 0, 0);
  doc.text(title.toUpperCase(), 5, y);
  doc.setDrawColor(120, 120, 120);
  doc.setLineWidth(0.3);
  doc.line(5, y + 1.5, 75, y + 1.5);
  doc.setDrawColor(0, 0, 0);
  return y + 5.5;
};

// ---------------------------------------------------------------------------
// Renderer compartilhado (mede e desenha)
// ---------------------------------------------------------------------------
const renderReceipt = async (doc: jsPDF, params: GenerateEmployeeThermalReceiptParams): Promise<number> => {
  const company = params.company;
  const whiteLabel = params.whiteLabel ?? company?.white_label_enabled ?? false;
  const { employee, responsibleName, kind } = params;
  const isVale = kind === 'vale';

  let y = 8;

  // Cabeçalho da empresa (se houver)
  if (company) {
    y = await renderCompanyHeader(doc, company, y);
  }

  // Faixa de título
  const docTitle = isVale ? 'Recibo de Vale' : 'Recibo de Pagamento';
  const generatedDate = new Date().toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });

  doc.setFillColor(0, 0, 0);
  doc.rect(5, y, 70, 9, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(docTitle, 40, y + 6, { align: 'center' });
  doc.setTextColor(0, 0, 0);
  y += 15;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(`Emitido em ${generatedDate}`, 40, y, { align: 'center' });
  y += 6;

  // Funcionário
  y = drawSectionTitle(doc, 'Funcionário', y);
  y = drawInfoRow(doc, 'Nome', employee.name, y);
  if (employee.position) y = drawInfoRow(doc, 'Cargo', employee.position, y);
  if (employee.cpf) y = drawInfoRow(doc, 'CPF', cpfCnpjMask(employee.cpf), y);
  y += 2;

  if (isVale) {
    const vale = params.vale;
    y = drawSectionTitle(doc, 'Dados do Vale', y);
    if (vale?.date) y = drawInfoRow(doc, 'Data/Hora', vale.date, y);
    y = drawInfoRow(doc, 'Forma de Pagamento', vale?.paymentMethod || 'Não informado', y);
    if (vale?.description) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(90, 90, 90);
      doc.text('Observações:', 5, y);
      y += 4;
      doc.setTextColor(0, 0, 0);
      doc.splitTextToSize(vale.description, 70).forEach((line: string) => {
        doc.text(line, 5, y);
        y += 4;
      });
    }
    y += 2;

    doc.setFillColor(0, 0, 0);
    doc.rect(5, y, 70, 9, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`Valor do Vale: ${formatReceiptCurrency(vale?.amount ?? 0)}`, 40, y + 6, { align: 'center' });
    doc.setTextColor(0, 0, 0);
    y += 13;
  } else {
    const p = params.payment;
    const salary = p?.salary ?? 0;
    const totalBonus = p?.totalBonus ?? 0;
    const totalFaltas = p?.totalFaltas ?? 0;
    const totalVales = p?.totalVales ?? 0;
    const valesDescontados = p?.valesDescontados ?? 0;
    const valesRestantes = p?.valesRestantes ?? 0;
    const valorPago = p?.valorPago ?? 0;
    const subtotal = salary + totalBonus - totalFaltas;

    y = drawSectionTitle(doc, 'Detalhamento', y);
    y = drawInfoRow(doc, 'Salário Base', formatReceiptCurrency(salary), y);
    if (totalBonus > 0) y = drawInfoRow(doc, '+ Bônus', `+ ${formatReceiptCurrency(totalBonus)}`, y);
    if (totalFaltas > 0) y = drawInfoRow(doc, '- Faltas', `- ${formatReceiptCurrency(totalFaltas)}`, y);
    y = drawInfoRow(doc, 'Subtotal', formatReceiptCurrency(subtotal), y);
    if (totalVales > 0) {
      y = drawInfoRow(doc, 'Vales acumulados', formatReceiptCurrency(totalVales), y);
      y = drawInfoRow(doc, 'Vales descontados', `- ${formatReceiptCurrency(valesDescontados)}`, y);
    }
    y = drawInfoRow(doc, 'Forma de Pagamento', p?.paymentMethod || 'Não informado', y);
    if (p?.description) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(90, 90, 90);
      doc.text('Observações:', 5, y);
      y += 4;
      doc.setTextColor(0, 0, 0);
      doc.splitTextToSize(p.description, 70).forEach((line: string) => {
        doc.text(line, 5, y);
        y += 4;
      });
    }
    y += 2;

    doc.setFillColor(0, 0, 0);
    doc.rect(5, y, 70, 9, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`Total Pago: ${formatReceiptCurrency(valorPago)}`, 40, y + 6, { align: 'center' });
    doc.setTextColor(0, 0, 0);
    y += 12;

    if (valesRestantes > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text(`Vales restantes (não descontados): ${formatReceiptCurrency(valesRestantes)}`, 40, y, { align: 'center' });
      y += 5;
    }
  }

  // Gerado por
  if (responsibleName) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    doc.text(`Gerado por: ${responsibleName}`, 5, y);
    y += 6;
  }

  // Assinatura do funcionário
  y += 12;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.line(15, y, 65, y);
  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(employee.name, 40, y, { align: 'center' });
  y += 3.5;
  doc.setFontSize(6.5);
  doc.setTextColor(120, 120, 120);
  doc.text('Assinatura do Funcionário', 40, y, { align: 'center' });
  doc.setTextColor(0, 0, 0);
  y += 6;

  // Rodapé Dominex — some no white-label
  if (!whiteLabel) {
    try {
      const { dataUrl } = await getCompressedImage(DOMINEX_LOGO_BLACK_BASE64, 512);
      const logoWidth = 28;
      const logoHeight = 4.7;
      const logoX = (80 - logoWidth) / 2;
      doc.addImage(dataUrl, 'JPEG', logoX, y, logoWidth, logoHeight);
      y += logoHeight + 2;
    } catch (err) {
      console.error('[EmployeeThermalReceipt] Erro no logo do rodapé:', err);
      y += 2;
    }
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    doc.text('dominex.app', 40, y, { align: 'center' });
    y += 5;
  }

  return y;
};

// ---------------------------------------------------------------------------
// API pública — gera o PDF (2-pass) e abre em nova janela.
// ---------------------------------------------------------------------------
export async function generateEmployeeThermalReceipt(params: GenerateEmployeeThermalReceiptParams): Promise<void> {
  // Abre a janela no clique (gesture) pra evitar bloqueio de popup.
  const loadingWindow = window.open('', '_blank');
  if (loadingWindow) {
    loadingWindow.document.write(
      '<html><head><meta charset="utf-8"><title>Gerando recibo…</title></head>' +
      '<body style="font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;color:#475569">' +
      '<p>Gerando recibo…</p></body></html>'
    );
  }

  try {
    // 2-pass: mede a altura real num doc oversized, recria com a altura exata.
    const measureDoc = new jsPDF({ unit: 'mm', format: [80, 9999] });
    const finalY = await renderReceipt(measureDoc, params);
    const contentHeight = Math.max(120, Math.ceil(finalY) + 6);

    const doc = new jsPDF({ unit: 'mm', format: [80, contentHeight] });
    const docTitle = params.kind === 'vale' ? 'Recibo de Vale' : 'Recibo de Pagamento';
    doc.setProperties({ title: `${docTitle} - ${params.employee.name}`, subject: docTitle, creator: 'Dominex' });

    await renderReceipt(doc, params);

    const pdfBlob = doc.output('blob');
    const pdfUrl = URL.createObjectURL(pdfBlob);

    const kindSlug = params.kind === 'vale' ? 'vale' : 'pagamento';
    const nameSlug = sanitizeSlug(params.employee.name);
    const filename = `recibo-${kindSlug}-${nameSlug}.pdf`;

    if (loadingWindow && !loadingWindow.closed) {
      loadingWindow.location.href = pdfUrl;
    } else {
      const link = document.createElement('a');
      link.href = pdfUrl;
      link.download = filename;
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }

    setTimeout(() => URL.revokeObjectURL(pdfUrl), 60000);
  } catch (error) {
    console.error('[EmployeeThermalReceipt] Erro ao gerar recibo:', error);
    if (loadingWindow && !loadingWindow.closed) loadingWindow.close();
    throw error;
  }
}
