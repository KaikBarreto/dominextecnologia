import { Link } from 'react-router-dom';
import logoWhite from '@/assets/logo-horizontal-verde.png';
import { SEGMENT_NAV_LINKS } from '@/pages/segmentos/segmentsData';
import { MODULE_NAV_LINKS } from '@/pages/modulos/modulesData';
import { getSegment } from '@/utils/companySegments';

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

// Coluna institucional enxuta (Empresa + Suporte unidas). Todos os itens são
// rotas reais — sem link quebrado. /blog é um stub "em breve" por enquanto
// (não está no sitemap até ter conteúdo real — ver retorno ao Tech Lead).
const INSTITUTIONAL_LINKS: { label: string; to: string }[] = [
  { label: 'Quem somos', to: '/quem-somos' },
  { label: 'Blog', to: '/blog' },
  { label: 'Termos de uso', to: '/termos' },
  { label: 'Política de Privacidade', to: '/privacidade' },
];

const footerLinkClass =
  'text-sm text-white/30 hover:text-white/60 transition-colors';

export default function LandingFooter() {
  return (
    <footer className="relative border-t border-white/5 pt-16 pb-8">
      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Faixa única: logo + colunas verticais lado a lado (estilo Auvo) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-10 mb-12">
          {/* Brand — ocupa a linha inteira no mobile */}
          <div className="col-span-2 md:col-span-4 lg:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <img src={logoWhite} alt="Dominex" className="h-10 w-auto" />
            </div>
            <p className="text-sm text-white/30 mb-4">
              Domine a execução do seu negócio.
            </p>
          </div>

          {/* Soluções — coluna vertical única (11 itens) */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-4">Soluções</h4>
            <ul className="space-y-2">
              {MODULE_NAV_LINKS.map((mod) => (
                <li key={mod.slug}>
                  <Link to={`/${mod.slug}`} className={footerLinkClass}>
                    {mod.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Segmentos — coluna vertical única (9 itens). Micro-interação no hover:
              o texto desliza pra direita e, à esquerda, faz fade-in o ícone do
              segmento SATURADO na cor daquele nicho (group-hover/focus-within, com
              transição suave — não quebra foco por teclado). */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-4">Segmentos</h4>
            <ul className="space-y-2">
              {SEGMENT_NAV_LINKS.map((seg) => {
                const Icon = seg.icon;
                const color = segmentColor(seg.slug);
                return (
                  <li key={seg.slug}>
                    <Link
                      to={`/${seg.slug}`}
                      className="group relative flex items-center text-sm text-white/30 transition-colors hover:text-white/70 focus-visible:text-white/70 focus-visible:outline-none"
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
                        {seg.label}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Institucional — coluna única enxuta (Empresa + Suporte unidas) */}
          <div>
            <h4 className="text-sm font-semibold text-white mb-4">Institucional</h4>
            <ul className="space-y-2">
              {INSTITUTIONAL_LINKS.map((item) => (
                <li key={item.to}>
                  <Link to={item.to} className={footerLinkClass}>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-t border-white/5 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-white/50">
            © {new Date().getFullYear()} Dominex. Todos os direitos reservados. Feito para quem domina o campo.
          </p>
          <p className="text-xs text-white/50">
            Criado por{' '}
            <a
              href="https://auctustech.com.br"
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-white/70 hover:text-white transition-colors"
            >
              Auctus
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
