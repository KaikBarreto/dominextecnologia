import { useState, useEffect, useRef, type ComponentType } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import {
  Menu,
  X,
  LogIn,
  ChevronDown,
  ClipboardList,
  ClipboardCheck,
  TrendingUp,
  DollarSign,
  Clock,
  FileText,
  FileSignature,
  Receipt,
  UserCircle,
  Package,
  ArrowRight,
  BadgeDollarSign,
  ShoppingCart,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Imagem REDONDA da Área do Técnico™ — a MESMA do botão flutuante (FAB) do
 * preenchimento da OS (SpeedDialFAB em TechnicianOS). É um asset remoto no
 * Storage; aqui só referenciamos a mesma URL pra manter a identidade.
 */
const AREA_TECNICO_FAB_IMG =
  'https://byqldosixshhuiuarszp.supabase.co/storage/v1/object/public/landingpage/app/ferramentas-tecnico-fab-v4.jpg';
import { SEGMENT_NAV_LINKS } from '@/pages/segmentos/segmentsData';
import { getSegment } from '@/utils/companySegments';
import LanguageSelector from '@/components/i18n/LanguageSelector';
import { useLocale } from '@/lib/i18n';
import { resolveSlug } from '@/lib/i18n';
import { localizeInternal } from '@/lib/i18n/localizeInternal';
import WhatsAppCtaLink from '@/components/landing/WhatsAppCtaLink';
import MarketingThemeToggle from '@/components/landing/MarketingThemeToggle';
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon';
import DominexBrandLogo from '@/components/landing/DominexBrandLogo';

type MenuIcon = ComponentType<{ className?: string }>;

/**
 * Mapa slug-da-landing → valor de segmento em `companySegments` (fonte única das
 * cores saturadas, a mesma que o SegmentBadge usa). Mantém os quadradinhos e o
 * hover de cada segmento na sua cor de marca, sem duplicar hex aqui.
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

/**
 * Cor SATURADA PURA do segmento. O quadrado do ícone usa exatamente
 * `seg.color` de companySegments e o ícone permanece branco em todos os
 * estados, conforme a linguagem visual definida para os cards de segmento.
 */
function segmentAccent(slug: string): { bg: string } {
  const value = SEGMENT_VALUE_BY_SLUG[slug];
  const bg = (value && getSegment(value)?.color) || '#06b6d4';
  return { bg };
}

/**
 * Mega menu de Soluções — uma página por módulo (slugs canônicos definidos com
 * o Tech Lead; as páginas entram no mesmo push). Tagline curta, foco no
 * benefício, PT-BR.
 *
 * REGRA DE ÍCONE (régua CEO): cada módulo usa o MESMO ícone Lucide que a função
 * tem DENTRO do sistema autenticado (sidebar SidebarMenuContent.tsx / abas das
 * telas), pra dar continuidade visual entre a vitrine e o produto:
 *   - OS, Agenda e Rastreio → ClipboardList  (sidebar "Ordens de Serviço")
 *   - PMOC                  → ClipboardCheck (aba "Histórico PMOC" do contrato)
 *   - CRM                   → TrendingUp     (sidebar "CRM")
 *   - Financeiro            → DollarSign     (sidebar grupo "Financeiro")
 *   - Funcionários (RH)     → Clock          (Funcionários → "Controle de Ponto")
 *   - NFS-e                 → Receipt        (sidebar "Notas Fiscais")
 *   - Portal do Cliente     → UserCircle     (sem item no sidebar; ícone canônico do módulo)
 *   - Estoque               → Package        (sidebar "Estoque")
 *   - Orçamentos & Contratos→ FileText       (sidebar "Orçamentos")
 *   - Área do Técnico™      → IMAGEM REDONDA do FAB da OS (não é ícone Lucide)
 *
 * O ícone fica SOLTO na cor verde da marca (sem quadradinho de fundo).
 */
interface SolutionLink {
  label: string;
  slug: string;
  /** Ícone Lucide do módulo (omitido quando o item usa imagem própria). */
  icon?: MenuIcon;
  /** Imagem redonda (só Área do Técnico™ — a mesma do FAB da OS). */
  image?: string;
  tagline: string;
}

const SOLUTION_LINKS: SolutionLink[] = [
  {
    label: 'OS Digital, Agenda e Rastreamento',
    slug: '/os-digital',
    icon: ClipboardList,
    tagline: 'OS no app, agenda organizada e equipe no mapa ao vivo.',
  },
  {
    label: 'PMOC',
    slug: '/sistema-pmoc',
    icon: ClipboardCheck,
    tagline: 'Relatório PMOC automático pela Lei 13.589/2018.',
  },
  {
    label: 'CRM & Vendas',
    slug: '/sistema-crm',
    icon: TrendingUp,
    tagline: 'Funil de clientes e propostas até fechar o negócio.',
  },
  {
    label: 'Financeiro',
    slug: '/controle-financeiro',
    icon: DollarSign,
    tagline: 'Contas a pagar, a receber e fluxo de caixa no controle.',
  },
  {
    label: 'Funcionários (RH)',
    slug: '/ponto-e-folha',
    icon: Clock,
    tagline: 'Ponto da equipe, vales e folha sem planilha paralela.',
  },
  {
    label: 'Emissão de Nota Fiscal',
    slug: '/emissao-de-nota-fiscal',
    icon: Receipt,
    tagline: 'NFS-e, NF-e e NFC-e ligadas a clientes, vendas e financeiro.',
  },
  {
    label: 'Portal do Cliente',
    slug: '/portal-do-cliente',
    icon: UserCircle,
    tagline: 'Seu cliente acompanha OS, orçamentos e histórico online.',
  },
  {
    label: 'Estoque',
    slug: '/controle-de-estoque',
    icon: Package,
    tagline: 'Peças e materiais com baixa automática a cada OS.',
  },
  {
    label: 'Orçamentos',
    slug: '/sistema-de-orcamentos',
    icon: FileText,
    tagline: 'Precificação, proposta por link e conversão em OS.',
  },
  {
    label: 'Contratos',
    slug: '/gestao-de-contratos',
    icon: FileSignature,
    tagline: 'Recorrências, documentos e visitas geradas no prazo.',
  },
  {
    label: 'Área do Técnico™',
    slug: '/area-do-tecnico',
    image: AREA_TECNICO_FAB_IMG,
    tagline: 'Calculadoras, gases e catálogo de equipamentos no bolso.',
  },
  {
    label: 'WhatsApp integrado',
    slug: '/integracao-whatsapp',
    icon: WhatsAppIcon,
    tagline: 'Avisos automáticos de OS e cobranças no número da empresa.',
  },
  {
    label: 'Cobranças',
    slug: '/cobrancas-automaticas',
    icon: BadgeDollarSign,
    tagline: 'Pix, boleto, cartão e recorrência ligados ao financeiro.',
  },
  {
    label: 'PDV & Loja',
    slug: '/pdv-e-loja',
    icon: ShoppingCart,
    tagline: 'Venda, caixa, fiado e estoque na mesma operação.',
  },
];

// Taglines/labels dos mega-menus agora vivem no sistema i18n (messages.nav.*):
// aqui os arrays só definem slug/ícone/imagem/ordem; a copy exibida é resolvida
// por locale no render (pt-br idêntico ao texto anterior).

export default function LandingNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [solutionsOpen, setSolutionsOpen] = useState(false); // desktop dropdown
  const [segmentsOpen, setSegmentsOpen] = useState(false); // desktop dropdown
  const [mobileSolutionsOpen, setMobileSolutionsOpen] = useState(false); // mobile accordion
  const [mobileSegmentsOpen, setMobileSegmentsOpen] = useState(false); // mobile accordion
  const solutionsRef = useRef<HTMLDivElement>(null);
  const segmentsRef = useRef<HTMLDivElement>(null);
  const solutionsCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const location = useLocation();
  const { locale, stripLocale, messages } = useLocale();
  const m = messages.nav;
  // Label e tagline exibidos vêm das mensagens (por slug); pt-br é idêntico ao
  // texto cravado de antes. O array define slug/ícone/imagem/ordem, não a copy.
  const moduleLabelBySlug = (slug: string) =>
    (messages.moduleLabels as Record<string, string>)[slug.replace(/^\//, '')] ?? '';
  const solutionTaglineBySlug = (slug: string) =>
    (m.solutionTaglines as Record<string, string>)[slug.replace(/^\//, '')] ?? '';
  const segmentLabelBySlug = (slug: string) =>
    (messages.segmentLabels as Record<string, string>)[slug] ?? '';
  const segmentTaglineBySlug = (slug: string) =>
    (m.segmentTaglines as Record<string, string>)[slug] ?? '';
  // Path canônico pt-br para comparações de estado ativo: remove o prefixo de
  // idioma E, se o 1º segmento for slug de segmento/módulo traduzido, resolve pra
  // key pt-br (senão o highlight quebraria quando o slug do idioma diferir).
  const canonicalPath = (() => {
    const stripped = stripLocale(location.pathname);
    const slug = stripped.replace(/^\/+/, '');
    if (slug && !slug.includes('/')) {
      const key = resolveSlug(slug, locale);
      if (key) return `/${key}`;
    }
    return stripped;
  })();
  const onHome = canonicalPath === '/';

  // CTA "Criar Conta": cor do segmento na respectiva landing, verde da marca no
  // resto. Usamos canonicalPath (sem prefixo de locale) para bater com as chaves
  // de SEGMENTS (ex: 'sistema-para-refrigeracao'). Calculamos o texto legível
  // por cima — branco na maioria, escuro só nos acentos claros.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 25);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Trava o scroll do body enquanto o menu mobile full-screen está aberto.
  // Reverte no fechar/desmontar. Fecha também com Escape.
  useEffect(() => {
    if (!mobileOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [mobileOpen]);

  // Close desktop dropdowns on outside click / Escape (cobre os dois mega menus).
  useEffect(() => {
    if (!segmentsOpen && !solutionsOpen) return;
    const onClick = (e: MouseEvent) => {
      const node = e.target as Node;
      if (segmentsRef.current && !segmentsRef.current.contains(node)) {
        setSegmentsOpen(false);
      }
      if (solutionsRef.current && !solutionsRef.current.contains(node)) {
        setSolutionsOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSegmentsOpen(false);
        setSolutionsOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [segmentsOpen, solutionsOpen]);

  // Hover open/close com pequeno delay (não fecha ao atravessar o gap).
  // Abrir um mega menu fecha o outro pra nunca empilharem.
  const openOnHover = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setSolutionsOpen(false);
    setSegmentsOpen(true);
  };
  const closeOnHover = () => {
    closeTimer.current = setTimeout(() => setSegmentsOpen(false), 120);
  };
  const openSolutionsOnHover = () => {
    if (solutionsCloseTimer.current) clearTimeout(solutionsCloseTimer.current);
    setSegmentsOpen(false);
    setSolutionsOpen(true);
  };
  const closeSolutionsOnHover = () => {
    solutionsCloseTimer.current = setTimeout(() => setSolutionsOpen(false), 120);
  };

  return (
    <nav
      className="fixed left-0 right-0 top-0 z-50 min-h-16"
    >
      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-0 -z-10 border-b border-[#dce1dc] bg-white/90 shadow-[0_8px_30px_rgba(16,21,18,0.07)] backdrop-blur-xl transition-transform duration-500 ease-out dark:border-white/10 dark:bg-[#0d0e11]/90',
          scrolled ? 'translate-y-0' : '-translate-y-full',
        )}
      />
      <div className="relative mx-auto w-full px-4 sm:px-6 md:px-6 xl:w-[calc(100%-360px)] xl:max-w-[1440px] xl:px-0">
        <div className="relative flex h-16 items-center justify-between md:grid md:grid-cols-[1fr_auto_1fr] md:gap-12">
          {/* Header mobile: [☰ esquerda] [logo centro] [idioma direita]. Os dois
              elementos das pontas são `md:hidden` e ABSOLUTOS nas bordas — assim
              não empurram o logo (que segue centralizado via max-md:absolute) e
              não interferem no cluster desktop (hidden md:flex). left-0/right-0
              alinham nas bordas do container, que já carrega o px do wrapper. */}
          {/* Hambúrguer mobile — só ícone, à esquerda. Abre o overlay do menu.
              Branco pra ficar legível sobre o hero escuro antes do scroll. */}
          <button
            type="button"
            aria-label={m.openMenuAria}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(true)}
            className="md:hidden absolute left-0 inline-flex h-10 w-10 items-center justify-center text-[#101512] dark:text-white"
          >
            <Menu className="h-6 w-6" />
          </button>

          {/* Logo — esquerda no desktop, centralizado no mobile (absolute + flex). */}
          <Link
            to={localizeInternal('/', locale)}
            className="flex items-center gap-2 max-md:absolute max-md:left-1/2 max-md:-translate-x-1/2"
          >
            <DominexBrandLogo className="w-[118px] md:w-[138px]" />
          </Link>

          {/* Seletor de idioma mobile — mesmo visual do desktop (variante compact:
              bandeira edge-to-edge + código + chevron), à direita. flex + h-16
              centraliza o pill (h-30px) verticalmente no header. */}
          <div className="md:hidden absolute right-0 flex h-16 items-center gap-1.5">
            <MarketingThemeToggle variant="compact" />
            <LanguageSelector surface="light" variant="compact" />
          </div>

          {/* Desktop links */}
          <div className="hidden items-center gap-7 md:flex md:justify-self-center">
            {/* Soluções — dropdown (hover no desktop, focável/clicável p/ teclado) */}
            <div
              ref={solutionsRef}
              className="relative"
              onMouseEnter={openSolutionsOnHover}
              onMouseLeave={closeSolutionsOnHover}
            >
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={solutionsOpen}
                // O foco já abre o menu. Alternar aqui fazia o mesmo clique
                // abrir no `focus` e fechar no `click`, sobretudo por teclado.
                onClick={() => setSolutionsOpen(true)}
                onFocus={openSolutionsOnHover}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setSolutionsOpen(true);
                  }
                }}
                className={cn(
                  'relative flex items-center gap-1 text-sm transition-colors py-1',
                  solutionsOpen ? 'text-[#101512] font-medium dark:text-white' : 'text-[#5f6862] hover:text-[#101512] dark:text-white/60 dark:hover:text-white'
                )}
              >
                {m.solutions}
                <ChevronDown
                  className={cn('h-4 w-4 transition-transform', solutionsOpen && 'rotate-180')}
                />
              </button>

              {/* Mega menu — grid de 3 colunas. SEM quadradinho atrás do ícone:
                  o ícone fica SOLTO no verde da marca (texto-primary). No hover o
                  card satura em primary e o ícone vira branco pra contraste.
                  Área do Técnico™ usa a imagem REDONDA do FAB da OS. */}
              {solutionsOpen && (
                <div
                  role="menu"
                  aria-label={m.solutionsMenuAria}
                  className="absolute left-1/2 top-full z-50 mt-3 w-[min(92vw,860px)] -translate-x-1/2 rounded-2xl border border-[#dce1dc] bg-white p-4 shadow-2xl dark:border-white/10 dark:bg-[#101311]"
                >
                  <p className="px-2 pb-3 text-xs font-semibold uppercase tracking-wider text-[#707973]">
                    {m.solutionsMenuHeader}
                  </p>
                  <div className="grid grid-cols-3 gap-1">
                    {SOLUTION_LINKS.map((sol) => {
                      const Icon = sol.icon;
                      const isCurrent = canonicalPath === sol.slug;
                      return (
                        <Link
                          key={sol.slug}
                          to={localizeInternal(sol.slug, locale)}
                          role="menuitem"
                          onClick={() => setSolutionsOpen(false)}
                          className={cn(
                            'group flex items-start gap-3 rounded-xl p-3 transition-colors duration-200',
                            // Verde FIXO da marca (#00C597): este menu NÃO pode
                            // depender de --primary (sobrescrito pelo white-label
                            // do tenant logado / accent de página de segmento).
                            'hover:bg-[#00C597] focus-visible:bg-[#00C597] focus-visible:outline-none',
                            isCurrent && 'bg-[#00C597]'
                          )}
                        >
                          {sol.image ? (
                            <img
                              src={sol.image}
                              alt=""
                              aria-hidden="true"
                              loading="lazy"
                              className="h-9 w-9 shrink-0 rounded-full object-cover"
                            />
                          ) : (
                            <span className={cn(
                              'inline-flex h-9 w-9 shrink-0 items-center justify-center text-[#00C597] transition-colors duration-200 group-hover:text-white group-focus-visible:text-white',
                              isCurrent && 'text-white',
                            )}>
                              {Icon && <Icon className="h-[20px] w-[20px]" />}
                            </span>
                          )}
                          <span className="min-w-0">
                            <span
                              className={cn(
                                'block text-sm font-medium leading-tight transition-colors duration-200',
                                isCurrent ? 'text-white' : 'text-[#28302b] dark:text-white/85',
                                'group-hover:text-white group-focus-visible:text-white'
                              )}
                            >
                              {moduleLabelBySlug(sol.slug)}
                            </span>
                            <span className={cn(
                              'mt-0.5 block text-xs leading-snug text-[#6c756f] transition-colors duration-200 group-hover:text-white/90 group-focus-visible:text-white/90 dark:text-white/50',
                              isCurrent && 'text-white/70 dark:text-white/70',
                            )}>
                              {solutionTaglineBySlug(sol.slug)}
                            </span>
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Segmentos — dropdown (hover no desktop, focável/clicável p/ teclado) */}
            <div
              ref={segmentsRef}
              className="relative"
              onMouseEnter={openOnHover}
              onMouseLeave={closeOnHover}
            >
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={segmentsOpen}
                onClick={() => setSegmentsOpen((o) => !o)}
                onFocus={openOnHover}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setSegmentsOpen(true);
                  }
                }}
                className={cn(
                  'relative flex items-center gap-1 text-sm transition-colors py-1',
                  segmentsOpen ? 'text-[#101512] font-medium dark:text-white' : 'text-[#5f6862] hover:text-[#101512] dark:text-white/60 dark:hover:text-white'
                )}
              >
                {m.segments}
                <ChevronDown
                  className={cn('h-4 w-4 transition-transform', segmentsOpen && 'rotate-180')}
                />
              </button>

              {/* Mega menu — painel sólido, grid de 3 colunas; quadradinho saturado
                  na cor do segmento + ícone branco; hover satura o card inteiro. */}
              {segmentsOpen && (
                <div
                  role="menu"
                  aria-label={m.segmentsMenuAria}
                  className="absolute left-1/2 top-full z-50 mt-3 w-[min(92vw,860px)] -translate-x-1/2 rounded-2xl border border-[#dce1dc] bg-white p-4 shadow-2xl dark:border-white/10 dark:bg-[#101311]"
                >
                  <p className="px-2 pb-3 text-xs font-semibold uppercase tracking-wider text-[#707973]">
                    {m.segmentsMenuHeader}
                  </p>
                  <div className="grid grid-cols-3 gap-1">
                    {SEGMENT_NAV_LINKS.map((seg) => {
                      const Icon = seg.icon;
                      const path = `/${seg.slug}`;
                      const isCurrent = canonicalPath === path;
                      const tagline = segmentTaglineBySlug(seg.slug);
                      const accent = segmentAccent(seg.slug);
                      return (
                        <Link
                          key={seg.slug}
                          to={localizeInternal(path, locale)}
                          role="menuitem"
                          onClick={() => setSegmentsOpen(false)}
                          style={{
                            ['--seg-accent' as string]: accent.bg,
                          }}
                          className={cn(
                            'group flex items-start gap-3 rounded-xl p-3 transition-colors duration-200',
                            // Hover/foco: card satura na COR PURA do segmento.
                            'hover:bg-[var(--seg-accent)] focus-visible:bg-[var(--seg-accent)] focus-visible:outline-none',
                            isCurrent && 'bg-[var(--seg-accent)]'
                          )}
                        >
                          {/* Normal: quadradinho na cor pura, ícone branco.
                              Hover/foco: quadradinho some (transparente) → ícone solto
                              direto sobre o card saturado. */}
                          <span
                            className={cn(
                              'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--seg-accent)] text-white transition-colors duration-200 group-hover:bg-transparent group-focus-visible:bg-transparent',
                              isCurrent && 'bg-transparent text-white',
                            )}
                          >
                            <Icon className="h-[18px] w-[18px]" />
                          </span>
                          <span className="min-w-0">
                            <span
                              className={cn(
                                'block text-sm font-medium leading-tight transition-colors duration-200',
                                isCurrent ? 'text-white' : 'text-[#28302b] dark:text-white/85',
                                'group-hover:text-white group-focus-visible:text-white'
                              )}
                            >
                              {segmentLabelBySlug(seg.slug)}
                            </span>
                            {tagline && (
                              <span className={cn(
                                'mt-0.5 block text-xs leading-snug transition-colors duration-200 group-hover:text-white/90 group-focus-visible:text-white/90',
                                isCurrent ? 'text-white/90' : 'text-[#6c756f] dark:text-white/50',
                              )}>
                                {tagline}
                              </span>
                            )}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Blog — rota própria (/blog), não é âncora: usa Link (SPA, sem reload). */}
            <Link
              to={localizeInternal('/blog', locale)}
              className={cn(
                'relative text-sm transition-colors py-1',
                canonicalPath.startsWith('/blog')
                  ? 'text-[#101512] font-medium dark:text-white'
                  : 'text-[#5f6862] hover:text-[#101512] dark:text-white/60 dark:hover:text-white'
              )}
            >
              Blog
              <span
                className={cn(
                  'absolute left-0 right-0 -bottom-1 h-[2px] rounded-full bg-primary transition-all duration-300',
                  canonicalPath.startsWith('/blog') ? 'opacity-100 scale-x-100' : 'opacity-0 scale-x-0'
                )}
              />
            </Link>
          </div>

          {/* Desktop CTA */}
          {/* mr-24 no md+ reserva o canto superior direito p/ o seletor de idioma
              (variant="corner", fixed no canto) não sobrepor o CTA "Criar Conta". */}
          <div className="hidden items-center gap-2 md:mr-40 md:flex md:justify-self-end xl:mr-0">
            <Button variant="ghost" className="rounded-full text-[#344038] hover:bg-transparent hover:text-black dark:text-white/75 dark:hover:bg-transparent dark:hover:text-white gap-2" asChild>
              <Link to={localizeInternal('/login', locale)}>
                <LogIn className="h-4 w-4" />
                {m.login}
              </Link>
            </Button>
            {/* Criar Conta — verde da marca na home/módulos; cor do segmento na
                landing daquele segmento. Texto via resolveWcagForeground (contraste WCAG). */}
            <Button
              className="gap-2 rounded-full border border-[#101512] bg-[#101512] px-5 text-white shadow-none transition-all hover:-translate-y-0.5 hover:bg-black hover:text-white dark:border-[#00C597] dark:bg-[#00C597] dark:text-white dark:hover:bg-[#00ad85] dark:hover:text-white"
              asChild
            >
              <WhatsAppCtaLink>
                {m.signup}
                <ArrowRight className="ml-0 h-4 w-4 shrink-0" />
              </WhatsAppCtaLink>
            </Button>
          </div>

        </div>
      </div>

      {/* Rodapé sticky mobile — aparece ao rolar (scrolled) e some quando o
          overlay do menu está aberto. SÓ o CTA de conversão, full-width e fino
          (o menu agora abre pelo hambúrguer do header). z-40: abaixo do overlay
          (z-50) e acima do conteúdo. Respeita a safe-area inferior do iPhone.
          PORTAL p/ document.body: o <nav> tem `backdrop-blur` (backdrop-filter),
          que cria um containing block — um `fixed bottom-0` descendente do nav
          ancoraria no topo do nav, não no rodapé da viewport. O portal escapa
          disso e fixa de verdade no rodapé da tela. */}
      {scrolled &&
        !mobileOpen &&
        createPortal(
          <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-[#dce1dc] bg-white/95 backdrop-blur-xl px-4 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] dark:border-white/10 dark:bg-[#090c0a]/95">
            <WhatsAppCtaLink
              className="inline-flex w-full items-center justify-center gap-2 whitespace-normal rounded-xl bg-[#101512] px-5 py-2.5 text-center text-sm font-semibold leading-tight text-white transition-colors hover:bg-black dark:bg-[#00C597] dark:text-white dark:hover:bg-[#00ad85]"
            >
              {m.trialSticky}
              <ArrowRight className="h-4 w-4 shrink-0" />
            </WhatsAppCtaLink>
          </div>,
          document.body
        )}

      {/* Mobile menu — overlay full-screen (100vw x 100dvh), fundo sólido.
          Também via PORTAL: mesmo motivo do rodapé sticky (o backdrop-filter do
          nav vira containing block dos `fixed` filhos). */}
      {mobileOpen &&
        createPortal(
        <div
          className="md:hidden fixed inset-0 z-50 flex flex-col bg-[#f8faf7] animate-in fade-in slide-in-from-top-2 duration-200 dark:bg-[#090c0a]"
          style={{ height: '100dvh', width: '100vw' }}
        >
          {/* Header do overlay — apenas o X de fechar, à direita (sem logo, sem
              borda). O logo agora aparece centralizado acima das opções. */}
          <div className="flex h-16 shrink-0 items-center justify-end px-4">
            <button
              type="button"
              className="text-[#101512] dark:text-white"
              aria-label={m.closeMenuAria}
              onClick={() => setMobileOpen(false)}
            >
              <X className="h-7 w-7" />
            </button>
          </div>

          {/* Conteúdo rolável — centralizado verticalmente quando cabe (my-auto),
              mas rola sem cortar o topo quando os grupos expandem. */}
          <div className="flex flex-1 flex-col overflow-y-auto px-4 py-6">
          <div className="my-auto w-full">
          {/* Logo Dominex centralizado acima das opções. width/height intrínsecos
              + onError: se um Service Worker antigo tiver precacheado um hash de
              logo defasado e o asset 404, o navegador não mostra o ícone de
              imagem quebrada. */}
          <div className="mb-6 flex justify-center">
            <Link to={localizeInternal('/', locale)} onClick={() => setMobileOpen(false)}>
              <DominexBrandLogo className="w-[196px]" />
            </Link>
          </div>
          {/* Soluções — grupo expansível no mobile */}
          <button
            type="button"
            aria-expanded={mobileSolutionsOpen}
            onClick={() => setMobileSolutionsOpen((o) => !o)}
            className="flex w-full items-center justify-between py-3 text-sm text-[#4f5953] border-b border-[#dde2dd] transition-colors hover:text-[#101512]"
          >
            <span>{m.solutions}</span>
            <ChevronDown
              className={cn('h-4 w-4 transition-transform', mobileSolutionsOpen && 'rotate-180')}
            />
          </button>
          {mobileSolutionsOpen && (
            <div className="border-b border-white/5 py-1">
              {SOLUTION_LINKS.map((sol) => {
                const Icon = sol.icon;
                return (
                  <Link
                    key={sol.slug}
                    to={localizeInternal(sol.slug, locale)}
                    onClick={() => {
                      setMobileOpen(false);
                      setMobileSolutionsOpen(false);
                    }}
                    className="flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm text-[#59635d] transition-colors hover:bg-[#edf1ed] hover:text-[#101512]"
                  >
                    {sol.image ? (
                      <img
                        src={sol.image}
                        alt=""
                        aria-hidden="true"
                        loading="lazy"
                        className="h-7 w-7 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center text-[#00C597]">
                        {Icon && <Icon className="h-[18px] w-[18px]" />}
                      </span>
                    )}
                    {moduleLabelBySlug(sol.slug)}
                  </Link>
                );
              })}
            </div>
          )}

          {/* Segmentos — grupo expansível no mobile */}
          <button
            type="button"
            aria-expanded={mobileSegmentsOpen}
            onClick={() => setMobileSegmentsOpen((o) => !o)}
            className="flex w-full items-center justify-between py-3 text-sm text-[#4f5953] border-b border-[#dde2dd] transition-colors hover:text-[#101512]"
          >
            <span>{m.segments}</span>
            <ChevronDown
              className={cn('h-4 w-4 transition-transform', mobileSegmentsOpen && 'rotate-180')}
            />
          </button>
          {mobileSegmentsOpen && (
            <div className="border-b border-white/5 py-1">
              {SEGMENT_NAV_LINKS.map((seg) => {
                const Icon = seg.icon;
                const path = `/${seg.slug}`;
                const accent = segmentAccent(seg.slug);
                return (
                  <Link
                    key={seg.slug}
                    to={localizeInternal(path, locale)}
                    onClick={() => {
                      setMobileOpen(false);
                      setMobileSegmentsOpen(false);
                    }}
                    className="flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm text-[#59635d] transition-colors hover:bg-[#edf1ed] hover:text-[#101512]"
                  >
                    <span
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
                      style={{ backgroundColor: accent.bg, color: '#ffffff' }}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    {segmentLabelBySlug(seg.slug)}
                  </Link>
                );
              })}
            </div>
          )}

          {/* Blog — rota própria (/blog), Link SPA (não recarrega). */}
          <Link
            to={localizeInternal('/blog', locale)}
            onClick={() => setMobileOpen(false)}
            className={cn(
              'block py-3 text-sm border-b border-white/5 transition-colors',
              canonicalPath.startsWith('/blog')
                ? 'text-[#101512] font-medium border-l-2 border-l-primary pl-3'
                : 'text-[#4f5953] hover:text-[#101512]'
            )}
          >
            Blog
          </Link>

          {/* Seletor de idioma agora vive no header (variante compact), à direita:
              fora do overlay pra não empilhar controles no menu. */}
          <div className="mt-4 flex flex-col gap-3">
            <Button variant="ghost" className="w-full text-[#202722] border border-[#cfd5d0] hover:bg-[#eef2ee] hover:text-[#101512] gap-2" asChild>
              <Link to={localizeInternal('/login', locale)}>
                <LogIn className="h-4 w-4" />
                {m.login}
              </Link>
            </Button>
            <Button
              className="w-full gap-2 rounded-full bg-[#101512] text-white transition-colors hover:bg-black hover:text-white dark:bg-[#00C597] dark:text-white dark:hover:bg-[#00ad85] dark:hover:text-white"
              asChild
            >
              <WhatsAppCtaLink>
                {m.signup}
                <ArrowRight className="h-4 w-4 shrink-0" />
              </WhatsAppCtaLink>
            </Button>
          </div>
          </div>
          </div>
        </div>,
          document.body
        )}
      {/* Seletor de idioma fixo no canto superior direito extremo — via portal
          (fora do backdrop-blur do nav, que criaria containing block e quebraria
          position:fixed de filhos). Só visível no desktop (hidden no mobile). */}
      <MarketingThemeToggle />
      <LanguageSelector surface="light" variant="corner" />
    </nav>
  );
}
