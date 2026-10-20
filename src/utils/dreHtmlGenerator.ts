import { MESSAGES } from '@/lib/i18n';
import type { LocaleCode } from '@/lib/i18n/locales';
import { safeTimeZone } from '@/lib/timezone';
import { escapeHtml, safeImageUrl } from "./escapeHtml";
import { pdfDownloadAssets } from '@/utils/pdfDownloadButton';
import { formatMoney } from '@/lib/format';

export interface DreExportCategory {
  /** Índice hierárquico visível, ex.: 06.01.017. */
  code?: string;
  name: string;
  value: number;
  color: string;
}

export interface DreExportCompany {
  name: string;
  document?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  logo_url?: string;
}

/** Linha da quebra por centro de custo (a última pode ser "sem centro"). */
export interface DreExportCostCenter {
  name: string;
  color: string;
  revenue: number;
  expense: number;
  result: number;
}

export type DreExportGroupNature =
  | 'revenue'
  | 'deduction'
  | 'cost'
  | 'operating_expense'
  | 'non_operating'
  | 'excluded';

/** Grupo configurável da empresa, já agregado pelo mesmo conjunto do DRE. */
export interface DreExportGroup {
  id: string;
  /** Índice do grupo dentro da estrutura, ex.: 06.01. */
  code?: string;
  name: string;
  nature: DreExportGroupNature;
  total: number;
  categories: DreExportCategory[];
}

export interface DreExportComparisonRow {
  code: string;
  label: string;
  current: number;
  previous: number;
  absolute: number;
  /** Fração decimal (0,125 = 12,5%); `null` quando a base anterior é zero. */
  percentage: number | null;
}

export interface DreExportComparison {
  currentPeriod: string;
  comparisonPeriod: string;
  rows: DreExportComparisonRow[];
}

export interface DreReportData {
  company: DreExportCompany;
  period: string;
  receitaBruta: number;
  /** Quebra da receita usada pelo Excel; opcional para manter callers legados. */
  receitaCategories?: DreExportCategory[];
  impostos: number;
  impostosCategories: DreExportCategory[];
  receitaLiquida: number;
  cpv: number;
  cpvCategories: DreExportCategory[];
  lucroBruto: number;
  opex: number;
  opexCategories: DreExportCategory[];
  resultadoLiquido: number;
  /** Linhas abaixo do resultado operacional; opcionais para callers legados. */
  naoOperacional?: number;
  naoOperacionalCategories?: DreExportCategory[];
  resultadoFinal?: number;
  margem: number;
  /**
   * Estrutura configurável do demonstrativo. Quando presente, exportadores
   * usam estes nomes e esta ordem dentro de cada natureza contábil; os campos
   * legados acima continuam sendo os totais de conferência.
   */
  groups?: DreExportGroup[];
  /**
   * Quebra por centro de custo do MESMO conjunto que gerou os totais acima.
   * Some do documento quando a empresa não usa centro de custo.
   */
  costCenters?: DreExportCostCenter[];
  /** Comparativo de indicadores, usado pela aba dedicada da planilha. */
  comparison?: DreExportComparison;
  /**
   * Regime usado pra montar os números ('caixa' = data do pagamento,
   * 'competencia' = data do fato gerador). Carimbado no cabeçalho do
   * documento: sem isso o cliente manda o PDF pro contador e ninguém sabe qual
   * régua gerou aqueles valores. Padrão: 'caixa'.
   */
  regime?: 'caixa' | 'competencia';
  /** Locale do usuário que está gerando o documento. Padrão: 'pt-br'. */
  locale?: LocaleCode;
  /** Moeda ISO 4217 da empresa. Padrão legado: BRL. */
  currency?: string | null;
  /**
   * Fuso DA EMPRESA (`useAppLocaleContext().timezone`). Entra por parâmetro
   * porque util não chama hook. Ausente ou inválido cai em America/Sao_Paulo.
   */
  timezone?: string | null;
}

export const generateDreHtml = (data: DreReportData) => {
  const locale = data.locale ?? 'pt-br';
  const formatCurrencyBR = (value: number) => formatMoney(value, data.currency || 'BRL', locale);
  const t = MESSAGES[locale].app.finance.dreGenerator;
  const regime = data.regime ?? 'caixa';
  const regimeLabel = regime === 'caixa' ? t.regimeCash : t.regimeAccrual;

  // "Gerado em" é um INSTANTE, então o relógio mostrado é o DA EMPRESA, não o
  // do aparelho de quem exportou nem Brasília chumbado: quem lê o documento é a
  // empresa e o contador dela. `safeTimeZone` impede que um fuso vazio ou
  // inválido derrube a exportação com RangeError.
  const generatedDate = new Date().toLocaleString(
    locale === 'pt-br' ? 'pt-BR' : locale === 'en' ? 'en-US' : locale === 'es' ? 'es-ES' : 'fr-FR',
    { timeZone: safeTimeZone(data.timezone), day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }
  );

  const grossProfitColor = data.lucroBruto > 0 ? '#16a34a' : data.lucroBruto < 0 ? '#dc2626' : '#374151';
  const resultColor = data.resultadoLiquido > 0 ? '#16a34a' : data.resultadoLiquido < 0 ? '#dc2626' : '#1f2937';
  const pct = (value: number) => data.receitaBruta
    ? `${((value / data.receitaBruta) * 100).toFixed(1)}%`
    : '';
  const valueWithPercent = (valueHtml: string, value: number) => `
    <span class="value-with-percent">
      <span>${valueHtml}</span>
      ${pct(value) ? `<span class="percent">${escapeHtml(pct(value))}</span>` : ''}
    </span>`;

  const renderCategories = (categories: DreExportCategory[], isRevenue = false) => categories.map(c => `
    <div class="row">
      <span class="row-label">
        <span class="color-dot" style="background: ${escapeHtml(c.color)}"></span>
        ${c.code ? `<span class="line-code">${escapeHtml(c.code)}</span>` : ''}
        ${escapeHtml(c.name)}
      </span>
      ${valueWithPercent(
        `<span class="${isRevenue ? 'positive' : 'negative'}">${isRevenue ? '' : '-'}${formatCurrencyBR(c.value)}</span>`,
        c.value,
      )}
    </div>
  `).join('');

  const configuredGroups = data.groups ?? [];
  const renderConfiguredGroups = (
    nature: DreExportGroupNature,
    fallbackLabel: string,
    fallbackCategories: DreExportCategory[],
    fallbackTotal: number,
    isRevenue = false,
  ) => {
    const groups = configuredGroups.filter((group) => group.nature === nature);
    const rows = groups.length > 0
      ? groups
      : [{ id: `legacy-${nature}`, name: fallbackLabel, nature, total: fallbackTotal, categories: fallbackCategories }];
    return rows.map((group) => `
      <div class="section-header">
        ${group.code ? `<span class="line-code">${escapeHtml(group.code)}</span>` : ''}
        ${escapeHtml(group.name)}
      </div>
      ${renderCategories(group.categories, isRevenue)}
      <div class="row subtotal">
        <span>${escapeHtml(group.name)}</span>
        ${valueWithPercent(
          `<span class="${isRevenue ? 'positive' : 'negative'}">${isRevenue ? '' : '-'}${formatCurrencyBR(group.total)}</span>`,
          group.total,
        )}
      </div>
    `).join('');
  };

  // Quebra por centro de custo: 3 valores por linha (receita, despesa,
  // resultado). A soma das linhas fecha com a Receita Bruta e com o total de
  // despesas impressos acima — vem do mesmo conjunto de lançamentos.
  const costCenterLines = data.costCenters ?? [];
  const renderCostCenters = () => costCenterLines.map(c => `
    <div class="row">
      <span class="row-label">
        <span class="color-dot" style="background: ${escapeHtml(c.color)}"></span>
        ${escapeHtml(c.name)}
      </span>
      <span class="cc-values">
        <span class="positive">${formatCurrencyBR(c.revenue)}</span>
        <span class="negative">-${formatCurrencyBR(c.expense)}</span>
        ${valueWithPercent(`<span class="${c.result >= 0 ? 'positive' : 'negative'}"><strong>${formatCurrencyBR(c.result)}</strong></span>`, c.result)}
      </span>
    </div>
  `).join('');

  const companyAddress = [data.company.address, data.company.city, data.company.state].filter(Boolean).join(', ');

  const html = `
<!DOCTYPE html>
<html lang="${locale === 'pt-br' ? 'pt-BR' : locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(t.title)} - ${escapeHtml(data.company.name)}</title>
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
    .print-btn { display: none; }
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
    .line-code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; color: #6b7280; white-space: nowrap; }
    .value-with-percent { display: inline-flex; align-items: baseline; justify-content: flex-end; gap: 8px; white-space: nowrap; }
    .percent { min-width: 42px; text-align: right; color: #9ca3af; font-size: 10px; font-weight: 500; }
    .highlight .percent, .result .percent { color: rgba(255,255,255,.82); }
    .color-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .cc-values { display: flex; gap: 16px; align-items: center; }
    .cc-values > span { min-width: 90px; text-align: right; }
    .cc-head { padding: 8px 16px 8px 32px; font-size: 10px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px; display: flex; justify-content: space-between; border-bottom: 1px solid #f3f4f6; }
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
<div id="pdf-root">
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
      <h1 class="title">${escapeHtml(t.title)}</h1>
      <p class="subtitle">${escapeHtml(t.period)}: ${data.period} | ${escapeHtml(t.generatedAt)}: ${generatedDate}</p>
      <p class="subtitle">${escapeHtml(t.regime)}: <strong>${escapeHtml(regimeLabel)}</strong>. ${escapeHtml(regime === 'caixa' ? t.regimeCashHint : t.regimeAccrualHint)}</p>
    </div>

    <div class="dre-container">
      <div class="section-header"><span class="line-code">01</span> ${escapeHtml(t.sectionGrossRevenue)}</div>
      ${renderConfiguredGroups('revenue', t.sectionGrossRevenue, data.receitaCategories ?? [], data.receitaBruta, true)}

      <div class="section-header"><span class="line-code">02</span> ${escapeHtml(t.sectionTaxes)}</div>
      ${renderConfiguredGroups('deduction', t.sectionTaxes, data.impostosCategories, data.impostos)}

      <div class="row highlight" style="background: ${data.receitaLiquida >= 0 ? '#16a34a' : '#dc2626'}">
        <span><span class="line-code" style="color:rgba(255,255,255,.8)">03</span> ${escapeHtml(t.rowNetRevenue)}</span>
        ${valueWithPercent(formatCurrencyBR(data.receitaLiquida), data.receitaLiquida)}
      </div>

      <div class="section-header"><span class="line-code">04</span> ${escapeHtml(t.sectionCogs)}</div>
      ${renderConfiguredGroups('cost', t.sectionCogs, data.cpvCategories, data.cpv)}

      <div class="row highlight" style="background: ${grossProfitColor}">
        <div class="result-label">
          <span><span class="line-code" style="color:rgba(255,255,255,.8)">05</span> ${escapeHtml(t.rowGrossProfit)}</span>
        </div>
        ${valueWithPercent(formatCurrencyBR(data.lucroBruto), data.lucroBruto)}
      </div>

      <div class="section-header"><span class="line-code">06</span> ${escapeHtml(t.sectionOpex)}</div>
      ${renderConfiguredGroups('operating_expense', t.sectionOpex, data.opexCategories, data.opex)}

      <div class="row result" style="background: ${resultColor}">
        <div class="result-label">
          <span><span class="line-code" style="color:rgba(255,255,255,.8)">07</span> ${escapeHtml(t.rowNetResult)}</span>
          <span class="result-sublabel">${data.resultadoLiquido > 0 ? escapeHtml(t.labelSurplus) : data.resultadoLiquido < 0 ? escapeHtml(t.labelDeficit) : escapeHtml(t.labelBalanced)}</span>
        </div>
        ${valueWithPercent(`${data.resultadoLiquido < 0 ? '-' : ''}${formatCurrencyBR(Math.abs(data.resultadoLiquido))}`, data.resultadoLiquido)}
      </div>

      <div class="section-header"><span class="line-code">08</span> ${escapeHtml(configuredGroups.find((group) => group.nature === 'non_operating')?.name ?? 'Resultado não operacional')}</div>
      ${renderConfiguredGroups(
        'non_operating',
        configuredGroups.find((group) => group.nature === 'non_operating')?.name ?? 'Resultado não operacional',
        data.naoOperacionalCategories ?? [],
        data.naoOperacional ?? 0,
      )}

      ${(data.naoOperacional ?? 0) !== 0 ? `
        <div class="row result" style="background: ${(data.resultadoFinal ?? data.resultadoLiquido) >= 0 ? '#16a34a' : '#dc2626'}">
          <span><span class="line-code" style="color:rgba(255,255,255,.8)">09</span> Resultado Final</span>
          ${valueWithPercent(formatCurrencyBR(data.resultadoFinal ?? data.resultadoLiquido), data.resultadoFinal ?? data.resultadoLiquido)}
        </div>
      ` : ''}
    </div>

    ${costCenterLines.length > 0 ? `
      <div class="dre-container">
        <div class="section-header">${escapeHtml(t.sectionCostCenters)}</div>
        <div class="cc-head">
          <span></span>
          <span class="cc-values">
            <span>${escapeHtml(t.colRevenue)}</span>
            <span>${escapeHtml(t.colExpense)}</span>
            <span>${escapeHtml(t.colResult)}</span>
          </span>
        </div>
        ${renderCostCenters()}
      </div>
    ` : ''}

    <div class="footer">
      <div class="footer-text">${escapeHtml(t.generatedBySystem)}</div>
    </div>
  </div>

</div>
${pdfDownloadAssets({ filename: 'dre-' + data.period, label: escapeHtml(t.printSavePdf), targetSelector: '#pdf-root' })}
</body>
</html>`;

  const newWindow = window.open('', '_blank');
  if (newWindow) {
    newWindow.document.write(html);
    newWindow.document.close();
  }
};
