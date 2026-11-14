import type { PdvCashV2SessionReport } from '@/hooks/usePdvCashSessionsV2';

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .split('&').join('&amp;')
    .split('<').join('&lt;')
    .split('>').join('&gt;')
    .split('"').join('&quot;')
    .split("'").join('&#039;');
}

const kindLabels: Record<string, string> = {
  opening: 'Abertura',
  cash_receipt: 'Recebimento em dinheiro',
  cash_payment: 'Pagamento em dinheiro',
  supply: 'Suprimento',
  withdrawal: 'Sangria',
  refund: 'Estorno em dinheiro',
  closing_return: 'Retorno ao cofre',
  shortage: 'Falta de caixa',
  surplus: 'Sobra de caixa',
  reversal: 'Compensação',
};

export function renderPdvCashClosingReportHtml(report: PdvCashV2SessionReport): string {
  const summary = [
    ['Dinheiro inicial', report.openingAmount],
    ['Recebimentos', report.cashReceipts],
    ['Pagamentos', -report.cashPayments],
    ['Suprimentos', report.supplies],
    ['Sangrias', -report.withdrawals],
    ['Estornos', -report.refunds],
  ];
  const movementRows = report.entries.map((entry) => `
    <tr>
      <td>${escapeHtml(dateTime.format(new Date(entry.createdAt)))}</td>
      <td>${escapeHtml(kindLabels[entry.kind] ?? entry.kind)}</td>
      <td>${escapeHtml(entry.description || entry.notes || 'Sem observação')}</td>
      <td class="amount ${entry.amount < 0 ? 'negative' : ''}">${escapeHtml(money.format(entry.amount))}</td>
    </tr>`).join('');

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Fechamento de caixa - ${escapeHtml(report.terminalName)}</title>
  <style>
    *{box-sizing:border-box}body{margin:0;background:#f4f4f5;color:#18181b;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    main{width:min(920px,calc(100% - 32px));margin:32px auto;background:#fff;border:1px solid #e4e4e7;border-radius:18px;padding:32px}
    header{display:flex;justify-content:space-between;gap:24px;border-bottom:2px solid #18181b;padding-bottom:20px}h1{font-size:24px;margin:0 0 6px}p{margin:4px 0;color:#52525b}.meta{text-align:right}
    .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:22px 0}.box{border:1px solid #e4e4e7;border-radius:12px;padding:14px}.box span{display:block;color:#71717a;font-size:12px}.box strong{display:block;margin-top:4px;font-size:17px}.strong{background:#18181b;color:#fff;border-color:#18181b}.strong span{color:#d4d4d8}
    h2{font-size:15px;margin:24px 0 10px}table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:10px 8px;border-bottom:1px solid #e4e4e7;text-align:left}th{color:#52525b;font-weight:700}.amount{text-align:right;font-variant-numeric:tabular-nums;font-weight:700}.negative{color:#b91c1c}.notes{padding:14px;border:1px solid #e4e4e7;border-radius:12px;white-space:pre-wrap}
    .actions{display:flex;justify-content:flex-end;margin-top:24px}.actions button{border:0;border-radius:10px;background:#18181b;color:white;padding:12px 18px;font:inherit;font-weight:700;cursor:pointer}
    @media(max-width:680px){main{width:100%;margin:0;border:0;border-radius:0;padding:20px}.grid{grid-template-columns:1fr 1fr}header{display:block}.meta{text-align:left;margin-top:12px}table{font-size:11px}}
    @media print{body{background:#fff}main{width:100%;margin:0;border:0;border-radius:0;padding:0}.actions{display:none}@page{margin:12mm}}
  </style>
</head>
<body>
  <main>
    <header>
      <div><h1>Relatório de fechamento de caixa</h1><p>${escapeHtml(report.terminalName)} · ${escapeHtml(report.operatorName)}</p><p>Conta: ${escapeHtml(report.cashAccountName)}</p></div>
      <div class="meta"><strong>${escapeHtml(dateTime.format(new Date(report.openedAt)))}</strong><p>até ${escapeHtml(dateTime.format(new Date(report.closedAt)))}</p><p>Fechado por ${escapeHtml(report.closedByName)}</p></div>
    </header>
    <section class="grid">
      ${summary.map(([label, value]) => `<div class="box"><span>${escapeHtml(label)}</span><strong>${escapeHtml(money.format(Number(value)))}</strong></div>`).join('')}
      <div class="box strong"><span>Esperado</span><strong>${escapeHtml(money.format(report.expectedAmount))}</strong></div>
      <div class="box strong"><span>Contado</span><strong>${escapeHtml(money.format(report.countedAmount))}</strong></div>
      <div class="box ${report.difference !== 0 ? 'strong' : ''}"><span>Diferença</span><strong>${escapeHtml(money.format(report.difference))}</strong></div>
    </section>
    <h2>Movimentações deste caixa</h2>
    <table><thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th class="amount">Valor</th></tr></thead><tbody>${movementRows || '<tr><td colspan="4">Nenhuma movimentação.</td></tr>'}</tbody></table>
    <h2>Observação do fechamento</h2><div class="notes">${escapeHtml(report.notes || 'Nenhuma observação informada.')}</div>
    <div class="actions"><button type="button" onclick="window.print()">Imprimir</button></div>
  </main>
</body>
</html>`;
}

export function openPdvCashClosingReport(
  target: Window,
  report: PdvCashV2SessionReport,
  printAutomatically = false,
) {
  target.document.open();
  target.document.write(renderPdvCashClosingReportHtml(report));
  target.document.close();
  target.focus();
  if (printAutomatically) target.setTimeout(() => target.print(), 150);
}
