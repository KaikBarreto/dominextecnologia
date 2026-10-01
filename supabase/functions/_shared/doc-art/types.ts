// =============================================================================
// docArt/types.ts — Spec declarativa de documentos com arte.
// =============================================================================
// Uma "arte" (template visual de certificado) é descrita como DADOS puros:
// uma lista de primitivas posicionadas na folha. Essa spec é renderizada por
// DOIS motores diferentes a partir da MESMA fonte:
//
//   1. `DocArtSvgRenderer.tsx` (React/SVG)  → preview ao vivo no editor e no
//      portal do cliente.
//   2. `_shared/doc-art/spec-pdf.ts` (Deno/pdf-lib) → o PDF de verdade, dentro
//      da edge function que já existe.
//
// É isso que elimina o problema histórico de "template espelhado frontend ↔
// backend que desencontra em silêncio": não existem dois layouts, existe UM
// dado e dois desenhistas.
//
// ⚠️ Este arquivo é COMPARTILHADO com o runtime Deno. Ele é copiado para
// `supabase/functions/_shared/doc-art/types.ts` e um teste de paridade
// (`docArtParity.test.ts`) falha se as duas cópias divergirem. Por isso:
//   - nada de import de React, de `@/`, de Node ou de pdf-lib aqui;
//   - imports relativos SEMPRE com extensão `.ts` explícita (Deno exige;
//     o tsconfig.app.json do front tem `allowImportingTsExtensions`).
// =============================================================================

/** Milímetros. Toda coordenada da spec é em mm. */
export type Mm = number;

/**
 * Sistema de coordenadas da spec: origem no canto **superior-esquerdo**, `y`
 * cresce para **baixo** — igual a SVG e igual a como se pensa um layout.
 * O renderizador pdf-lib converte para o sistema do PDF (origem embaixo).
 */
export type Orientation = 'portrait' | 'landscape';

/** Dimensões da folha A4 em mm, por orientação. */
export const PAGE_MM: Record<Orientation, { w: Mm; h: Mm }> = {
  portrait: { w: 210, h: 297 },
  landscape: { w: 297, h: 210 },
};

// -----------------------------------------------------------------------------
// Cor
// -----------------------------------------------------------------------------

/**
 * Tokens de cor do tema. A arte NUNCA chumba a cor da marca — ela pinta com
 * tokens, e o tema do tenant resolve o valor final. É o que permite trocar a
 * cor do certificado inteiro mexendo em um campo.
 *
 * - `primary`   — cor principal da marca.
 * - `accent`    — cor secundária/realce.
 * - `bg`        — fundo da folha.
 * - `paper`     — branco do painel de conteúdo (sempre claro, pra impressão).
 * - `ink`       — cor do texto principal (derivada pra contrastar com `paper`).
 * - `inkSoft`   — texto secundário.
 * - `onPrimary` — texto que cai EM CIMA de `primary` (derivado por contraste).
 */
export type ColorToken =
  | 'primary'
  | 'accent'
  | 'bg'
  | 'paper'
  | 'ink'
  | 'inkSoft'
  | 'onPrimary';

/** Cor na spec: um token do tema ou um hex literal `#rrggbb`. */
export type ColorRef = ColorToken | string;

// -----------------------------------------------------------------------------
// Tipografia
// -----------------------------------------------------------------------------

/**
 * As duas famílias embutidas (ver `fonts/data.ts`):
 *  - `display` — Playfair Display, uma serifa de alto contraste. Só para
 *    títulos e números grandes; em corpo pequeno ela fecha.
 *  - `sans` — Montserrat, geométrica. Todo o resto.
 *
 * As Standard 14 do PDF não entram no desenho das artes: Helvetica em corpo
 * grande tem cara de formulário, não de certificado.
 */
export type FontFamily = 'sans' | 'display';
export type FontWeight = 'regular' | 'bold';
export type TextAlign = 'left' | 'center' | 'right';
export type TextTransform = 'none' | 'uppercase';

// -----------------------------------------------------------------------------
// Slots — o que o gestor edita
// -----------------------------------------------------------------------------

/**
 * Slots nomeados de uma arte. A arte declara ONDE cada slot cai e com que
 * tipografia; o gestor edita o TEXTO de cada um (com as variáveis
 * `data-pmoc-var` de sempre).
 *
 * Nem toda arte usa todos os slots — cada template declara os seus.
 */
export type DocArtSlotKey =
  /** Linha fina acima do título (ex: "Lei Federal 13.589/2018"). */
  | 'sobretitulo'
  /** O título grande (ex: "CERTIFICADO"). */
  | 'titulo'
  /** Linha logo abaixo do título (ex: "DE CONFORMIDADE"). */
  | 'subtitulo'
  /** O parágrafo principal, onde vivem as variáveis. */
  | 'corpo'
  /** Faixa de destaque em caixa alta (ex: "SEGURANÇA ALIMENTAR"). */
  | 'destaque'
  /** Rodapé (ex: site da empresa). */
  | 'rodape'
  /** Texto fino girado na margem (ex: nº do documento + validade). */
  | 'lateral'
  /** Nome sob a linha de assinatura. */
  | 'assinaturaNome'
  /** Cargo/registro sob o nome. */
  | 'assinaturaCargo';

/**
 * Imagens que a arte pode posicionar; os bytes/URL vêm do runtime.
 *
 * Não há "selo de conformidade": o PNG que existia no repo era um selo
 * inventado, sem lastro em órgão nenhum, e certificado não carimba autoridade
 * que não tem.
 */
export type DocArtImageRef = 'logo' | 'signature';

// -----------------------------------------------------------------------------
// Primitivas
// -----------------------------------------------------------------------------

interface ShapeBase {
  /** 0..1. Default 1. */
  opacity?: number;
}

export interface RectShape extends ShapeBase {
  kind: 'rect';
  x: Mm;
  y: Mm;
  w: Mm;
  h: Mm;
  fill?: ColorRef;
  stroke?: ColorRef;
  strokeWidth?: Mm;
}

export interface CircleShape extends ShapeBase {
  kind: 'circle';
  cx: Mm;
  cy: Mm;
  r: Mm;
  fill?: ColorRef;
  stroke?: ColorRef;
  strokeWidth?: Mm;
}

export interface LineShape extends ShapeBase {
  kind: 'line';
  x1: Mm;
  y1: Mm;
  x2: Mm;
  y2: Mm;
  stroke: ColorRef;
  strokeWidth: Mm;
  /** Traço/intervalo em mm, quando pontilhada. */
  dash?: [Mm, Mm];
}

/**
 * Caminho vetorial arbitrário — é o que desenha as faixas diagonais, ondas e
 * ornamentos. `d` usa o mesmo sistema de coordenadas da spec (mm, y pra baixo).
 * Só comandos absolutos `M L H V C Q Z` (o conversor do pdf-lib é literal).
 */
export interface PathShape extends ShapeBase {
  kind: 'path';
  d: string;
  fill?: ColorRef;
  stroke?: ColorRef;
  strokeWidth?: Mm;
}

export interface ImageShape extends ShapeBase {
  kind: 'image';
  src: DocArtImageRef;
  /** Caixa em que a imagem é encaixada preservando proporção (`contain`). */
  x: Mm;
  y: Mm;
  w: Mm;
  h: Mm;
  /** Alinhamento dentro da caixa quando sobra espaço. Default `center`. */
  align?: TextAlign;
  /** Default `middle`. */
  valign?: 'top' | 'middle' | 'bottom';
  /**
   * Plaqueta desenhada ATRÁS da imagem, e só quando ela existe. É o que torna
   * o logo do tenant legível nas artes de fundo escuro, sem deixar um
   * retângulo branco vazio na folha de quem não cadastrou logo.
   */
  plate?: ColorRef;
  /** Folga da plaqueta ao redor da caixa da imagem, em mm. Default 3. */
  platePadding?: Mm;
}

export interface TextShape extends ShapeBase {
  kind: 'text';
  slot: DocArtSlotKey;
  /** Canto superior-esquerdo da caixa de texto. */
  x: Mm;
  y: Mm;
  /** Largura da caixa — define onde o texto quebra. */
  w: Mm;
  font: FontFamily;
  weight: FontWeight;
  /** Corpo da fonte em pt (não mm — é a unidade natural de tipografia). */
  size: number;
  /** Altura de linha em pt. */
  lineHeight: number;
  /**
   * Respiro EXTRA (pt) entre um parágrafo e o seguinte, somado por parágrafo
   * já passado. Sem isso dois `<p>` saem colados e o corpo vira um bloco só.
   */
  paragraphSpacing?: number;
  align: TextAlign;
  color: ColorRef;
  transform?: TextTransform;
  /** Espaçamento entre letras em pt. Útil em títulos caixa-alta. */
  letterSpacing?: number;
  /** Graus, sentido horário, pivô em (x, y). Usado no slot `lateral`. */
  rotate?: number;
  /**
   * Corta o texto nesse número de linhas (sem reticências — o excedente some).
   * Protege a arte de um texto longo demais vazar por cima do desenho.
   */
  maxLines?: number;
}

export type DocArtShape =
  | RectShape
  | CircleShape
  | LineShape
  | PathShape
  | ImageShape
  | TextShape;

// -----------------------------------------------------------------------------
// Template
// -----------------------------------------------------------------------------

/**
 * Switches opcionais que uma arte respeita. O config do gestor liga/desliga,
 * e a arte filtra os shapes marcados com a mesma chave.
 */
export type DocArtToggleKey = 'signature' | 'footer';

/** Um shape pode ficar condicionado a um toggle ligado. */
export interface DocArtConditionalShape {
  /** Só desenha quando o toggle correspondente estiver ligado. */
  requires?: DocArtToggleKey;
  shape: DocArtShape;
}

export interface DocArtTemplate {
  slug: string;
  /** Nome exibido no seletor. */
  name: string;
  orientation: Orientation;
  /** Cor de amostra do card do seletor. */
  previewColor: string;
  /** Tema default da arte — o config do gestor sobrescreve campo a campo. */
  defaultTheme: DocArtTheme;
  /** Texto default de cada slot (HTML inline com `data-pmoc-var`). */
  defaultSlots: Partial<Record<DocArtSlotKey, string>>;
  /** Slots que esta arte realmente usa — dirige o formulário de edição. */
  slots: DocArtSlotKey[];
  /** Toggles que esta arte suporta. */
  toggles: DocArtToggleKey[];
  /** O desenho, em ordem de pintura (primeiro = mais ao fundo). */
  shapes: DocArtConditionalShape[];
}

// -----------------------------------------------------------------------------
// Tema e config salvos
// -----------------------------------------------------------------------------

export interface DocArtTheme {
  primary: string;
  accent: string;
  bg: string;
  paper: string;
}

/**
 * O que fica salvo em `certificado_art_config` (jsonb). Tudo opcional: campo
 * ausente cai no default da arte.
 */
export interface DocArtConfig {
  theme?: Partial<DocArtTheme>;
  /** Logo específico do documento; ausente = logo da empresa. */
  logoUrl?: string | null;
  toggles?: Partial<Record<DocArtToggleKey, boolean>>;
  /** Texto editado de cada slot (HTML inline). Ausente = default da arte. */
  slots?: Partial<Record<DocArtSlotKey, string>>;
}

// -----------------------------------------------------------------------------
// Saída do resolve
// -----------------------------------------------------------------------------

/** Trecho de texto com formatação uniforme, pronto pra medir e desenhar. */
export interface InlineRun {
  text: string;
  bold: boolean;
  italic: boolean;
}

/**
 * Um trecho de texto já POSICIONADO dentro da linha. `x` é o deslocamento em
 * pt a partir do início da linha.
 *
 * O layout entrega posições, não uma sequência a ser emendada: quem desenha só
 * coloca cada trecho no seu `x`. Isso elimina de vez a divergência entre a
 * largura medida e a desenhada (o bug em que "A empresa " + **"Acme"** saía
 * "A empresaAcme"), e garante que tela e PDF caiam no mesmo lugar.
 */
export interface LaidOutPiece {
  text: string;
  bold: boolean;
  italic: boolean;
  x: number;
}

/** Uma linha já quebrada, com seus trechos posicionados e a largura medida. */
export interface LaidOutLine {
  pieces: LaidOutPiece[];
  width: number;
  /** A qual parágrafo do slot esta linha pertence — alimenta o respiro entre eles. */
  paragraphIndex: number;
}

/** `TextShape` depois do resolve: cores finais e conteúdo já substituído. */
export interface ResolvedTextShape extends Omit<TextShape, 'color'> {
  color: string;
  /**
   * Parágrafos do slot já com as variáveis substituídas. Cada parágrafo é uma
   * lista de runs; a quebra em linhas acontece em cada renderizador, porque só
   * ele sabe medir a própria fonte.
   */
  paragraphs: InlineRun[][];
}

export type ResolvedShape =
  | (Omit<RectShape, 'fill' | 'stroke'> & { fill?: string; stroke?: string })
  | (Omit<CircleShape, 'fill' | 'stroke'> & { fill?: string; stroke?: string })
  | (Omit<LineShape, 'stroke'> & { stroke: string })
  | (Omit<PathShape, 'fill' | 'stroke'> & { fill?: string; stroke?: string })
  | ImageShape
  | ResolvedTextShape;

export interface ResolvedDocArt {
  slug: string;
  orientation: Orientation;
  page: { w: Mm; h: Mm };
  theme: DocArtTheme;
  shapes: ResolvedShape[];
}
