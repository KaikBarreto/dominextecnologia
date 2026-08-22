// useBrandedQrConfig — resolvedor de estilo do QR branded pro app LOGADO.
//
// Devolve `{ logoUrl, dotStyle, cornerStyle, color }` do tenant atual, pronto
// pra passar direto ao <BrandedQRCode/>. Regra:
//   - white_label_enabled → logo do tenant + estilo/cor das colunas novas de
//     company_settings (defaults square/square/preto quando NULL);
//   - sem white-label → logoUrl null (o BrandedQRCode cai no ícone Dominex) e
//     estilo padrão.
//
// Fonte da verdade é o useWhiteLabel (que já resolve `enabled` respeitando
// super_admin) + as settings do tenant. O componente NUNCA toca supabase; este
// hook é a fronteira.

import { useWhiteLabel } from '@/hooks/useWhiteLabel';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import type { QRDotStyle, QRCornerStyle } from '@/components/BrandedQRCode';

export interface BrandedQrConfig {
  logoUrl: string | null;
  dotStyle: QRDotStyle;
  cornerStyle: QRCornerStyle;
  color: string;
}

const DOT_STYLES: QRDotStyle[] = ['square', 'rounded', 'dots', 'classy'];
const CORNER_STYLES: QRCornerStyle[] = ['square', 'rounded', 'dot'];

function coerceDotStyle(value?: string | null): QRDotStyle {
  return DOT_STYLES.includes(value as QRDotStyle) ? (value as QRDotStyle) : 'square';
}

function coerceCornerStyle(value?: string | null): QRCornerStyle {
  return CORNER_STYLES.includes(value as QRCornerStyle) ? (value as QRCornerStyle) : 'square';
}

export function useBrandedQrConfig(): BrandedQrConfig {
  const { enabled, logoUrl } = useWhiteLabel();
  const { settings } = useCompanySettings();

  // Sem white-label: ícone Dominex + estilo padrão. O BrandedQRCode já força
  // contraste/nível H, então preto puro é sempre legível.
  if (!enabled) {
    return { logoUrl: null, dotStyle: 'square', cornerStyle: 'square', color: '#000000' };
  }

  return {
    logoUrl: logoUrl ?? null,
    dotStyle: coerceDotStyle(settings?.white_label_qr_dot_style),
    cornerStyle: coerceCornerStyle(settings?.white_label_qr_corner_style),
    // Cor vazia/NULL → preto. O BrandedQRCode ainda reforça contraste sobre o
    // branco (cor clara demais cai pro preto), então isto é só a preferência.
    color: settings?.white_label_qr_color || '#000000',
  };
}
