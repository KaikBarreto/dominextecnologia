import { getPayrollTables, LATEST_PAYROLL_YEAR } from "@/utils/payrollTables";

export interface HoleriteCompany {
  name: string;
  cnpj?: string;
  address?: string;
  [k: string]: unknown;
}

export interface HoleriteLinha {
  label: string;
  valor: number;
  codigo?: string;
  referencia?: string;
}

export interface HoleriteData {
  company: HoleriteCompany;
  employeeName: string;
  position?: string;
  codigo?: string;   // CÓDIGO (matrícula) — em branco se ausente
  cbo?: string;      // CBO — em branco se ausente
  competencia: string;
  proventos: HoleriteLinha[];
  descontos: HoleriteLinha[];
  totalProventos: number;
  totalDescontos: number;
  liquido: number;
  baseINSS: number;
  baseFGTS: number;
  valorFGTS: number;
  baseIRRF: number;
  salarioBase?: number;
  generatedAt?: string;
}

/** Snapshot congelado salvo em employee_movements.payment_details.holerite. */
export interface HoleriteSnapshot {
  mode?: string;
  competencia?: string;
  proventos: { salary: number; adicional: number; bonus: number };
  descontos: { inss: number; irrf: number; vt: number; faltas: number; vales: number };
  bases: { inss: number; irrf: number; fgts: number; fgtsValor: number };
  liquido: number;
}

export interface HoleriteIdentity {
  company: HoleriteCompany;
  employeeName: string;
  position?: string;
  codigo?: string;
  cbo?: string;
}

/**
 * Monta o HoleriteData a partir do snapshot congelado + identidade.
 * FONTE ÚNICA — usado tanto no pagamento quanto ao reabrir o comprovante CLT.
 * NÃO recalcula imposto: usa exclusivamente os valores do snapshot.
 */
export function buildHoleriteData(
  snapshot: HoleriteSnapshot,
  identity: HoleriteIdentity,
): HoleriteData {
  const s = snapshot;

  const fmtPct = (pct: number): string =>
    `${pct.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

  // Alíquota efetiva = desconto / base * 100. Guarda divisão por zero.
  const aliquota = (desconto: number, base: number): string => {
    if (!base || base <= 0) return "";
    return fmtPct((desconto / base) * 100);
  };

  // Alíquota da FAIXA do IRRF (tabela da competência). Deriva o ano de "MM/AAAA";
  // faixa isenta ou base ausente → branco.
  const referenciaIrrf = (): string => {
    const baseIrrf = s.bases.irrf;
    if (!baseIrrf || baseIrrf <= 0) return "";
    const anoParsed = parseInt((s.competencia ?? "").split("/")[1] ?? "", 10);
    const ano = Number.isNaN(anoParsed) ? LATEST_PAYROLL_YEAR : anoParsed;
    const faixa = getPayrollTables(ano).irrf.faixas.find((f) => baseIrrf <= f.ate);
    if (!faixa || faixa.aliquota <= 0) return "";
    return fmtPct(faixa.aliquota * 100);
  };

  const proventos: HoleriteLinha[] = [
    { codigo: "001", label: "SALÁRIO BASE", valor: s.proventos.salary },
    ...(s.proventos.adicional > 0
      ? [{ codigo: "002", label: "ADICIONAL (PERIC./INSALUB.)", valor: s.proventos.adicional }]
      : []),
    ...(s.proventos.bonus > 0
      ? [{ codigo: "003", label: "BÔNUS / COMISSÃO", valor: s.proventos.bonus }]
      : []),
  ];

  const descontos: HoleriteLinha[] = [
    { codigo: "051", label: "INSS", valor: s.descontos.inss, referencia: aliquota(s.descontos.inss, s.bases.inss) },
    ...(s.descontos.vt > 0
      ? [{ codigo: "052", label: "VALE-TRANSPORTE", valor: s.descontos.vt }]
      : []),
    ...(s.descontos.faltas > 0
      ? [{ codigo: "053", label: "FALTAS", valor: s.descontos.faltas }]
      : []),
    { codigo: "054", label: "IRRF", valor: s.descontos.irrf, referencia: referenciaIrrf() },
    ...(s.descontos.vales > 0
      ? [{ codigo: "055", label: "VALES / ADIANTAMENTO", valor: s.descontos.vales }]
      : []),
  ];

  return {
    company: identity.company,
    employeeName: identity.employeeName,
    position: identity.position,
    codigo: identity.codigo,
    cbo: identity.cbo,
    competencia:
      s.competencia ??
      `${String(new Date().getMonth() + 1).padStart(2, "0")}/${new Date().getFullYear()}`,
    proventos,
    descontos,
    totalProventos: s.proventos.salary + s.proventos.adicional + s.proventos.bonus,
    totalDescontos:
      s.descontos.inss + s.descontos.irrf + s.descontos.vt + s.descontos.faltas + s.descontos.vales,
    liquido: s.liquido,
    baseINSS: s.bases.inss,
    baseIRRF: s.bases.irrf,
    baseFGTS: s.bases.fgts,
    valorFGTS: s.bases.fgtsValor,
    salarioBase: s.proventos.salary,
  };
}

const num = (v: number): string =>
  (v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const MIN_BODY_ROWS = 12;

export function generateHoleriteHtml(data: HoleriteData): string {
  const bodyLinhas: { codigo: string; label: string; referencia: string; provento?: number; desconto?: number }[] = [
    ...data.proventos.map((l) => ({ codigo: l.codigo ?? "", label: l.label, referencia: l.referencia ?? "", provento: l.valor })),
    ...data.descontos.map((l) => ({ codigo: l.codigo ?? "", label: l.label, referencia: l.referencia ?? "", desconto: l.valor })),
  ];
  const emptyRows = Math.max(0, MIN_BODY_ROWS - bodyLinhas.length);

  const bodyRowsHtml =
    bodyLinhas.map((l) => `
      <tr>
        <td class="c-cod">${esc(l.codigo)}</td>
        <td class="c-desc">${esc(l.label)}</td>
        <td class="c-ref">${esc(l.referencia)}</td>
        <td class="c-val">${l.provento !== undefined ? num(l.provento) : ""}</td>
        <td class="c-val">${l.desconto !== undefined ? num(l.desconto) : ""}</td>
      </tr>`).join("") +
    Array.from({ length: emptyRows }).map(() => `
      <tr class="empty">
        <td class="c-cod">&nbsp;</td><td class="c-desc"></td><td class="c-ref"></td><td class="c-val"></td><td class="c-val"></td>
      </tr>`).join("");

  const addr = data.company.address ?? "";
  const empHead = [
    data.company.name ? `<div class="emp-name">${esc(data.company.name)}</div>` : "",
    addr ? `<div class="emp-line"><b>Endereço:</b> ${esc(addr.replace(/\n/g, ", "))}</div>` : "",
    data.company.cnpj ? `<div class="emp-line"><b>CNPJ:</b> ${esc(data.company.cnpj)}</div>` : "",
  ].join("");

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Recibo de Pagamento de Salário - ${esc(data.employeeName)} - ${esc(data.competencia)}</title>
<style>
  @page { size: A4 portrait; margin: 12mm; }
  * { box-sizing: border-box; }
  html, body { background: #fff; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color: #000; margin: 0; padding: 14px; font-size: 11px; line-height: 1.25; font-weight: 500; }
  .sheet { max-width: 780px; margin: 0 auto; }
  .frame { display: flex; border: 1.5px solid #000; }
  .main { flex: 1; min-width: 0; }
  .side { width: 26px; border-left: 1.5px solid #000; position: relative; display: flex; flex-direction: column; }
  .side .vtxt { writing-mode: vertical-rl; text-orientation: mixed; transform: rotate(180deg); padding: 8px 3px; font-size: 8px; letter-spacing: .5px; line-height: 1.3; flex: 1; display: flex; align-items: flex-start; justify-content: center; white-space: nowrap; font-weight: 500; }
  .side .sig { writing-mode: vertical-rl; text-orientation: mixed; transform: rotate(180deg); border-top: 1.5px solid #000; padding: 8px 3px; font-size: 8px; letter-spacing: .5px; text-align: center; white-space: nowrap; font-weight: 700; }
  table.grid { width: 100%; border-collapse: collapse; }
  table.grid td, table.grid th { border: 1px solid #000; padding: 3px 5px; vertical-align: top; }
  .top td { vertical-align: top; }
  .top .title-cell { text-align: center; border-left: 1px solid #000; }
  .doc-title { font-size: 13px; font-weight: 700; text-transform: uppercase; color: #000; }
  .ref-label { font-size: 9px; text-transform: uppercase; margin-top: 6px; font-weight: 700; color: #000; }
  .ref-value { font-size: 15px; font-weight: 700; margin-top: 2px; color: #000; }
  .emp-name { font-size: 12px; font-weight: 700; text-transform: uppercase; color: #000; }
  .emp-line { font-size: 10px; margin-top: 2px; font-weight: 700; color: #000; }
  .cap { font-size: 8px; text-transform: uppercase; color: #000; letter-spacing: .3px; display: block; margin-bottom: 1px; font-weight: 700; }
  .func td { font-size: 11px; color: #000; }
  .func .val { font-weight: 700; color: #000; }
  table.rub { width: 100%; border-collapse: collapse; }
  table.rub th, table.rub td { border: 1px solid #000; padding: 2px 5px; }
  table.rub th { font-size: 8.5px; text-transform: uppercase; background: #eee; text-align: center; font-weight: 700; color: #000; }
  table.rub td { font-size: 10.5px; font-weight: 700; color: #000; }
  .c-cod { width: 38px; text-align: center; }
  .c-desc { text-align: left; }
  .c-ref { width: 78px; text-align: center; }
  .c-val { width: 92px; text-align: right; font-variant-numeric: tabular-nums; }
  tr.empty td { height: 15px; }
  table.foot { width: 100%; border-collapse: collapse; }
  table.foot td { border: 1px solid #000; padding: 4px 6px; vertical-align: top; }
  .msg-cell { width: 55%; font-size: 9px; font-weight: 500; color: #000; }
  .msg-title { font-size: 8px; text-transform: uppercase; font-weight: 700; margin-bottom: 3px; color: #000; }
  .tot-label { text-align: right; font-size: 9px; text-transform: uppercase; font-weight: 700; color: #000; }
  .tot-value { text-align: right; width: 92px; font-weight: 700; font-variant-numeric: tabular-nums; color: #000; }
  .liq-label { text-align: right; font-size: 10px; text-transform: uppercase; font-weight: 700; color: #000; }
  .liq-value { text-align: right; font-size: 15px; font-weight: 700; font-variant-numeric: tabular-nums; color: #000; }
  table.bases { width: 100%; border-collapse: collapse; }
  table.bases td { border: 1px solid #000; padding: 3px 6px; text-align: right; font-variant-numeric: tabular-nums; }
  table.bases .cap { text-align: left; }
  .base-val { font-size: 11px; font-weight: 700; color: #000; }
  .actions { position: fixed; bottom: 20px; right: 20px; display: flex; gap: 8px; z-index: 100; }
  .action-btn { background: linear-gradient(to right, #1a1a1a, #374151); color: white; border: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.2); font-family: system-ui, -apple-system, sans-serif; }
  .action-btn:hover { background: linear-gradient(to right, #374151, #4b5563); }
  @media print { body { padding: 0; } .sheet { max-width: none; } .no-print { display: none !important; } }
</style></head>
<body><div class="sheet"><div class="frame">
  <div class="main">
    <table class="grid top">
      <tr>
        <td style="width:62%"><span class="cap">Empregador</span>${empHead}</td>
        <td class="title-cell">
          <div class="doc-title">Recibo de Pagamento<br>de Salário</div>
          <div class="ref-label">Referente ao Mês / Ano</div>
          <div class="ref-value">${esc(data.competencia)}</div>
        </td>
      </tr>
    </table>
    <table class="grid func">
      <tr>
        <td style="width:15%"><span class="cap">Código</span><span class="val">${data.codigo ? esc(data.codigo) : "&nbsp;"}</span></td>
        <td style="width:45%"><span class="cap">Nome do Funcionário</span><span class="val">${esc(data.employeeName)}</span></td>
        <td style="width:15%"><span class="cap">CBO</span><span class="val">${data.cbo ? esc(data.cbo) : "&nbsp;"}</span></td>
        <td style="width:25%"><span class="cap">Função</span><span class="val">${data.position ? esc(data.position) : "&nbsp;"}</span></td>
      </tr>
    </table>
    <table class="rub">
      <thead><tr>
        <th class="c-cod">Cód.</th><th class="c-desc">Descrição</th><th class="c-ref">Referência</th><th class="c-val">Proventos</th><th class="c-val">Descontos</th>
      </tr></thead>
      <tbody>${bodyRowsHtml}</tbody>
    </table>
    <table class="foot">
      <tr>
        <td class="msg-cell" rowspan="3">
          <div class="msg-title">Mensagens</div>
          <div>Valores estimados conforme a legislação da competência; não substitui a orientação do seu contador.</div>
          <div style="margin-top:4px">O FGTS é depósito do empregador (não desconta do empregado).</div>
        </td>
        <td class="tot-label">Total dos Vencimentos</td>
        <td class="tot-value">${num(data.totalProventos)}</td>
      </tr>
      <tr><td class="tot-label">Total dos Descontos</td><td class="tot-value">${num(data.totalDescontos)}</td></tr>
      <tr><td class="liq-label">Líquido a Receber &#8594;</td><td class="liq-value">${num(data.liquido)}</td></tr>
    </table>
    <table class="bases">
      <tr>
        <td><span class="cap">Salário Base</span><span class="base-val">${num(data.salarioBase ?? 0)}</span></td>
        <td><span class="cap">Base Cálc. INSS</span><span class="base-val">${num(data.baseINSS)}</span></td>
        <td><span class="cap">FGTS do Mês</span><span class="base-val">${num(data.valorFGTS)}</span></td>
        <td><span class="cap">Base Cálc. FGTS</span><span class="base-val">${num(data.baseFGTS)}</span></td>
        <td><span class="cap">Base Cálc. IRRF</span><span class="base-val">${num(data.baseIRRF)}</span></td>
      </tr>
    </table>
  </div>
  <div class="side">
    <div class="vtxt">DECLARO TER RECEBIDO A IMPORTÂNCIA LÍQUIDA DISCRIMINADA NESTE RECIBO.</div>
    <div class="sig">ASSINATURA DO FUNCIONÁRIO&nbsp;&nbsp;__________&nbsp;&nbsp;DATA&nbsp;__________</div>
  </div>
</div></div>
<div class="actions no-print">
  <button class="action-btn" onclick="downloadPdf()">Salvar PDF</button>
</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
<script>
  function downloadPdf() {
    var el = document.querySelector('.sheet');
    if (!el || !window.html2pdf) return;
    window.html2pdf().set({
      margin: 0,
      filename: 'holerite-${data.employeeName.replace(/[^a-zA-Z0-9]/g, "-")}-${data.competencia.replace(/[^a-zA-Z0-9]/g, "-")}.pdf',
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).from(el).save();
  }
</script>
</body></html>`;
}
