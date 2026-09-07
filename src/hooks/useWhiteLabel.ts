import { useEffect } from 'react';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { useAuth } from '@/contexts/AuthContext';
import logoDark from '@/assets/logo-dark.png';
import logoWhite from '@/assets/logo-white.png';

const WHITE_LABEL_VARS = [
  '--primary',
  '--ring',
  '--sidebar-primary',
  '--sidebar-accent',
  '--sidebar-ring',
  '--gradient-brand',
  // Barra neon do menu escuro (Fase 2). Sem white-label volta ao verde neon
  // default declarado no index.css; com white-label deriva da cor do cliente.
  // É `--wl-nav-neon` (não `--nav-neon`) porque as superfícies de nav
  // redeclaram `--nav-neon: var(--wl-nav-neon, <verde>)` no próprio elemento —
  // setar `--nav-neon` só no :root seria sobrescrito por essa redeclaração.
  '--wl-nav-neon',
  // Texto do botão/badge "default" (--primary-foreground) — derivado da cor
  // do TENANT via `resolvePrimaryContrast`. Sem isso, marca clara (ex.:
  // amarelo/laranja) herdaria o branco fixo do :root e ficaria ilegível.
  '--primary-foreground',
] as const;

/**
 * Deriva a cor da barra NEON (indicador do menu escuro) da cor primária do
 * white-label. Recebe o HSL "H S% L%" já computado e devolve uma versão um
 * pouco mais SATURADA e CLARA pra "acender" como neon sobre o fundo escuro do
 * menu — mas nunca abaixo do original (marcas já vivas/claras não escurecem).
 */
export function buildNavNeon(hsl: string): string {
  const parts = hsl.trim().split(/\s+/);
  if (parts.length < 3) return hsl;
  const h = Number.parseInt(parts[0], 10);
  const s = Number.parseInt(parts[1], 10); // "62%" → 62
  const l = Number.parseInt(parts[2], 10);
  if (!Number.isFinite(h) || !Number.isFinite(s) || !Number.isFinite(l)) return hsl;
  const neonS = Math.min(s + 15, 95);
  const neonL = Math.min(Math.max(l, 50), 62);
  return `${h} ${neonS}% ${neonL}%`;
}

export function hexToHsl(hex: string): string | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;

  let r = parseInt(result[1], 16) / 255;
  let g = parseInt(result[2], 16) / 255;
  let b = parseInt(result[3], 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  let l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function buildBrandGradient(hsl: string) {
  const [h, s, rawL] = hsl.split(' ');
  const lightness = Number.parseInt(rawL, 10);
  const glowLightness = Number.isFinite(lightness) ? Math.min(lightness + 6, 60) : 45;
  return `linear-gradient(135deg, hsl(${hsl}) 0%, hsl(${h} ${s} ${glowLightness}%) 100%)`;
}

// ── Contraste do PAR primary/primary-foreground ─────────────────────────────
// Botão/badge "default" usa fundo --primary + texto --primary-foreground.
// Verde default (#00C597) e várias cores de white-label medem <4.5:1 (WCAG AA)
// contra texto branco — mas o MESMO fundo mede ótimo contraste contra um
// texto escuro neutro. Decisão (CEO, pós-QA visual v1.24.0): a marca (matiz/
// saturação/luminância do --primary) NUNCA muda pra "resolver" contraste —
// trocar a cor destoaria da aba ativa/badge ao lado que também usa --primary
// (incidente: white-label laranja da Glacial virou botão marrom, dessincronizado
// da aba "Notas Fiscais" ao lado). Em vez disso:
//   1. Calcula o contraste do --primary efetivo contra BRANCO e contra um
//      ESCURO NEUTRO (`0 0% 10%`, o mesmo tom usado como --foreground/
//      --primary-foreground do restyle sóbrio do app logado).
//   2. Usa o que der o MELHOR contraste como --primary-foreground.
//   3. SÓ SE nenhum dos dois bater 4.5:1 (cor de luminância intermediária,
//      ex. um azul médio — existe e acontece), ajusta a luminância do PRÓPRIO
//      --primary o mínimo necessário (1 ponto de cada vez) até o melhor dos
//      dois foregrounds passar. Esse é o fallback, não o caminho principal —
//      a esmagadora maioria das marcas (incl. o verde default e o laranja da
//      Glacial) resolve inteiramente no passo 2, sem tocar no --primary.
function hslToRgb01(h: number, s: number, l: number): [number, number, number] {
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
  return [r + m, g + m, b + m];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const chan = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

function relativeLuminanceHsl(h: number, s: number, l: number): number {
  return relativeLuminance(hslToRgb01(h, s, l));
}

function contrastRatio(lumA: number, lumB: number): number {
  const a = Math.max(lumA, lumB);
  const b = Math.min(lumA, lumB);
  return (a + 0.05) / (b + 0.05);
}

const CONTRAST_TARGET = 4.5; // WCAG AA, texto normal
const WHITE_FOREGROUND = '0 0% 100%';
const DARK_FOREGROUND = '0 0% 10%'; // mesmo neutro do --foreground do :root
const WHITE_LUM = relativeLuminanceHsl(0, 0, 100);
const DARK_LUM = relativeLuminanceHsl(0, 0, 10);

/**
 * Resolve o par `{ primary, foreground }` pro fundo --primary efetivo:
 * escolhe branco ou escuro-neutro como texto (o que der mais contraste) e só
 * ajusta a luminância do próprio --primary no caso raro de nenhum dos dois
 * bater 4.5:1 sozinho. Ver comentário acima pro racional completo.
 */
export function resolvePrimaryContrast(hsl: string): { primary: string; foreground: string } {
  const parts = hsl.trim().split(/\s+/);
  if (parts.length < 3) return { primary: hsl, foreground: WHITE_FOREGROUND };
  const h = Number.parseInt(parts[0], 10);
  const s = Number.parseInt(parts[1], 10);
  let l = Number.parseInt(parts[2], 10);
  if (!Number.isFinite(h) || !Number.isFinite(s) || !Number.isFinite(l)) {
    return { primary: hsl, foreground: WHITE_FOREGROUND };
  }

  const bgLum = relativeLuminanceHsl(h, s, l);
  const contrastWhite = contrastRatio(bgLum, WHITE_LUM);
  const contrastDark = contrastRatio(bgLum, DARK_LUM);
  const useWhite = contrastWhite >= contrastDark;
  const foreground = useWhite ? WHITE_FOREGROUND : DARK_FOREGROUND;
  const bestContrast = useWhite ? contrastWhite : contrastDark;

  if (bestContrast >= CONTRAST_TARGET) {
    return { primary: hsl, foreground };
  }

  // Fallback raro: nenhum dos dois foregrounds bate 4.5:1 sozinho (cor de
  // luminância intermediária). Empurra o --primary na direção que ajuda o
  // foreground JÁ escolhido — mais escuro se for branco, mais claro se for
  // escuro — parando assim que passar (ou nos limites 0/100).
  const targetLum = useWhite ? WHITE_LUM : DARK_LUM;
  const direction = useWhite ? -1 : 1;
  let adjustedL = l;
  for (let i = 0; i < 100; i++) {
    adjustedL += direction;
    if (adjustedL <= 0 || adjustedL >= 100) break;
    const contrast = contrastRatio(relativeLuminanceHsl(h, s, adjustedL), targetLum);
    if (contrast >= CONTRAST_TARGET) break;
  }
  adjustedL = Math.max(0, Math.min(100, adjustedL));
  return { primary: `${h} ${s}% ${adjustedL}%`, foreground };
}

// Cache da marca do tenant para reaplicação síncrona no boot (index.html),
// eliminando o flash da cor verde padrão da Dominex no reload/pull-to-refresh.
// Os nomes das chaves são FIXOS e duplicados como string literal no script
// inline do index.html (que é JS puro e não importa constantes).
function cacheWhiteLabel(hsl: string, gradient: string, navNeon: string, foreground: string) {
  try {
    localStorage.setItem('__wl_primary', hsl);
    localStorage.setItem('__wl_gradient', gradient);
    localStorage.setItem('__wl_nav_neon', navNeon);
    localStorage.setItem('__wl_primary_foreground', foreground);
  } catch (_) {
    /* localStorage pode lançar em modo privado/iOS — ignorar */
  }
}

function clearWhiteLabelCache() {
  try {
    localStorage.removeItem('__wl_primary');
    localStorage.removeItem('__wl_gradient');
    localStorage.removeItem('__wl_nav_neon');
    localStorage.removeItem('__wl_primary_foreground');
  } catch (_) {
    /* localStorage pode lançar em modo privado/iOS — ignorar */
  }
}

export function applyWhiteLabelTheme(enabled: boolean, primaryColor?: string | null) {
  const root = document.documentElement;

  if (!enabled || !primaryColor) {
    WHITE_LABEL_VARS.forEach((variable) => root.style.removeProperty(variable));
    clearWhiteLabelCache();
    return;
  }

  const hsl = hexToHsl(primaryColor);
  if (!hsl) {
    WHITE_LABEL_VARS.forEach((variable) => root.style.removeProperty(variable));
    clearWhiteLabelCache();
    return;
  }

  // Resolve o texto do botão/badge "default" (branco ou escuro-neutro) pro
  // --primary do TENANT — e só no caso raro (cor de luminância intermediária)
  // ajusta a própria luminância do --primary. Ver comentário em
  // `resolvePrimaryContrast` pro racional completo.
  const { primary: resolvedPrimary, foreground } = resolvePrimaryContrast(hsl);
  const gradient = buildBrandGradient(resolvedPrimary);
  const navNeon = buildNavNeon(resolvedPrimary);
  root.style.setProperty('--primary', resolvedPrimary);
  root.style.setProperty('--primary-foreground', foreground);
  root.style.setProperty('--ring', resolvedPrimary);
  root.style.setProperty('--sidebar-primary', resolvedPrimary);
  root.style.setProperty('--sidebar-accent', resolvedPrimary);
  root.style.setProperty('--sidebar-ring', resolvedPrimary);
  root.style.setProperty('--gradient-brand', gradient);
  // Barra neon do menu escuro passa a usar a cor do cliente (todos os itens,
  // incl. subitens dos grupos colapsáveis, herdam via var(--nav-neon), que
  // resolve `var(--wl-nav-neon, <verde>)` nas superfícies de nav).
  root.style.setProperty('--wl-nav-neon', navNeon);

  // Persiste a marca já computada para o boot síncrono no próximo load.
  cacheWhiteLabel(resolvedPrimary, gradient, navNeon, foreground);
}

export function useWhiteLabel() {
  const { settings, isLoading } = useCompanySettings();
  const { hasRole } = useAuth();

  const isSuperAdmin = hasRole('super_admin');
  const enabled = !isSuperAdmin && !!settings?.white_label_enabled;
  const primaryColor = settings?.white_label_primary_color || null;
  const customLogoUrl = settings?.white_label_logo_url || null;
  const customIconUrl = settings?.white_label_icon_url || null;

  const logoUrl = enabled ? customLogoUrl || settings?.logo_url || null : null;
  const iconUrl = enabled ? customIconUrl : null;

  const defaultLogoDark = logoDark;
  const defaultLogoWhite = logoWhite;

  useEffect(() => {
    // Enquanto as settings ainda carregam não sabemos a resposta — não derruba
    // a cor que o inline script (index.html) aplicou do cache no boot. Resetar
    // aqui durante o load apagaria o cache e piscaria o verde padrão a cada
    // refresh (inclusive na tela pública de OS / relatório).
    if (isLoading) return;
    applyWhiteLabelTheme(enabled, primaryColor);
  }, [enabled, primaryColor, isLoading]);

  return {
    enabled,
    primaryColor,
    customLogoUrl,
    customIconUrl,
    logoUrl,
    iconUrl,
    defaultLogoDark,
    defaultLogoWhite,
    isLoading,
  };
}
