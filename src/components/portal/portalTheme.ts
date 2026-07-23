import type { CSSProperties } from 'react';
import { REPORT_HEADER_DARK_GRADIENT } from '@/components/technician/ReportHeader';

/**
 * Estilo inline do header branded de portais publicos.
 *
 * Cor vem do PAYLOAD (anti-FOUC, regra-lei n2):
 *   - Nunca cacheia em localStorage.
 *   - Nunca toca CSS vars globais.
 *   - Sem cor -> degrede escuro Dominex.
 *
 * Mesma logica do PontoPublico.tsx (linha 130-164), adaptada para portais
 * que so recebem brandColor (sem precisar de todo o resolveBranding).
 */
export function portalHeaderStyle(brandColor?: string | null): CSSProperties {
  if (!brandColor) {
    return { background: REPORT_HEADER_DARK_GRADIENT, color: '#ffffff' };
  }
  return {
    background: `linear-gradient(180deg, ${brandColor} 0%, color-mix(in srgb, ${brandColor}, #000 34%) 100%)`,
    color: '#ffffff',
  };
}

/** Degrede do rodape sticky dos portais (identico ao do PontoPublico / TechnicianOS). */
export const PORTAL_FOOTER_GRADIENT = 'linear-gradient(180deg, #0a0a0a, #27272a)';
