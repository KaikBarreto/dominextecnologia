/**
 * Helpers de contraste de cor — usados quando uma cor arbitrária do usuário
 * (ex: cor de uma conta financeira) vira FUNDO e precisamos de um texto legível
 * por cima. Evita o bug "branco no branco" (cartão salvo com #ffffff sumia).
 */

/** Converte hex (#RRGGBB) em `r, g, b` pra usar em rgba(). Fallback: null. */
export function hexToRgbTriplet(hex?: string): string | null {
  if (!hex) return null;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const int = parseInt(m[1], 16);
  return `${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}`;
}

/**
 * Dado um fundo (hex), retorna a cor de texto ideal pra ficar legível por cima:
 * `'#ffffff'` (branco) sobre fundos escuros, ou `'#0f172a'` (slate-900) sobre
 * fundos claros. Usa luminância relativa sRGB (0.2126R + 0.7152G + 0.0722B,
 * normalizada 0-1) com threshold ~0.6 — cores muito claras (ex: #ffffff) caem
 * no texto escuro. Hex inválido/ausente → `'#ffffff'` (mantém o comportamento
 * legado de texto branco).
 */
export function idealForeground(hex?: string): string {
  const triplet = hexToRgbTriplet(hex);
  if (!triplet) return '#ffffff';
  const [r, g, b] = triplet.split(',').map((n) => Number(n.trim()) / 255);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.6 ? '#0f172a' : '#ffffff';
}

// --- WCAG 2.1 — contraste de verdade (site público + blog) ----------------
// `idealForeground` acima usa luminância SEM correção gama e um threshold
// solto (0.6): funciona bem o bastante pros usos internos legados (contas
// financeiras, orgchart, etc.) mas reprova no cálculo oficial da WCAG pra
// cores saturadas de marca — ex.: #00C597 com branco mede só ~2,2:1 de
// verdade, não "ilegível só nos tons claros" como o comentário de cima supõe.
// Não reescrevemos `idealForeground` (usado por outros domínios fora do
// site público; mudar o threshold ali teria blast radius em telas que não
// são nossas) — esta função nova é o mesmo ALGORITMO de
// `resolvePrimaryContrast` (useWhiteLabel.ts:147), só que em hex puro (sem
// depender de React/Supabase, que useWhiteLabel.ts arrasta e o site público
// não pode importar). Mesma dupla de foreground: branco ou '#1a1a1a'
// (idêntico a `hsl(0 0% 10%)`, o tom do --foreground/--primary-foreground
// do index.css). NUNCA ajusta o fundo — a lei do CEO proíbe escurecer marca
// ou accent de segmento pra resolver contraste; aqui só se deriva o texto.
const WCAG_WHITE_RGB: [number, number, number] = [255, 255, 255];
const WCAG_DARK_RGB: [number, number, number] = [26, 26, 26]; // hsl(0 0% 10%)

function srgbChannelToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function wcagRelativeLuminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * srgbChannelToLinear(r) + 0.7152 * srgbChannelToLinear(g) + 0.0722 * srgbChannelToLinear(b);
}

function wcagContrastRatio(lumA: number, lumB: number): number {
  const a = Math.max(lumA, lumB);
  const b = Math.min(lumA, lumB);
  return (a + 0.05) / (b + 0.05);
}

/** Mínimo da WCAG 2.1 AA pra texto normal (1.4.3). */
const WCAG_AA_NORMAL_TEXT = 4.5;
const WCAG_BLACK_RGB: [number, number, number] = [0, 0, 0];

/**
 * Dado um fundo hex, devolve o texto que ganha MAIS contraste de verdade
 * (fórmula WCAG). Fundo inválido/ausente → `'#ffffff'` (mesmo fallback legado
 * de `idealForeground`).
 *
 * Primeiro tenta a dupla da régua (`'#ffffff'` / `'#1a1a1a'`). Em matizes
 * MÉDIOS nenhum dos dois alcança 4,5:1 — o caso real é o accent do segmento
 * CFTV / categoria "Ordem de Serviço" do blog (`#6366f1`), onde branco mede
 * 4,47:1 e `#1a1a1a` mede 3,90:1, os dois reprovando. Aí vai no EXTREMO que
 * maximiza o contraste (preto ou branco puro): `#000000` sobre `#6366f1` mede
 * 4,70:1 e passa.
 *
 * Continua respeitando a lei: só o FOREGROUND é derivado, a cor de marca/accent
 * nunca é escurecida nem alterada.
 */
export function resolveWcagForeground(hex?: string): string {
  const rgb = parseCssColorToRgb(hex);
  if (!rgb) return '#ffffff';
  const bgLum = wcagRelativeLuminance(rgb);
  const contrastWhite = wcagContrastRatio(bgLum, wcagRelativeLuminance(WCAG_WHITE_RGB));
  const contrastDark = wcagContrastRatio(bgLum, wcagRelativeLuminance(WCAG_DARK_RGB));
  const best = contrastWhite >= contrastDark
    ? { color: '#ffffff', ratio: contrastWhite }
    : { color: '#1a1a1a', ratio: contrastDark };
  if (best.ratio >= WCAG_AA_NORMAL_TEXT) return best.color;

  const contrastBlack = wcagContrastRatio(bgLum, wcagRelativeLuminance(WCAG_BLACK_RGB));
  return contrastBlack > contrastWhite ? '#000000' : '#ffffff';
}

/**
 * Parser mínimo pra `#rrggbb`, `rgb(r, g, b)` e `hsl(h s% l%)` — o suficiente
 * pro que o blog/landing guardam como cor de categoria/segmento (hex no banco
 * `blog_categories.color`, ou `hsl(160 100% 39%)` no fallback BRAND_GREEN).
 * Sem isso, `resolveWcagForeground('hsl(160 100% 39%)')` cairia no fallback
 * branco (`hexToRgbTriplet` só entende hex) e repetiria o mesmo bug que
 * estamos corrigindo.
 */
function parseCssColorToRgb(color?: string | null): [number, number, number] | null {
  if (!color) return null;
  const trimmed = color.trim();

  const hexTriplet = hexToRgbTriplet(trimmed);
  if (hexTriplet) {
    return hexTriplet.split(',').map((n) => Number(n.trim())) as [number, number, number];
  }

  const rgbMatch = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(trimmed);
  if (rgbMatch) {
    return [Number(rgbMatch[1]), Number(rgbMatch[2]), Number(rgbMatch[3])];
  }

  const hslMatch = /^hsla?\(\s*([\d.]+)(?:deg)?[,\s]+([\d.]+)%[,\s]+([\d.]+)%/i.exec(trimmed);
  if (hslMatch) {
    const h = Number(hslMatch[1]);
    const s = Number(hslMatch[2]);
    const l = Number(hslMatch[3]);
    return hslToRgb255(h, s, l);
  }

  return null;
}

function hslToRgb255(h: number, s: number, l: number): [number, number, number] {
  const sN = s / 100;
  const lN = l / 100;
  const c = (1 - Math.abs(2 * lN - 1)) * sN;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lN - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
