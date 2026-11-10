import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  PDFDocument,
  PDFImage,
  PDFPage,
  PDFFont,
  StandardFonts,
  rgb,
} from "https://esm.sh/pdf-lib@1.17.1";

import {
  dateToExtenso,
  formatDateBr,
  safeTimeZone,
  ymdInTimeZone,
  type TemplateContext,
} from "../_shared/pmoc-templates/context.ts";
import { drawCertificadoPage } from "../_shared/pmoc-templates/certificado.ts";
import { type PmocVariableContext } from "../_shared/pmoc-templates/variables.ts";
import {
  drawCertificadoArtPage,
  fetchImageBytes,
  resolveEffectiveArt,
} from "../_shared/doc-art/certificado-art.ts";
import type { DocArtConfig } from "../_shared/doc-art/types.ts";
import { drawGeneratedByDominexFooter } from "../_shared/pmoc-templates/footer.ts";
import { getDocArtTemplate } from "../_shared/doc-art/templates/index.ts";
import {
  finalizePmocCertificateValidation,
  reservePmocCertificateValidation,
} from "../_shared/pmoc-certificate-validation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DOC_TYPES = new Set(["relatorio_servico", "certificado_conformidade"]);
const BUCKET = "pmoc-documents";

type DocType = "relatorio_servico" | "certificado_conformidade";
type JsonRecord = Record<string, unknown>;

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}

function failure(code: string, message: string, status: number, field?: string): Response {
  return response({ error: code, code, message, ...(field ? { field } : {}) }, status);
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function html(value: unknown): string {
  return text(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function filenamePart(value: unknown, fallback: string): string {
  const clean = text(value)
    .replace(/\p{Cc}/gu, " ")
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (clean || fallback).slice(0, 100).trim();
}

const FILE_MONTHS = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"] as const;

function readableOrderNumber(orderNumber: unknown): string {
  const normalizedOrderNumber = typeof orderNumber === "number" || typeof orderNumber === "string"
    ? String(orderNumber).trim()
    : "";
  const parsed = normalizedOrderNumber ? Number(normalizedOrderNumber) : Number.NaN;
  return Number.isFinite(parsed) ? String(Math.trunc(parsed)).padStart(6, "0") : "sem-numero";
}

function readableFileDate(generatedAt: Date, timeZone: string): string {
  const ymd = ymdInTimeZone(generatedAt.toISOString(), timeZone);
  if (!ymd) return "DATA NÃO INFORMADA";
  return `${String(ymd.day).padStart(2, "0")} ${FILE_MONTHS[ymd.month - 1]} ${ymd.year}`;
}

function documentFileName(docType: DocType, orderNumber: unknown, customerName: unknown, generatedAt: Date, timeZone: string): string {
  const number = readableOrderNumber(orderNumber);
  const label = docType === "relatorio_servico"
    ? "Relatório de Serviço"
    : "Certificado de Conformidade";
  return `${label} - OS ${number} - ${filenamePart(customerName, "Cliente")} - ${readableFileDate(generatedAt, timeZone)}.pdf`;
}

function dateOnly(value: unknown, timeZone: string): string | null {
  const ymd = ymdInTimeZone(typeof value === "string" ? value : null, timeZone);
  if (!ymd) return null;
  return `${String(ymd.year).padStart(4, "0")}-${String(ymd.month).padStart(2, "0")}-${String(ymd.day).padStart(2, "0")}`;
}

function normalizeSegment(value: unknown): string {
  return text(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((n) => n.toString(16).padStart(2, "0")).join("");
}

function addMonthsDateOnly(date: string, months: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const targetMonth = month - 1 + months;
  const targetYear = year + Math.floor(targetMonth / 12);
  const monthIndex = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, monthIndex + 1, 0)).getUTCDate();
  return `${String(targetYear).padStart(4, "0")}-${String(monthIndex + 1).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

function minDate(a: string, b: string): string {
  return a <= b ? a : b;
}

function displayDate(value: unknown): string {
  const raw = text(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "Não informado";
}

function addressOf(row: JsonRecord | null, os?: JsonRecord | null): string {
  const parts = os
    ? [os.service_address, os.service_address_number, os.service_neighborhood, os.service_city, os.service_state, os.service_zip_code]
    : [row?.address, row?.address_number ?? row?.street_number, row?.neighborhood, row?.city, row?.state, row?.zip_code];
  return parts.map((part) => text(part)).filter(Boolean).join(", ");
}

async function loadLogo(url: unknown): Promise<{ bytes: Uint8Array | null; mime: "image/png" | "image/jpeg" | null }> {
  if (!text(url)) return { bytes: null, mime: null };
  try {
    const result = await fetch(text(url));
    if (!result.ok) return { bytes: null, mime: null };
    const contentType = result.headers.get("content-type") ?? "";
    const mime = contentType.includes("png")
      ? "image/png" as const
      : contentType.includes("jpeg") || contentType.includes("jpg")
        ? "image/jpeg" as const
        : null;
    return mime ? { bytes: new Uint8Array(await result.arrayBuffer()), mime } : { bytes: null, mime: null };
  } catch {
    return { bytes: null, mime: null };
  }
}

const A4_W = 595.28;
const A4_H = 841.89;
const REPORT_MARGIN = 42;
const REPORT_DARK = rgb(0.07, 0.10, 0.12);
const REPORT_MUTED = rgb(0.38, 0.42, 0.45);
const REPORT_LINE = rgb(0.87, 0.89, 0.90);

function reportAccent(value: unknown) {
  const raw = text(value).replace(/^#/, "");
  const normalized = /^[0-9a-f]{3}$/i.test(raw)
    ? raw.split("").map((digit) => `${digit}${digit}`).join("")
    : raw;
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return rgb(0, 0, 0);
  return rgb(
    Number.parseInt(normalized.slice(0, 2), 16) / 255,
    Number.parseInt(normalized.slice(2, 4), 16) / 255,
    Number.parseInt(normalized.slice(4, 6), 16) / 255,
  );
}

function pdfSafe(value: unknown): string {
  return text(value, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2010\u2011\u2212]/g, "-")
    .replace(/[\u2022]/g, "·")
    .replace(/[^\u0020-\u007e\u00a0-\u00ff\u20ac\u2013\u2014]/g, "");
}

function wrap(font: PDFFont, value: unknown, size: number, width: number): string[] {
  const words = pdfSafe(value).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width || !line) line = candidate;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines.length ? lines : ["-"];
}

async function drawServiceReport(
  pdf: PDFDocument,
  data: {
    company: JsonRecord;
    customer: JsonRecord;
    order: JsonRecord;
    product: JsonRecord;
    rt: JsonRecord;
    equipment: JsonRecord[];
    completedDate: string;
    validUntil: string;
    companyName: string;
    generatedAt: Date;
    timeZone: string;
    accentColor: string | null;
    logo: { bytes: Uint8Array | null; mime: "image/png" | "image/jpeg" | null };
  },
): Promise<void> {
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let headerLogo: PDFImage | null = null;
  if (data.logo.bytes && data.logo.mime) {
    try {
      headerLogo = data.logo.mime === "image/png"
        ? await pdf.embedPng(data.logo.bytes)
        : await pdf.embedJpg(data.logo.bytes);
    } catch {
      headerLogo = null;
    }
  }
  const accent = reportAccent(data.accentColor);
  let page!: PDFPage;
  let y = 0;

  const newPage = () => {
    page = pdf.addPage([A4_W, A4_H]);
    page.drawRectangle({ x: 0, y: A4_H - 15, width: A4_W, height: 15, color: accent });
    let companyTextX = REPORT_MARGIN;
    if (headerLogo) {
      const logoHeight = Math.min(24, headerLogo.height * (72 / headerLogo.width));
      const logoWidth = headerLogo.width * (logoHeight / headerLogo.height);
      page.drawImage(headerLogo, { x: REPORT_MARGIN, y: A4_H - 64, width: logoWidth, height: logoHeight });
      companyTextX += logoWidth + 10;
    }
    page.drawText(pdfSafe(data.companyName), { x: companyTextX, y: A4_H - 47, size: 9, font: bold, color: REPORT_MUTED, maxWidth: A4_W - companyTextX - 120 });
    if (text(data.company.document)) {
      page.drawText(`CNPJ ${pdfSafe(data.company.document)}`, { x: companyTextX, y: A4_H - 60, size: 7.2, font: regular, color: REPORT_MUTED });
    }
    page.drawText(`OS ${String(Number(data.order.order_number)).padStart(6, "0")}`, { x: A4_W - 110, y: A4_H - 47, size: 9, font: bold, color: accent });
    // Reserva a faixa institucional completa (logo, empresa e CNPJ) antes do
    // título do documento; evita sobreposição quando há logo horizontal.
    y = A4_H - 94;
  };
  const ensure = (height: number) => { if (y - height < 45) newPage(); };
  const title = (label: string) => {
    ensure(38);
    page.drawText(pdfSafe(label.toUpperCase()), { x: REPORT_MARGIN, y, size: 9, font: bold, color: accent });
    y -= 8;
    page.drawLine({ start: { x: REPORT_MARGIN, y }, end: { x: A4_W - REPORT_MARGIN, y }, thickness: 0.7, color: REPORT_LINE });
    y -= 17;
  };
  const paragraph = (value: unknown) => {
    const lines = wrap(regular, value, 9.2, A4_W - REPORT_MARGIN * 2);
    ensure(lines.length * 13 + 9);
    for (const line of lines) { page.drawText(line, { x: REPORT_MARGIN, y, size: 9.2, font: regular, color: REPORT_DARK }); y -= 13; }
    y -= 8;
  };
  const pair = (label: string, value: unknown, x: number, width: number) => {
    page.drawText(pdfSafe(label), { x, y, size: 7, font: bold, color: REPORT_MUTED });
    const lines = wrap(regular, value, 9, width);
    lines.slice(0, 2).forEach((line, index) => page.drawText(line, { x, y: y - 13 - index * 11, size: 9, font: regular, color: REPORT_DARK }));
  };

  newPage();
  page.drawText("RELATÓRIO DE SERVIÇO", { x: REPORT_MARGIN, y, size: 23, font: bold, color: REPORT_DARK });
  y -= 34;
  page.drawText(pdfSafe(text(data.customer.name, "Cliente")), { x: REPORT_MARGIN, y, size: 13, font: bold, color: accent });
  y -= 18;
  paragraph([
    text(data.customer.document) ? `CPF/CNPJ: ${text(data.customer.document)}` : "",
    addressOf(data.customer, data.order) || addressOf(data.customer),
  ].filter(Boolean).join(" · "));

  title("Objetivo");
  paragraph("Registrar a execução dos serviços de higienização e manutenção dos sistemas de climatização, com rastreabilidade dos equipamentos e do produto aplicado.");
  title("Referências legais e periodicidade");
  paragraph("Atendimento realizado em conformidade com a Lei Federal nº 13.589/2018, a Portaria GM/MS nº 3.523/1998 e as normas sanitárias aplicáveis. A periodicidade futura deve observar o PMOC, as condições do ambiente e a orientação do responsável técnico.");

  title("Produto bactericida");
  ensure(73);
  pair("PRODUTO", data.product.name, REPORT_MARGIN, 235);
  pair("FABRICANTE", data.product.pmoc_manufacturer, 310, 240);
  y -= 38;
  pair("REGISTRO ANVISA", data.product.pmoc_anvisa_registration, REPORT_MARGIN, 155);
  pair("LOTE", data.product.pmoc_batch_number || "Não informado", 210, 100);
  pair("FABRICAÇÃO", displayDate(data.product.pmoc_manufactured_on), 330, 90);
  pair("VALIDADE", displayDate(data.product.pmoc_expires_on), 445, 90);
  y -= 45;

  title("Equipamentos atendidos");
  const columns = [143.28, 92, 92, 82, 102];
  const headers = ["IDENTIFICAÇÃO", "MARCA", "MODELO", "CAPACIDADE", "LOCAL"];
  const tableWidth = columns.reduce((sum, width) => sum + width, 0);
  const tableBorder = rgb(0.18, 0.18, 0.18);
  const drawCenteredCell = (value: unknown, x: number, width: number, baseline: number, cellFont: PDFFont, size: number, color = REPORT_DARK) => {
    const safeValue = pdfSafe(value);
    const measured = Math.min(cellFont.widthOfTextAtSize(safeValue, size), width - 8);
    page.drawText(safeValue, {
      x: x + Math.max(4, (width - measured) / 2),
      y: baseline,
      size,
      font: cellFont,
      color,
      maxWidth: width - 8,
    });
  };
  const drawEquipmentHeader = () => {
    ensure(32);
    const top = y + 4;
    const bottom = top - 24;
    let x = REPORT_MARGIN;
    page.drawRectangle({ x, y: bottom, width: tableWidth, height: 24, color: rgb(0, 0, 0), borderColor: tableBorder, borderWidth: 0.75 });
    headers.forEach((header, index) => {
      drawCenteredCell(header, x, columns[index], bottom + 8, bold, 7, rgb(1, 1, 1));
      x += columns[index];
      if (index < headers.length - 1) page.drawLine({ start: { x, y: bottom }, end: { x, y: top }, thickness: 0.65, color: rgb(1, 1, 1) });
    });
    y = bottom;
  };
  drawEquipmentHeader();
  const equipments = data.equipment.length ? data.equipment : [{ name: "Equipamento não vinculado" }];
  for (const item of equipments) {
    if (y < 65) { newPage(); title("Equipamentos atendidos - continuação"); drawEquipmentHeader(); }
    const values = [item.identifier || item.name, item.brand, item.model, item.capacity, item.location];
    const rowTop = y;
    const rowBottom = rowTop - 20;
    let x = REPORT_MARGIN;
    values.forEach((value, index) => {
      drawCenteredCell(value, x, columns[index], rowBottom + 7, regular, 7.2);
      x += columns[index];
      if (index < values.length - 1) page.drawLine({ start: { x, y: rowBottom }, end: { x, y: rowTop }, thickness: 0.55, color: tableBorder });
    });
    page.drawRectangle({ x: REPORT_MARGIN, y: rowBottom, width: tableWidth, height: 20, borderColor: tableBorder, borderWidth: 0.55 });
    y = rowBottom;
  }
  y -= 12;

  title("Laudo e conclusão");
  paragraph(data.order.solution || data.order.diagnosis || "Os equipamentos relacionados foram atendidos e higienizados com o produto identificado neste relatório. Na data da execução, não foram registradas não conformidades adicionais na ordem de serviço.");
  ensure(92);
  pair("RESPONSÁVEL TÉCNICO", data.rt.full_name, REPORT_MARGIN, 230);
  pair("REGISTRO PROFISSIONAL", data.rt.cft_crea || data.rt.registry_number || "Não informado", 310, 240);
  y -= 40;
  pair("DATA DO SERVIÇO", displayDate(data.completedDate), REPORT_MARGIN, 150);
  pair("VALIDADE DOCUMENTAL", displayDate(data.validUntil), 210, 150);
  pair("EMISSÃO ELETRÔNICA", formatDateBr(data.generatedAt, data.timeZone), 390, 145);

  for (const reportPage of pdf.getPages()) {
    reportPage.drawText("Documento emitido eletronicamente a partir da ordem de serviço concluída.", { x: REPORT_MARGIN, y: 35, size: 6.8, font: regular, color: REPORT_MUTED });
    await drawGeneratedByDominexFooter(pdf, reportPage);
  }
}

function certificateHtml(product: JsonRecord): string {
  return `
<h2>CERTIFICADO DE CONFORMIDADE</h2>
<p>A <strong><span data-pmoc-var="empresa.razao_social"></span></strong>, CNPJ <strong><span data-pmoc-var="empresa.cnpj"></span></strong>, certifica a execução do atendimento de higienização e manutenção dos sistemas de climatização descrito na ordem de serviço.</p>
<h3>DADOS DO ATENDIMENTO</h3>
<ul>
  <li><strong>Unidade atendida:</strong> <span data-pmoc-var="cliente.nome"></span></li>
  <li><strong>Local:</strong> <span data-pmoc-var="cliente.endereco"></span></li>
  <li><strong>Responsável técnico:</strong> <span data-pmoc-var="rt.nome"></span> · <span data-pmoc-var="rt.modalidade"></span> · <span data-pmoc-var="rt.cft_crea"></span></li>
</ul>
<h3>PRODUTO APLICADO</h3>
<ul>
  <li><strong>Produto:</strong> ${html(product.name)} · <strong>Fabricante:</strong> ${html(product.pmoc_manufacturer)}</li>
  <li><strong>Registro ANVISA:</strong> ${html(product.pmoc_anvisa_registration)} · <strong>Lote:</strong> ${html(product.pmoc_batch_number || "Não informado")}</li>
  <li><strong>Fabricação:</strong> ${html(displayDate(product.pmoc_manufactured_on))} · <strong>Validade do produto:</strong> ${html(displayDate(product.pmoc_expires_on))}</li>
</ul>
<h3>CONFORMIDADE E VALIDADE</h3>
<p>Serviço executado sob responsabilidade técnica, em conformidade com a Lei Federal nº 13.589/2018, a Portaria GM/MS nº 3.523/1998 e as normas sanitárias aplicáveis.</p>
<p><strong>Validade do certificado:</strong> <span data-pmoc-var="documento.validade"></span>, até <span data-pmoc-var="documento.data_vencimento"></span>.<br><strong>Emissão eletrônica:</strong> <span data-pmoc-var="documento.data_emissao"></span>.<br><strong>Código de validação:</strong> <span data-pmoc-var="documento.codigo_validacao"></span>.<br><strong>Valide em:</strong> <span data-pmoc-var="documento.url_validacao"></span>.</p>
`.trim();
}

function certificateProductHtml(product: JsonRecord, orderNumber: string): string {
  return `<strong>${html(product.name)}</strong><br>Fabricante: <strong>${html(product.pmoc_manufacturer)}</strong><br>ANVISA: <strong>${html(product.pmoc_anvisa_registration)}</strong> · Lote: <strong>${html(product.pmoc_batch_number || "Não informado")}</strong><br>Fabricação: <strong>${html(displayDate(product.pmoc_manufactured_on))}</strong> · Validade: <strong>${html(displayDate(product.pmoc_expires_on))}</strong><br>OS <strong>${html(orderNumber)}</strong>`;
}

function ensureCertificateValidationHtml(content: string): string {
  const lines = [
    content.includes('data-pmoc-var="documento.codigo_validacao"')
      ? ""
      : '<strong>Código de validação:</strong> <span data-pmoc-var="documento.codigo_validacao"></span>.',
    content.includes('data-pmoc-var="documento.url_validacao"')
      ? ""
      : '<strong>Valide em:</strong> <span data-pmoc-var="documento.url_validacao"></span>.',
  ].filter(Boolean);
  return lines.length > 0 ? `${content}<p>${lines.join("<br>")}</p>` : content;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return failure("method_not_allowed", "Método HTTP não suportado.", 405);

  try {
    const authorization = req.headers.get("Authorization") ?? "";
    if (!authorization.toLowerCase().startsWith("bearer ")) {
      return failure("unauthorized", "Sessão expirada. Faça login novamente.", 401);
    }
    const body = await req.json().catch(() => null) as JsonRecord | null;
    const serviceOrderId = text(body?.service_order_id);
    const inventoryId = text(body?.inventory_id);
    const responsibleTechnicianId = text(body?.responsible_technician_id);
    const docType = text(body?.doc_type) as DocType;
    const requestedValidityMonths = body?.validity_months == null
      ? null
      : Number(body.validity_months);
    if (!UUID_RE.test(serviceOrderId)) return failure("invalid_service_order_id", "Ordem de serviço inválida.", 400, "service_order_id");
    if (!DOC_TYPES.has(docType)) return failure("invalid_doc_type", "Tipo de documento inválido.", 400, "doc_type");
    if (requestedValidityMonths !== null && (!Number.isInteger(requestedValidityMonths) || requestedValidityMonths < 1 || requestedValidityMonths > 60)) {
      return failure("invalid_validity_months", "Escolha uma duração entre 1 e 60 meses.", 400, "validity_months");
    }
    if (!UUID_RE.test(inventoryId)) return failure("invalid_inventory_id", "Selecione um produto bactericida válido.", 400, "inventory_id");
    if (!UUID_RE.test(responsibleTechnicianId)) return failure("invalid_responsible_technician_id", "Selecione um responsável técnico válido.", 400, "responsible_technician_id");

    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authed = createClient(url, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: userData, error: authError } = await authed.auth.getUser();
    if (authError || !userData.user) return failure("unauthorized", "Sessão expirada. Faça login novamente.", 401);

    // Esta consulta usa o JWT + RLS do chamador. Um UUID de outro tenant
    // resulta no mesmo 404 de um UUID inexistente.
    const { data: accessibleOrder } = await authed
      .from("service_orders")
      .select("id,company_id,status,entry_type")
      .eq("id", serviceOrderId)
      .maybeSingle();
    if (!accessibleOrder) return failure("not_found", "Ordem de serviço não encontrada ou sem acesso.", 404);

    const db = createClient(url, serviceRoleKey);
    const { data: order } = await db
      .from("service_orders")
      .select("id,company_id,customer_id,contract_id,equipment_id,order_number,status,entry_type,completed_at,check_out_time,check_out_by,technician_id,team_id,description,diagnosis,solution,service_address,service_address_number,service_neighborhood,service_city,service_state,service_zip_code")
      .eq("id", serviceOrderId)
      .eq("company_id", accessibleOrder.company_id)
      .maybeSingle();
    if (!order) return failure("not_found", "Ordem de serviço não encontrada ou sem acesso.", 404);
    if (order.entry_type === "tarefa" || order.status !== "concluida") {
      return failure("service_order_not_completed", "Finalize a ordem de serviço antes de gerar documentos PMOC.", 409);
    }
    const completionInstant = order.completed_at ?? order.check_out_time;
    if (!completionInstant) return failure("completion_date_missing", "A OS está concluída, mas não possui data de conclusão válida.", 409);

    const userId = userData.user.id;
    const [superResult, editResult, finePermissionResult, entitlementResult, assigneeResult, teamMemberResult] = await Promise.all([
      db.rpc("is_super_admin", { _user_id: userId }),
      db.rpc("can_edit_os", { _user_id: userId }),
      db.rpc("user_has_permission", { _user_id: userId, _key: "fn:edit_os" }),
      db.rpc("tenant_subscription_allows_access", { _company_id: order.company_id }),
      db.from("service_order_assignees").select("id").eq("service_order_id", order.id).eq("user_id", userId).limit(1).maybeSingle(),
      order.team_id
        ? db.from("team_members").select("id").eq("team_id", order.team_id).eq("user_id", userId).limit(1).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    if (entitlementResult.data !== true && superResult.data !== true) {
      return failure("subscription_inactive", "A assinatura da empresa precisa estar ativa para emitir documentos.", 403);
    }
    const canManage = superResult.data === true || editResult.data === true || finePermissionResult.data === true;
    const isExecutionTechnician = order.technician_id === userId
      || order.check_out_by === userId
      || Boolean(assigneeResult.data)
      || Boolean(teamMemberResult.data);
    if (!canManage && !isExecutionTechnician) {
      return failure("forbidden", "Você não tem permissão para emitir documentos desta ordem de serviço.", 403);
    }

    const [{ data: settings }, { data: company }, { data: customer }, { data: product }, { data: rt }, { data: templates }, { data: contract }] = await Promise.all([
      db.from("company_settings").select("name,document,logo_url,white_label_enabled,white_label_logo_url,white_label_primary_color,city,address,address_number,neighborhood,complement,zip_code,state,phone,email,report_header_bg_color,report_header_text_color,report_header_logo_size,timezone,segment,segments").eq("company_id", order.company_id).maybeSingle(),
      db.from("companies").select("id,name").eq("id", order.company_id).maybeSingle(),
      order.customer_id ? db.from("customers").select("id,company_id,name,document,address,address_number,street_number,neighborhood,city,state,zip_code").eq("id", order.customer_id).eq("company_id", order.company_id).maybeSingle() : Promise.resolve({ data: null }),
      db.from("inventory").select("id,company_id,name,is_pmoc_product,pmoc_manufacturer,pmoc_anvisa_registration,pmoc_batch_number,pmoc_manufactured_on,pmoc_expires_on").eq("id", inventoryId).eq("company_id", order.company_id).is("archived_at", null).maybeSingle(),
      db.from("responsible_technicians").select("id,company_id,full_name,cft_crea,modality,registry_number,signature_image_url,stamp_image_url,is_active,updated_at").eq("id", responsibleTechnicianId).eq("company_id", order.company_id).maybeSingle(),
      db.from("company_pmoc_document_templates").select("certificado_content,certificado_validity_months,certificado_art_slug,certificado_art_config").eq("company_id", order.company_id).maybeSingle(),
      order.contract_id ? db.from("contracts").select("id,name,start_date,frequency_type,frequency_value").eq("id", order.contract_id).eq("company_id", order.company_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const { data: contractCustom } = order.contract_id
      ? await db.from("pmoc_contract_documents_custom")
        .select("certificado_content,certificado_art_slug,certificado_art_config")
        .eq("contract_id", order.contract_id)
        .eq("company_id", order.company_id)
        .maybeSingle()
      : { data: null };

    const segments = Array.isArray(settings?.segments) && settings.segments.length
      ? settings.segments
      : [settings?.segment];
    if (!segments.some((segment) => normalizeSegment(segment) === "refrigeracao")) {
      return failure("refrigeration_segment_required", "A geração está disponível para empresas com o segmento Refrigeração ativo.", 403);
    }
    if (!customer) return failure("customer_missing", "A OS precisa ter um cliente vinculado.", 400, "service_order.customer_id");
    if (!product || product.is_pmoc_product !== true) return failure("pmoc_product_not_found", "O produto selecionado não é um bactericida PMOC desta empresa.", 400, "inventory_id");
    if (!product.pmoc_manufacturer || !product.pmoc_anvisa_registration || !product.pmoc_expires_on) {
      return failure("pmoc_product_incomplete", "Complete fabricante, registro ANVISA e validade no cadastro do produto.", 400, "inventory_id");
    }
    if (!rt || rt.is_active !== true) return failure("responsible_technician_inactive", "Selecione um responsável técnico ativo desta empresa.", 400, "responsible_technician_id");
    if (!text(rt.full_name) || !text(rt.modality) || (!text(rt.cft_crea) && !text(rt.registry_number))) {
      return failure("responsible_technician_incomplete", "Complete o nome, a modalidade e o registro profissional do responsável técnico.", 400, "responsible_technician_id");
    }
    if (docType === "certificado_conformidade" && !text(settings?.document)) {
      return failure("company_document_missing", "Cadastre o CNPJ da empresa antes de emitir o certificado.", 400, "company_settings.document");
    }

    const timeZone = safeTimeZone(settings?.timezone ?? null);
    const completedDate = dateOnly(completionInstant, timeZone);
    if (!completedDate) return failure("completion_date_invalid", "A data de conclusão da OS é inválida.", 409);
    if (product.pmoc_manufactured_on && product.pmoc_manufactured_on > completedDate) {
      return failure("pmoc_product_not_yet_valid", "O produto ainda não havia sido fabricado na data de conclusão da OS.", 400, "inventory_id");
    }
    if (product.pmoc_expires_on < completedDate) {
      return failure("pmoc_product_expired", "O produto estava vencido na data de conclusão da OS.", 400, "inventory_id");
    }

    const [{ data: equipmentLinks }, { data: consumedRows }] = await Promise.all([
      db.from("service_order_equipment").select("equipment_id").eq("service_order_id", order.id),
      db.from("service_order_materials").select("inventory_id,quantity,committed_quantity,stock_id").eq("service_order_id", order.id).eq("company_id", order.company_id),
    ]);
    const equipmentIds = Array.from(new Set([order.equipment_id, ...(equipmentLinks ?? []).map((row) => row.equipment_id)].filter(Boolean))) as string[];
    const { data: equipment } = equipmentIds.length
      ? await db.from("equipment").select("id,company_id,name,identifier,brand,model,capacity,location,serial_number").in("id", equipmentIds).eq("company_id", order.company_id)
      : { data: [] };

    const configuredValidityMonths = Math.min(60, Math.max(1, Number(templates?.certificado_validity_months ?? 12)));
    const validityMonths = requestedValidityMonths ?? configuredValidityMonths;
    const nominalValidUntil = addMonthsDateOnly(completedDate, validityMonths);
    const validUntil = minDate(nominalValidUntil, product.pmoc_expires_on);
    const productLimitsValidity = validUntil < nominalValidUntil;
    const companyName = text(settings?.name, text(company?.name, "Empresa"));
    const customerAddress = addressOf(customer, order) || addressOf(customer);
    const orderNumber = readableOrderNumber(order.order_number);
    const generatedAt = new Date();
    const fileName = documentFileName(docType, order.order_number, customer.name, generatedAt, timeZone);
    const consumed = (consumedRows ?? []).find((row) => row.inventory_id === product.id && Number(row.committed_quantity) > 0) ?? null;

    const snapshot = {
      schema_version: 2,
      // O snapshot precisa conter TODOS os inputs efetivamente renderizados.
      // Assim qualquer troca de endereço, laudo, contrato, contato, assinatura
      // ou carimbo muda o hash e nunca devolve um PDF anterior pelo cache.
      company: { record: company, settings, resolved_name: companyName, resolved_address: addressOf(settings as JsonRecord) },
      service_order: { ...order, completion_instant: completionInstant, completed_on: completedDate },
      customer: { ...customer, resolved_address: customerAddress },
      contract,
      product: { ...product, consumption: consumed },
      material_consumptions: consumedRows ?? [],
      responsible_technician: rt,
      equipment: equipment ?? [],
      document: {
        doc_type: docType,
        valid_until: validUntil,
        file_name: fileName,
        art_slug: templates?.certificado_art_slug ?? null,
        art_config: templates?.certificado_art_config ?? null,
        certificate_content: templates?.certificado_content ?? null,
        contract_art_slug: contractCustom?.certificado_art_slug ?? null,
        contract_art_config: contractCustom?.certificado_art_config ?? null,
        contract_certificate_content: contractCustom?.certificado_content ?? null,
        logo_url: settings?.logo_url ?? null,
        white_label_logo_url: settings?.white_label_logo_url ?? null,
        white_label_enabled: settings?.white_label_enabled === true,
        brand_primary: settings?.white_label_primary_color ?? null,
        report_header_bg: settings?.report_header_bg_color ?? null,
        report_header_text: settings?.report_header_text_color ?? null,
        report_header_logo_size: settings?.report_header_logo_size ?? null,
      },
      issued: { generated_at: generatedAt.toISOString(), generated_by: userData.user.id },
    };
    const { issued: _issued, ...hashSnapshot } = snapshot;
    const contentHash = await sha256({ ...hashSnapshot, renderer: docType === "relatorio_servico" ? "os-report-v3-grid-black-accent" : "os-certificate-v7-public-validation" });
    const validationIdentity = docType === "certificado_conformidade"
      ? await reservePmocCertificateValidation(db, {
          companyId: order.company_id,
          contentHash,
          sourceKind: "service_order",
          sourceId: order.id,
        })
      : null;
    const persistedSnapshot = validationIdentity
      ? {
          ...snapshot,
          document: {
            ...snapshot.document,
            validation_code: validationIdentity.validationCode,
            validation_url: validationIdentity.validationUrl,
            certificate_number: validationIdentity.certificateNumber,
          },
        }
      : snapshot;

    const { data: cached } = await db.from("service_order_pmoc_documents")
      .select("id,version,pdf_storage_path,file_name,valid_until,generated_at")
      .eq("service_order_id", order.id).eq("doc_type", docType).eq("content_hash", contentHash)
      .order("version", { ascending: false }).limit(1).maybeSingle();
    if (cached) {
      if (validationIdentity) {
        await finalizePmocCertificateValidation(db, {
          companyId: order.company_id,
          contentHash,
          sourceKind: "service_order",
          documentId: cached.id,
          issuerName: companyName,
          holderName: customer.name,
          sourceLabel: `OS ${orderNumber}`,
          issuedAt: cached.generated_at,
          validUntil: cached.valid_until,
        });
      }
      const { data: signed } = await db.storage.from(BUCKET).createSignedUrl(cached.pdf_storage_path, 3600);
      if (signed?.signedUrl) return response({
        pdf_url: signed.signedUrl,
        file_name: cached.file_name,
        version: cached.version,
        valid_until: cached.valid_until,
        validation_code: validationIdentity?.validationCode ?? null,
        validation_url: validationIdentity?.validationUrl ?? null,
        cached: true,
      });
    }

    const pdf = await PDFDocument.create();
    pdf.setTitle(fileName.replace(/\.pdf$/i, ""));
    pdf.setAuthor(companyName);
    pdf.setProducer("Dominex Tecnologia");
    pdf.setCreator("Dominex Tecnologia");
    const logoUrl = settings?.white_label_enabled === true
      ? settings.white_label_logo_url ?? settings.logo_url
      : settings?.logo_url;
    const documentLogo = await loadLogo(logoUrl);
    if (docType === "relatorio_servico") {
      await drawServiceReport(pdf, {
        company: settings ?? {},
        customer,
        order,
        product,
        rt,
        equipment: equipment ?? [],
        completedDate,
        validUntil,
        companyName,
        generatedAt,
        timeZone,
        accentColor: text(settings?.report_header_bg_color, text(settings?.white_label_primary_color)) || null,
        logo: documentLogo,
      });
    } else {
      const logo = documentLogo;
      const ctx: TemplateContext = {
        empresa: {
          razao_social: companyName,
          cnpj: text(settings?.document),
          cidade: text(settings?.city),
          logo_bytes: logo.bytes,
          logo_mime: logo.mime,
          phone: settings?.phone,
          email: settings?.email,
          address: settings?.address,
          address_number: settings?.address_number,
          neighborhood: settings?.neighborhood,
          state: settings?.state,
          zip_code: settings?.zip_code,
          header_bg_color: settings?.report_header_bg_color,
          header_text_color: settings?.report_header_text_color,
          header_logo_size: settings?.report_header_logo_size,
          white_label_enabled: settings?.white_label_enabled === true,
        },
        rt: { nome: rt.full_name, modalidade: rt.modality, cft_crea: rt.cft_crea, signature_image_url: rt.signature_image_url, stamp_image_url: rt.stamp_image_url },
        customer: { name: customer.name, address: customerAddress, city: customer.city, state: customer.state },
        contract: { name: contract?.name ?? `OS ${orderNumber}`, frequency_label: contract ? "Conforme contrato" : "Atendimento avulso", start_date_extenso: dateToExtenso(completionInstant, timeZone) },
        cidade: text(settings?.city, text(customer.city, "________________")),
        generated_at_extenso: dateToExtenso(generatedAt, timeZone),
      };
      const variableContext: PmocVariableContext = {
        "empresa.nome": companyName, "empresa.razao_social": companyName, "empresa.cnpj": text(settings?.document),
        "empresa.endereco": addressOf(settings as JsonRecord), "empresa.cidade": text(settings?.city), "empresa.estado": text(settings?.state), "empresa.telefone": text(settings?.phone), "empresa.email": text(settings?.email),
        "rt.nome": rt.full_name, "rt.modalidade": text(rt.modality), "rt.cft_crea": text(rt.cft_crea), "rt.registro": text(rt.registry_number),
        "cliente.nome": customer.name, "cliente.documento": text(customer.document), "cliente.endereco": customerAddress, "cliente.cidade": text(customer.city),
        "contrato.nome": contract?.name ?? `OS ${orderNumber}`, "contrato.vigencia_inicio": dateToExtenso(completionInstant, timeZone), "contrato.frequencia": contract ? "Conforme contrato" : "Atendimento avulso",
        "data.hoje_extenso": dateToExtenso(generatedAt, timeZone), "documento.validade": productLimitsValidity ? "limitada à validade do produto" : `${validityMonths} ${validityMonths === 1 ? "mês" : "meses"}`, "documento.data_vencimento": displayDate(validUntil), "documento.data_emissao": formatDateBr(generatedAt, timeZone), "documento.codigo_validacao": validationIdentity?.validationCode ?? "", "documento.url_validacao": validationIdentity?.displayUrl ?? "",
      };
      const effectiveArt = resolveEffectiveArt(
        contractCustom?.certificado_art_slug,
        contractCustom?.certificado_art_config,
        templates?.certificado_art_slug,
        templates?.certificado_art_config,
      );
      if (effectiveArt) {
        const originalConfig = effectiveArt.config ?? {};
        const template = getDocArtTemplate(effectiveArt.slug);
        const adaptedConfig: DocArtConfig = {
          ...originalConfig,
          slots: {
            ...originalConfig.slots,
            produto: certificateProductHtml(product, orderNumber),
            lateral: `<strong>OS ${orderNumber}</strong> · Emitido em <strong>${formatDateBr(generatedAt, timeZone)}</strong> · Válido até <strong>${displayDate(validUntil)}</strong>`,
          },
        };
        await drawCertificadoArtPage(pdf, { slug: effectiveArt.slug, config: adaptedConfig, variables: variableContext, logo: await fetchImageBytes(logoUrl), signatureUrl: rt.signature_image_url, brandPrimary: settings?.white_label_primary_color, validationUrl: validationIdentity?.validationUrl });
      } else {
        const savedCertificateHtml = text(contractCustom?.certificado_content) || text(templates?.certificado_content);
        const configuredHtml = ensureCertificateValidationHtml(savedCertificateHtml
          ? `${savedCertificateHtml}${certificateProductHtml(product, orderNumber)}`
          : certificateHtml(product));
        await drawCertificadoPage(pdf, ctx, configuredHtml, variableContext);
      }
    }

    const bytes = await pdf.save();
    const { data: latest } = await db.from("service_order_pmoc_documents").select("version").eq("service_order_id", order.id).eq("doc_type", docType).order("version", { ascending: false }).limit(1).maybeSingle();
    let version = (latest?.version ?? 0) + 1;
    // Cada tentativa recebe um objeto imutavel. PDFs semanticamente iguais
    // podem ter bytes diferentes por metadados internos do pdf-lib; portanto
    // jamais sobrescrevemos um path que ja esteja referenciado pela auditoria.
    const path = `${order.company_id}/service-orders/${order.id}/${docType}-${contentHash.slice(0, 24)}-${crypto.randomUUID()}.pdf`;
    const { error: uploadError } = await db.storage.from(BUCKET).upload(path, bytes, { contentType: "application/pdf", upsert: false });
    if (uploadError) throw new Error(`storage_upload_failed:${uploadError.message}`);

    let insertedDocumentId: string | null = null;
    for (let attempt = 0; attempt < 3 && !insertedDocumentId; attempt += 1) {
      const { data: insertedDocument, error: insertError } = await db.from("service_order_pmoc_documents").insert({
        company_id: order.company_id, service_order_id: order.id, doc_type: docType, version,
        content_hash: contentHash, pdf_storage_path: path, file_name: fileName, snapshot: persistedSnapshot,
        valid_until: validUntil, generated_at: generatedAt.toISOString(), generated_by: userData.user.id,
      }).select("id").single();
      if (!insertError) {
        insertedDocumentId = insertedDocument.id;
        break;
      }
      if (insertError.code !== "23505") {
        await db.storage.from(BUCKET).remove([path]);
        throw new Error(`document_insert_failed:${insertError.message}`);
      }

      const { data: winner } = await db.from("service_order_pmoc_documents")
        .select("id,version,pdf_storage_path,file_name,valid_until,generated_at")
        .eq("service_order_id", order.id).eq("doc_type", docType).eq("content_hash", contentHash)
        .maybeSingle();
      if (winner) {
        // Esta tentativa perdeu a disputa do mesmo hash; remove somente o seu
        // objeto unico e preserva o artefato imutavel do vencedor.
        await db.storage.from(BUCKET).remove([path]);
        if (validationIdentity) {
          await finalizePmocCertificateValidation(db, {
            companyId: order.company_id,
            contentHash,
            sourceKind: "service_order",
            documentId: winner.id,
            issuerName: companyName,
            holderName: customer.name,
            sourceLabel: `OS ${orderNumber}`,
            issuedAt: winner.generated_at,
            validUntil: winner.valid_until,
          });
        }
        const { data: winnerUrl } = await db.storage.from(BUCKET).createSignedUrl(winner.pdf_storage_path, 3600);
        if (winnerUrl?.signedUrl) return response({
          pdf_url: winnerUrl.signedUrl,
          file_name: winner.file_name,
          version: winner.version,
          valid_until: winner.valid_until,
          validation_code: validationIdentity?.validationCode ?? null,
          validation_url: validationIdentity?.validationUrl ?? null,
          cached: true,
        });
      }
      const { data: newest } = await db.from("service_order_pmoc_documents")
        .select("version").eq("service_order_id", order.id).eq("doc_type", docType)
        .order("version", { ascending: false }).limit(1).maybeSingle();
      version = (newest?.version ?? version) + 1;
      await new Promise((resolve) => setTimeout(resolve, 75));
    }
    if (!insertedDocumentId) {
      await db.storage.from(BUCKET).remove([path]);
      throw new Error("document_insert_conflict");
    }
    if (validationIdentity) {
      await finalizePmocCertificateValidation(db, {
        companyId: order.company_id,
        contentHash,
        sourceKind: "service_order",
        documentId: insertedDocumentId,
        issuerName: companyName,
        holderName: customer.name,
        sourceLabel: `OS ${orderNumber}`,
        issuedAt: generatedAt.toISOString(),
        validUntil,
      });
    }
    const { data: signed, error: signedError } = await db.storage.from(BUCKET).createSignedUrl(path, 3600);
    if (signedError || !signed?.signedUrl) throw new Error("signed_url_failed");
    return response({
      pdf_url: signed.signedUrl,
      file_name: fileName,
      version,
      valid_until: validUntil,
      validation_code: validationIdentity?.validationCode ?? null,
      validation_url: validationIdentity?.validationUrl ?? null,
      cached: false,
    });
  } catch (error) {
    console.error("[generate-os-pmoc-document] falha", error instanceof Error ? error.message : "unknown");
    return failure("document_generation_failed", "Não foi possível gerar o documento PMOC. Tente novamente.", 500);
  }
});
