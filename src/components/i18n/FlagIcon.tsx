// ─────────────────────────────────────────────────────────────────────────────
// FlagIcon — imagens reais das 4 bandeiras do seletor de idioma.
//
// Imagens locais em /public/flags/{br,us,es,fr}.png (w160, retina-ready).
// Servidas do nosso domínio: sem hotlink que apodrece, sem dep npm extra.
//
// Dimensões exibidas: por padrão 20×14px (proporção original da maioria das
// bandeiras) com src 160px (2x pra telas retina).
// Proporção forçada via CSS (object-fit: cover) pra evitar distorção mesmo
// quando a proporção nativa da imagem (br=160x112, es=160x107, fr=160x107,
// us=160x84) difere do container.
//
// API preservada: { locale, size?, className? } — mesmos props do SVG anterior.
// ─────────────────────────────────────────────────────────────────────────────

import type { CSSProperties } from 'react';
import type { LocaleCode } from '@/lib/i18n/locales';

interface FlagIconProps {
  locale: LocaleCode;
  /** Largura em px. Altura calculada pela proporção 20:14. Padrão: 20. */
  size?: number;
  className?: string;
}

/** Mapeamento locale -> código de arquivo + nome do país para alt. */
const FLAG_META: Record<LocaleCode, { code: string; country: string }> = {
  'pt-br': { code: 'br', country: 'Brasil' },
  en:      { code: 'us', country: 'Estados Unidos' },
  es:      { code: 'es', country: 'Espanha' },
  fr:      { code: 'fr', country: 'França' },
};

export default function FlagIcon({ locale, size = 20, className }: FlagIconProps) {
  const w = size;
  const h = Math.round((size * 14) / 20);
  const meta = FLAG_META[locale];
  if (!meta) return null;

  const wrapStyle: CSSProperties = {
    display: 'inline-block',
    lineHeight: 0,
    flexShrink: 0,
    width: w,
    height: h,
    overflow: 'hidden',
  };

  return (
    <span style={wrapStyle} className={className}>
      <img
        src={`/flags/${meta.code}.png`}
        alt={meta.country}
        width={w}
        height={h}
        style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }}
        draggable={false}
      />
    </span>
  );
}
