// =============================================================================
// pmoc-templates/capa.ts — Capa preta do dossiê PMOC.
// =============================================================================
// Layout (§3.1 do plano):
//   - Fundo preto sólido #0A0A0A.
//   - Tipografia branca, sans-serif (Helvetica embedded).
//   - 4 arcos circulares brancos decorativos nos cantos.
//   - "PMOC" 140pt branco bold centralizado.
//   - "Plano de Manutenção" + "Operação e Controle" 32pt centralizados.
//   - Linha horizontal branca abaixo do subtítulo.
//   - Logo do tenant (ou texto companies.name se sem logo).
// =============================================================================

import {
  PDFDocument,
  PDFPage,
  PDFImage,
  StandardFonts,
  rgb,
} from "https://esm.sh/pdf-lib@1.17.1";
import { TemplateContext } from "./context.ts";

const A4_W = 595.28;
const A4_H = 841.89;

const BG_BLACK = rgb(0.039, 0.039, 0.039); // #0A0A0A
const WHITE = rgb(1, 1, 1);

export async function drawCapaPage(
  pdf: PDFDocument,
  ctx: TemplateContext,
): Promise<PDFPage> {
  const page = pdf.addPage([A4_W, A4_H]);

  // -- Fundo preto sólido
  page.drawRectangle({
    x: 0,
    y: 0,
    width: A4_W,
    height: A4_H,
    color: BG_BLACK,
  });

  const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const helv = await pdf.embedFont(StandardFonts.Helvetica);

  // -- Arcos decorativos nos 4 cantos (círculos brancos parcialmente fora da página)
  // Visual sutil: 4 círculos brancos posicionados pra que só uma "curva" apareça
  // em cada canto.
  const arcRadius = 80;
  const arcOffset = 60; // quanto entra na página (resto fica fora)

  // Cantos: top-left, top-right, bottom-left, bottom-right
  const corners = [
    { x: -arcOffset, y: A4_H + arcOffset }, // TL
    { x: A4_W + arcOffset, y: A4_H + arcOffset }, // TR
    { x: -arcOffset, y: -arcOffset }, // BL
    { x: A4_W + arcOffset, y: -arcOffset }, // BR
  ];

  for (const c of corners) {
    page.drawCircle({
      x: c.x,
      y: c.y,
      size: arcRadius,
      borderColor: WHITE,
      borderWidth: 2,
    });
  }

  // -- Texto principal "PMOC" centralizado (~140pt)
  const PMOC_SIZE = 140;
  const pmocWidth = helvBold.widthOfTextAtSize("PMOC", PMOC_SIZE);
  const pmocX = (A4_W - pmocWidth) / 2;
  // Posiciona um pouco acima do centro (visual com mockup)
  const pmocY = A4_H / 2 + 20;
  page.drawText("PMOC", {
    x: pmocX,
    y: pmocY,
    size: PMOC_SIZE,
    font: helvBold,
    color: WHITE,
  });

  // -- Subtítulo "Plano de Manutenção" + "Operação e Controle"
  const SUB_SIZE = 24;
  const sub1 = "Plano de Manutenção";
  const sub2 = "Operação e Controle";
  const sub1W = helv.widthOfTextAtSize(sub1, SUB_SIZE);
  const sub2W = helv.widthOfTextAtSize(sub2, SUB_SIZE);
  const sub1Y = pmocY - 50;
  const sub2Y = sub1Y - 32;

  page.drawText(sub1, {
    x: (A4_W - sub1W) / 2,
    y: sub1Y,
    size: SUB_SIZE,
    font: helv,
    color: WHITE,
  });
  page.drawText(sub2, {
    x: (A4_W - sub2W) / 2,
    y: sub2Y,
    size: SUB_SIZE,
    font: helv,
    color: WHITE,
  });

  // -- Linha horizontal branca abaixo do subtítulo
  const lineWidth = A4_W * 0.6;
  const lineX = (A4_W - lineWidth) / 2;
  const lineY = sub2Y - 24;
  page.drawLine({
    start: { x: lineX, y: lineY },
    end: { x: lineX + lineWidth, y: lineY },
    thickness: 2,
    color: WHITE,
  });

  // -- Logo do tenant (centralizado, abaixo da linha) ou texto companies.name
  const logoY = lineY - 100;
  if (ctx.empresa.logo_bytes && ctx.empresa.logo_mime) {
    try {
      let img: PDFImage;
      if (ctx.empresa.logo_mime === "image/png") {
        img = await pdf.embedPng(ctx.empresa.logo_bytes);
      } else {
        img = await pdf.embedJpg(ctx.empresa.logo_bytes);
      }
      const maxLogoH = 60;
      const ratio = maxLogoH / img.height;
      const w = img.width * ratio;
      page.drawImage(img, {
        x: (A4_W - w) / 2,
        y: logoY - maxLogoH / 2,
        width: w,
        height: maxLogoH,
      });
    } catch {
      // fallback texto
      drawTenantName(page, helvBold, ctx.empresa.razao_social, logoY);
    }
  } else {
    drawTenantName(page, helvBold, ctx.empresa.razao_social, logoY);
  }

  // -- Portal PMOC: QR Code + link no canto inferior direito (discreto).
  //    Só renderiza quando há token (portal_url + portal_qr_png presentes).
  if (ctx.portal_url && ctx.portal_qr_png) {
    try {
      const qrImg = await pdf.embedPng(ctx.portal_qr_png);
      const qrSize = 72; // ~2.5cm — discreto
      const pad = 32; // margem da borda da página
      const qrX = A4_W - pad - qrSize;
      const qrY = pad + 22; // deixa espaço pro texto abaixo do QR

      // Moldura branca atrás do QR (QR é preto/branco; sobre fundo preto precisa
      // de área clara pra leitura).
      const frame = 6;
      page.drawRectangle({
        x: qrX - frame,
        y: qrY - frame,
        width: qrSize + frame * 2,
        height: qrSize + frame * 2,
        color: WHITE,
      });
      page.drawImage(qrImg, {
        x: qrX,
        y: qrY,
        width: qrSize,
        height: qrSize,
      });

      // Rótulo + URL abaixo do QR, alinhados à direita (terminam na borda do QR).
      const labelSize = 7;
      const label = "Portal PMOC da unidade";
      const labelW = helv.widthOfTextAtSize(label, labelSize);
      const rightEdge = qrX + qrSize + frame;
      page.drawText(label, {
        x: rightEdge - labelW,
        y: qrY - frame - 12,
        size: labelSize,
        font: helv,
        color: WHITE,
      });

      const urlSize = 7;
      const urlW = helv.widthOfTextAtSize(ctx.portal_url, urlSize);
      page.drawText(ctx.portal_url, {
        x: rightEdge - urlW,
        y: qrY - frame - 22,
        size: urlSize,
        font: helv,
        color: WHITE,
      });
    } catch {
      // QR é best-effort — se falhar o embed, a capa continua válida sem ele.
    }
  }

  return page;
}

function drawTenantName(
  page: PDFPage,
  font: ReturnType<typeof StandardFonts.Helvetica & Function> | unknown,
  name: string,
  y: number,
) {
  // simple wrapper — font deve ser PDFFont, ignorando typing aqui pra
  // manter o módulo livre de import circular.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const f = font as { widthOfTextAtSize: (s: string, sz: number) => number };
  const SIZE = 24;
  const w = f.widthOfTextAtSize(name, SIZE);
  page.drawText(name, {
    x: (A4_W - w) / 2,
    y,
    size: SIZE,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    font: font as any,
    color: WHITE,
  });
}
