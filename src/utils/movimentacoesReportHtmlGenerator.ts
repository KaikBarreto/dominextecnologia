import type { CompanySettings } from '@/hooks/useCompanySettings';
import { escapeHtml } from '@/utils/escapeHtml';
import { DOMINEX_LOGO_BLACK_BASE64 } from '@/utils/dominexLogoBase64';
import { cpfCnpjMask, phoneMask } from '@/utils/masks';
import { MESSAGES } from '@/lib/i18n';
import type { LocaleCode } from '@/lib/i18n/locales';

/**
 * Relatório HTML printável das Movimentações financeiras.
 *
 * Espelha o padrão do `dreHtmlGenerator.ts` (abre um HTML A4 em nova aba com
 * botão "Imprimir / Salvar PDF") e reusa a régua de cabeçalho/rodapé do
 * `receiptGenerator.ts`:
 *  - Cabeçalho: logo + dados da empresa respeitando os toggles
 *    `show_*_in_documents` de `company_settings`.
 *  - Rodapé Dominex (logo + dominex.app) SÓ quando o tenant NÃO é white-label
 *    (regra-lei #2: white-label não vaza). A flag vem do hook `useWhiteLabel`.
 */

export interface MovimentacaoReportRow {
  /** ISO `YYYY-MM-DD` exibido (já é a data de vencimento da fatura quando cartão). */
  date: string;
  /** 'entrada' | 'saida' */
  type: 'entrada' | 'saida';
  description: string;
  category: string;
  account: string;
  amount: number;
  isPaid: boolean;
}

interface MovimentacoesReportData {
  company: CompanySettings | null | undefined;
  /** true = tenant white-label → não renderiza rodapé Dominex. */
  whiteLabel: boolean;
  title: string;
  rows: MovimentacaoReportRow[];
  /** Locale do usuário que gera o documento. Padrão: 'pt-br'. */
  locale?: LocaleCode;
}

const formatCurrencyBR = (value: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDateBR(dateStr: string): string {
  try {
    return parseLocalDate(dateStr).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  } catch {
    return dateStr;
  }
}

function formatGeneratedAt(locale?: LocaleCode): string {
  const bcp47 =
    locale === 'pt-br' ? 'pt-BR'
    : locale === 'en' ? 'en-US'
    : locale === 'es' ? 'es-ES'
    : locale === 'fr' ? 'fr-FR'
    : 'pt-BR';
  return new Date().toLocaleString(bcp47, {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Linhas de dados da empresa no cabeçalho, respeitando os toggles
 * `show_*_in_documents` (mesmo contrato do recibo/EcoSistema).
 */
function buildCompanyDetails(s: CompanySettings): string {
  const lines: string[] = [];

  if (s.show_address_in_documents && s.address) {
    let a = escapeHtml(s.address);
    if (s.address_number) a += `, ${escapeHtml(s.address_number)}`;
    if (s.complement) a += ` ${escapeHtml(s.complement)}`;
    if (s.neighborhood) a += ` - ${escapeHtml(s.neighborhood)}`;
    if (s.city) a += ` - ${escapeHtml(s.city)}`;
    if (s.state) a += `/${escapeHtml(s.state)}`;
    if (s.zip_code) a += ` - CEP: ${escapeHtml(s.zip_code)}`;
    lines.push(a);
  }

  const contact: string[] = [];
  if (s.show_phone_in_documents && s.phone) contact.push(`Tel: ${escapeHtml(phoneMask(s.phone))}`);
  if (s.show_email_in_documents && s.email) contact.push(escapeHtml(s.email));
  if (contact.length) lines.push(contact.join(' | '));

  if (s.show_cnpj_in_documents && s.document) {
    const digits = s.document.replace(/\D/g, '');
    const label = digits.length <= 11 ? 'CPF' : 'CNPJ';
    lines.push(`${label}: ${escapeHtml(cpfCnpjMask(s.document))}`);
  }

  return lines.join('<br>');
}

function buildHeader(s: CompanySettings | null | undefined): string {
  if (!s) return '';
  const showName = s.show_name_in_documents !== false && s.name;
  const logo = s.logo_url
    ? `<div class="header-logo"><img src="${escapeHtml(s.logo_url)}" alt="Logo" onerror="this.style.display='none'"></div>`
    : '';
  const details = buildCompanyDetails(s);
  return `
    <div class="header">
      ${logo}
      <div class="header-info">
        ${showName ? `<div class="company-name">${escapeHtml(s.name)}</div>` : ''}
        ${details ? `<div class="company-details">${details}</div>` : ''}
      </div>
    </div>`;
}

function buildDominexFooter(whiteLabel: boolean): string {
  if (whiteLabel) return '';
  return `
    <div class="footer">
      <img src="${DOMINEX_LOGO_BLACK_BASE64}" alt="Dominex" class="footer-logo">
      <div class="footer-text">Desenvolvido por Dominex · dominex.app</div>
    </div>`;
}

export function generateMovimentacoesReportHtml(data: MovimentacoesReportData): void {
  const { company, whiteLabel, title, rows } = data;
  const locale = data.locale ?? 'pt-br';
  const t = MESSAGES[locale].app.finance.movimentacoesGenerator;

  let totalEntradas = 0;
  let totalSaidas = 0;
  for (const r of rows) {
    if (r.type === 'entrada') totalEntradas += r.amount;
    else totalSaidas += r.amount;
  }
  const saldo = totalEntradas - totalSaidas;
  const saldoColor = saldo > 0 ? '#16a34a' : saldo < 0 ? '#dc2626' : '#1f2937';

  const generatedAt = formatGeneratedAt(locale);
  const companyName = company?.show_name_in_documents !== false && company?.name ? company.name : 'Relatório';

  const bodyRows = rows.map((r) => {
    const tipoLabel = r.type === 'entrada' ? t.labelRevenue : t.labelExpense;
    const tipoClass = r.type === 'entrada' ? 'tipo-entrada' : 'tipo-saida';
    const valorClass = r.type === 'entrada' ? 'positive' : 'negative';
    const sinal = r.type === 'entrada' ? '+ ' : '- ';
    return `
      <tr>
        <td>${formatDateBR(r.date)}</td>
        <td><span class="tipo-badge ${tipoClass}">${tipoLabel}</span></td>
        <td>${escapeHtml(r.description) || '—'}</td>
        <td>${escapeHtml(r.category) || '—'}</td>
        <td>${escapeHtml(r.account) || '—'}</td>
        <td class="right ${valorClass}">${sinal}${formatCurrencyBR(r.amount)}</td>
        <td class="center"><span class="status-badge ${r.isPaid ? 'status-paid' : 'status-unpaid'}">${r.isPaid ? t.labelPaid : t.labelPending}</span></td>
      </tr>`;
  }).join('');

  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - ${escapeHtml(companyName)}</title>
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
    .table-container { border: 1px solid #e5e5e5; border-radius: 8px; overflow: hidden; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    thead tr { background: linear-gradient(to right, #1f2937, #111827); }
    th { background: transparent; padding: 10px 8px; text-align: left; font-size: 10px; font-weight: 700; color: #fff; letter-spacing: 0.3px; text-transform: uppercase; }
    th.right { text-align: right; }
    th.center { text-align: center; }
    td { padding: 8px; font-size: 11px; color: #1f2937; border-bottom: 1px solid #f3f4f6; vertical-align: middle; }
    td.right { text-align: right; }
    td.center { text-align: center; }
    tbody tr:nth-child(even) td { background: #fafafa; }
    tbody tr:last-child td { border-bottom: none; }
    .positive { color: #16a34a; font-weight: 600; }
    .negative { color: #dc2626; font-weight: 600; }
    .tipo-badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 9px; font-weight: 700; color: #fff; }
    .tipo-entrada { background: #16a34a; }
    .tipo-saida { background: #dc2626; }
    .status-badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 9px; font-weight: 600; }
    .status-paid { background: #dcfce7; color: #166534; }
    .status-unpaid { background: #f3f4f6; color: #4b5563; }
    .totals { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 16px; }
    .total-card { padding: 12px 14px; border: 1px solid #e5e5e5; border-radius: 8px; background: #fafafa; }
    .total-label { font-size: 10px; color: #6b7280; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.3px; }
    .total-value { font-size: 16px; font-weight: 700; }
    .footer { margin-top: 24px; text-align: center; padding-top: 16px; border-top: 1px solid #e5e5e5; }
    .footer-logo { height: 24px; margin-bottom: 6px; }
    .footer-text { font-size: 10px; color: #999; }
    .print-btn { position: fixed; bottom: 20px; right: 20px; background: linear-gradient(to right, #1a1a1a, #374151); color: white; border: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.2); display: flex; align-items: center; gap: 8px; }
    .print-btn:hover { background: linear-gradient(to right, #374151, #4b5563); }
  </style>
</head>
<body>
  <div class="page">
    ${buildHeader(company)}

    <div class="title-section">
      <h1 class="title">${escapeHtml(title)}</h1>
      <p class="subtitle">${rows.length} ${rows.length !== 1 ? t.recordsPlural : t.records} | ${t.generatedAt}: ${generatedAt}</p>
    </div>

    <div class="totals">
      <div class="total-card">
        <div class="total-label">${t.cardLabelEntradas}</div>
        <div class="total-value positive">${formatCurrencyBR(totalEntradas)}</div>
      </div>
      <div class="total-card">
        <div class="total-label">${t.cardLabelSaidas}</div>
        <div class="total-value negative">${formatCurrencyBR(totalSaidas)}</div>
      </div>
      <div class="total-card">
        <div class="total-label">${t.cardLabelSaldo}</div>
        <div class="total-value" style="color: ${saldoColor}">${formatCurrencyBR(saldo)}</div>
      </div>
    </div>

    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>${t.colDate}</th>
            <th>${t.colType}</th>
            <th>${t.colDescription}</th>
            <th>${t.colCategory}</th>
            <th>${t.colAccount}</th>
            <th class="right">${t.colAmount}</th>
            <th class="center">${t.colStatus}</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length > 0 ? bodyRows : `<tr><td colspan="7" class="center" style="padding:24px;color:#9ca3af">${t.emptyPeriod}</td></tr>`}
        </tbody>
      </table>
    </div>

    ${buildDominexFooter(whiteLabel)}
  </div>

  <button class="print-btn no-print" onclick="window.print()">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="6 9 6 2 18 2 18 9"></polyline>
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
      <rect x="6" y="14" width="12" height="8"></rect>
    </svg>
    ${t.printSavePdf}
  </button>
</body>
</html>`;

  const newWindow = window.open('', '_blank');
  if (newWindow) {
    newWindow.document.write(html);
    newWindow.document.close();
  }
}
