import { useEffect } from 'react';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import logoDark from '@/assets/logo-dark.png';
import logoWhite from '@/assets/logo-white.png';

function hexToHsl(hex: string): string | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;
  let r = parseInt(result[1], 16) / 255;
  let g = parseInt(result[2], 16) / 255;
  let b = parseInt(result[3], 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export function useWhiteLabel() {
  const { settings } = useCompanySettings();

  const enabled = !!(settings as any)?.white_label_enabled;
  const primaryColor = (settings as any)?.white_label_primary_color || null;
  const customLogoUrl = (settings as any)?.white_label_logo_url || null;

  // When WL is enabled: use custom WL logo, or fall back to company logo
  const logoUrl = enabled
    ? (customLogoUrl || settings?.logo_url || null)
    : null; // null means use default static logos

  const defaultLogoDark = logoDark;
  const defaultLogoWhite = logoWhite;

  // Apply CSS custom property overrides when white label color is active
  useEffect(() => {
    if (enabled && primaryColor) {
      const hsl = hexToHsl(primaryColor);
      if (hsl) {
        document.documentElement.style.setProperty('--primary', hsl);
        document.documentElement.style.setProperty('--ring', hsl);
      }
    } else {
      document.documentElement.style.removeProperty('--primary');
      document.documentElement.style.removeProperty('--ring');
    }
    return () => {
      document.documentElement.style.removeProperty('--primary');
      document.documentElement.style.removeProperty('--ring');
    };
  }, [enabled, primaryColor]);

  return {
    enabled,
    primaryColor,
    customLogoUrl,
    /** The resolved logo URL, or null if default Dominex logos should be used */
    logoUrl,
    defaultLogoDark,
    defaultLogoWhite,
  };
}
