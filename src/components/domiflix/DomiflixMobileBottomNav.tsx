import { Link, useLocation, useSearchParams } from "react-router-dom";
import { Home, Layers, Radio, Bookmark, Menu } from "lucide-react";
import { cn } from "@/lib/utils";

interface SideNavItem {
  to: string;
  label: string;
  icon: typeof Home;
  /**
   * Função custom de "ativo" — necessária porque `/domiflix`,
   * `/domiflix?tipo=modulos` e `/domiflix?tipo=lives` compartilham o mesmo
   * `pathname`, então o NavLink default acharia que estão todos ativos
   * ao mesmo tempo.
   */
  isActive: (pathname: string, tipoParam: string | null) => boolean;
}

// Itens laterais à esquerda do botão central "Início"
const LEFT_ITEMS: SideNavItem[] = [
  {
    to: "/domiflix?tipo=modulos",
    label: "Módulos",
    icon: Layers,
    isActive: (pathname, tipo) => pathname === "/domiflix" && tipo === "modulos",
  },
  {
    to: "/domiflix?tipo=lives",
    label: "Lives",
    icon: Radio,
    isActive: (pathname, tipo) => pathname === "/domiflix" && tipo === "lives",
  },
];

// Itens laterais à direita do botão central
const RIGHT_ITEMS: SideNavItem[] = [
  {
    to: "/domiflix/minha-lista",
    label: "Minha Lista",
    icon: Bookmark,
    isActive: (pathname) =>
      pathname === "/domiflix/minha-lista" ||
      pathname.startsWith("/domiflix/minha-lista/"),
  },
];

// Botão central destacado — "Início" da Domiflix (espelha o estilo do "+"
// do MobileBottomNav global: círculo grande, cor saturada, sombra colorida).
const CENTER_HOME = {
  to: "/domiflix",
  label: "Início",
  isActive: (pathname: string, tipo: string | null) =>
    pathname === "/domiflix" && !tipo,
};

/**
 * Bottom navigation próprio da Domiflix (mobile only).
 *
 * Substitui o `<MobileBottomNav />` global (que tem cor verde Dominex e
 * itens do sistema principal — Caixa, Estoque, etc.) dentro do
 * `DomiflixLayout`. Mantém imersão Netflix-like: fundo preto sólido,
 * accent vermelho `#e50914`, ícones cinza no estado inativo.
 *
 * Layout (5 slots): Módulos | Lives | (●) Início | Minha Lista | Menu
 *  - Botão "Início" central destacado: círculo vermelho com ícone branco,
 *    elevado acima da barra (visual idêntico ao "+" do MobileBottomNav global).
 *  - "Menu" abre o drawer hambúrguer Domiflix (mesmo state `mobileMenuOpen`
 *    do `DomiflixLayout`, via callback `onOpenDrawer`).
 *
 * Não aparece no player (`/domiflix/assistir/...`) porque essa rota fica fora
 * do layout.
 */
interface DomiflixMobileBottomNavProps {
  /** Abre o drawer hambúrguer (state `mobileMenuOpen` do DomiflixLayout). */
  onOpenDrawer: () => void;
}

export function DomiflixMobileBottomNav({
  onOpenDrawer,
}: DomiflixMobileBottomNavProps) {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const tipoParam = searchParams.get("tipo");

  const homeActive = CENTER_HOME.isActive(location.pathname, tipoParam);

  // Estilo unificado pros itens laterais (Módulos, Lives, Minha Lista).
  // Botão "Menu" reusa o mesmo visual.
  const renderSideItem = (item: SideNavItem) => {
    const active = item.isActive(location.pathname, tipoParam);
    const Icon = item.icon;
    return (
      <li key={item.to} className="flex-1">
        <Link
          to={item.to}
          className={cn(
            "flex flex-col items-center justify-center gap-1 h-full w-full",
            "transition-colors duration-200 select-none",
            "min-h-[44px]", // a11y tap target
            active
              ? "text-[#e50914]"
              : "text-white/55 hover:text-white active:text-white",
          )}
          aria-current={active ? "page" : undefined}
        >
          <Icon
            className={cn(
              "w-5 h-5 transition-transform duration-200",
              active && "scale-110",
            )}
            strokeWidth={active ? 2.5 : 2}
            // Bookmark fica mais legível "preenchido" quando ativo
            fill={active && item.icon === Bookmark ? "currentColor" : "none"}
          />
          <span
            className={cn(
              "text-[11px] leading-none",
              active ? "font-semibold" : "font-medium",
            )}
          >
            {item.label}
          </span>
        </Link>
      </li>
    );
  };

  return (
    <nav
      className={cn(
        "lg:hidden fixed bottom-0 left-0 right-0 z-40",
        "bg-[#141414]/95 backdrop-blur",
        "border-t border-white/10",
        // Safe-area iOS (notch inferior)
        "pb-[env(safe-area-inset-bottom,0px)]",
      )}
      aria-label="Navegação Domiflix"
    >
      <ul className="flex justify-around items-stretch h-16 px-1">
        {/* Esquerda: Módulos, Lives */}
        {LEFT_ITEMS.map(renderSideItem)}

        {/* Centro: Início (botão destacado, redondo, vermelho) */}
        <li className="flex-1 flex items-start justify-center">
          <Link
            to={CENTER_HOME.to}
            className={cn(
              "relative flex items-center justify-center",
              "w-14 h-14 rounded-full",
              "bg-[#e50914] text-white",
              "transition-all duration-200 active:scale-90",
              // Eleva acima da barra (estilo "+" do MobileBottomNav global)
              "-translate-y-3",
              // Glow vermelho: padrão suave, intensificado quando ativo (vibe Netflix)
              homeActive
                ? "shadow-xl shadow-[#e50914]/70"
                : "shadow-lg shadow-[#e50914]/40",
            )}
            aria-label="Início"
            aria-current={homeActive ? "page" : undefined}
          >
            <Home
              className={cn(
                "w-6 h-6 transition-transform duration-200",
                homeActive && "scale-110",
              )}
              strokeWidth={2.5}
            />
            <span className="sr-only">Início</span>
          </Link>
        </li>

        {/* Direita: Minha Lista */}
        {RIGHT_ITEMS.map(renderSideItem)}

        {/* Menu — abre drawer hambúrguer Domiflix (não é rota) */}
        <li className="flex-1">
          <button
            type="button"
            onClick={onOpenDrawer}
            className={cn(
              "flex flex-col items-center justify-center gap-1 h-full w-full",
              "transition-colors duration-200 select-none",
              "min-h-[44px]",
              "text-white/55 hover:text-white active:text-white",
            )}
            aria-label="Abrir menu"
          >
            <Menu className="w-5 h-5" strokeWidth={2} />
            <span className="text-[11px] leading-none font-medium">Menu</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
