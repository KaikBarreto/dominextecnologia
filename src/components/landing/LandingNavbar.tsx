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
  Receipt,
  UserCircle,
  Package,
  Map,
  type LucideProps,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { idealForeground } from '@/lib/colorContrast';

/** Verde da marca Dominex (#00C597) — fallback do CTA fora de páginas de segmento. */
const BRAND_GREEN = '#00C597';

/**
 * Imagem REDONDA da Área do Técnico™ — a MESMA do botão flutuante (FAB) do
 * preenchimento da OS (SpeedDialFAB em TechnicianOS). É um asset remoto no
 * Storage; aqui só referenciamos a mesma URL pra manter a identidade.
 */
const AREA_TECNICO_FAB_IMG =
  'https://byqldosixshhuiuarszp.supabase.co/storage/v1/object/public/landingpage/app/ferramentas-tecnico-fab-v4.jpg';
import logoWhite from '@/assets/logo-horizontal-verde.png';
import { SEGMENT_NAV_LINKS, SEGMENTS } from '@/pages/segmentos/segmentsData';
import { getSegment } from '@/utils/companySegments';
import LanguageSelector from '@/components/i18n/LanguageSelector';
import { useLocale } from '@/lib/i18n';
import { resolveSlug } from '@/lib/i18n';
import { localizeInternal } from '@/lib/i18n/localizeInternal';
import { localizeHash, type AnchorKey } from '@/lib/i18n/localizeHash';

/** Chaves canônicas das âncoras do nav. Hash + label localizados no render. */
const NAV_ANCHOR_KEYS: { key: AnchorKey }[] = [
  { key: 'precos' },
];

type MenuIcon = ComponentType<LucideProps>;

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
 * Cor SATURADA PURA do segmento + cor de texto/ícone que fica legível por cima
 * dela. A cor nunca é escurecida: o quadradinho do ícone e o card em hover usam
 * exatamente `seg.color` de companySegments (régua CEO: o usuário tem que ver a
 * cor saturada de verdade). O contraste é resolvido pela COR DO TEXTO, não pela
 * cor de fundo: `idealForeground` devolve branco na maioria e slate-escuro só
 * nos tons claros/quentes (amarelo solar #eab308, âmbar elétrica #f59e0b), os
 * únicos onde o branco ficaria ilegível. Os demais (inclusive construção e
 * dedetização) ganham texto branco direto sobre a cor pura.
 */
function segmentAccent(slug: string): { bg: string; fg: string } {
  const value = SEGMENT_VALUE_BY_SLUG[slug];
  const bg = (value && getSegment(value)?.color) || '#06b6d4';
  return { bg, fg: idealForeground(bg) };
}

/**
 * Mega menu de Soluções — uma página por módulo (slugs canônicos definidos com
 * o Tech Lead; as páginas entram no mesmo push). Tagline curta, foco no
 * benefício, PT-BR.
 *
 * REGRA DE ÍCONE (régua CEO): cada módulo usa o MESMO ícone Lucide que a função
 * tem DENTRO do sistema autenticado (sidebar SidebarMenuContent.tsx / abas das
 * telas), pra dar continuidade visual entre a vitrine e o produto:
 *   - Ordem de Serviço      → ClipboardList  (sidebar "Ordens de Serviço")
 *   - PMOC                  → ClipboardCheck (aba "Histórico PMOC" do contrato)
 *   - CRM                   → TrendingUp     (sidebar "CRM")
 *   - Financeiro            → DollarSign     (sidebar grupo "Financeiro")
 *   - Ponto & Folha         → Clock          (Funcionários → "Controle de Ponto")
 *   - NFS-e                 → Receipt        (sidebar "Notas Fiscais")
 *   - Portal do Cliente     → UserCircle     (sem item no sidebar; ícone canônico do módulo)
 *   - Estoque               → Package        (sidebar "Estoque")
 *   - Orçamentos & Contratos→ FileText       (sidebar "Orçamentos")
 *   - Rastreamento & Agenda → Map            (sidebar "Mapa e Rastreamento")
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
    label: 'Ordem de Serviço Digital',
    slug: '/os-digital',
    icon: ClipboardList,
    tagline: 'OS no app, com foto, checklist e assinatura do cliente.',
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
    label: 'Ponto & Folha (RH)',
    slug: '/ponto-e-folha',
    icon: Clock,
    tagline: 'Ponto da equipe, vales e folha sem planilha paralela.',
  },
  {
    label: 'NFS-e',
    slug: '/emissao-de-nfse',
    icon: Receipt,
    tagline: 'Emita a nota fiscal de serviço direto pela plataforma.',
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
    label: 'Orçamentos & Contratos',
    slug: '/orcamentos-e-contratos',
    icon: FileText,
    tagline: 'Orçamento aprovado por link vira contrato e OS recorrente.',
  },
  {
    label: 'Rastreamento & Agenda',
    slug: '/rastreamento-de-equipes',
    icon: Map,
    tagline: 'Equipe no mapa ao vivo e rota do dia organizada.',
  },
  {
    label: 'Área do Técnico™',
    slug: '/area-do-tecnico',
    image: AREA_TECNICO_FAB_IMG,
    tagline: 'Calculadoras, gases e catálogo de equipamentos no bolso.',
  },
];

// Taglines/labels dos mega-menus agora vivem no sistema i18n (messages.nav.*):
// aqui os arrays só definem slug/ícone/imagem/ordem; a copy exibida é resolvida
// por locale no render (pt-br idêntico ao texto anterior).

export default function LandingNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeId, setActiveId] = useState<string>('');
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

  // navLinks localizados: id e href usam o hash traduzido pro locale atual.
  // O label do primeiro item (Plataforma) sai das mensagens.
  const anchorLabel = (key: AnchorKey) => (key === 'recursos' ? m.platform : m.pricing);
  const navLinks = NAV_ANCHOR_KEYS.map((item) => {
    const hash = localizeHash(item.key, locale);
    return { label: anchorLabel(item.key), key: item.key, id: hash, href: `#${hash}` };
  });
  // Hash localizados das âncoras principais — usados nos comparadores de activeId.
  const hashPrecos   = localizeHash('precos', locale);

  // CTA "Criar Conta": cor do segmento na respectiva landing, verde da marca no
  // resto. Usamos canonicalPath (sem prefixo de locale) para bater com as chaves
  // de SEGMENTS (ex: 'sistema-para-refrigeracao'). Calculamos o texto legível
  // por cima — branco na maioria, escuro só nos acentos claros.
  const ctaSegment = SEGMENTS[canonicalPath.replace(/^\//, '')];
  const ctaBg = ctaSegment?.accentColor ?? BRAND_GREEN;
  const ctaFg = idealForeground(ctaBg);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 25);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Track active section (only meaningful on the home page).
  useEffect(() => {
    if (!onHome) {
      setActiveId('');
      return;
    }
    // Mede a posição das seções e atualiza a aba ativa. As leituras de geometria
    // (getBoundingClientRect) rodam dentro de um requestAnimationFrame e nunca
    // depois de uma escrita no DOM no mesmo frame — evita o forced reflow (layout
    // thrashing) que o trace acusou no scroll da home.
    let raf = 0;
    const compute = () => {
      const offset = window.innerHeight * 0.4;
      let current = '';
      for (const link of navLinks) {
        const el = document.getElementById(link.id);
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        if (top - offset <= 0) {
          current = link.id;
        } else {
          break;
        }
      }
      setActiveId(current);
    };
    const updateActive = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(compute);
    };

    compute();
    window.addEventListener('scroll', updateActive, { passive: true });
    window.addEventListener('resize', updateActive, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', updateActive);
      window.removeEventListener('resize', updateActive);
    };
  }, [onHome]);

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

  // Âncoras (ex: #recursos…) só rolam na home. Em outra rota, manda pra /<locale>/#id.
  // anchorTo recebe a chave canônica da âncora e devolve o href localizado.
  const anchorTo = (key: AnchorKey) => {
    const hash = `#${localizeHash(key, locale)}`;
    return onHome ? hash : localizeInternal('/', locale) + hash;
  };

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? 'bg-[hsl(0,0%,5%)]/90 backdrop-blur-xl border-b border-white/5' : 'bg-transparent'
      }`}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="relative flex h-16 items-center justify-between">
          {/* Logo — esquerda no desktop, centralizado no mobile (absolute + flex). */}
          <Link
            to={localizeInternal('/', locale)}
            className="flex items-center gap-2 max-md:absolute max-md:left-1/2 max-md:-translate-x-1/2"
          >
            <img src={logoWhite} alt="Dominex" className="h-10 w-auto" />
          </Link>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-8">
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
                onClick={() => setSolutionsOpen((o) => !o)}
                onFocus={openSolutionsOnHover}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setSolutionsOpen(true);
                  }
                }}
                className={cn(
                  'relative flex items-center gap-1 text-sm transition-colors py-1',
                  solutionsOpen ? 'text-white font-medium' : 'text-white/60 hover:text-white'
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
                  className="absolute left-1/2 top-full z-50 mt-3 w-[min(92vw,860px)] -translate-x-1/2 rounded-2xl border border-white/10 bg-[hsl(0,0%,8%)] p-4 shadow-2xl"
                >
                  <p className="px-2 pb-3 text-xs font-semibold uppercase tracking-wider text-white/55">
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
                            isCurrent && 'bg-[#00C597]/10'
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
                            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center text-[#00C597] transition-colors duration-200 group-hover:text-white group-focus-visible:text-white">
                              {Icon && <Icon className="h-[20px] w-[20px]" />}
                            </span>
                          )}
                          <span className="min-w-0">
                            <span
                              className={cn(
                                'block text-sm font-medium leading-tight transition-colors duration-200',
                                isCurrent ? 'text-white' : 'text-white/85',
                                'group-hover:text-white group-focus-visible:text-white'
                              )}
                            >
                              {moduleLabelBySlug(sol.slug)}
                            </span>
                            <span className="mt-0.5 block text-xs leading-snug text-white/45 transition-colors duration-200 group-hover:text-white/90 group-focus-visible:text-white/90">
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
                  segmentsOpen ? 'text-white font-medium' : 'text-white/60 hover:text-white'
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
                  className="absolute left-1/2 top-full z-50 mt-3 w-[min(92vw,860px)] -translate-x-1/2 rounded-2xl border border-white/10 bg-[hsl(0,0%,8%)] p-4 shadow-2xl"
                >
                  <p className="px-2 pb-3 text-xs font-semibold uppercase tracking-wider text-white/55">
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
                            ['--seg-fg' as string]: accent.fg,
                          }}
                          className={cn(
                            'group flex items-start gap-3 rounded-xl p-3 transition-colors duration-200',
                            // Hover/foco: card satura na COR PURA do segmento.
                            'hover:bg-[var(--seg-accent)] focus-visible:bg-[var(--seg-accent)] focus-visible:outline-none',
                            isCurrent && 'bg-white/5'
                          )}
                        >
                          {/* Normal: quadradinho na cor pura, ícone na cor de contraste.
                              Hover/foco: quadradinho some (transparente) → ícone solto
                              direto sobre o card saturado. */}
                          <span
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors duration-200 bg-[var(--seg-accent)] text-[var(--seg-fg)] group-hover:bg-transparent group-focus-visible:bg-transparent group-hover:text-[var(--seg-fg)] group-focus-visible:text-[var(--seg-fg)]"
                          >
                            <Icon className="h-[18px] w-[18px]" />
                          </span>
                          <span className="min-w-0">
                            <span
                              className={cn(
                                'block text-sm font-medium leading-tight transition-colors duration-200',
                                isCurrent ? 'text-white' : 'text-white/85',
                                'group-hover:text-[var(--seg-fg)] group-focus-visible:text-[var(--seg-fg)]'
                              )}
                            >
                              {segmentLabelBySlug(seg.slug)}
                            </span>
                            {tagline && (
                              <span className="mt-0.5 block text-xs leading-snug text-white/45 transition-colors duration-200 group-hover:text-[var(--seg-fg)] group-focus-visible:text-[var(--seg-fg)] group-hover:opacity-90 group-focus-visible:opacity-90">
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

            <a
              href={anchorTo('precos')}
              className={cn(
                'relative text-sm transition-colors py-1',
                activeId === hashPrecos ? 'text-white font-medium' : 'text-white/60 hover:text-white'
              )}
            >
              {m.pricing}
              <span
                className={cn(
                  'absolute left-0 right-0 -bottom-1 h-[2px] rounded-full bg-primary transition-all duration-300',
                  activeId === hashPrecos ? 'opacity-100 scale-x-100' : 'opacity-0 scale-x-0'
                )}
              />
            </a>

            {/* Blog — rota própria (/blog), não é âncora: usa Link (SPA, sem reload). */}
            <Link
              to={localizeInternal('/blog', locale)}
              className={cn(
                'relative text-sm transition-colors py-1',
                canonicalPath.startsWith('/blog')
                  ? 'text-white font-medium'
                  : 'text-white/60 hover:text-white'
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
          <div className="hidden md:flex items-center gap-3 md:mr-24">
            <Button variant="ghost" className="text-white border border-white/20 hover:bg-white/10 hover:text-white gap-2" asChild>
              <Link to="/login">
                <LogIn className="h-4 w-4" />
                {m.login}
              </Link>
            </Button>
            {/* Criar Conta — verde da marca na home/módulos; cor do segmento na
                landing daquele segmento. Texto via idealForeground (contraste). */}
            <Button
              className="hover:opacity-90 transition-opacity"
              style={{ backgroundColor: ctaBg, color: ctaFg }}
              asChild
            >
              <Link to="/cadastro">{m.signup}</Link>
            </Button>
          </div>

          {/* No mobile o header tem APENAS o logo centralizado — o menu agora é
              aberto pelo botão "Menu" do rodapé sticky (abaixo). */}
        </div>
      </div>

      {/* Rodapé sticky mobile — aparece ao rolar (scrolled) e some quando o
          overlay do menu está aberto. CTA grande de conversão + botão "Menu".
          z-40: abaixo do overlay (z-50) e acima do conteúdo. Respeita a
          safe-area inferior do iPhone.
          PORTAL p/ document.body: o <nav> tem `backdrop-blur` (backdrop-filter),
          que cria um containing block — um `fixed bottom-0` descendente do nav
          ancoraria no topo do nav, não no rodapé da viewport. O portal escapa
          disso e fixa de verdade no rodapé da tela. */}
      {scrolled &&
        !mobileOpen &&
        createPortal(
          <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-[hsl(0,0%,5%)]/95 backdrop-blur-xl px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <div className="flex items-center gap-3">
              <Link
                to="/cadastro?origem=Site"
                className="flex-1 inline-flex items-center justify-center rounded-xl px-5 py-3.5 text-base font-semibold hover:opacity-90 transition-opacity"
                style={{ backgroundColor: ctaBg, color: ctaFg }}
              >
                {m.trialSticky}
              </Link>
              <button
                type="button"
                aria-label={m.openMenuAria}
                aria-expanded={mobileOpen}
                onClick={() => setMobileOpen(true)}
                className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-white/15 px-4 py-3.5 text-base font-medium text-white hover:bg-white/5 transition-colors"
              >
                <Menu className="h-5 w-5" />
                {m.openMenu}
              </button>
            </div>
          </div>,
          document.body
        )}

      {/* Mobile menu — overlay full-screen (100vw x 100dvh), fundo sólido.
          Também via PORTAL: mesmo motivo do rodapé sticky (o backdrop-filter do
          nav vira containing block dos `fixed` filhos). */}
      {mobileOpen &&
        createPortal(
        <div
          className="md:hidden fixed inset-0 z-50 flex flex-col bg-[hsl(0,0%,5%)] animate-in fade-in slide-in-from-top-2 duration-200"
          style={{ height: '100dvh', width: '100vw' }}
        >
          {/* Header do overlay — apenas o X de fechar, à direita (sem logo, sem
              borda). O logo agora aparece centralizado acima das opções. */}
          <div className="flex h-16 shrink-0 items-center justify-end px-4">
            <button
              type="button"
              className="text-white"
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
              <img
                src={logoWhite}
                alt="Dominex"
                width={1601}
                height={326}
                className="h-10 w-auto"
                onError={(e) => {
                  e.currentTarget.style.visibility = 'hidden';
                }}
              />
            </Link>
          </div>
          {/* Soluções — grupo expansível no mobile */}
          <button
            type="button"
            aria-expanded={mobileSolutionsOpen}
            onClick={() => setMobileSolutionsOpen((o) => !o)}
            className="flex w-full items-center justify-between py-3 text-sm text-white/70 border-b border-white/5 transition-colors hover:text-white"
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
                    className="flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm text-white/65 transition-colors hover:bg-white/5 hover:text-white"
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
            className="flex w-full items-center justify-between py-3 text-sm text-white/70 border-b border-white/5 transition-colors hover:text-white"
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
                    className="flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm text-white/65 transition-colors hover:bg-white/5 hover:text-white"
                  >
                    <span
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
                      style={{ backgroundColor: accent.bg, color: accent.fg }}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    {segmentLabelBySlug(seg.slug)}
                  </Link>
                );
              })}
            </div>
          )}

          <a
            href={anchorTo('precos')}
            onClick={() => setMobileOpen(false)}
            className={cn(
              'block py-3 text-sm border-b border-white/5 transition-colors',
              activeId === hashPrecos ? 'text-white font-medium border-l-2 border-l-primary pl-3' : 'text-white/70 hover:text-white'
            )}
          >
            {m.pricing}
          </a>

          {/* Blog — rota própria (/blog), Link SPA (não recarrega). */}
          <Link
            to={localizeInternal('/blog', locale)}
            onClick={() => setMobileOpen(false)}
            className={cn(
              'block py-3 text-sm border-b border-white/5 transition-colors',
              canonicalPath.startsWith('/blog')
                ? 'text-white font-medium border-l-2 border-l-primary pl-3'
                : 'text-white/70 hover:text-white'
            )}
          >
            Blog
          </Link>

          <div className="mt-4 flex flex-col gap-3">
            {/* Seletor de idioma dentro do menu (mobile) — verde fixo da marca (site público). */}
            <LanguageSelector surface="dark" fullWidth />
            <Button variant="ghost" className="w-full text-white border border-white/20 hover:bg-white/10 hover:text-white gap-2" asChild>
              <Link to="/login">
                <LogIn className="h-4 w-4" />
                {m.login}
              </Link>
            </Button>
            <Button
              className="w-full hover:opacity-90 transition-opacity"
              style={{ backgroundColor: ctaBg, color: ctaFg }}
              asChild
            >
              <Link to="/cadastro">{m.signup}</Link>
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
      <LanguageSelector variant="corner" />
    </nav>
  );
}
