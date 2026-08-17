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

// Cache da marca do tenant para reaplicação síncrona no boot (index.html),
// eliminando o flash da cor verde padrão da Dominex no reload/pull-to-refresh.
// Os nomes das chaves são FIXOS e duplicados como string literal no script
// inline do index.html (que é JS puro e não importa constantes).
function cacheWhiteLabel(hsl: string, gradient: string, navNeon: string) {
  try {
    localStorage.setItem('__wl_primary', hsl);
    localStorage.setItem('__wl_gradient', gradient);
    localStorage.setItem('__wl_nav_neon', navNeon);
  } catch (_) {
    /* localStorage pode lançar em modo privado/iOS — ignorar */
  }
}

function clearWhiteLabelCache() {
  try {
    localStorage.removeItem('__wl_primary');
    localStorage.removeItem('__wl_gradient');
    localStorage.removeItem('__wl_nav_neon');
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

  const gradient = buildBrandGradient(hsl);
  const navNeon = buildNavNeon(hsl);
  root.style.setProperty('--primary', hsl);
  root.style.setProperty('--ring', hsl);
  root.style.setProperty('--sidebar-primary', hsl);
  root.style.setProperty('--sidebar-accent', hsl);
  root.style.setProperty('--sidebar-ring', hsl);
  root.style.setProperty('--gradient-brand', gradient);
  // Barra neon do menu escuro passa a usar a cor do cliente (todos os itens,
  // incl. subitens dos grupos colapsáveis, herdam via var(--nav-neon), que
  // resolve `var(--wl-nav-neon, <verde>)` nas superfícies de nav).
  root.style.setProperty('--wl-nav-neon', navNeon);

  // Persiste a marca já computada para o boot síncrono no próximo load.
  cacheWhiteLabel(hsl, gradient, navNeon);
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
