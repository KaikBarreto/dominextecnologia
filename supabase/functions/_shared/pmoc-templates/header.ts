// =============================================================================
// pmoc-templates/header.ts — Cabeçalho com identidade do tenant.
// =============================================================================
// Replicação visual do `<ReportHeader>` da OS (src/components/technician/
// ReportHeader.tsx) dentro de um PDF gerado por pdf-lib. Aparece no topo do
// TRT (e demais documentos PMOC que quiserem ter identidade do tenant).
//
// Layout (do topo pra base, A4 portrait):
//   ┌────────────────────────────────────────────────────────────────┐
//   │  [logo]  Nome da Empresa                                       │ (fundo bg)
//   │          CNPJ • telefone • email                               │
//   │          Endereço completo                                     │
//   └────────────────────────────────────────────────────────────────┘
//
// Cores: respeita `report_header_*` de company_settings; fallback no
// `DEFAULT_HEADER_CONFIG` (bg=#1e293b / texto=#fff).
// =============================================================================

import {
  PDFDocument,
  PDFPage,
  PDFImage,
  PDFFont,
  StandardFonts,
  rgb,
} from "https://esm.sh/pdf-lib@1.17.1";
import { A4_W, MARGIN_X } from "./html-renderer.ts";

// -----------------------------------------------------------------------------
// Config — espelha DEFAULT_HEADER_CONFIG do front
// -----------------------------------------------------------------------------

const DEFAULT_BG = "#1e293b";
const DEFAULT_TEXT = "#ffffff";

export interface HeaderTenant {
  name: string;
  cnpj?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  address_number?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  /** Bytes do logo (PNG ou JPG) já carregados pela edge. Null = sem logo (mostra inicial). */
  logo_bytes?: Uint8Array | null;
  logo_mime?: "image/png" | "image/jpeg" | null;
}

export interface HeaderConfig {
  bgColor?: string | null;
  textColor?: string | null;
  /** Tamanho do logo em pt (largura/altura do quadrado). Default ~48pt. */
  logoSize?: number | null;
}

export interface DrawHeaderResult {
  /** Y do final do header (próximo conteúdo começa abaixo desse Y). */
  bottomY: number;
  /** Altura total ocupada pelo header. */
  height: number;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** Converte "#1e293b" pra [r,g,b] em [0..1]. */
function hexToRgb01(hex: string): [number, number, number] {
  const h = hex.replace("#", "").trim();
  if (h.length !== 6) return [0.118, 0.161, 0.231]; // default slate-800
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  if ([r, g, b].some((v) => Number.isNaN(v))) return [0.118, 0.161, 0.231];
  return [r, g, b];
}

function joinAddressLine(t: HeaderTenant): string {
  const parts = [
    [t.address, t.address_number].filter(Boolean).join(", "),
    t.neighborhood ?? "",
    [t.city, t.state].filter(Boolean).join(" - "),
    t.zip_code ? `CEP: ${t.zip_code}` : "",
  ].filter((s) => s && s.trim().length > 0);
  return parts.join(" • ");
}

function safeText(font: PDFFont, raw: string): string {
  // WinAnsi (Helvetica) não tem todos os glifos Unicode. Substituímos os
  // problemáticos por equivalentes seguros pra não quebrar o render.
  return raw
    .replace(/[–—]/g, "-") // en/em dash → hyphen
    .replace(/[‘’]/g, "'") // smart single quotes
    .replace(/[“”]/g, '"') // smart double quotes
    .replace(/•/g, "-"); // bullet → hyphen
}

// -----------------------------------------------------------------------------
// API principal
// -----------------------------------------------------------------------------

/**
 * Desenha o cabeçalho do tenant no topo da página. Retorna o Y onde o próximo
 * conteúdo deve começar.
 *
 * Não toca em estado fora da página — chamador é responsável por usar o
 * `bottomY` retornado como novo `cursorY` antes de renderizar o restante.
 */
export async function drawTenantHeader(
  pdf: PDFDocument,
  page: PDFPage,
  tenant: HeaderTenant,
  config: HeaderConfig = {},
): Promise<DrawHeaderResult> {
  const pageH = page.getHeight();
  const pageW = A4_W;

  const bgColor = (config.bgColor ?? DEFAULT_BG) || DEFAULT_BG;
  const textColor = (config.textColor ?? DEFAULT_TEXT) || DEFAULT_TEXT;
  const [bgR, bgG, bgB] = hexToRgb01(bgColor);
  const [txR, txG, txB] = hexToRgb01(textColor);
  const TEXT = rgb(txR, txG, txB);
  const BG = rgb(bgR, bgG, bgB);

  const logoPx = Math.max(28, Math.min(80, config.logoSize ?? 48));
  const padX = MARGIN_X / 2; // header é full-bleed, mas conteúdo respeita esse padding
  const padY = 14;

  // ---- 1) Tenta embedar o logo (best-effort)
  let logoImg: PDFImage | null = null;
  if (tenant.logo_bytes && tenant.logo_mime) {
    try {
      logoImg =
        tenant.logo_mime === "image/png"
          ? await pdf.embedPng(tenant.logo_bytes)
          : await pdf.embedJpg(tenant.logo_bytes);
    } catch {
      logoImg = null;
    }
  }

  // ---- 2) Fontes
  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  // ---- 3) Calcular altura total (logo OU 3 linhas de texto, o que for maior)
  const NAME_SIZE = 14;
  const CNPJ_SIZE = 9.5;
  const ADDR_SIZE = 8.5;
  const LINE_GAP = 3;

  const nameH = NAME_SIZE;
  const cnpjH = CNPJ_SIZE;
  const addrH = ADDR_SIZE;

  // Texto que aparece embaixo do nome (CNPJ + telefone + email)
  const metaParts: string[] = [];
  if (tenant.cnpj && tenant.cnpj.trim()) metaParts.push(`CNPJ: ${tenant.cnpj.trim()}`);
  if (tenant.phone && tenant.phone.trim()) metaParts.push(tenant.phone.trim());
  if (tenant.email && tenant.email.trim()) metaParts.push(tenant.email.trim());
  const metaLine = safeText(helv, metaParts.join(" • "));

  const addressLine = safeText(helv, joinAddressLine(tenant));

  const textBlockH =
    nameH +
    (metaLine ? LINE_GAP + cnpjH : 0) +
    (addressLine ? LINE_GAP + addrH : 0);

  const blockH = Math.max(logoPx, textBlockH);
  const totalH = padY * 2 + blockH;

  // ---- 4) Fundo full-bleed
  page.drawRectangle({
    x: 0,
    y: pageH - totalH,
    width: pageW,
    height: totalH,
    color: BG,
  });

  // ---- 5) Logo (à esquerda, verticalmente centralizado no bloco)
  const blockTopY = pageH - padY;
  let textStartX = padX;

  if (logoImg) {
    const ratio = Math.min(logoPx / logoImg.width, logoPx / logoImg.height);
    const drawW = logoImg.width * ratio;
    const drawH = logoImg.height * ratio;
    const logoY = blockTopY - blockH / 2 - drawH / 2;
    const logoX = padX;
    // Fundo branco sutil atrás do logo (espelha showLogoBg do ReportHeader)
    page.drawRectangle({
      x: logoX - 4,
      y: logoY - 4,
      width: drawW + 8,
      height: drawH + 8,
      color: rgb(1, 1, 1),
    });
    page.drawImage(logoImg, {
      x: logoX,
      y: logoY,
      width: drawW,
      height: drawH,
    });
    textStartX = padX + drawW + 14;
  } else {
    // Fallback: quadrado discreto com inicial do tenant
    const initial = (tenant.name || "E").trim()[0].toUpperCase();
    page.drawRectangle({
      x: padX,
      y: blockTopY - blockH / 2 - logoPx / 2,
      width: logoPx,
      height: logoPx,
      color: rgb(1, 1, 1),
      opacity: 0.12,
    });
    const initSize = logoPx * 0.5;
    const initW = helvBold.widthOfTextAtSize(initial, initSize);
    page.drawText(initial, {
      x: padX + logoPx / 2 - initW / 2,
      y: blockTopY - blockH / 2 - initSize / 2 + 1,
      size: initSize,
      font: helvBold,
      color: TEXT,
    });
    textStartX = padX + logoPx + 14;
  }

  // ---- 6) Textos à direita do logo
  // Nome no topo. Encolhe o tamanho se exceder a largura disponível.
  const availableW = pageW - textStartX - padX;
  let nameSize = NAME_SIZE;
  const safeName = safeText(helvBold, tenant.name || "Empresa");
  while (
    nameSize > 10 &&
    helvBold.widthOfTextAtSize(safeName, nameSize) > availableW
  ) {
    nameSize -= 0.5;
  }
  // Cursor textual (baseline)
  let cursorY = blockTopY - nameSize;
  page.drawText(safeName, {
    x: textStartX,
    y: cursorY,
    size: nameSize,
    font: helvBold,
    color: TEXT,
  });

  if (metaLine) {
    cursorY -= LINE_GAP + CNPJ_SIZE;
    page.drawText(metaLine, {
      x: textStartX,
      y: cursorY,
      size: CNPJ_SIZE,
      font: helv,
      color: TEXT,
    });
  }
  if (addressLine) {
    cursorY -= LINE_GAP + ADDR_SIZE;
    page.drawText(addressLine, {
      x: textStartX,
      y: cursorY,
      size: ADDR_SIZE,
      font: helv,
      color: TEXT,
    });
  }

  return {
    bottomY: pageH - totalH,
    height: totalH,
  };
}
