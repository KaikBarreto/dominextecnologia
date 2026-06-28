import { Link } from 'react-router-dom';
import { Sun, Moon, ArrowLeft } from 'lucide-react';
import logoVerde from '@/assets/logo-horizontal-verde.png';
import logoPreto from '@/assets/logo-black-horizontal.png';
import type { BlogTheme } from './useBlogTheme';

/**
 * Cabeçalho PRÓPRIO do blog (não usa o LandingNavbar, que é dark/compartilhado).
 *
 * Limpo, estilo blog: logo Dominex à esquerda (volta pro site) e, à direita, o
 * toggle de tema (Sol/Lua) que alterna claro/escuro e persiste — pedido do CEO.
 * Claro é o padrão; tudo é escrito em estilo CLARO + variantes `dark:`. A logo
 * verde tem o wordmark BRANCO (some no claro) → no claro usamos a versão preta.
 */
export default function BlogNavbar({
  theme,
  onToggleTheme,
}: {
  theme: BlogTheme;
  onToggleTheme: () => void;
}) {
  const isDark = theme === 'dark';
  return (
    <header className="sticky top-0 z-50 border-b border-neutral-200 bg-white/85 backdrop-blur-xl dark:border-white/10 dark:bg-[hsl(0,0%,5%)]/85">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo — volta pro site */}
        <Link to="/" className="flex items-center gap-2" aria-label="Voltar ao site Dominex">
          <img
            src={isDark ? logoVerde : logoPreto}
            alt="Dominex"
            className="h-9 w-auto"
          />
        </Link>

        <div className="flex items-center gap-2 sm:gap-4">
          {/* Voltar ao site (some no mobile pra manter limpo; logo já leva pra home) */}
          <Link
            to="/"
            className="hidden items-center gap-1.5 text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-900 sm:inline-flex dark:text-white/60 dark:hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar ao site
          </Link>

          {/* Toggle de tema (Sol/Lua) */}
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={isDark ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
            title={isDark ? 'Tema claro' : 'Tema escuro'}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-white/15 dark:bg-white/[0.04] dark:text-white/80 dark:hover:bg-white/10"
          >
            {isDark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
          </button>
        </div>
      </div>
    </header>
  );
}
