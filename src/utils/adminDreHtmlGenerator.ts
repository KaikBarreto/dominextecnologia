interface DRELine { name: string; value: number; }
interface DREData {
  grossRevenue: number;
  revenueLines: DRELine[];
  taxes: number;
  taxLines: DRELine[];
  netRevenue: number;
  cpv: number;
  cpvLines: DRELine[];
  grossProfit: number;
  margemBruta?: number;
  opex: number;
  opexLines: DRELine[];
  ebitda: number;
  margin: number;
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function generateAdminDreHtml(dre: DREData, periodLabel: string): string {
  const lucroBrutoBg = dre.grossProfit > 0 ? '#16a34a' : dre.grossProfit < 0 ? '#dc2626' : '#374151';
  const resultBg = dre.ebitda > 0 ? '#16a34a' : dre.ebitda < 0 ? '#dc2626' : '#1f2937';
  const margemBruta = dre.margemBruta ?? (dre.netRevenue > 0 ? (dre.grossProfit / dre.netRevenue) * 100 : 0);

  const renderRows = (items: DRELine[], colorClass: 'positive' | 'negative') =>
    items.map((i) => `
      <div class="row">
        <span class="row-label" style="padding-left:16px;">${i.name}</span>
        <span class="${colorClass}">${colorClass === 'positive' ? '' : '-'}${fmt(i.value)}</span>
      </div>`).join('');

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8" />
<title>DRE Admin · ${periodLabel}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  @page{size:A4 portrait;margin:10mm}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;padding:20px;color:#1a1a1a;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .page{width:210mm;background:white;margin:0 auto;padding:15mm;box-shadow:0 4px 6px rgba(0,0,0,.1)}
  @media print{body{background:white;padding:0}.page{width:100%;box-shadow:none;padding:0}.no-print{display:none!important}}
  .title-section{text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #e5e5e5}
  .title{font-size:20px;font-weight:700;margin-bottom:6px}
  .subtitle{font-size:12px;color:#888}
  .dre-container{border:1px solid #e5e5e5;border-radius:8px;overflow:hidden;margin-bottom:16px}
  .section-header{background:#f9fafb;padding:10px 16px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:#6b7280;border-bottom:1px solid #e5e5e5}
  .row{display:flex;justify-content:space-between;align-items:center;padding:10px 16px 10px 32px;border-bottom:1px solid #f3f4f6;font-size:13px}
  .row:last-child{border-bottom:none}
  .row.subtotal{padding:10px 16px;font-weight:600;background:#f9fafb;border-top:1px solid #e5e5e5}
  .row.highlight{padding:12px 16px;font-weight:600;color:white;border-bottom:none}
  .row.highlight.blue{background:#2563eb}
  .row.highlight.green{background:#16a34a}
  .row.highlight.red{background:#dc2626}
  .row.highlight.gray{background:#374151}
  .row.result{padding:16px;font-size:16px;font-weight:700;color:white}
  .positive{color:#16a34a;font-weight:500}
  .negative{color:#dc2626;font-weight:500}
  .margin-text{font-size:11px;color:rgba(255,255,255,.85);margin-top:2px}
  .result-label{display:flex;flex-direction:column}
  .print-btn{position:fixed;bottom:20px;right:20px;background:linear-gradient(to right,#1a1a1a,#374151);color:white;border:none;padding:12px 24px;border-radius:8px;font-weight:600;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.2)}
</style></head><body>
<div class="page">
  <div class="title-section">
    <h1 class="title">DRE - Demonstrativo de Resultados</h1>
    <p class="subtitle">Período: ${periodLabel}</p>
  </div>
  <div class="dre-container">
    <div class="section-header">(+) Receita Bruta</div>
    ${renderRows(dre.revenueLines, 'positive')}
    <div class="row subtotal"><span>Total Receita Bruta</span><span class="positive">${fmt(dre.grossRevenue)}</span></div>

    ${dre.taxLines.length ? `
      <div class="section-header">(-) Impostos e Deduções</div>
      ${renderRows(dre.taxLines, 'negative')}
      <div class="row subtotal"><span>Total Impostos</span><span class="negative">-${fmt(dre.taxes)}</span></div>` : ''}

    <div class="row highlight blue"><span>(=) RECEITA LÍQUIDA</span><span>${fmt(dre.netRevenue)}</span></div>

    ${dre.cpvLines.length ? `
      <div class="section-header">(-) CPV (Custo do Serviço)</div>
      ${renderRows(dre.cpvLines, 'negative')}
      <div class="row subtotal"><span>Total CPV</span><span class="negative">-${fmt(dre.cpv)}</span></div>` : ''}

    <div class="row highlight" style="background:${lucroBrutoBg}">
      <div class="result-label"><span>(=) LUCRO BRUTO</span><span class="margin-text">Margem Bruta: ${margemBruta.toFixed(1)}%</span></div>
      <span>${fmt(dre.grossProfit)}</span>
    </div>

    <div class="section-header">(-) Despesas Operacionais (OPEX)</div>
    ${renderRows(dre.opexLines, 'negative')}
    <div class="row subtotal"><span>Total OPEX</span><span class="negative">-${fmt(dre.opex)}</span></div>

    <div class="row result" style="background:${resultBg}">
      <div class="result-label"><span>(=) RESULTADO LÍQUIDO (EBITDA)</span><span style="font-size:11px;font-weight:400;opacity:.85">${dre.ebitda >= 0 ? 'Lucro' : 'Prejuízo'} do Período · Margem: ${dre.margin.toFixed(1)}%</span></div>
      <span>${fmt(dre.ebitda)}</span>
    </div>
  </div>
</div>
<button class="print-btn no-print" onclick="window.print()">Imprimir / Salvar PDF</button>
</body></html>`;
}
