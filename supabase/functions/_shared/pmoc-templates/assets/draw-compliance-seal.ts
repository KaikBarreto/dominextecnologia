// =============================================================================
// draw-compliance-seal.ts — desenha o selo PNG de conformidade nos PDFs PMOC.
// =============================================================================
// O selo "Em conformidade com a Lei Federal 13.589/2018" (PNG 240×206) é
// embutido em base64 (compliance-seal.ts). Este helper decodifica os bytes
// UMA vez (cache de módulo), embute no PDFDocument e desenha CENTRALIZADO
// e LOGO ACIMA do texto regulatório, sem distorcer o aspect ratio.
//
// DRY: usado pelo Certificado, Dossiê (pág. 3), Cronograma e PDF do QR.
// =============================================================================

import { PDFDocument, PDFPage } from "https://esm.sh/pdf-lib@1.17.1";
import { COMPLIANCE_SEAL_PNG_BASE64 } from "./compliance-seal.ts";

// PNG original: 240×206 → ratio ~1.165:1 (largura ÷ altura).
const SEAL_RATIO = 240 / 206;

// Decodifica o base64 → Uint8Array UMA vez por execução do módulo.
let cachedBytes: Uint8Array | null = null;
function getSealBytes(): Uint8Array {
  if (cachedBytes) return cachedBytes;
  const binary = atob(COMPLIANCE_SEAL_PNG_BASE64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  cachedBytes = bytes;
  return bytes;
}

export interface DrawComplianceSealOptions {
  /** Centro X (em pt) onde o selo será centralizado. */
  centerX: number;
  /** Y (em pt) da BASE do selo — normalmente topo do texto da lei + respiro. */
  baselineY: number;
  /** Largura desejada do selo em pt (56–72 recomendado). Default 64. */
  width?: number;
}

/**
 * Embute (se necessário) e desenha o selo de conformidade no PDF.
 * Retorna a altura desenhada (pt) pra quem precisar ajustar layout acima.
 */
export async function drawComplianceSeal(
  pdf: PDFDocument,
  page: PDFPage,
  opts: DrawComplianceSealOptions,
): Promise<number> {
  const width = opts.width ?? 64;
  const height = width / SEAL_RATIO;

  const sealImage = await pdf.embedPng(getSealBytes());

  page.drawImage(sealImage, {
    x: opts.centerX - width / 2,
    y: opts.baselineY,
    width,
    height,
  });

  return height;
}
