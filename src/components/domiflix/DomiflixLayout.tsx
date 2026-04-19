import { Outlet, NavLink, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useState, useEffect, useRef, useMemo } from "react";
import { ArrowLeft, Search, X, Menu, Play, ChevronRight } from "lucide-react";
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
  const [navSearchOpen, setNavSearchOpen] = useState(false);
  const [navSearchQuery, setNavSearchQuery] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const { user, profile, loading: authLoading } = useAuth();
  const { avatarUrl } = useDomiflixAvatar();
  const { displayName } = useDomiflixDisplayName();
  const { data: titles = [] } = useDomiflixTitles();
  const { data: allEpisodesData } = useDomiflixAllEpisodes();

  const firstName = useMemo(() => {
    if (displayName?.trim()) return displayName.trim().split(/\s+/)[0];
    const name = profile?.full_name?.trim();
    return name ? name.split(/\s+/)[0] : "";
  }, [profile?.full_name, displayName]);

  const initials = useMemo(() => {
    const name = profile?.full_name?.trim();
    if (!name) return "?";
    const parts = name.split(/\s+/);
    return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
  }, [profile?.full_name]);

  // Entrance animation
  useEffect(() => {
    const t = requestAnimationFrame(() => setHeaderMounted(true));
    return () => cancelAnimationFrame(t);
  }, []);

  // Intro sound (once per day per user)
  useEffect(() => {
    if (authLoading || !user?.id) return;
    try {
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
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

  // Search results — titles + episodes
  const navSearchResults = useMemo(() => {
    if (navSearchQuery.trim().length < 2) return [];
    const q = navSearchQuery.trim().toLowerCase();
    const matchedTitleIds = new Set<string>();
    const episodesByTitle = allEpisodesData?.byTitle ?? {};
    Object.entries(episodesByTitle).forEach(([titleId, eps]) => {
      const hit = eps.some(
        (ep) => ep.title?.toLowerCase().includes(q) || ep.description?.toLowerCase().includes(q),
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

  useEffect(() => { setMobileMenuOpen(false); }, [location.pathname, location.search]);

  // Click outside dropdown
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
    if (window.opener) window.close();
    else window.location.href = "/dashboard";
  }

  const isHomePage = location.pathname === "/domiflix";
  const tipoParam = searchParams.get("tipo");

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "relative text-sm font-normal transition-colors py-1.5",
      isActive
        ? "text-white after:content-[''] after:absolute after:left-0 after:right-0 after:-bottom-1 after:h-[2px] after:bg-[#e50914] after:rounded-full"
        : "text-white/[.85] hover:text-white",
    );

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
      <nav
        className={cn(
          "fixed top-0 left-0 right-0 z-50 transition-all duration-500",
          scrolled || !isHomePage
            ? "bg-[#141414] shadow-[0_8px_20px_-4px_rgba(0,0,0,0.7)]"
            : "bg-gradient-to-b from-black/95 via-black/70 to-transparent",
          headerMounted ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0",
        )}
        style={{ transition: "transform 0.5s cubic-bezier(0.16,1,0.3,1), opacity 0.5s ease, background-color 0.5s" }}
      >
        <div className="flex items-center justify-between px-4 md:px-12 h-[56px] md:h-[68px]">
          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden text-white/85 hover:text-white transition-colors p-1.5 -ml-1.5"
            aria-label="Menu"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>

          {/* Mobile logo centered */}
          <NavLink to="/domiflix" className="md:hidden absolute left-1/2 -translate-x-1/2 block h-9 w-[112px]" aria-label="Domiflix">
            {!logoLoaded && <div className="w-full h-full rounded bg-white/10 animate-pulse" />}
            <img
              src={logoWhite}
              alt="Domiflix"
              className={cn(
                "h-9 object-contain select-none transition-opacity duration-300 mx-auto",
                logoLoaded ? "opacity-100" : "opacity-0 absolute",
              )}
              onLoad={() => setLogoLoaded(true)}
            />
          </NavLink>

          {/* Desktop logo + nav */}
          <div className="hidden md:flex items-center gap-4 md:gap-8">
            <NavLink to="/domiflix" className="block w-[120px] h-10 shrink-0">
              {!logoLoaded && <div className="w-full h-full rounded bg-white/10 animate-pulse" />}
              <img
                src={logoWhite}
                alt="Domiflix"
                className={cn(
                  "h-10 object-contain select-none transition-opacity duration-300",
                  logoLoaded ? "opacity-100" : "opacity-0 absolute",
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
                  <NavLink to="/domiflix" end className={tipoLinkClass(null)}>Início</NavLink>
                  <NavLink to="/domiflix?tipo=modulos" className={tipoLinkClass("modulos")}>Módulos</NavLink>
                  <NavLink to="/domiflix?tipo=lives" className={tipoLinkClass("lives")}>Lives</NavLink>
                  <NavLink to="/domiflix/minha-lista" className={navLinkClass}>Minha Lista</NavLink>
                </>
              )}
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2 md:gap-3">
            {/* Desktop search with hover */}
            <div
              className="hidden md:flex items-center relative"
              ref={dropdownRef}
              onMouseEnter={() => {
                if (!navSearchOpen) {
                  setNavSearchOpen(true);
                  setTimeout(() => searchInputRef.current?.focus(), 150);
                }
              }}
              onMouseLeave={() => {
                if (navSearchOpen && !navSearchQuery) setNavSearchOpen(false);
              }}
            >
              <div className={cn(
                "flex items-center transition-all duration-300 ease-out rounded overflow-hidden",
                navSearchOpen ? "bg-[#1a1a1a] border border-white/30" : "border border-transparent",
              )}>
                <button
                  onClick={() => {
                    if (navSearchOpen && navSearchQuery) setNavSearchQuery("");
                    setNavSearchOpen(!navSearchOpen);
                    if (!navSearchOpen) setTimeout(() => searchInputRef.current?.focus(), 100);
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
                    navSearchOpen ? "w-32 sm:w-40 md:w-56 pr-2 opacity-100" : "w-0 p-0 opacity-0",
                  )}
                />
                {navSearchOpen && navSearchQuery && (
                  <button onClick={() => setNavSearchQuery("")} className="text-white/50 hover:text-white transition-colors pr-2">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Dropdown rich results with episode hits */}
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
                          ? eps.filter((ep) => ep.title?.toLowerCase().includes(q) || ep.description?.toLowerCase().includes(q))
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
                                  <img src={title.banner_url || title.thumbnail_url || ""} alt={title.title}
                                    loading="lazy" decoding="async" className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full bg-[#333]" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-white text-sm font-medium line-clamp-1">{title.title}</p>
                                {title.description && (
                                  <p className="text-white/45 text-xs line-clamp-1">{title.description}</p>
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
                                        <span className="text-[10px] font-semibold text-white/40 shrink-0 w-10">{label}</span>
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

            {/* Voltar ao sistema (desktop) */}
            <button
              onClick={handleBackToSystem}
              className="hidden md:flex items-center gap-2 text-sm font-medium text-white/85 hover:text-white bg-white/5 hover:bg-[#e50914] border border-white/15 hover:border-[#e50914] transition-all duration-300 rounded px-4 py-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Voltar ao sistema
            </button>

            {/* Greeting + avatar */}
            {user && (
              <button
                onClick={() => navigate("/domiflix/perfil")}
                className="flex items-center gap-2.5 ml-1 group"
                title="Editar perfil Domiflix"
              >
                {firstName && (
                  <span className="hidden sm:block text-sm font-normal text-white/85 select-none group-hover:text-white transition-colors">
                    Olá, <span className="text-white font-medium">{firstName}</span>!
                  </span>
                )}
                {avatarUrl ? (
                  <img src={avatarUrl} alt={firstName}
                    className="h-10 w-10 rounded-md object-cover border-2 border-transparent group-hover:border-white transition-all" />
                ) : (
                  <Avatar className="h-10 w-10 border border-white/20 rounded-md group-hover:border-white transition-all">
                    <AvatarImage src={profile?.avatar_url || undefined} alt={firstName} />
                    <AvatarFallback className="bg-[#e50914] text-white text-sm font-semibold rounded-md">{initials}</AvatarFallback>
                  </Avatar>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Mobile drawer with search inside */}
        {mobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-[60]">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={() => setMobileMenuOpen(false)} />
            <div
              className="absolute left-0 top-0 bottom-0 w-[82%] max-w-[320px] bg-[#141414] border-r border-white/10 shadow-2xl flex flex-col"
              style={{ animation: "slideInLeft 0.3s cubic-bezier(0.16,1,0.3,1)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 h-[56px] border-b border-white/10">
                <img src={logoWhite} alt="Domiflix" className="h-7 object-contain" />
                <button onClick={() => setMobileMenuOpen(false)} className="text-white/70 hover:text-white p-1.5" aria-label="Fechar">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Search inside drawer */}
              <div className="px-4 pt-4">
                <div className="flex items-center gap-2 bg-[#1a1a1a] border border-white/20 rounded px-3 h-10">
                  <Search className="w-4 h-4 text-white/50 shrink-0" />
                  <input
                    type="text"
                    autoFocus
                    placeholder="Buscar títulos..."
                    value={navSearchQuery}
                    onChange={(e) => setNavSearchQuery(e.target.value)}
                    className="bg-transparent text-white text-sm placeholder-white/30 outline-none flex-1 h-full"
                  />
                  {navSearchQuery && (
                    <button onClick={() => setNavSearchQuery("")} className="text-white/50 hover:text-white" aria-label="Limpar">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {navSearchQuery.trim().length >= 2 && (
                <div className="px-4 pt-2 max-h-[40vh] overflow-y-auto">
                  {navSearchResults.length === 0 ? (
                    <p className="text-white/40 text-xs py-3 text-center">
                      Nenhum resultado para "{navSearchQuery}"
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {navSearchResults.map((title) => (
                        <button
                          key={title.id}
                          onClick={() => {
                            navigate(`/domiflix/${slugify(title.title)}`);
                            setMobileMenuOpen(false);
                            setNavSearchQuery("");
                          }}
                          className="w-full flex items-center gap-2 p-2 rounded hover:bg-white/[0.06] text-left"
                        >
                          <div className="w-12 h-7 rounded overflow-hidden bg-[#252525] shrink-0">
                            {(title.banner_url || title.thumbnail_url) && (
                              <img src={title.banner_url || title.thumbnail_url || ""} alt={title.title}
                                className="w-full h-full object-cover" />
                            )}
                          </div>
                          <span className="text-white text-xs font-medium line-clamp-1 flex-1">{title.title}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <nav className="flex flex-col px-2 pt-4 gap-0.5">
                <NavLink to="/domiflix" end className={({ isActive }) =>
                  cn("px-4 py-3 rounded text-base font-medium transition-colors",
                    isActive && !tipoParam ? "bg-white/[0.08] text-white" : "text-white/75 hover:bg-white/[0.05] hover:text-white")}>
                  Início
                </NavLink>
                <NavLink to="/domiflix?tipo=modulos" className={cn(
                  "px-4 py-3 rounded text-base font-medium transition-colors",
                  tipoParam === "modulos" ? "bg-white/[0.08] text-white" : "text-white/75 hover:bg-white/[0.05] hover:text-white")}>
                  Módulos
                </NavLink>
                <NavLink to="/domiflix?tipo=lives" className={cn(
                  "px-4 py-3 rounded text-base font-medium transition-colors",
                  tipoParam === "lives" ? "bg-white/[0.08] text-white" : "text-white/75 hover:bg-white/[0.05] hover:text-white")}>
                  Lives
                </NavLink>
                <NavLink to="/domiflix/minha-lista" className={({ isActive }) =>
                  cn("px-4 py-3 rounded text-base font-medium transition-colors",
                    isActive ? "bg-white/[0.08] text-white" : "text-white/75 hover:bg-white/[0.05] hover:text-white")}>
                  Minha Lista
                </NavLink>
              </nav>

              <div className="mt-auto p-4 border-t border-white/10">
                <button
                  onClick={handleBackToSystem}
                  className="w-full flex items-center justify-center gap-2 text-sm font-medium text-white bg-[#e50914] hover:bg-[#c11118] transition-colors rounded px-4 py-2.5"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Voltar ao sistema
                </button>
              </div>
            </div>
          </div>
        )}
      </nav>

      <div key={location.pathname} className="domiflix-page-enter">
        <Outlet />
      </div>

      {location.pathname !== "/domiflix/perfil" && <DomiflixFooter />}
    </div>
  );
}
