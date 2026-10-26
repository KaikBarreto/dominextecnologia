import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { SEGMENT_NAV_LINKS } from '@/pages/segmentos/segmentsData';
import { MODULE_NAV_LINKS } from '@/pages/modulos/modulesData';
import { getSegment } from '@/utils/companySegments';
import { useLocale } from '@/lib/i18n';
import { localizeInternal } from '@/lib/i18n/localizeInternal';
import DominexBrandLogo from '@/components/landing/DominexBrandLogo';

/**
 * Mapa slug-da-landing → valor de segmento em `companySegments` (fonte única das
 * cores saturadas — a MESMA usada no dropdown do navbar e no SegmentBadge). Cada
 * item da coluna Segmentos do rodapé pinta seu ícone de hover na cor do seu
 * próprio segmento, sem duplicar hex aqui.
 */
const SEGMENT_VALUE_BY_SLUG: Record<string, string> = {
  'sistema-para-refrigeracao': 'refrigeracao',
  'sistema-para-eletricistas': 'eletrica',
  'sistema-para-energia-solar': 'solar',
  'sistema-para-provedores': 'telecom',
  'sistema-para-cftv': 'cftv',
  'sistema-para-construcao-civil': 'construcao',
  'sistema-para-elevadores': 'elevadores',
  'sistema-para-limpeza-conservacao': 'limpeza',
  'sistema-para-dedetizacao': 'dedetizacao',
};

function segmentColor(slug: string): string {
  const value = SEGMENT_VALUE_BY_SLUG[slug];
  return (value && getSegment(value)?.color) || '#06b6d4';
}

const footerLinkClass =
  'text-sm text-[#667069] hover:text-primary transition-colors dark:text-white/55 dark:hover:text-white';

export default function LandingFooter() {
  const { locale, messages } = useLocale();
  const f = messages.footer;
  // Rótulos por slug (i18n). Módulo/segmento nunca mudam de slug, só de label.
  const moduleLabel = (slug: string) =>
    (messages.moduleLabels as Record<string, string>)[slug] ?? slug;
  const segmentLabel = (slug: string) =>
    (messages.segmentLabels as Record<string, string>)[slug] ?? slug;
  // Coluna institucional: rotas reais (sem link quebrado), label localizado.
  const institutionalLinks: { label: string; to: string }[] = [
    { label: f.linkAbout, to: '/quem-somos' },
    { label: f.linkBlog, to: '/blog' },
    { label: f.linkTerms, to: '/termos' },
    { label: f.linkPrivacy, to: '/privacidade' },
  ];
  return (
    <footer className="relative border-t border-[#e0e4e0] bg-white pt-16 pb-8 dark:border-white/5 dark:bg-[#070908]">
      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Faixa única: logo + colunas verticais lado a lado (estilo Auvo) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-10 mb-12">
          {/* Brand — ocupa a linha inteira no mobile */}
          <div className="col-span-2 md:col-span-4 lg:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <DominexBrandLogo className="w-[196px]" />
            </div>
            <p className="text-sm text-[#667069] mb-4 dark:text-white/55">
              {f.tagline}
            </p>
          </div>

          {/* Soluções — coluna vertical única (11 itens). Mesma micro-interação
              dos Segmentos: o texto desliza pra direita e o ícone do módulo faz
              fade-in à esquerda no hover/foco. Diferença: o ícone é SEMPRE o verde
              fixo da marca (#00C597, BRAND_GREEN) — nada de cor por item. HEX literal
              de propósito: o site público não pode puxar --primary, senão o
              white-label de um tenant logado vazaria a cor dele aqui. */}
          <div>
            <h3 className="text-sm font-semibold text-[#101512] mb-4 dark:text-white">{f.solutions}</h3>
            <ul className="space-y-2">
              {MODULE_NAV_LINKS.map((mod) => {
                const Icon = mod.icon;
                return (
                  <li key={mod.slug}>
                    <Link
                      to={localizeInternal(`/${mod.slug}`, locale)}
                      className="group relative flex items-center text-sm text-[#667069] transition-colors hover:text-primary focus-visible:text-primary focus-visible:outline-none dark:text-white/55 dark:hover:text-white dark:focus-visible:text-white"
                    >
                      {/* Ícone do módulo no verde da marca — invisível e um pouco
                          à esquerda; entra (fade + slide) no hover/foco. */}
                      <Icon
                        aria-hidden="true"
                        className="pointer-events-none absolute left-0 h-4 w-4 -translate-x-1 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100"
                        style={{ color: '#00C597' }}
                      />
                      {/* Texto: desliza pra direita pra dar espaço ao ícone. */}
                      <span className="transition-transform duration-300 group-hover:translate-x-6 group-focus-visible:translate-x-6">
                        {moduleLabel(mod.slug)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Segmentos — coluna vertical única (9 itens). Micro-interação no hover:
              o texto desliza pra direita e, à esquerda, faz fade-in o ícone do
              segmento SATURADO na cor daquele nicho (group-hover/focus-within, com
              transição suave — não quebra foco por teclado). */}
          <div>
            <h3 className="text-sm font-semibold text-[#101512] mb-4 dark:text-white">{f.segments}</h3>
            <ul className="space-y-2">
              {SEGMENT_NAV_LINKS.map((seg) => {
                const Icon = seg.icon;
                const color = segmentColor(seg.slug);
                return (
                  <li key={seg.slug}>
                    <Link
                      to={localizeInternal(`/${seg.slug}`, locale)}
                      className="group relative flex items-center text-sm text-[#667069] transition-colors hover:text-[var(--seg-accent)] focus-visible:text-[var(--seg-accent)] focus-visible:outline-none dark:text-white/55 dark:hover:text-[var(--seg-accent)] dark:focus-visible:text-[var(--seg-accent)]"
                      style={{ '--seg-accent': color } as CSSProperties}
                    >
                      {/* Ícone do segmento na cor pura — parte invisível e um pouco
                          à esquerda; entra (fade + slide) no hover/foco. */}
                      <Icon
                        aria-hidden="true"
                        className="pointer-events-none absolute left-0 h-4 w-4 -translate-x-1 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100"
                        style={{ color }}
                      />
                      {/* Texto: desliza pra direita pra dar espaço ao ícone. */}
                      <span className="transition-transform duration-300 group-hover:translate-x-6 group-focus-visible:translate-x-6">
                        {segmentLabel(seg.slug)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Institucional — coluna única enxuta (Empresa + Suporte unidas) */}
          <div>
            <h3 className="text-sm font-semibold text-[#101512] mb-4 dark:text-white">{f.institutional}</h3>
            <ul className="space-y-2">
              {institutionalLinks.map((item) => (
                <li key={item.to}>
                  <Link to={localizeInternal(item.to, locale)} className={footerLinkClass}>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-t border-[#e0e4e0] pt-6 flex items-center justify-center dark:border-white/5">
          <p className="text-xs text-[#778079] dark:text-white/50">
            © {new Date().getFullYear()} Dominex. {f.copyright}
          </p>
        </div>
      </div>
    </footer>
  );
}
