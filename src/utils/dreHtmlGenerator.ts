import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { escapeHtml, safeImageUrl } from "./escapeHtml";

const formatCurrencyBR = (value: number): string => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
};

interface ExpenseCategory {
  name: string;
  value: number;
  color: string;
}

interface CompanyData {
  name: string;
  document?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  logo_url?: string;
}

interface DreReportData {
  company: CompanyData;
  period: string;
  receitaBruta: number;
  impostos: number;
  impostosCategories: ExpenseCategory[];
  receitaLiquida: number;
  cpv: number;
  cpvCategories: ExpenseCategory[];
  lucroBruto: number;
  opex: number;
  opexCategories: ExpenseCategory[];
  resultadoLiquido: number;
  margem: number;
}

export const generateDreHtml = (data: DreReportData) => {
  const generatedDate = format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });

  const grossProfitColor = data.lucroBruto > 0 ? '#16a34a' : data.lucroBruto < 0 ? '#dc2626' : '#374151';
  const resultColor = data.resultadoLiquido > 0 ? '#16a34a' : data.resultadoLiquido < 0 ? '#dc2626' : '#1f2937';

  const renderCategories = (categories: ExpenseCategory[]) => categories.map(c => `
    <div class="row">
      <span class="row-label">
        <span class="color-dot" style="background: ${escapeHtml(c.color)}"></span>
        ${escapeHtml(c.name)}
      </span>
      <span class="negative">-${formatCurrencyBR(c.value)}</span>
    </div>
  `).join('');

  const companyAddress = [data.company.address, data.company.city, data.company.state].filter(Boolean).join(', ');

  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DRE - ${escapeHtml(data.company.name)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page { size: A4 portrait; margin: 10mm; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
      background: #f5f5f5; padding: 20px; color: #1a1a1a;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .page { width: 210mm; min-height: 297mm; background: white; margin: 0 auto; padding: 15mm; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    @media print { body { background: white; padding: 0; } .page { width: 100%; min-height: auto; box-shadow: none; padding: 0; } .no-print { display: none !important; } }
    .header { display: flex; gap: 16px; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 2px solid #e5e5e5; }
    .header-logo { width: 70px; height: 70px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .header-logo img { max-width: 100%; max-height: 100%; object-fit: contain; }
    .header-info { flex: 1; }
    .company-name { font-size: 18px; font-weight: 700; margin-bottom: 4px; }
    .company-details { font-size: 11px; color: #666; line-height: 1.5; }
    .title-section { text-align: center; margin-bottom: 24px; }
    .title { font-size: 20px; font-weight: 700; margin-bottom: 6px; }
    .subtitle { font-size: 12px; color: #888; }
    .dre-container { border: 1px solid #e5e5e5; border-radius: 8px; overflow: hidden; margin-bottom: 16px; }
    .section-header { background: #f9fafb; padding: 10px 16px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; border-bottom: 1px solid #e5e5e5; }
    .row { display: flex; justify-content: space-between; align-items: center; padding: 10px 16px 10px 32px; border-bottom: 1px solid #f3f4f6; font-size: 13px; }
    .row:last-child { border-bottom: none; }
    .row.highlight { padding: 12px 16px; font-weight: 600; color: white; border-bottom: none; }
    .row.subtotal { padding: 10px 16px; font-weight: 600; background: #f9fafb; border-top: 1px solid #e5e5e5; }
    .row.result { padding: 16px; font-size: 16px; font-weight: 700; color: white; }
    .row-label { display: flex; align-items: center; gap: 8px; }
    .color-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .positive { color: #16a34a; font-weight: 500; }
    .negative { color: #dc2626; font-weight: 500; }
    .result-label { display: flex; flex-direction: column; }
    .result-sublabel { font-size: 11px; font-weight: 400; opacity: 0.85; }
    .margin-text { font-size: 11px; color: rgba(255,255,255,0.8); margin-top: 2px; }
    .footer { margin-top: 24px; text-align: center; padding-top: 16px; border-top: 1px solid #e5e5e5; }
    .footer-text { font-size: 10px; color: #999; }
    .print-btn { position: fixed; bottom: 20px; right: 20px; background: linear-gradient(to right, #1a1a1a, #374151); color: white; border: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.2); display: flex; align-items: center; gap: 8px; }
    .print-btn:hover { background: linear-gradient(to right, #374151, #4b5563); }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      ${safeImageUrl(data.company.logo_url) ? `<div class="header-logo"><img src="${safeImageUrl(data.company.logo_url)}" alt="Logo" onerror="this.style.display='none'"></div>` : ''}
      <div class="header-info">
        <div class="company-name">${escapeHtml(data.company.name)}</div>
        <div class="company-details">
          ${companyAddress ? `${escapeHtml(companyAddress)}<br>` : ''}
          ${data.company.phone ? `Tel: ${escapeHtml(data.company.phone)}` : ''}${data.company.phone && data.company.email ? ' | ' : ''}${escapeHtml(data.company.email) || ''}
          ${data.company.document ? `<br>CNPJ/CPF: ${escapeHtml(data.company.document)}` : ''}
        </div>
      </div>
    </div>
    
    <div class="title-section">
      <h1 class="title">Demonstrativo de Resultado (DRE)</h1>
      <p class="subtitle">Período: ${data.period} | Gerado em: ${generatedDate}</p>
    </div>
    
    <div class="dre-container">
      <div class="section-header">Receita Bruta</div>
      <div class="row">
        <span class="row-label">Total de Receitas</span>
        <span class="positive">${formatCurrencyBR(data.receitaBruta)}</span>
      </div>
      
      ${data.impostosCategories.length > 0 ? `
        <div class="section-header">Impostos e Deduções</div>
        ${renderCategories(data.impostosCategories)}
        <div class="row subtotal">
          <span>Total Impostos</span>
          <span class="negative">-${formatCurrencyBR(data.impostos)}</span>
        </div>
      ` : ''}
      
      <div class="row highlight" style="background: ${data.receitaLiquida >= 0 ? '#16a34a' : '#dc2626'}">
        <span>= Receita Líquida</span>
        <span>${formatCurrencyBR(data.receitaLiquida)}</span>
      </div>
      
      ${data.cpvCategories.length > 0 ? `
        <div class="section-header">Custo do Serviço (CPV)</div>
        ${renderCategories(data.cpvCategories)}
        <div class="row subtotal">
          <span>Total CPV</span>
          <span class="negative">-${formatCurrencyBR(data.cpv)}</span>
        </div>
      ` : ''}
      
      <div class="row highlight" style="background: ${grossProfitColor}">
        <div class="result-label">
          <span>= Lucro Bruto</span>
          <span class="margin-text">Margem: ${data.margem.toFixed(1)}%</span>
        </div>
        <span>${formatCurrencyBR(data.lucroBruto)}</span>
      </div>
      
      ${data.opexCategories.length > 0 ? `
        <div class="section-header">Despesas Operacionais (OPEX)</div>
        ${renderCategories(data.opexCategories)}
        <div class="row subtotal">
          <span>Total OPEX</span>
          <span class="negative">-${formatCurrencyBR(data.opex)}</span>
        </div>
      ` : ''}
      
      <div class="row result" style="background: ${resultColor}">
        <div class="result-label">
          <span>= Resultado Líquido (EBITDA)</span>
          <span class="result-sublabel">${data.resultadoLiquido > 0 ? 'Superávit' : data.resultadoLiquido < 0 ? 'Déficit' : 'Equilibrado'}</span>
        </div>
        <span>${data.resultadoLiquido < 0 ? '-' : ''}${formatCurrencyBR(Math.abs(data.resultadoLiquido))}</span>
      </div>
    </div>
    
    <div class="footer">
      <div class="footer-text">Gerado automaticamente pelo sistema</div>
    </div>
  </div>
  
  <button class="print-btn no-print" onclick="window.print()">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="6 9 6 2 18 2 18 9"></polyline>
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
      <rect x="6" y="14" width="12" height="8"></rect>
    </svg>
    Imprimir / Salvar PDF
  </button>
</body>
</html>`;

  const newWindow = window.open('', '_blank');
  if (newWindow) {
    newWindow.document.write(html);
    newWindow.document.close();
  }
};
