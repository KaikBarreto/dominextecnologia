import { Outlet, NavLink, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useState, useEffect, useRef, useMemo } from "react";
import { ArrowLeft, Search, X, Play, ChevronRight } from "lucide-react";
import logoWhite from "@/assets/logo-white-horizontal.png";
import { cn } from "@/lib/utils";
import { useDomiflixTitles, useDomiflixAllEpisodes } from "@/hooks/useDomiflix";
import { slugify } from "@/lib/slugify";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useDomiflixAvatar } from "@/hooks/useDomiflixAvatar";
import { useDomiflixDisplayName } from "@/hooks/useDomiflixDisplayName";
import { DomiflixFooter } from "./DomiflixFooter";
import { playDomiflixIntro } from "@/lib/domiflixIntroSound";
import { DomiflixMobileBottomNav } from "./DomiflixMobileBottomNav";
import { DomiflixMoreMenuDrawer } from "./DomiflixMoreMenuDrawer";
import { captureDomiflixOrigin } from "./domiflixReturn";

const introPlayedKeys = new Set<string>();

// ── Loading exclusivo Domiflix ───────────────────────────────────────────────
export function DomiflixLoadingFallback() {
  return (
    <div className="domiflix-root min-h-screen bg-[#141414] flex flex-col items-center justify-center gap-7">
      <div className="domiflix-spinner" />
    </div>
  );
}

// ── Layout principal ─────────────────────────────────────────────────────────
export function DomiflixLayout() {
  const [scrolled, setScrolled] = useState(false);
  const [logoLoaded, setLogoLoaded] = useState(false);
  const [headerMounted, setHeaderMounted] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [navSearchOpen, setNavSearchOpen] = useState(false);
  const [navSearchQuery, setNavSearchQuery] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const { data: titles = [] } = useDomiflixTitles();
  const { data: allEpisodesData } = useDomiflixAllEpisodes();
  const { user, profile, loading: authLoading, isAdminUser } = useAuth();
  const { avatarUrl: domiflixAvatarUrl } = useDomiflixAvatar();
  const { displayName: domiflixDisplayName } = useDomiflixDisplayName();

  const firstName = useMemo(() => {
    if (domiflixDisplayName?.trim()) return domiflixDisplayName.trim().split(/\s+/)[0];
    const name = profile?.full_name?.trim();
    if (!name) return "";
    return name.split(/\s+/)[0];
  }, [profile?.full_name, domiflixDisplayName]);

  const initials = useMemo(() => {
    const name = profile?.full_name?.trim();
    if (!name) return "?";
    const parts = name.split(/\s+/);
    return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
  }, [profile?.full_name]);

  // Trigger entrance animation after mount
  useEffect(() => {
    const t = requestAnimationFrame(() => setHeaderMounted(true));
    return () => cancelAnimationFrame(t);
  }, []);

  // Captura durável da origem de entrada na Domiflix. Os pontos de entrada
  // (topbar/sidebar/command palette/more menu) passam `state.from`. Como o
  // Layout envolve TODAS as rotas /domiflix, gravamos a origem assim que o
  // usuário entra; navegação interna (state nulo) não sobrescreve — ver
  // captureDomiflixOrigin (só grava `from` externo à Domiflix).
  useEffect(() => {
    captureDomiflixOrigin((location.state as { from?: string } | null)?.from);
  }, [location.state]);

  // Play Domiflix intro only on the first Domiflix entry of the day for the
  // authenticated user.
  useEffect(() => {
    if (authLoading || !user?.id) return;

    try {
      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Sao_Paulo",
      }).format(new Date());
      const key = `domiflix:intro-played:${user.id}:${today}`;

      if (introPlayedKeys.has(key)) return;
      if (localStorage.getItem(key) === "1") {
        introPlayedKeys.add(key);
        return;
      }

      introPlayedKeys.add(key);
      localStorage.setItem(key, "1");
      void playDomiflixIntro();
    } catch {
      void playDomiflixIntro();
    }
  }, [authLoading, user?.id]);

  // Search results for dropdown — searches titles AND episodes.
  const navSearchResults = useMemo(() => {
    if (navSearchQuery.trim().length < 2) return [];
    const q = navSearchQuery.trim().toLowerCase();

    const matchedTitleIds = new Set<string>();
    const episodesByTitle = allEpisodesData?.byTitle ?? {};
    Object.entries(episodesByTitle).forEach(([titleId, eps]) => {
      const hit = eps.some(
        (ep) =>
          ep.title?.toLowerCase().includes(q) ||
          ep.description?.toLowerCase().includes(q),
      );
      if (hit) matchedTitleIds.add(titleId);
    });

    return titles
      .filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.description?.toLowerCase().includes(q) ||
          t.tags?.some((tag) => tag.toLowerCase().includes(q)) ||
          matchedTitleIds.has(t.id),
      )
      .slice(0, 8);
  }, [titles, navSearchQuery, allEpisodesData]);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname, location.search]);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setNavSearchOpen(false);
        setNavSearchQuery("");
      }
    }
    if (navSearchOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [navSearchOpen]);

  function handleBackToSystem() {
    if (window.opener) {
      window.close();
    } else {
      // Super_admin volta pro painel master Auctus; tenant volta pro dashboard.
      window.location.href = isAdminUser ? "/admin/empresas" : "/dashboard";
    }
  }

  // Mark "Módulos" / "Lives" filters as active when on /domiflix?tipo=...
  const tipoParam = searchParams.get("tipo");

  // Home REAL = só /domiflix sem filtro (com filtro `?tipo=...` não tem
  // DomiflixHero por trás, então o gradient transparente do header não tem
  // onde se misturar e fica aparecendo o fundo embaixo).
  const isHomePage = location.pathname === "/domiflix" && !tipoParam;

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "relative text-sm font-normal transition-colors py-1.5",
      isActive
        ? "text-white after:content-[''] after:absolute after:left-0 after:right-0 after:-bottom-1 after:h-[2px] after:bg-[#e50914] after:rounded-full"
        : "text-white/[.85] hover:text-white",
    );

  // Custom evaluator for the filter NavLinks (they all share /domiflix path).
  const tipoLinkClass = (expected: string | null) =>
    cn(
      "relative text-sm font-normal transition-colors py-1.5",
      (expected === null
        ? location.pathname === "/domiflix" && !tipoParam
        : tipoParam === expected)
        ? "text-white after:content-[''] after:absolute after:left-0 after:right-0 after:-bottom-1 after:h-[2px] after:bg-[#e50914] after:rounded-full"
        : "text-white/[.85] hover:text-white",
    );

  return (
    <div className="domiflix-root min-h-screen bg-[#141414]">
      {/* ── Navbar fixa estilo Netflix ── */}
      <nav
        className={cn(
          "fixed top-0 left-0 right-0 z-50 transition-all duration-500",
          scrolled || !isHomePage
            ? "bg-[#141414] shadow-[0_8px_20px_-4px_rgba(0,0,0,0.7)]"
            : "bg-gradient-to-b from-black/95 via-black/70 to-transparent",
          // Entrance animation
          headerMounted
            ? "translate-y-0 opacity-100"
            : "-translate-y-full opacity-0"
        )}
        style={{ transition: "transform 0.5s cubic-bezier(0.16,1,0.3,1), opacity 0.5s ease, background-color 0.5s" }}
      >
        <div className="flex items-center justify-between px-4 md:px-12 h-[56px] md:h-[68px]">
          {/* ── Mobile: logo centered (absolutely positioned to be perfectly centered) ── */}
          <NavLink
            to="/domiflix"
            className="md:hidden absolute left-1/2 -translate-x-1/2 block h-9 w-[112px]"
            aria-label="Domiflix"
          >
            {!logoLoaded && (
              <div className="w-full h-full rounded bg-white/10 animate-pulse" />
            )}
            <img
              src={logoWhite}
              alt="Domiflix"
              className={cn(
                "h-9 object-contain select-none transition-opacity duration-300 mx-auto",
                logoLoaded ? "opacity-100" : "opacity-0 absolute"
              )}
              onLoad={() => setLogoLoaded(true)}
            />
          </NavLink>

          {/* ── Desktop: Logo + nav links (esquerda) ── */}
          <div className="hidden md:flex items-center gap-4 md:gap-8">
            <NavLink to="/domiflix" className="block w-[120px] h-10 shrink-0">
              {!logoLoaded && (
                <div className="w-full h-full rounded bg-white/10 animate-pulse" />
              )}
              <img
                src={logoWhite}
                alt="Domiflix"
                className={cn(
                  "h-10 object-contain select-none transition-opacity duration-300",
                  logoLoaded ? "opacity-100" : "opacity-0 absolute"
                )}
                onLoad={() => setLogoLoaded(true)}
              />
            </NavLink>

            <div className="flex items-center gap-6">
              {!headerMounted ? (
                <>
                  <div className="h-4 w-12 rounded bg-white/10 animate-pulse" />
                  <div className="h-4 w-16 rounded bg-white/10 animate-pulse" />
                  <div className="h-4 w-10 rounded bg-white/10 animate-pulse" />
                </>
              ) : (
                <>
                  <NavLink to="/domiflix" end className={tipoLinkClass(null)}>
                    Início
                  </NavLink>
                  <NavLink to="/domiflix?tipo=modulos" className={tipoLinkClass("modulos")}>
                    Módulos
                  </NavLink>
                  <NavLink to="/domiflix?tipo=lives" className={tipoLinkClass("lives")}>
                    Lives
                  </NavLink>
                  <NavLink to="/domiflix/minha-lista" className={navLinkClass}>
                    Minha Lista
                  </NavLink>
                </>
              )}
            </div>
          </div>

          {/* Direita: ícones + botão voltar */}
          <div className="flex items-center gap-2 md:gap-3">
            {/* Search - desktop only (mobile usa link no menu hamburger) */}
            <div className="hidden md:flex items-center relative"
              ref={dropdownRef}
              onMouseEnter={() => {
                if (!navSearchOpen) {
                  setNavSearchOpen(true);
                  setTimeout(() => searchInputRef.current?.focus(), 150);
                }
              }}
              onMouseLeave={() => {
                if (navSearchOpen && !navSearchQuery) {
                  setNavSearchOpen(false);
                }
              }}
            >
              <div
                className={cn(
                  "flex items-center transition-all duration-300 ease-out rounded overflow-hidden",
                  navSearchOpen ? "bg-[#1a1a1a] border border-white/30" : "border border-transparent"
                )}
              >
                <button
                  onClick={() => {
                    if (navSearchOpen && navSearchQuery) {
                      setNavSearchQuery("");
                    }
                    setNavSearchOpen(!navSearchOpen);
                    if (!navSearchOpen) {
                      setTimeout(() => searchInputRef.current?.focus(), 100);
                    }
                  }}
                  className="text-white/80 hover:text-white transition-colors p-1.5"
                >
                  <Search className="w-5 h-5" />
                </button>
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Buscar títulos..."
                  value={navSearchQuery}
                  onChange={(e) => setNavSearchQuery(e.target.value)}
                  className={cn(
                    "bg-transparent text-white text-sm placeholder-white/30 outline-none h-8 transition-all duration-300 ease-out",
                    navSearchOpen ? "w-32 sm:w-40 md:w-56 pr-2 opacity-100" : "w-0 p-0 opacity-0"
                  )}
                />
                {navSearchOpen && navSearchQuery && (
                  <button
                    onClick={() => setNavSearchQuery("")}
                    className="text-white/50 hover:text-white transition-colors pr-2"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Dropdown results */}
              {navSearchOpen && navSearchQuery.trim().length >= 2 && (
                <div className="absolute top-full right-0 mt-1 w-[calc(100vw-2rem)] sm:w-[350px] md:w-[420px] bg-[#1a1a1a] border border-white/10 rounded-lg shadow-2xl overflow-hidden z-[60]">
                  {navSearchResults.length === 0 ? (
                    <div className="px-4 py-6 text-center text-white/40 text-sm">
                      Nenhum resultado para "{navSearchQuery}"
                    </div>
                  ) : (
                    <div className="max-h-[480px] overflow-y-auto">
                      {navSearchResults.map((title) => {
                        const eps = allEpisodesData?.byTitle?.[title.id] ?? [];
                        const seasonMap = allEpisodesData?.seasonMap ?? {};
                        const q = navSearchQuery.trim().toLowerCase();
                        const matchingEps = q.length >= 2
                          ? eps.filter(
                              (ep) =>
                                ep.title?.toLowerCase().includes(q) ||
                                ep.description?.toLowerCase().includes(q),
                            )
                          : [];
                        const epLabel = title.type === "series" ? "episódios" : "gravações";
                        return (
                          <div key={title.id} className="border-b border-white/[0.04] last:border-b-0">
                            <div
                              onClick={() => {
                                navigate(`/domiflix/${slugify(title.title)}`);
                                setNavSearchOpen(false);
                                setNavSearchQuery("");
                              }}
                              className="flex items-center gap-3 px-3 py-2.5 hover:bg-[#252525] cursor-pointer transition-colors"
                            >
                              <div className="w-16 h-9 flex-shrink-0 rounded overflow-hidden bg-[#252525]">
                                {(title.banner_url || title.thumbnail_url) ? (
                                  <img
                                    src={title.banner_url || title.thumbnail_url}
                                    alt={title.title}
                                    loading="lazy"
                                    decoding="async"
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full bg-[#333]" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-white text-sm font-medium line-clamp-1">{title.title}</p>
                                {title.description && (
                                  <p className="text-white/45 text-xs line-clamp-1">
                                    {title.description}
                                  </p>
                                )}
                              </div>
                              {eps.length > 0 && (
                                <span className="text-white/50 text-[11px] font-light shrink-0 whitespace-nowrap">
                                  {eps.length} {epLabel}
                                </span>
                              )}
                            </div>

                            {matchingEps.length > 0 && (
                              <div className="bg-black/30 pb-1">
                                {matchingEps.slice(0, 4).map((ep) => {
                                  const info = seasonMap[ep.id];
                                  const label = info ? `T${info.seasonNumber}·E${info.episodeInSeason}` : null;
                                  const idx = eps.findIndex((e) => e.id === ep.id);
                                  const epNumber = idx >= 0 ? idx + 1 : 1;
                                  return (
                                    <button
                                      key={ep.id}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        navigate(`/domiflix/assistir/${slugify(title.title)}/${epNumber}`);
                                        setNavSearchOpen(false);
                                        setNavSearchQuery("");
                                      }}
                                      className="w-full text-left flex items-center gap-2 pl-12 pr-3 py-1.5 hover:bg-white/[0.05] transition-colors group"
                                    >
                                      <Play className="w-3 h-3 text-white/35 group-hover:text-white shrink-0 fill-current" />
                                      {label && (
                                        <span className="text-[10px] font-semibold text-white/40 shrink-0 w-10">
                                          {label}
                                        </span>
                                      )}
                                      <span className="text-xs text-white/75 truncate flex-1">{ep.title}</span>
                                      <ChevronRight className="w-3 h-3 text-white/25 group-hover:text-white/60 shrink-0" />
                                    </button>
                                  );
                                })}
                                {matchingEps.length > 4 && (
                                  <p className="pl-12 pr-3 py-1 text-[10px] text-white/35">
                                    + {matchingEps.length - 4} outros…
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Voltar ao sistema (desktop only) */}
            <button
              onClick={handleBackToSystem}
              className="hidden md:flex items-center gap-2 text-sm font-medium text-white/85 hover:text-white bg-white/5 hover:bg-[#e50914] border border-white/15 hover:border-[#e50914] transition-all duration-300 rounded px-4 py-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Voltar ao sistema
            </button>

            {/* Avatar + primeiro nome à direita (clicável → /domiflix/perfil) */}
            {user && (
              <button
                onClick={() => navigate("/domiflix/perfil")}
                className="flex items-center gap-2.5 ml-1 group"
                title="Editar perfil Domiflix"
              >
                {domiflixAvatarUrl ? (
                  <img
                    src={domiflixAvatarUrl}
                    alt={firstName}
                    className="h-10 w-10 rounded-md object-cover border-2 border-transparent group-hover:border-white transition-all"
                  />
                ) : (
                  <Avatar className="h-10 w-10 border border-white/20 rounded-md group-hover:border-white transition-all">
                    <AvatarImage src={profile?.avatar_url || undefined} alt={firstName} />
                    <AvatarFallback className="bg-[#e50914] text-white text-sm font-semibold rounded-md">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                )}
                {firstName && (
                  <span className="text-sm font-medium text-white/85 select-none group-hover:text-white transition-colors max-w-[120px] truncate">
                    {firstName}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>

      </nav>

      {/* Mobile menu drawer — BOTTOM SHEET (sobe de baixo, estilo MoreMenuDrawer
          do sistema principal). Substituiu o antigo drawer lateral (slideInLeft).
          Compartilha o state `mobileMenuOpen` com o "Menu" do
          `DomiflixMobileBottomNav`. */}
      <DomiflixMoreMenuDrawer open={mobileMenuOpen} onOpenChange={setMobileMenuOpen} />

      {/* Conteúdo das páginas
          pb-28 no mobile: garante que último item visível não fica coberto pelo
          DomiflixMobileBottomNav (renderizado abaixo, lg:hidden). Desktop não precisa. */}
      <div key={location.pathname} className="domiflix-page-enter pb-28 lg:pb-0">
        <Outlet />
      </div>

      {/* Footer — oculto no picker de avatar */}
      {location.pathname !== "/domiflix/perfil" && <DomiflixFooter />}

      {/* Bottom navigation próprio da Domiflix — mobile only (lg:hidden interno).
          Substitui o MobileBottomNav global (verde Dominex, itens do sistema
          principal) por um nav com identidade Domiflix (preto + vermelho #e50914).
          Layout: Módulos | Lives | (●)Início | Minha Lista | Menu — o botão
          "Início" central é destacado (círculo vermelho elevado, estilo "+"
          do MobileBottomNav global) e "Menu" abre o drawer hambúrguer Domiflix
          (mesmo `mobileMenuOpen` do header — compat preservada).
          NÃO é renderizado no player (/domiflix/assistir/...) porque essa rota
          fica fora do DomiflixLayout (é standalone, tela cheia). */}
      <DomiflixMobileBottomNav onOpenDrawer={() => setMobileMenuOpen(true)} />
    </div>
  );
}
