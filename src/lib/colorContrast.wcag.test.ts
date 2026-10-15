// ─────────────────────────────────────────────────────────────────────────────
// resolveWcagForeground — rede de proteção de CONTRASTE (WCAG 2.1 AA, 1.4.3).
//
// O site público pinta CTAs e badges com a cor da marca, do segmento ou da
// categoria do blog como FUNDO. Texto branco fixo em cima reprovava em quase
// todos (medido com axe-core em produção: CTA da marca 2,22:1, WhatsApp 1,98:1,
// badges do blog entre 2,14 e 3,67). A correção deriva o foreground; a lei do
// CEO proíbe escurecer a cor de marca/accent pra resolver.
//
// O teste abaixo lê as cores REAIS de segmentsData, então cor nova que entre no
// site e não consiga atingir AA com nenhum foreground falha aqui, não em
// produção. A razão de contraste é recalculada por uma implementação
// INDEPENDENTE (abaixo), de propósito: validar a função com a própria função
// não provaria nada.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { SEGMENTS } from '@/pages/segmentos/segmentsData';
import { resolveWcagForeground } from './colorContrast';

const AA_NORMAL = 4.5;

// Implementação independente da fórmula WCAG 2.1 (relative luminance).
function luminance(hex: string): number {
  const int = parseInt(hex.replace('#', ''), 16);
  const channels = [(int >> 16) & 255, (int >> 8) & 255, int & 255];
  const [r, g, b] = channels.map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(fg: string, bg: string): number {
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Cores de marca e de categoria do blog que o axe pegou reprovando em produção. */
const CORES_CRITICAS: Record<string, string> = {
  'verde da marca (CTA primário)': '#00c597',
  'verde da marca (variante do blog)': '#00c785',
  'verde oficial do WhatsApp': '#25d366',
  'blog — Gestão de Campo': '#10b981',
  'blog — PMOC': '#06b6d4',
  'blog — Refrigeração': '#3b82f6',
  'blog — Ordem de Serviço': '#6366f1',
  'blog — Dicas': '#f59e0b',
  'blog — Novidades': '#6b7280',
  'blog — Gestão Financeira': '#0ea5e9',
};

describe('resolveWcagForeground — atinge AA nas cores reais do site', () => {
  it.each(Object.entries(CORES_CRITICAS))('%s (%s) atinge 4.5:1', (_nome, bg) => {
    const fg = resolveWcagForeground(bg);
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('todo accentColor de segmento atinge 4.5:1 com o foreground derivado', () => {
    const reprovando = Object.values(SEGMENTS)
      .map((s) => ({ slug: s.slug, bg: s.accentColor }))
      .map(({ slug, bg }) => ({ slug, bg, fg: resolveWcagForeground(bg), r: ratio(resolveWcagForeground(bg), bg) }))
      .filter(({ r }) => r < AA_NORMAL)
      .map(({ slug, bg, fg, r }) => `${slug} ${bg} + ${fg} = ${r.toFixed(2)}:1`);
    expect(reprovando).toEqual([]);
  });
});

describe('resolveWcagForeground — a cor de fundo nunca é alterada', () => {
  it('devolve apenas um foreground, jamais um fundo novo', () => {
    const permitidos = ['#ffffff', '#1a1a1a', '#000000'];
    for (const bg of [...Object.values(CORES_CRITICAS), ...Object.values(SEGMENTS).map((s) => s.accentColor)]) {
      expect(permitidos).toContain(resolveWcagForeground(bg));
    }
  });
});

describe('resolveWcagForeground — casos de borda', () => {
  it('matiz médio onde a dupla da régua falha cai no extremo (#6366f1)', () => {
    // branco = 4,47:1 e #1a1a1a = 3,90:1, ambos reprovam; preto puro = 4,70:1.
    expect(resolveWcagForeground('#6366f1')).toBe('#000000');
  });

  it('fundo escuro saturado usa o tom escuro da régua, não preto puro', () => {
    expect(resolveWcagForeground('#00c597')).toBe('#1a1a1a');
  });

  it('fundo escuro de verdade usa branco', () => {
    expect(resolveWcagForeground('#0d0d0d')).toBe('#ffffff');
  });

  it('aceita rgb() e hsl(), não só hex', () => {
    expect(resolveWcagForeground('rgb(0, 197, 151)')).toBe('#1a1a1a');
    expect(resolveWcagForeground('hsl(160 100% 39%)')).toBe('#1a1a1a');
  });

  it('cor ausente ou inválida cai no branco legado', () => {
    expect(resolveWcagForeground(undefined)).toBe('#ffffff');
    expect(resolveWcagForeground('nao-e-cor')).toBe('#ffffff');
  });
});
