// =============================================================================
// docArt/resolve.ts — Template + config do gestor → spec pronta pra desenhar.
// =============================================================================
// Resolve, nesta ordem:
//   1. tema (default da arte ← sobrescrito campo a campo pelo config);
//   2. toggles (selo / assinatura / rodapé) — filtra os shapes condicionais;
//   3. cores (token do tema → hex final, com os derivados de contraste);
//   4. slots (texto do config ou default da arte) → `substitute` → runs.
//
// O resultado (`ResolvedDocArt`) já não tem token nem HTML: é geometria com
// cor hex e runs de texto. Os dois renderizadores só desenham.
//
// ⚠️ Arquivo COMPARTILHADO com o runtime Deno — ver o cabeçalho de `types.ts`.
// =============================================================================

import type {
  ColorRef,
  DocArtConfig,
  DocArtShape,
  DocArtTemplate,
  DocArtTheme,
  DocArtToggleKey,
  ResolvedDocArt,
  ResolvedShape,
  TextShape,
} from './types.ts';
import { PAGE_MM } from './types.ts';
import { parseInlineHtml, transformRuns } from './inline.ts';

// -----------------------------------------------------------------------------
// Cor
// -----------------------------------------------------------------------------

/** `#abc` / `#aabbcc` → `[r, g, b]` em 0..255. Inválido → null. */
export function parseHex(hex: string | undefined | null): [number, number, number] | null {
  if (!hex) return null;
  const raw = hex.trim().replace(/^#/, '');
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  const int = parseInt(full, 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

function toHex(rgb: [number, number, number]): string {
  return (
    '#' +
    rgb
      .map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0'))
      .join('')
  );
}

/** Luminância relativa sRGB (0..1). */
function luminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((n) => n / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Cor de texto legível sobre `hex`. Mesma fórmula de
 * `src/lib/colorContrast.ts#idealForeground`, reescrita aqui porque este
 * módulo é compartilhado com o Deno e não pode importar de `@/`.
 *
 * ⚠️ DERIVA o contraste — nunca escurece a cor da marca pra "fazer caber".
 */
export function idealForeground(hex: string | undefined | null): string {
  const rgb = parseHex(hex);
  if (!rgb) return '#ffffff';
  return luminance(rgb) > 0.6 ? '#0f172a' : '#ffffff';
}

/** Mistura linear de duas cores. `t=0` → a, `t=1` → b. */
function mix(a: string, b: string, t: number): string {
  const ra = parseHex(a);
  const rb = parseHex(b);
  if (!ra || !rb) return a;
  return toHex([
    ra[0] + (rb[0] - ra[0]) * t,
    ra[1] + (rb[1] - ra[1]) * t,
    ra[2] + (rb[2] - ra[2]) * t,
  ]);
}

/** Tabela token → hex, derivada do tema. */
export function buildPalette(theme: DocArtTheme): Record<string, string> {
  const ink = idealForeground(theme.paper);
  return {
    primary: theme.primary,
    accent: theme.accent,
    bg: theme.bg,
    paper: theme.paper,
    ink,
    // Texto secundário: o `ink` puxado 38% na direção do papel. Mantém o
    // contraste confortável na impressão sem virar cinza lavado.
    inkSoft: mix(ink, theme.paper, 0.38),
    onPrimary: idealForeground(theme.primary),
  };
}

function resolveColor(
  ref: ColorRef | undefined,
  palette: Record<string, string>,
): string | undefined {
  if (!ref) return undefined;
  if (ref.startsWith('#')) return ref;
  return palette[ref] ?? ref;
}

// -----------------------------------------------------------------------------
// Tema e toggles
// -----------------------------------------------------------------------------

/**
 * Resolve o tema em três camadas, nesta ordem de precedência:
 *   1. o que o gestor escolheu no editor (`config.theme`);
 *   2. a COR DA MARCA do tenant (`brand`) — é o que faz o certificado já nascer
 *      na cara da empresa, em vez de na cor que o designer da arte chutou;
 *   3. o default da arte.
 *
 * Hex inválido em qualquer camada é ignorado e cai na camada seguinte.
 */
export function resolveTheme(
  template: DocArtTemplate,
  config?: DocArtConfig,
  brand?: Partial<DocArtTheme>,
): DocArtTheme {
  const saved = config?.theme ?? {};
  const pick = (key: keyof DocArtTheme): string => {
    const value = saved[key];
    if (typeof value === 'string' && parseHex(value)) return value;
    const fromBrand = brand?.[key];
    if (typeof fromBrand === 'string' && parseHex(fromBrand)) return fromBrand;
    return template.defaultTheme[key];
  };
  return {
    primary: pick('primary'),
    accent: pick('accent'),
    bg: pick('bg'),
    paper: pick('paper'),
  };
}

/** Toggle ausente no config = LIGADO (a arte nasce completa). */
export function isToggleOn(key: DocArtToggleKey, config?: DocArtConfig): boolean {
  const value = config?.toggles?.[key];
  return value === undefined ? true : value === true;
}

// -----------------------------------------------------------------------------
// Resolve
// -----------------------------------------------------------------------------

export interface ResolveOptions {
  /**
   * Troca os `<span data-pmoc-var="...">` pelo valor real. Injetada porque o
   * catálogo de variáveis vive em módulos diferentes nos dois runtimes.
   * Ausente = texto fica como está (útil no seletor de modelo).
   */
  substitute?: (html: string) => string;
  /**
   * Cor da marca do tenant. Entra como default ANTES do default da arte — ver
   * `resolveTheme`. Normalmente `{ primary: white_label_primary_color }`.
   */
  brand?: Partial<DocArtTheme>;
}

export function resolveDocArt(
  template: DocArtTemplate,
  config?: DocArtConfig,
  options: ResolveOptions = {},
): ResolvedDocArt {
  const theme = resolveTheme(template, config, options.brand);
  const palette = buildPalette(theme);
  const substitute = options.substitute ?? ((html: string) => html);

  const shapes: ResolvedShape[] = [];

  for (const entry of template.shapes) {
    if (entry.requires && !isToggleOn(entry.requires, config)) continue;
    const resolved = resolveShape(entry.shape, palette, template, config, substitute);
    if (resolved) shapes.push(resolved);
  }

  return {
    slug: template.slug,
    orientation: template.orientation,
    page: PAGE_MM[template.orientation],
    theme,
    shapes,
  };
}

function resolveShape(
  shape: DocArtShape,
  palette: Record<string, string>,
  template: DocArtTemplate,
  config: DocArtConfig | undefined,
  substitute: (html: string) => string,
): ResolvedShape | null {
  if (shape.kind === 'image') {
    return shape.plate
      ? { ...shape, plate: resolveColor(shape.plate, palette) }
      : shape;
  }

  if (shape.kind === 'text') return resolveText(shape, palette, template, config, substitute);

  if (shape.kind === 'line') {
    return { ...shape, stroke: resolveColor(shape.stroke, palette) ?? '#000000' };
  }

  return {
    ...shape,
    fill: resolveColor(shape.fill, palette),
    stroke: resolveColor(shape.stroke, palette),
  } as ResolvedShape;
}

function resolveText(
  shape: TextShape,
  palette: Record<string, string>,
  template: DocArtTemplate,
  config: DocArtConfig | undefined,
  substitute: (html: string) => string,
): ResolvedShape | null {
  const raw = getSlotHtml(template, config, shape.slot);
  // Slot esvaziado de propósito pelo gestor → o shape simplesmente não entra.
  // É assim que se tira o "destaque" de um certificado sem mexer na arte.
  if (!raw.trim()) return null;

  let paragraphs = transformRuns(parseInlineHtml(substitute(raw)), shape.transform);
  if (paragraphs.length === 0) return null;

  // O peso do SHAPE entra nos runs aqui, e não só na hora de escolher a fonte.
  // Se ficasse só no desenho, a caixa de texto toda em negrito seria MEDIDA em
  // peso normal e DESENHADA em negrito — o texto fica mais largo que o medido e
  // come o espaço entre as palavras ("Carlos Eduardo" virava "CarlosEduardo").
  if (shape.weight === 'bold') {
    paragraphs = paragraphs.map((runs) => runs.map((r) => ({ ...r, bold: true })));
  }

  return {
    ...shape,
    color: resolveColor(shape.color, palette) ?? palette.ink,
    paragraphs,
  };
}

/** Texto de um slot: o que o gestor salvou, senão o default da arte. */
export function getSlotHtml(
  template: DocArtTemplate,
  config: DocArtConfig | undefined,
  slot: TextShape['slot'],
): string {
  const saved = config?.slots?.[slot];
  if (typeof saved === 'string') return saved;
  return template.defaultSlots[slot] ?? '';
}

// -----------------------------------------------------------------------------
// Conversões de unidade
// -----------------------------------------------------------------------------

/** 1 mm = 72/25.4 pt. Usado pelos dois renderizadores. */
export const PT_PER_MM = 72 / 25.4;

export const mmToPt = (mm: number): number => mm * PT_PER_MM;
export const ptToMm = (pt: number): number => pt / PT_PER_MM;

/**
 * Fração do corpo da fonte que fica ACIMA da baseline (altura de ascendente).
 * 0.76 é a média boa pra Helvetica e Times, as duas famílias que usamos.
 *
 * ⚠️ Os DOIS renderizadores usam esta constante pra achar a baseline. Mexer
 * aqui desloca o texto na tela e no PDF junto — que é exatamente o ponto.
 */
export const ASCENT_RATIO = 0.76;

/**
 * Baseline (em mm, do topo da folha) da linha `index` de uma caixa de texto.
 * `extraPt` acomoda o respiro acumulado entre parágrafos.
 */
export function lineBaselineMm(
  boxTopMm: number,
  lineHeightPt: number,
  sizePt: number,
  index: number,
  extraPt = 0,
): number {
  return boxTopMm + ptToMm(lineHeightPt * index + sizePt * ASCENT_RATIO + extraPt);
}

/**
 * Deslocamento horizontal (mm) da linha dentro da caixa, conforme o
 * alinhamento. `lineWidthPt` é a largura medida pelo renderizador.
 */
export function alignOffsetMm(
  align: 'left' | 'center' | 'right',
  boxWidthMm: number,
  lineWidthPt: number,
): number {
  if (align === 'left') return 0;
  const free = boxWidthMm - ptToMm(lineWidthPt);
  return align === 'center' ? free / 2 : free;
}
