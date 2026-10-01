// =============================================================================
// docArt/templates/index.ts — Registro das artes por slug.
// =============================================================================
// Despacho por slug, igual `ProposalRenderer` faz com os templates de
// orçamento. Slug desconhecido (ou documento antigo) NÃO cai num default:
// retorna `null`, e quem chama volta pro layout de texto puro de sempre.
// É isso que garante zero retroação em contrato já existente.
//
// ⚠️ Arquivo COMPARTILHADO com o runtime Deno — ver o cabeçalho de `types.ts`.
// =============================================================================

import type { DocArtTemplate } from '../types.ts';
import { auroraTemplate } from './aurora.ts';
import { blocoTemplate } from './bloco.ts';
import { circuitoTemplate } from './circuito.ts';
import { gradeTemplate } from './grade.ts';
import { marcaTemplate } from './marca.ts';
import { monolitoTemplate } from './monolito.ts';
import { noturnoTemplate } from './noturno.ts';
import { ondaTemplate } from './onda.ts';
import { porticoTemplate } from './portico.ts';
import { prismaTemplate } from './prisma.ts';
import { seloTemplate } from './selo.ts';

/** Ordem aqui = ordem no seletor de modelo: claros primeiro, escuros depois. */
export const DOC_ART_TEMPLATES: DocArtTemplate[] = [
  auroraTemplate,
  ondaTemplate,
  seloTemplate,
  blocoTemplate,
  porticoTemplate,
  marcaTemplate,
  gradeTemplate,
  noturnoTemplate,
  prismaTemplate,
  circuitoTemplate,
  monolitoTemplate,
];

export function getDocArtTemplate(slug: string | null | undefined): DocArtTemplate | null {
  if (!slug) return null;
  return DOC_ART_TEMPLATES.find((t) => t.slug === slug) ?? null;
}

export {
  auroraTemplate,
  blocoTemplate,
  circuitoTemplate,
  gradeTemplate,
  marcaTemplate,
  monolitoTemplate,
  noturnoTemplate,
  ondaTemplate,
  porticoTemplate,
  prismaTemplate,
  seloTemplate,
};
