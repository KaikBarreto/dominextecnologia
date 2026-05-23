// =============================================================================
// pmoc-templates/signature-embed.ts — Helper compartilhado de assinatura do RT.
// =============================================================================
// Onda E (v1.9.x). Embebe a assinatura visual do RT (signature_image_url do
// responsible_technicians) automaticamente nos PDFs PMOC sempre que existir.
//
// Princípios:
//   - Se signature_image_url existe: baixa a imagem, embeda como PNG/JPG e
//     posiciona acima da linha; abaixo desenha 3 linhas (nome, modalidade, CFT).
//   - Se null/falha de fetch: desenha linha pontilhada vazia + dados textuais
//     (estado "pendente"), permitindo preenchimento manual em campo.
//   - Retorna { pending: boolean } pra que a edge function saiba se o doc ficou
//     em estado pendente e propague pro payload (signature_status).
//
// Usado por:
//   - termo-rt.ts  (Termo de Responsabilidade Técnica)
//   - certificado.ts (Certificado de Conformidade)
//   - generate-pmoc-trt-pdf  (TRT standalone)
//   - generate-pmoc-dossie-pdf (dossiê 3 páginas)
// =============================================================================

import {
  PDFPage,
  PDFDocument,
  PDFFont,
  StandardFonts,
  rgb,
} from "https://esm.sh/pdf-lib@1.17.1";

const BLACK = rgb(0, 0, 0);
const GRAY = rgb(0.45, 0.45, 0.45);

// -----------------------------------------------------------------------------
// Contexto e tipos públicos
// -----------------------------------------------------------------------------

export interface SignatureContext {
  rt_name: string;
  rt_modality: string;
  rt_cft_crea: string | null;
  /** URL pública (storage signed ou direct) da assinatura. null = pendente. */
  signature_image_url: string | null;
  /** Carimbo (não usado aqui — reservado pra futura iteração). */
  stamp_image_url: string | null;
}

export interface SignaturePosition {
  /** Coordenada X do canto esquerdo do bloco. */
  x: number;
  /** Coordenada Y do TOPO do bloco (cresce pra baixo). */
  y: number;
  /** Largura disponível pra centralizar imagem + textos. */
  width: number;
}

export interface SignatureEmbedResult {
  /** true quando não havia assinatura disponível (campo em branco no PDF). */
  pending: boolean;
}

// -----------------------------------------------------------------------------
// Dimensões fixas (em pt). Total ocupado: ~120pt de altura.
// -----------------------------------------------------------------------------

const SIG_IMG_MAX_W = 200; // largura máxima da imagem
const SIG_IMG_MAX_H = 56;  // altura máxima da imagem
const LINE_OFFSET_Y = 4;   // distância entre base da imagem e a linha
const LINE_THICKNESS = 0.8;
const NAME_OFFSET_Y = 14;  // distância entre linha e nome
const NAME_SIZE = 10.5;
const META_SIZE = 9.5;
const META_LINE_HEIGHT = 12;

/**
 * Total de altura aproximada que o bloco vai consumir (pra ensureSpace antes).
 * Útil pros templates calcularem se precisam paginar antes de desenhar.
 */
export const SIGNATURE_BLOCK_HEIGHT = SIG_IMG_MAX_H + LINE_OFFSET_Y + NAME_OFFSET_Y + META_LINE_HEIGHT * 3 + 6;

// -----------------------------------------------------------------------------
// Helpers internos
// -----------------------------------------------------------------------------

interface FetchedImage {
  bytes: Uint8Array;
  mime: "image/png" | "image/jpeg";
}

async function fetchSignatureImage(url: string): Promise<FetchedImage | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    const buf = new Uint8Array(await res.arrayBuffer());
    if (ct.includes("png")) return { bytes: buf, mime: "image/png" };
    if (ct.includes("jpeg") || ct.includes("jpg")) return { bytes: buf, mime: "image/jpeg" };
    // Fallback por sniffing dos primeiros bytes (storage signed URL às vezes
    // devolve content-type genérico tipo application/octet-stream).
    if (buf.length >= 8) {
      const isPng =
        buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
      const isJpg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
      if (isPng) return { bytes: buf, mime: "image/png" };
      if (isJpg) return { bytes: buf, mime: "image/jpeg" };
    }
    return null;
  } catch {
    return null;
  }
}

function drawCenteredText(
  page: PDFPage,
  font: PDFFont,
  text: string,
  size: number,
  centerX: number,
  baselineY: number,
  color = BLACK,
) {
  if (!text) return;
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, {
    x: centerX - w / 2,
    y: baselineY,
    size,
    font,
    color,
  });
}

/**
 * Desenha uma linha "pontilhada" simples — pdf-lib não tem dash nativo, então
 * desenhamos uma sequência de pequenos segmentos.
 */
function drawDashedLine(
  page: PDFPage,
  x1: number,
  y: number,
  x2: number,
  dash = 3,
  gap = 2,
  thickness = 0.7,
) {
  let cx = x1;
  while (cx < x2) {
    const end = Math.min(cx + dash, x2);
    page.drawLine({
      start: { x: cx, y },
      end: { x: end, y },
      thickness,
      color: BLACK,
    });
    cx = end + gap;
  }
}

// -----------------------------------------------------------------------------
// API principal
// -----------------------------------------------------------------------------

/**
 * Desenha o bloco de assinatura do RT na página.
 *
 * Layout (do topo pra base, dentro do retângulo definido por pos):
 *   ┌──────────────────────────────────────┐
 *   │        [imagem da assinatura]        │  ← SIG_IMG_MAX_H, centralizada (ou linha pontilhada)
 *   │  ─────────────────────────────────  │  ← linha sólida (separador visual)
 *   │           Nome do RT (bold)          │
 *   │            Modalidade                 │
 *   │            CFT/CREA                   │
 *   └──────────────────────────────────────┘
 *
 * @returns { pending: true } se signature_image_url for null OU se o fetch
 *          falhar (estado "pendente" — campo manual em branco).
 */
export async function drawRtSignatureBlock(
  pdfDoc: PDFDocument,
  page: PDFPage,
  ctx: SignatureContext,
  pos: SignaturePosition,
): Promise<SignatureEmbedResult> {
  const helv = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helvBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const centerX = pos.x + pos.width / 2;
  const topY = pos.y;
  const imgAreaBottomY = topY - SIG_IMG_MAX_H;
  const lineY = imgAreaBottomY - LINE_OFFSET_Y;

  let pending = true;

  // 1) Imagem (se disponível)
  if (ctx.signature_image_url) {
    const fetched = await fetchSignatureImage(ctx.signature_image_url);
    if (fetched) {
      try {
        const img =
          fetched.mime === "image/png"
            ? await pdfDoc.embedPng(fetched.bytes)
            : await pdfDoc.embedJpg(fetched.bytes);

        // Escala proporcional caindo dentro de SIG_IMG_MAX_W × SIG_IMG_MAX_H.
        const scaleW = SIG_IMG_MAX_W / img.width;
        const scaleH = SIG_IMG_MAX_H / img.height;
        const scale = Math.min(scaleW, scaleH);
        const drawW = img.width * scale;
        const drawH = img.height * scale;

        page.drawImage(img, {
          x: centerX - drawW / 2,
          y: lineY + 2, // base da imagem cola na linha (com 2pt de respiro)
          width: drawW,
          height: drawH,
        });
        pending = false;
      } catch {
        // embed falhou — cai no fallback pendente
      }
    }
  }

  // 2) Se ainda pendente, desenha linha pontilhada (placeholder pra assinatura manual)
  if (pending) {
    const dashStartX = centerX - SIG_IMG_MAX_W / 2;
    const dashEndX = centerX + SIG_IMG_MAX_W / 2;
    // Centro vertical da área que seria da imagem
    const dashY = imgAreaBottomY + SIG_IMG_MAX_H / 2;
    drawDashedLine(page, dashStartX, dashY, dashEndX);
  }

  // 3) Linha sólida (separador entre área da imagem e os dados textuais)
  page.drawLine({
    start: { x: centerX - SIG_IMG_MAX_W / 2, y: lineY },
    end: { x: centerX + SIG_IMG_MAX_W / 2, y: lineY },
    thickness: LINE_THICKNESS,
    color: BLACK,
  });

  // 4) Dados textuais centralizados abaixo da linha
  const nameY = lineY - NAME_OFFSET_Y;
  drawCenteredText(page, helvBold, ctx.rt_name || "—", NAME_SIZE, centerX, nameY);

  const modY = nameY - META_LINE_HEIGHT;
  drawCenteredText(page, helv, ctx.rt_modality || "—", META_SIZE, centerX, modY, GRAY);

  if (ctx.rt_cft_crea) {
    const cftY = modY - META_LINE_HEIGHT;
    drawCenteredText(page, helv, `CFT: ${ctx.rt_cft_crea}`, META_SIZE, centerX, cftY, GRAY);
  }

  return { pending };
}
