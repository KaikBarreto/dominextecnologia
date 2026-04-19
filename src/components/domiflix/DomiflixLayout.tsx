import { Outlet, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect, useMemo } from "react";
import { ArrowLeft, Search, X, Menu } from "lucide-react";
import logoWhite from "@/assets/logo-white-horizontal.png";
import { cn } from "@/lib/utils";
import { useDomiflixTitles } from "@/hooks/useDomiflix";
import { slugify } from "@/lib/slugify";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useDomiflixAvatar } from "@/hooks/useDomiflixAvatar";
import { useDomiflixDisplayName } from "@/hooks/useDomiflixDisplayName";
import { DomiflixFooter } from "./DomiflixFooter";
import { playDomiflixIntro } from "@/lib/domiflixIntroSound";

const introPlayedKeys = new Set<string>();

export function DomiflixLayout() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [navSearchOpen, setNavSearchOpen] = useState(false);
  const [navSearchQuery, setNavSearchQuery] = useState("");
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { avatarUrl } = useDomiflixAvatar();
  const { displayName } = useDomiflixDisplayName();
  const { data: titles = [] } = useDomiflixTitles();

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

  useEffect(() => {
    if (!user?.id) return;
    try {
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
      const key = `domiflix:intro-played:${user.id}:${today}`;
      if (introPlayedKeys.has(key) || localStorage.getItem(key) === "1") {
        introPlayedKeys.add(key);
        return;
      }
      introPlayedKeys.add(key);
      localStorage.setItem(key, "1");
      void playDomiflixIntro();
    } catch { void playDomiflixIntro(); }
  }, [user?.id]);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => { setMobileMenuOpen(false); }, [location.pathname, location.search]);

  const navSearchResults = useMemo(() => {
    if (navSearchQuery.trim().length < 2) return [];
    const q = navSearchQuery.trim().toLowerCase();
    return titles.filter((t) =>
      t.title.toLowerCase().includes(q) ||
      t.description?.toLowerCase().includes(q) ||
      t.tags?.some((tag) => tag.toLowerCase().includes(q))
    ).slice(0, 8);
  }, [titles, navSearchQuery]);

  const isHomePage = location.pathname === "/domiflix";

  return (
    <div className="domiflix-root min-h-screen bg-[#141414]">
      <nav
        className={cn(
          "fixed top-0 left-0 right-0 z-50 transition-all duration-500",
          scrolled || !isHomePage
            ? "bg-[#141414] shadow-[0_8px_20px_-4px_rgba(0,0,0,0.7)]"
            : "bg-gradient-to-b from-black/95 via-black/70 to-transparent"
        )}
      >
        <div className="flex items-center justify-between px-4 md:px-12 h-[56px] md:h-[68px]">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden text-white/85 hover:text-white p-1.5 -ml-1.5"
            aria-label="Menu"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>

          <NavLink to="/domiflix" className="md:hidden absolute left-1/2 -translate-x-1/2 block h-9 w-[112px]">
            <img src={logoWhite} alt="Domiflix" className="h-9 object-contain mx-auto" />
          </NavLink>

          <div className="hidden md:flex items-center gap-8">
            <NavLink to="/domiflix" className="block w-[120px] h-10 shrink-0">
              <img src={logoWhite} alt="Domiflix" className="h-10 object-contain" />
            </NavLink>
            <div className="flex items-center gap-6">
              <NavLink to="/domiflix" end className={({ isActive }) =>
                cn("text-sm py-1.5 transition-colors", isActive ? "text-white" : "text-white/85 hover:text-white")
              }>Início</NavLink>
              <NavLink to="/domiflix?tipo=modulos" className="text-sm py-1.5 text-white/85 hover:text-white transition-colors">Módulos</NavLink>
              <NavLink to="/domiflix?tipo=lives" className="text-sm py-1.5 text-white/85 hover:text-white transition-colors">Lives</NavLink>
              <NavLink to="/domiflix/minha-lista" className={({ isActive }) =>
                cn("text-sm py-1.5 transition-colors", isActive ? "text-white" : "text-white/85 hover:text-white")
              }>Minha Lista</NavLink>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            <div className="hidden md:flex items-center relative">
              <div className={cn(
                "flex items-center transition-all duration-300 rounded overflow-hidden",
                navSearchOpen ? "bg-[#1a1a1a] border border-white/30" : "border border-transparent"
              )}>
                <button onClick={() => setNavSearchOpen(!navSearchOpen)} className="text-white/80 hover:text-white p-1.5">
                  <Search className="w-5 h-5" />
                </button>
                <input
                  type="text"
                  placeholder="Buscar títulos..."
                  value={navSearchQuery}
                  onChange={(e) => setNavSearchQuery(e.target.value)}
                  className={cn(
                    "bg-transparent text-white text-sm placeholder-white/30 outline-none h-8 transition-all",
                    navSearchOpen ? "w-56 pr-2" : "w-0 p-0"
                  )}
                />
              </div>
              {navSearchOpen && navSearchQuery.trim().length >= 2 && (
                <div className="absolute top-full right-0 mt-1 w-[420px] bg-[#1a1a1a] border border-white/10 rounded-lg shadow-2xl overflow-hidden z-[60] max-h-[480px] overflow-y-auto">
                  {navSearchResults.length === 0 ? (
                    <div className="px-4 py-6 text-center text-white/40 text-sm">Nenhum resultado</div>
                  ) : navSearchResults.map((t) => (
                    <button key={t.id} onClick={() => { navigate(`/domiflix/${slugify(t.title)}`); setNavSearchOpen(false); setNavSearchQuery(""); }}
                      className="flex items-center gap-3 px-3 py-2.5 hover:bg-[#252525] w-full text-left transition-colors">
                      <div className="w-16 h-9 rounded overflow-hidden bg-[#252525] flex-shrink-0">
                        {(t.banner_url || t.thumbnail_url) && (
                          <img src={t.banner_url || t.thumbnail_url || ""} alt={t.title} className="w-full h-full object-cover" />
                        )}
                      </div>
                      <span className="text-white text-sm font-medium line-clamp-1 flex-1">{t.title}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => navigate("/dashboard")}
              className="hidden md:flex items-center gap-2 text-sm font-medium text-white/85 hover:text-white bg-white/5 hover:bg-[#e50914] border border-white/15 hover:border-[#e50914] transition-all duration-300 rounded px-4 py-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Voltar ao sistema
            </button>

            {user && (
              <button onClick={() => navigate("/domiflix/perfil")} className="flex items-center gap-2.5 ml-1 group" title="Editar perfil Domiflix">
                {firstName && (
                  <span className="hidden sm:block text-sm text-white/85 group-hover:text-white transition-colors">
                    Olá, <span className="text-white font-medium">{firstName}</span>!
                  </span>
                )}
                {avatarUrl ? (
                  <img src={avatarUrl} alt={firstName} className="h-10 w-10 rounded-md object-cover border-2 border-transparent group-hover:border-white transition-all" />
                ) : (
                  <Avatar className="h-10 w-10 border border-white/20 rounded-md group-hover:border-white transition-all">
                    <AvatarFallback className="bg-[#00C597] text-black text-sm font-semibold rounded-md">{initials}</AvatarFallback>
                  </Avatar>
                )}
              </button>
            )}
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-[60]">
            <div className="absolute inset-0 bg-black/70" onClick={() => setMobileMenuOpen(false)} />
            <div className="absolute left-0 top-0 bottom-0 w-[82%] max-w-[320px] bg-[#141414] border-r border-white/10 flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-4 h-[56px] border-b border-white/10">
                <img src={logoWhite} alt="Domiflix" className="h-7" />
                <button onClick={() => setMobileMenuOpen(false)} className="text-white/70 p-1.5"><X className="w-5 h-5" /></button>
              </div>
              <nav className="flex flex-col px-2 pt-4 gap-0.5">
                <NavLink to="/domiflix" end className="px-4 py-3 rounded text-base text-white/75 hover:bg-white/5 hover:text-white">Início</NavLink>
                <NavLink to="/domiflix?tipo=modulos" className="px-4 py-3 rounded text-base text-white/75 hover:bg-white/5 hover:text-white">Módulos</NavLink>
                <NavLink to="/domiflix?tipo=lives" className="px-4 py-3 rounded text-base text-white/75 hover:bg-white/5 hover:text-white">Lives</NavLink>
                <NavLink to="/domiflix/minha-lista" className="px-4 py-3 rounded text-base text-white/75 hover:bg-white/5 hover:text-white">Minha Lista</NavLink>
              </nav>
              <div className="mt-auto p-4 border-t border-white/10">
                <button onClick={() => navigate("/dashboard")}
                  className="w-full flex items-center justify-center gap-2 text-sm font-medium text-white bg-[#e50914] hover:bg-[#c11118] transition-colors rounded px-4 py-2.5">
                  <ArrowLeft className="w-4 h-4" /> Voltar ao sistema
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
