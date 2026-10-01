// =============================================================================
// doc-art/certificado-art.ts — Cola entre a edge do Certificado e o motor de arte.
// =============================================================================
// Sabe: resolver a arte efetiva (contrato herda da empresa), juntar as imagens
// (logo do tenant e assinatura do RT) e desenhar a página.
//
// O que ele NÃO faz: decidir se a arte está ligada. Isso é do chamador — e a
// regra é simples e não pode regredir: **sem slug de arte, o Certificado sai
// no layout de texto puro de sempre.**
// =============================================================================

import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";

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
  const slug = contractSlug ?? companySlug ?? null;
  if (!slug) return null;
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
}

export interface DrawCertificadoArtResult {
  /** `true` quando o certificado saiu com linha em branco pra assinar à mão. */
  signaturePending: boolean;
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

  const signature = await fetchImageBytes(input.signatureUrl);

  const images: DocArtImageSources = { logo, signature };

  await drawDocArtPage(pdf, template, input.config, {
    substitute: (html) => substituteVariables(html, input.variables),
    brand: input.brandPrimary ? { primary: input.brandPrimary } : undefined,
    images,
  });

  return { signaturePending: signature === null };
}
