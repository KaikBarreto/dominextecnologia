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
