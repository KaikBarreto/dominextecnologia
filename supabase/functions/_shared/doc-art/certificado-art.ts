// =============================================================================
// doc-art/certificado-art.ts — Cola entre a edge do Certificado e o motor de arte.
// =============================================================================
// Sabe: resolver a arte efetiva (contrato herda da empresa), juntar as imagens
// (logo do tenant e assinatura do RT) e desenhar a página.
//
// O que ele NÃO faz: decidir se a arte está ligada. Isso é do chamador — e a
// regra atual: **sem slug de arte, o Certificado usa Conformidade**, modelo
// institucional que preserva a leitura e a identidade do tenant.
// =============================================================================

import { PDFDocument, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import * as qrCodeModule from "https://esm.sh/qrcode@1.5.4";

import {
  PmocVariableContext,
  substituteVariables,
} from "../pmoc-templates/variables.ts";
import { getDocArtTemplate } from "./templates/index.ts";
import {
  drawDocArtPage,
  type DocArtImageBytes,
  type DocArtImageSources,
} from "./spec-pdf.ts";
import type { DocArtConfig } from "./types.ts";
import { drawCertificateGeneratedByFooter } from "../pmoc-templates/footer.ts";
import { idealForeground, mmToPt, resolveTheme } from "./resolve.ts";

type QrCodeApi = {
  toDataURL: (value: string, options: {
    errorCorrectionLevel: "M";
    margin: number;
    width: number;
    color: { dark: string; light: string };
  }) => Promise<string>;
};
const QRCode = (
  (qrCodeModule as unknown as { default?: QrCodeApi }).default ?? qrCodeModule
) as QrCodeApi;

/**
 * Arte efetiva de um contrato: o que o contrato definiu, senão o padrão da
 * empresa. Slug e config andam JUNTOS — herdar o slug da empresa e a config do
 * contrato produziria um texto escrito pra outra arte.
 */
export function resolveEffectiveArt(
  contractSlug: string | null | undefined,
  contractConfig: unknown,
  companySlug: string | null | undefined,
  companyConfig: unknown,
): { slug: string; config: DocArtConfig | undefined } | null {
  const slug = contractSlug ?? companySlug ?? "aurora";
  if (!getDocArtTemplate(slug)) {
    // Slug gravado por uma versão futura/removida: volta pro texto puro em vez
    // de cair num default qualquer.
    console.warn(`[doc-art] slug desconhecido "${slug}" — usando texto puro.`);
    return null;
  }
  const raw = contractSlug ? contractConfig : companyConfig;
  return { slug, config: asConfig(raw) };
}

function asConfig(raw: unknown): DocArtConfig | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  return raw as DocArtConfig;
}

/** Baixa uma imagem remota e devolve no formato que o pdf-lib embute. */
export async function fetchImageBytes(
  url: string | null | undefined,
): Promise<DocArtImageBytes | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    const format = contentType.includes("png")
      ? "png"
      : contentType.includes("jpeg") || contentType.includes("jpg")
        ? "jpg"
        : null;
    if (!format) return null;
    return { data: new Uint8Array(await res.arrayBuffer()), format };
  } catch (err) {
    console.warn("[doc-art] falha ao baixar imagem:", err);
    return null;
  }
}

export interface DrawCertificadoArtInput {
  slug: string;
  config: DocArtConfig | undefined;
  variables: PmocVariableContext;
  /** Logo do tenant já baixado pela edge (respeita white-label). */
  logo: DocArtImageBytes | null;
  /** URL da assinatura do RT; baixada aqui. */
  signatureUrl: string | null;
  /** Cor da marca do tenant — vira o default do tema da arte. */
  brandPrimary?: string | null;
  /** URL pública do registro canônico, também aplicada como link no selo. */
  validationUrl?: string | null;
}

export interface DrawCertificadoArtResult {
  /** `true` quando o certificado saiu com linha em branco pra assinar à mão. */
  signaturePending: boolean;
}

function certificateBackgroundUrl(slug: string): string | null {
  if (slug.startsWith("essencial-")) return null;
  const baseUrl = (Deno.env.get("DOC_ART_BACKGROUND_BASE_URL") ?? "https://dominex.app")
    .replace(/\/+$/, "");
  return `${baseUrl}/images/certificate-backgrounds/${slug}.jpg`;
}

async function buildValidationQrPng(validationUrl: string | null | undefined): Promise<Uint8Array | null> {
  if (!validationUrl || !/^https:\/\/dominex\.app\/c\/[A-Za-z0-9_-]{16}$/.test(validationUrl)) return null;
  try {
    const dataUrl = await QRCode.toDataURL(validationUrl, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 256,
      color: { dark: "#111111", light: "#FFFFFF" },
    });
    const encoded = dataUrl.split(",")[1];
    if (!encoded) return null;
    const binary = atob(encoded);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch (error) {
    console.warn("[doc-art] falha ao gerar QR de validação:", error);
    return null;
  }
}

/**
 * Desenha a página do Certificado com arte. Retorna o status da assinatura no
 * mesmo contrato que `drawCertificadoPage`, pra edge não precisar saber qual
 * dos dois caminhos rodou.
 */
export async function drawCertificadoArtPage(
  pdf: PDFDocument,
  input: DrawCertificadoArtInput,
): Promise<DrawCertificadoArtResult> {
  const template = getDocArtTemplate(input.slug);
  if (!template) throw new Error(`doc-art: template "${input.slug}" não existe`);

  const logo = input.config?.logoUrl
    ? ((await fetchImageBytes(input.config.logoUrl)) ?? input.logo)
    : input.logo;

  const [signature, background, validationQrPng] = await Promise.all([
    fetchImageBytes(input.signatureUrl),
    fetchImageBytes(certificateBackgroundUrl(input.slug)),
    buildValidationQrPng(input.validationUrl),
  ]);

  const images: DocArtImageSources = { logo, signature, background };
  const brand = input.brandPrimary ? { primary: input.brandPrimary } : undefined;
  const dark = idealForeground(resolveTheme(template, input.config, brand).paper) === '#ffffff';

  const pagesBefore = pdf.getPageCount();
  await drawDocArtPage(pdf, template, input.config, {
    substitute: (html) => substituteVariables(html, input.variables),
    brand,
    images,
    validationUrl: input.validationUrl ?? undefined,
  });

  // O motor pode paginar um tema. Toda pagina nova do certificado recebe a
  // assinatura institucional, sem depender do toggle de rodape do tema.
  const certificatePages = pdf.getPages().slice(pagesBefore);
  const validationQr = validationQrPng ? await pdf.embedPng(validationQrPng) : null;
  for (const page of certificatePages) {
    await drawCertificateGeneratedByFooter(pdf, page, { dark });
    if (validationQr) {
      // Selo no canto inferior direito, maior e ainda fora da faixa vertical
      // de validação. A quiet zone branca preserva leitura em temas escuros.
      const size = mmToPt(18);
      const plate = mmToPt(20);
      const x = page.getWidth() - size - mmToPt(10);
      const y = mmToPt(7);
      page.drawRectangle({
        x: x - mmToPt(1),
        y: y - mmToPt(1),
        width: plate,
        height: plate,
        color: rgb(1, 1, 1),
        opacity: 0.9,
      });
      page.drawImage(validationQr, { x, y, width: size, height: size, opacity: 0.86 });
    }
  }

  return { signaturePending: signature === null };
}
