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
  opex: number;
  opexLines: DRELine[];
  ebitda: number;
  margin: number;
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function generateAdminDreHtml(dre: DREData, periodLabel: string): string {
  const row = (label: string, value: number, bold = false, accent = false) => `
    <tr class="${bold ? 'bold' : ''} ${accent ? 'accent' : ''}">
      <td>${label}</td>
      <td class="num ${value < 0 ? 'neg' : 'pos'}">${fmt(value)}</td>
    </tr>`;
  const sub = (lines: DRELine[]) => lines.map((l) => `
    <tr class="sub"><td>&nbsp;&nbsp;&nbsp;&nbsp;${l.name}</td><td class="num">${fmt(l.value)}</td></tr>
  `).join('');

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8" />
<title>DRE Admin - ${periodLabel}</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; padding: 32px; max-width: 800px; margin: auto; color: #0f172a; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .period { color: #64748b; font-size: 13px; margin-bottom: 24px; }
  .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px; }
  .card { border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; }
  .card .lbl { font-size: 11px; text-transform: uppercase; color: #64748b; letter-spacing: 0.05em; }
  .card .val { font-size: 20px; font-weight: 700; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 10px 8px; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
  tr.bold td { font-weight: 600; }
  tr.accent td { background: #f0fdf4; }
  tr.sub td { font-size: 12px; color: #64748b; padding: 4px 8px; border: none; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .pos { color: #059669; }
  .neg { color: #dc2626; }
  @media print { body { padding: 16px; } }
</style></head><body>
<h1>Demonstrativo de Resultado</h1>
<p class="period">Período: ${periodLabel}</p>
<div class="summary">
  <div class="card"><div class="lbl">Receita Líquida</div><div class="val">${fmt(dre.netRevenue)}</div></div>
  <div class="card"><div class="lbl">EBITDA</div><div class="val ${dre.ebitda >= 0 ? 'pos' : 'neg'}">${fmt(dre.ebitda)}</div></div>
  <div class="card"><div class="lbl">Margem</div><div class="val ${dre.margin >= 0 ? 'pos' : 'neg'}">${dre.margin.toFixed(1)}%</div></div>
</div>
<table>
  ${row('Receita Bruta', dre.grossRevenue, true)}
  ${sub(dre.revenueLines)}
  ${row('(-) Impostos e Taxas', -dre.taxes)}
  ${sub(dre.taxLines.map((l) => ({ ...l, value: -l.value })))}
  ${row('= Receita Líquida', dre.netRevenue, true, true)}
  ${dre.cpv > 0 ? row('(-) CPV', -dre.cpv) : ''}
  ${dre.cpv > 0 ? sub(dre.cpvLines.map((l) => ({ ...l, value: -l.value }))) : ''}
  ${dre.cpv > 0 ? row('= Lucro Bruto', dre.grossProfit, true) : ''}
  ${row('(-) Despesas Operacionais', -dre.opex)}
  ${sub(dre.opexLines.map((l) => ({ ...l, value: -l.value })))}
  ${row('= EBITDA', dre.ebitda, true, true)}
</table>
<script>window.onload = () => setTimeout(() => window.print(), 300);</script>
</body></html>`;
}
