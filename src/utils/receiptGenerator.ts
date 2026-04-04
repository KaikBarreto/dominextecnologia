import { format } from 'date-fns';
import type { CompanySettings } from '@/hooks/useCompanySettings';
import type { EmployeeMovement, BalanceSummary } from '@/utils/employeeCalculations';
import { formatMovementType } from '@/utils/employeeCalculations';

interface ReceiptData {
  employeeName: string;
  salary: number;
  movement: EmployeeMovement;
  companySettings?: CompanySettings | null;
  whiteLabel?: boolean;
  generatedByName?: string;
}

function buildCompanyHeader(s: CompanySettings | null | undefined): string {
  if (!s) return '';
  const lines: string[] = [];
  if (s.show_name_in_documents !== false && s.name) lines.push(`<strong style="font-size:16px">${s.name}</strong>`);
  const addrParts: string[] = [];
  if (s.show_address_in_documents && s.address) {
    let a = s.address;
    if (s.address_number) a += `, ${s.address_number}`;
    if (s.complement) a += ` ${s.complement}`;
    if (s.neighborhood) a += ` - ${s.neighborhood}`;
    if (s.city) a += ` - ${s.city}`;
    if (s.state) a += `/${s.state}`;
    if (s.zip_code) a += ` - CEP: ${s.zip_code}`;
    addrParts.push(a);
  }
  if (addrParts.length) lines.push(`<span style="font-size:12px;color:#555">${addrParts.join('')}</span>`);
  const contact: string[] = [];
  if (s.show_phone_in_documents && s.phone) contact.push(`Tel: ${s.phone}`);
  if (s.show_email_in_documents && s.email) contact.push(s.email);
  if (contact.length) lines.push(`<span style="font-size:12px;color:#555">${contact.join(' | ')}</span>`);
  if (s.show_cnpj_in_documents && s.document) lines.push(`<span style="font-size:12px;color:#555">CNPJ: ${s.document}</span>`);
  return lines.join('<br/>');
}

function buildDominexFooter(whiteLabel?: boolean): string {
  if (whiteLabel) return '';
  return `
  <div style="text-align:center;padding-top:24px;border-top:1px solid #eee;margin-top:40px">
    <img src="https://dominextecnologia.lovable.app/lovable-uploads/0d8b9de1-d24c-4a3b-bbbf-d42d3fa27ce6.png" alt="Dominex" style="height:32px;margin-bottom:4px" />
    <br/><span style="font-size:11px;color:#999">dominex.app</span>
  </div>`;
}

export function generateReceiptHTML(data: ReceiptData): string {
  const { employeeName, salary, movement, companySettings, whiteLabel, generatedByName } = data;
  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const details = movement.payment_details || {};
  const bonus = Number(details.bonus) || 0;
  const totalVales = Number(details.totalVales) || 0;
  const totalFaltas = Number(details.totalFaltas) || 0;
  const valeDiscount = Number(details.valeDiscount) || totalVales;
  const paymentMethod = movement.payment_method || details.paymentMethod || 'Não informado';
  const subtotal = salary + bonus;
  const paidAmount = Math.abs(movement.amount);

  const companyHeader = buildCompanyHeader(companySettings);
  const dominexFooter = buildDominexFooter(whiteLabel);
  const dateStr = format(new Date(movement.created_at), "dd/MM/yyyy 'às' HH:mm");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Recibo de Pagamento — ${employeeName}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding:40px; color:#1a1a1a; font-size:13px; max-width:800px; margin:0 auto; }
  .header { margin-bottom:16px; }
  .divider { border:none; border-top:3px solid #00C597; margin:16px 0; }
  h1 { font-size:22px; text-align:center; margin:24px 0 4px; }
  .date-sub { text-align:center; color:#666; font-size:12px; margin-bottom:24px; }
  .section-title { font-weight:700; font-size:14px; margin-bottom:8px; }
  .row { display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #f0f0f0; font-size:13px; }
  .row.indent { padding-left:20px; }
  .row .label { color:#555; }
  .row .value { font-weight:500; }
  .green { color:#16a34a; }
  .red { color:#dc2626; }
  .total-box { margin:24px 0; border:2px solid #e5e5e5; border-radius:10px; padding:16px 20px; display:flex; justify-content:space-between; align-items:center; }
  .total-box .lbl { font-weight:700; font-size:15px; }
  .total-box .val { font-weight:700; font-size:20px; color:#16a34a; }
  .signatures { display:flex; justify-content:space-around; margin-top:60px; }
  .sig-block { text-align:center; width:200px; }
  .sig-line { border-top:1px solid #333; margin-bottom:6px; }
  .sig-name { font-size:12px; font-weight:600; }
  .sig-role { font-size:11px; color:#888; }
  .btn-print { position:fixed; bottom:24px; right:24px; background:linear-gradient(135deg, #1e293b, #0f172a); color:white; border:none; padding:12px 24px; border-radius:10px; cursor:pointer; font-size:14px; font-weight:600; z-index:100; box-shadow:0 4px 14px rgba(0,0,0,0.3); }
  .btn-print:hover { background:linear-gradient(135deg, #334155, #1e293b); }
  @media print { .btn-print { display:none; } }
</style>
</head>
<body>
<button class="btn-print" onclick="window.print()">Salvar em PDF</button>

${companyHeader ? `<div class="header">${companyHeader}</div><hr class="divider" />` : ''}

<h1>RECIBO DE PAGAMENTO</h1>
<p class="date-sub">Emitido em ${dateStr}</p>

<p class="section-title">DADOS DO FUNCIONÁRIO</p>
<div class="row">
  <span class="label">Nome</span>
  <span class="value">${employeeName}</span>
</div>

<br/>
<p class="section-title">DETALHAMENTO</p>
<div class="row">
  <span class="label">Salário Base</span>
  <span class="value">${fmt(salary)}</span>
</div>
${bonus > 0 ? `<div class="row indent">
  <span class="label">+ Bônus</span>
  <span class="value green">+ ${fmt(bonus)}</span>
</div>
<div class="row">
  <span class="label">Subtotal</span>
  <span class="value">${fmt(subtotal)}</span>
</div>` : ''}
${totalVales > 0 ? `<div class="row">
  <span class="label">Total de vales acumulados</span>
  <span class="value red">${fmt(totalVales)}</span>
</div>
<div class="row">
  <span class="label">Vales descontados neste pagamento</span>
  <span class="value red">- ${fmt(valeDiscount)}</span>
</div>` : ''}
${totalFaltas > 0 ? `<div class="row">
  <span class="label">Total de faltas</span>
  <span class="value red">- ${fmt(totalFaltas)}</span>
</div>` : ''}
<div class="row">
  <span class="label">Forma de Pagamento</span>
  <span class="value">${paymentMethod}</span>
</div>
${movement.description ? `<div class="row">
  <span class="label">Observações</span>
  <span class="value">${movement.description}</span>
</div>` : ''}

<div class="total-box">
  <span class="lbl">Valor Líquido Pago</span>
  <span class="val">${fmt(paidAmount)}</span>
</div>

<div class="signatures">
  <div class="sig-block">
    <div class="sig-line"></div>
    <p class="sig-name">${generatedByName || (companySettings?.name || 'Empresa')}</p>
    <p class="sig-role">Responsável / Empresa</p>
  </div>
  <div class="sig-block">
    <div class="sig-line"></div>
    <p class="sig-name">${employeeName}</p>
    <p class="sig-role">Funcionário</p>
  </div>
</div>

${dominexFooter}
</body></html>`;
}

export function generateExtractHTMLWithHeader(
  employeeName: string,
  movements: EmployeeMovement[],
  balance: BalanceSummary,
  companySettings?: CompanySettings | null,
  whiteLabel?: boolean
): string {
  const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const sorted = [...movements].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const companyHeader = buildCompanyHeader(companySettings);
  const dominexFooter = buildDominexFooter(whiteLabel);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Extrato — ${employeeName}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding:32px; color:#1a1a1a; font-size:13px; max-width:900px; margin:0 auto; }
  .header { margin-bottom:16px; }
  .divider { border:none; border-top:3px solid #00C597; margin:16px 0; }
  h1 { font-size:18px; margin-bottom:4px; }
  .subtitle { color:#666; margin-bottom:16px; font-size:12px; }
  .summary { display:flex; gap:12px; margin-bottom:20px; }
  .summary-card { flex:1; border:1px solid #e5e5e5; border-radius:8px; padding:12px; text-align:center; }
  .summary-card .label { font-size:11px; color:#888; text-transform:uppercase; }
  .summary-card .value { font-size:14px; font-weight:700; margin-top:2px; }
  .green { color:#16a34a; }
  .red { color:#dc2626; }
  table { width:100%; border-collapse:collapse; margin-bottom:16px; }
  th, td { padding:8px 10px; text-align:left; border-bottom:1px solid #eee; font-size:12px; }
  th { background:#f9fafb; font-weight:600; font-size:11px; text-transform:uppercase; color:#666; }
  .right { text-align:right; }
  .badge { display:inline-block; padding:2px 8px; border-radius:12px; font-size:10px; font-weight:600; }
  .badge-vale { background:#fef2f2; color:#dc2626; }
  .badge-bonus { background:#f0fdf4; color:#16a34a; }
  .badge-falta { background:#f5f5f5; color:#666; }
  .badge-pagamento { background:#eff6ff; color:#2563eb; }
  .badge-ajuste { background:#f5f5f5; color:#666; }
  .btn-print { position:fixed; top:16px; right:16px; background:#2563eb; color:white; border:none; padding:10px 20px; border-radius:8px; cursor:pointer; font-size:13px; font-weight:600; }
  .btn-print:hover { background:#1d4ed8; }
  @media print { .btn-print { display:none; } }
</style>
</head>
<body>
<button class="btn-print" onclick="window.print()">Salvar em PDF</button>

${companyHeader ? `<div class="header">${companyHeader}</div><hr class="divider" />` : ''}

<h1>Extrato — ${employeeName}</h1>
<p class="subtitle">Gerado em ${format(new Date(), 'dd/MM/yyyy HH:mm')}</p>

<div class="summary">
  <div class="summary-card"><div class="label">Bônus</div><div class="value green">${fmt(balance.totalBonus)}</div></div>
  <div class="summary-card"><div class="label">Vales</div><div class="value red">${fmt(balance.totalVales)}</div></div>
  <div class="summary-card"><div class="label">Faltas</div><div class="value red">${fmt(balance.totalFaltas)}</div></div>
  <div class="summary-card"><div class="label">Saldo</div><div class="value ${balance.currentBalance >= 0 ? 'green' : 'red'}">${fmt(balance.currentBalance)}</div></div>
</div>

<table>
<thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th class="right">Valor</th><th class="right">Saldo</th></tr></thead>
<tbody>
${sorted.map(m => {
  const isDebit = ['vale', 'falta'].includes(m.type);
  const badgeClass = `badge badge-${m.type}`;
  return `<tr>
    <td>${format(new Date(m.created_at), 'dd/MM/yyyy HH:mm')}</td>
    <td><span class="${badgeClass}">${formatMovementType(m.type)}</span></td>
    <td>${m.description || '—'}</td>
    <td class="right ${isDebit ? 'red' : 'green'}">${isDebit ? '-' : '+'}${fmt(Math.abs(m.amount))}</td>
    <td class="right">${fmt(m.balance_after)}</td>
  </tr>`;
}).join('')}
</tbody>
</table>

${dominexFooter}
</body></html>`;
}
