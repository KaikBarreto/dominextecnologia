import { useState, useEffect, useRef, type ComponentType } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Menu,
  X,
  LogIn,
  ChevronDown,
  ClipboardList,
  ShieldCheck,
  Users,
  Wallet,
  Clock,
  FileText,
  UserCircle,
  Package,
  FileSignature,
  MapPin,
  Wrench,
  type LucideProps,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { idealForeground } from '@/lib/colorContrast';
import logoWhite from '@/assets/logo-horizontal-verde.png';
import { SEGMENT_NAV_LINKS } from '@/pages/segmentos/segmentsData';
import { getSegment } from '@/utils/companySegments';

const navLinks = [
  { label: 'Plataforma', href: '#recursos', id: 'recursos' },
  { label: 'Preços', href: '#precos', id: 'precos' },
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
 * benefício, PT-BR. Quadradinho na cor de marca (primary) com ícone branco,
 * mesmo padrão dos Segmentos.
 */
interface SolutionLink {
  label: string;
  slug: string;
  icon: MenuIcon;
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
    icon: ShieldCheck,
    tagline: 'Relatório PMOC automático pela Lei 13.589/2018.',
  },
  {
    label: 'CRM & Vendas',
    slug: '/sistema-crm',
    icon: Users,
    tagline: 'Funil de clientes e propostas até fechar o negócio.',
  },
  {
    label: 'Financeiro',
    slug: '/controle-financeiro',
    icon: Wallet,
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
    icon: FileText,
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
    icon: FileSignature,
    tagline: 'Orçamento aprovado por link vira contrato e OS recorrente.',
  },
  {
    label: 'Rastreamento & Agenda',
    slug: '/rastreamento-de-equipes',
    icon: MapPin,
    tagline: 'Equipe no mapa ao vivo e rota do dia organizada.',
  },
  {
    label: 'Área do Técnico™',
    slug: '/area-do-tecnico',
    icon: Wrench,
    tagline: 'Calculadoras, gases e catálogo de equipamentos no bolso.',
  },
];

/**
 * Taglines curtas do mega menu de Segmentos (copy de Growth, foco no benefício).
 * Chaveadas pelo slug de SEGMENT_NAV_LINKS (segmentsData.ts é a fonte de
 * label+slug+ícone; aqui só a copy de vitrine). Mobile omite a tagline.
 */
const SEGMENT_TAGLINES: Record<string, string> = {
  'sistema-para-refrigeracao': 'OS, PMOC e controle de gás por equipamento.',
  'sistema-para-eletricistas': 'Laudos, ART e instalações sob controle.',
  'sistema-para-energia-solar': 'Projeto, instalação e O&M de usinas.',
  'sistema-para-provedores': 'Instalação, suporte e visita técnica de FTTH.',
  'sistema-para-cftv': 'Câmeras, alarmes e ronda com histórico.',
  'sistema-para-construcao-civil': 'Obras, equipes e medições no campo.',
  'sistema-para-elevadores': 'Manutenção preventiva e chamados em dia.',
  'sistema-para-limpeza-conservacao': 'Postos, rondas e equipes organizados.',
  'sistema-para-dedetizacao': 'Certificados, MIP e contratos recorrentes.',
};

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
  const onHome = location.pathname === '/';

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
    const updateActive = () => {
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

    updateActive();
    window.addEventListener('scroll', updateActive, { passive: true });
    window.addEventListener('resize', updateActive);
    return () => {
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

  // Âncoras (#recursos…) só rolam na home. Em outra rota, manda pra /#id.
  const anchorTo = (href: string) => (onHome ? href : `/${href}`);

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
            to="/"
            className="flex items-center gap-2 max-md:absolute max-md:left-1/2 max-md:-translate-x-1/2"
          >
            <img src={logoWhite} alt="Dominex" className="h-10 w-auto" />
          </Link>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-8">
            <a
              href={anchorTo('#recursos')}
              className={cn(
                'relative text-sm transition-colors py-1',
                activeId === 'recursos' ? 'text-white font-medium' : 'text-white/60 hover:text-white'
              )}
            >
              Plataforma
              <span
                className={cn(
                  'absolute left-0 right-0 -bottom-1 h-[2px] rounded-full bg-primary transition-all duration-300',
                  activeId === 'recursos' ? 'opacity-100 scale-x-100' : 'opacity-0 scale-x-0'
                )}
              />
            </a>
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
                Soluções
                <ChevronDown
                  className={cn('h-4 w-4 transition-transform', solutionsOpen && 'rotate-180')}
                />
              </button>

              {/* Mega menu — grid de 3 colunas, quadradinho na cor de marca + ícone branco */}
              {solutionsOpen && (
                <div
                  role="menu"
                  aria-label="Nossas soluções"
                  className="absolute left-1/2 top-full z-50 mt-3 w-[min(92vw,860px)] -translate-x-1/2 rounded-2xl border border-white/10 bg-[hsl(0,0%,8%)] p-4 shadow-2xl"
                >
                  <p className="px-2 pb-3 text-xs font-semibold uppercase tracking-wider text-white/40">
                    Tudo o que a plataforma faz
                  </p>
                  <div className="grid grid-cols-3 gap-1">
                    {SOLUTION_LINKS.map((sol) => {
                      const Icon = sol.icon;
                      const isCurrent = location.pathname === sol.slug;
                      return (
                        <Link
                          key={sol.slug}
                          to={sol.slug}
                          role="menuitem"
                          onClick={() => setSolutionsOpen(false)}
                          className={cn(
                            'group flex items-start gap-3 rounded-xl p-3 transition-colors duration-200',
                            'hover:bg-primary focus-visible:bg-primary focus-visible:outline-none',
                            isCurrent && 'bg-primary/10'
                          )}
                        >
                          <span
                            className={cn(
                              'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white transition-colors duration-200',
                              'bg-primary group-hover:bg-white/25 group-focus-visible:bg-white/25'
                            )}
                          >
                            <Icon className="h-[18px] w-[18px]" />
                          </span>
                          <span className="min-w-0">
                            <span
                              className={cn(
                                'block text-sm font-medium leading-tight transition-colors duration-200',
                                isCurrent ? 'text-white' : 'text-white/85',
                                'group-hover:text-white group-focus-visible:text-white'
                              )}
                            >
                              {sol.label}
                            </span>
                            <span className="mt-0.5 block text-xs leading-snug text-white/45 transition-colors duration-200 group-hover:text-white/90 group-focus-visible:text-white/90">
                              {sol.tagline}
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
                Segmentos
                <ChevronDown
                  className={cn('h-4 w-4 transition-transform', segmentsOpen && 'rotate-180')}
                />
              </button>

              {/* Mega menu — painel sólido, grid de 3 colunas; quadradinho saturado
                  na cor do segmento + ícone branco; hover satura o card inteiro. */}
              {segmentsOpen && (
                <div
                  role="menu"
                  aria-label="Nossos segmentos"
                  className="absolute left-1/2 top-full z-50 mt-3 w-[min(92vw,860px)] -translate-x-1/2 rounded-2xl border border-white/10 bg-[hsl(0,0%,8%)] p-4 shadow-2xl"
                >
                  <p className="px-2 pb-3 text-xs font-semibold uppercase tracking-wider text-white/40">
                    Nossos segmentos
                  </p>
                  <div className="grid grid-cols-3 gap-1">
                    {SEGMENT_NAV_LINKS.map((seg) => {
                      const Icon = seg.icon;
                      const path = `/${seg.slug}`;
                      const isCurrent = location.pathname === path;
                      const tagline = SEGMENT_TAGLINES[seg.slug];
                      const accent = segmentAccent(seg.slug);
                      return (
                        <Link
                          key={seg.slug}
                          to={path}
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
                              {seg.label}
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
              href={anchorTo('#precos')}
              className={cn(
                'relative text-sm transition-colors py-1',
                activeId === 'precos' ? 'text-white font-medium' : 'text-white/60 hover:text-white'
              )}
            >
              Preços
              <span
                className={cn(
                  'absolute left-0 right-0 -bottom-1 h-[2px] rounded-full bg-primary transition-all duration-300',
                  activeId === 'precos' ? 'opacity-100 scale-x-100' : 'opacity-0 scale-x-0'
                )}
              />
            </a>
          </div>

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center gap-3">
            <Button variant="ghost" className="text-white border border-white/20 hover:bg-white/10 hover:text-white gap-2" asChild>
              <Link to="/login">
                <LogIn className="h-4 w-4" />
                Entrar
              </Link>
            </Button>
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" asChild>
              <Link to="/cadastro">Criar Conta</Link>
            </Button>
          </div>

          {/* Mobile hamburger — fica à direita; logo é absolute-centralizado. */}
          <button
            className="md:hidden ml-auto text-white"
            aria-label={mobileOpen ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile menu — overlay full-screen (100vw x 100dvh), fundo sólido. */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 flex flex-col bg-[hsl(0,0%,5%)] animate-in fade-in slide-in-from-top-2 duration-200"
          style={{ height: '100dvh', width: '100vw' }}
        >
          {/* Header do overlay — logo + X de fechar */}
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/5 px-4">
            <Link to="/" className="flex items-center gap-2" onClick={() => setMobileOpen(false)}>
              <img src={logoWhite} alt="Dominex" className="h-10 w-auto" />
            </Link>
            <button
              type="button"
              className="text-white"
              aria-label="Fechar menu"
              onClick={() => setMobileOpen(false)}
            >
              <X className="h-7 w-7" />
            </button>
          </div>

          {/* Conteúdo rolável */}
          <div className="flex-1 overflow-y-auto px-4 pb-6 pt-2">
          {navLinks.slice(0, 1).map((l) => (
            <a
              key={l.href}
              href={anchorTo(l.href)}
              onClick={() => setMobileOpen(false)}
              className={cn(
                'block py-3 text-sm border-b border-white/5 transition-colors',
                activeId === l.id ? 'text-white font-medium border-l-2 border-l-primary pl-3' : 'text-white/70 hover:text-white'
              )}
            >
              {l.label}
            </a>
          ))}

          {/* Soluções — grupo expansível no mobile */}
          <button
            type="button"
            aria-expanded={mobileSolutionsOpen}
            onClick={() => setMobileSolutionsOpen((o) => !o)}
            className="flex w-full items-center justify-between py-3 text-sm text-white/70 border-b border-white/5 transition-colors hover:text-white"
          >
            <span>Soluções</span>
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
                    to={sol.slug}
                    onClick={() => {
                      setMobileOpen(false);
                      setMobileSolutionsOpen(false);
                    }}
                    className="flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm text-white/65 transition-colors hover:bg-white/5 hover:text-white"
                  >
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-white">
                      <Icon className="h-4 w-4" />
                    </span>
                    {sol.label}
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
            <span>Segmentos</span>
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
                    to={path}
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
                    {seg.label}
                  </Link>
                );
              })}
            </div>
          )}

          <a
            href={anchorTo('#precos')}
            onClick={() => setMobileOpen(false)}
            className={cn(
              'block py-3 text-sm border-b border-white/5 transition-colors',
              activeId === 'precos' ? 'text-white font-medium border-l-2 border-l-primary pl-3' : 'text-white/70 hover:text-white'
            )}
          >
            Preços
          </a>

          <div className="mt-4 flex flex-col gap-3">
            <Button variant="ghost" className="w-full text-white border border-white/20 hover:bg-white/10 hover:text-white gap-2" asChild>
              <Link to="/login">
                <LogIn className="h-4 w-4" />
                Entrar
              </Link>
            </Button>
            <Button className="w-full bg-primary text-primary-foreground" asChild>
              <Link to="/cadastro">Criar Conta</Link>
            </Button>
          </div>
          </div>
        </div>
      )}
    </nav>
  );
}
