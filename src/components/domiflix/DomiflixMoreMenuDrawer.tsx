import { useMemo, useState } from "react";
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Bookmark,
  ChevronRight,
  Home,
  Layers,
  Play,
  Radio,
  Search,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from "@/components/ui/drawer";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";

import logoWhite from "@/assets/domiflix-logo-horizontal.png";
import { APP_VERSION } from "@/config/version";
import { useAuth } from "@/contexts/AuthContext";
import { useDomiflixAvatar } from "@/hooks/useDomiflixAvatar";
import { useDomiflixDisplayName } from "@/hooks/useDomiflixDisplayName";
import { useDomiflixAllEpisodes, useDomiflixTitles } from "@/hooks/useDomiflix";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { slugify } from "@/lib/slugify";

interface DomiflixMoreMenuDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Drawer "Mais" da Domiflix — BOTTOM SHEET (sobe de baixo).
 *
 * Substitui o antigo drawer lateral (slideInLeft) por um bottom sheet seguindo
 * o mesmo padrão do MoreMenuDrawer do sistema principal — mas com identidade
 * visual Domiflix (#141414 / #e50914 / texto branco).
 *
 * Estrutura:
 * - Header: avatar Domiflix + saudação + close button
 * - Busca inline (preservada do drawer lateral antigo)
 * - Lista de navegação (Início / Módulos / Lives / Minha Lista)
 * - Atalho destacado: "Voltar ao sistema" (CTA vermelho)
 * - Footer: logo Domiflix + versão
 *
 * Acessibilidade: shadcn Drawer (vaul) já cuida de swipe down + ESC + focus trap.
 */
export function DomiflixMoreMenuDrawer({ open, onOpenChange }: DomiflixMoreMenuDrawerProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tipoParam = searchParams.get("tipo");

  const { user, profile, isAdminUser } = useAuth();
  const { avatarUrl: domiflixAvatarUrl } = useDomiflixAvatar();
  const { displayName: domiflixDisplayName } = useDomiflixDisplayName();

  const { data: titles = [] } = useDomiflixTitles();
  const { data: allEpisodesData } = useDomiflixAllEpisodes();

  const [navSearchQuery, setNavSearchQuery] = useState("");

  const close = () => onOpenChange(false);

  // Nome completo (preferência) com fallbacks: domiflixDisplayName → profile.full_name → email
  const fullName = useMemo(() => {
    if (domiflixDisplayName?.trim()) return domiflixDisplayName.trim();
    const name = profile?.full_name?.trim();
    if (name) return name;
    return user?.email?.split("@")[0] ?? "";
  }, [domiflixDisplayName, profile?.full_name, user?.email]);

  const initials = useMemo(() => {
    const name = profile?.full_name?.trim() || domiflixDisplayName?.trim() || user?.email?.split("@")[0] || "";
    if (!name) return "?";
    const parts = name.split(/\s+/);
    return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
  }, [profile?.full_name, domiflixDisplayName, user?.email]);

  // Busca em títulos + episódios (mesma lógica do dropdown desktop)
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
      .slice(0, 6);
  }, [titles, navSearchQuery, allEpisodesData]);

  function handleBackToSystem() {
    close();
    // Comportamento Dominex: se a Domiflix foi aberta em nova aba (window.opener),
    // fecha a aba; senão volta pro destino do sistema principal — super_admin
    // Auctus vai pro painel master, tenant vai pro dashboard.
    if (window.opener) {
      window.close();
    } else {
      window.location.href = isAdminUser ? "/admin/empresas" : "/dashboard";
    }
  }

  function handleNavigate(path: string) {
    close();
    navigate(path);
  }

  // Itens de navegação principais (espelham o bottom nav + extras)
  const navItems: Array<{
    icon: typeof Home;
    label: string;
    path: string;
    isActive: () => boolean;
  }> = [
    {
      icon: Home,
      label: "Início",
      path: "/domiflix",
      isActive: () => location.pathname === "/domiflix" && !tipoParam,
    },
    {
      icon: Layers,
      label: "Módulos",
      path: "/domiflix?tipo=modulos",
      isActive: () => location.pathname === "/domiflix" && tipoParam === "modulos",
    },
    {
      icon: Radio,
      label: "Lives",
      path: "/domiflix?tipo=lives",
      isActive: () => location.pathname === "/domiflix" && tipoParam === "lives",
    },
    {
      icon: Bookmark,
      label: "Minha Lista",
      path: "/domiflix/minha-lista",
      isActive: () =>
        location.pathname === "/domiflix/minha-lista" ||
        location.pathname.startsWith("/domiflix/minha-lista/"),
    },
  ];

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        className={cn(
          "domiflix-root h-auto max-h-[85vh] border-0 rounded-t-2xl p-0",
          // Fundo Domiflix sólido — sobrescreve bg-background do shadcn Drawer
          "bg-[#141414] text-white",
        )}
      >
        <VisuallyHidden asChild>
          <DrawerTitle>Menu Domiflix</DrawerTitle>
        </VisuallyHidden>
        <VisuallyHidden asChild>
          <DrawerDescription>Navegação e atalhos da Domiflix</DrawerDescription>
        </VisuallyHidden>

        <div className="flex flex-col h-full min-h-0 max-h-[85vh]">
          {/* ── HEADER ────────────────────────────────────────────── */}
          <div className="shrink-0 px-4 pt-2 pb-3 border-b border-white/10">
            <div className="flex items-center gap-3">
              {/* Avatar Domiflix clicável → /domiflix/perfil */}
              <button
                type="button"
                onClick={() => handleNavigate("/domiflix/perfil")}
                className="shrink-0 group"
                aria-label="Editar perfil Domiflix"
                title="Editar perfil Domiflix"
              >
                {domiflixAvatarUrl ? (
                  <img
                    src={domiflixAvatarUrl}
                    alt={fullName || "Perfil"}
                    className="h-11 w-11 rounded-md object-cover border-2 border-transparent group-hover:border-white transition-all"
                  />
                ) : (
                  <Avatar className="h-11 w-11 rounded-md border border-white/20 group-hover:border-white transition-all">
                    <AvatarImage src={profile?.avatar_url || undefined} alt={fullName || "Perfil"} className="object-cover" />
                    <AvatarFallback className="bg-[#e50914] text-white text-sm font-semibold rounded-md">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                )}
              </button>

              <div className="min-w-0 flex-1 overflow-hidden">
                <p className="text-base font-semibold text-white truncate leading-tight">
                  {fullName || "Menu"}
                </p>
                {user?.email && (
                  <p className="text-[11px] text-white/55 truncate leading-tight mt-0.5">
                    {user.email}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={close}
                className="text-white/70 hover:text-white p-1.5 rounded-md transition-colors"
                aria-label="Fechar menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* ── BUSCA ─────────────────────────────────────────────── */}
          <div className="shrink-0 px-4 pt-3 pb-2">
            <div className="flex items-center gap-2 bg-[#1a1a1a] border border-white/20 rounded px-3 h-10">
              <Search className="w-4 h-4 text-white/50 shrink-0" />
              <input
                type="text"
                placeholder="Buscar títulos..."
                value={navSearchQuery}
                onChange={(e) => setNavSearchQuery(e.target.value)}
                className="bg-transparent text-white text-sm placeholder-white/30 outline-none flex-1 h-full"
              />
              {navSearchQuery && (
                <button
                  type="button"
                  onClick={() => setNavSearchQuery("")}
                  className="text-white/50 hover:text-white"
                  aria-label="Limpar busca"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* ── BODY: resultados de busca OU navegação ─────────────── */}
          <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-3">
            {navSearchQuery.trim().length >= 2 ? (
              // ── Resultados de busca inline ──
              <div className="px-2 pt-1">
                {navSearchResults.length === 0 ? (
                  <p className="text-white/40 text-xs py-6 text-center">
                    Nenhum resultado para "{navSearchQuery}"
                  </p>
                ) : (
                  <div className="space-y-1">
                    {navSearchResults.map((title) => {
                      const eps = allEpisodesData?.byTitle?.[title.id] ?? [];
                      const seasonMap = allEpisodesData?.seasonMap ?? {};
                      const q = navSearchQuery.trim().toLowerCase();
                      const matchingEps =
                        q.length >= 2
                          ? eps
                              .filter(
                                (ep) =>
                                  ep.title?.toLowerCase().includes(q) ||
                                  ep.description?.toLowerCase().includes(q),
                              )
                              .slice(0, 3)
                          : [];
                      return (
                        <div
                          key={title.id}
                          className="border-b border-white/[0.04] last:border-b-0 pb-1"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              close();
                              setNavSearchQuery("");
                              navigate(`/domiflix/${slugify(title.title)}`);
                            }}
                            className="w-full flex items-center gap-3 p-2 rounded hover:bg-white/[0.06] transition-colors text-left"
                          >
                            <div className="w-16 h-9 rounded overflow-hidden bg-[#252525] shrink-0">
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
                              <p className="text-white text-sm font-medium line-clamp-1">
                                {title.title}
                              </p>
                              {title.description && (
                                <p className="text-white/45 text-xs line-clamp-1">
                                  {title.description}
                                </p>
                              )}
                            </div>
                          </button>

                          {matchingEps.length > 0 && (
                            <div className="bg-black/30 pb-1">
                              {matchingEps.map((ep) => {
                                const info = seasonMap[ep.id];
                                const label = info
                                  ? `T${info.seasonNumber}·E${info.episodeInSeason}`
                                  : null;
                                const idx = eps.findIndex((e) => e.id === ep.id);
                                const epNumber = idx >= 0 ? idx + 1 : 1;
                                return (
                                  <button
                                    key={ep.id}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      close();
                                      setNavSearchQuery("");
                                      navigate(
                                        `/domiflix/assistir/${slugify(title.title)}/${epNumber}`,
                                      );
                                    }}
                                    className="w-full text-left flex items-center gap-2 pl-12 pr-3 py-1.5 hover:bg-white/[0.05] transition-colors group"
                                  >
                                    <Play className="w-3 h-3 text-white/35 group-hover:text-white shrink-0 fill-current" />
                                    {label && (
                                      <span className="text-[10px] font-semibold text-white/40 shrink-0 w-10">
                                        {label}
                                      </span>
                                    )}
                                    <span className="text-xs text-white/75 truncate flex-1">
                                      {ep.title}
                                    </span>
                                    <ChevronRight className="w-3 h-3 text-white/25 group-hover:text-white/60 shrink-0" />
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              // ── Lista de navegação ──
              <nav className="flex flex-col gap-0.5 pt-2 px-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const active = item.isActive();
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      end={item.path === "/domiflix"}
                      onClick={close}
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-base font-medium transition-colors",
                        active
                          ? "bg-[#e50914] text-white"
                          : "text-white/75 hover:bg-white/[0.06] hover:text-white",
                      )}
                      aria-current={active ? "page" : undefined}
                    >
                      <Icon
                        className={cn("h-5 w-5 shrink-0", active && "scale-110")}
                        strokeWidth={active ? 2.5 : 2}
                        fill={
                          active && item.icon === Bookmark ? "currentColor" : "none"
                        }
                      />
                      <span>{item.label}</span>
                    </NavLink>
                  );
                })}

                {/* Divisor */}
                <div className="my-2 border-t border-white/10" />

                {/* CTA: Voltar ao sistema */}
                <button
                  type="button"
                  onClick={handleBackToSystem}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold",
                    "bg-[#e50914] text-white hover:bg-[#c11118] transition-colors",
                  )}
                >
                  <ArrowLeft className="w-4 h-4" />
                  Voltar ao sistema
                </button>
              </nav>
            )}
          </div>

          {/* ── FOOTER: institucional centralizado ───────────────── */}
          <div className="shrink-0 border-t border-white/10 px-4 pt-4 pb-[max(env(safe-area-inset-bottom),1rem)]">
            <div className="flex flex-col items-center gap-2">
              {/* Logo Domiflix maior, centralizado */}
              <Link
                to="/domiflix"
                onClick={close}
                className="block shrink-0"
                aria-label="Domiflix"
              >
                <img
                  src={logoWhite}
                  alt="Domiflix"
                  className="h-10 object-contain select-none"
                />
              </Link>

              {/* Versão + Desenvolvido por Auctus */}
              <div className="flex items-center gap-1.5 text-[11px] text-white/55">
                <Link
                  to="/changelog"
                  onClick={close}
                  className="font-bold transition-colors hover:text-white"
                >
                  Dominex v{APP_VERSION}
                </Link>
                <span>•</span>
                <span>
                  Desenvolvido por{" "}
                  <a
                    href="https://auctustech.com.br"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold transition-colors hover:text-white"
                  >
                    Auctus
                  </a>
                </span>
              </div>

              {/* Copyright */}
              <span className="text-[10px] text-white/30 text-center">
                Copyright © {new Date().getFullYear()} | Todos os Direitos Reservados
              </span>
            </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
