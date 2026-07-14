import { Link } from 'react-router-dom';
import { Sun, Moon, ArrowLeft } from 'lucide-react';
import logoVerde from '@/assets/logo-horizontal-verde.png';
import logoPreto from '@/assets/logo-black-horizontal.png';
import type { BlogTheme } from './useBlogTheme';
import LanguageSelector from '@/components/i18n/LanguageSelector';
import { useLocale } from '@/lib/i18n';
import { localizeInternal } from '@/lib/i18n/localizeInternal';

/**
 * Cabeçalho PRÓPRIO do blog (não usa o LandingNavbar, que é dark/compartilhado).
 *
 * Layout em 3 zonas (pedido do CEO):
 *   - ESQUERDA: "Voltar ao site" (no mobile vira só a seta pra economizar espaço);
 *   - CENTRO: logo Dominex CENTRALIZADO de verdade via `absolute` no eixo, então a
 *     centralização não depende da largura das laterais; clicável → volta pra home;
 *   - DIREITA: seletor de idioma (com bandeiras) + toggle de tema (Sol/Lua).
 *
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
  const { locale } = useLocale();
  return (
    <header className="sticky top-0 z-50 border-b border-neutral-200 bg-white/85 backdrop-blur-xl dark:border-white/10 dark:bg-[hsl(0,0%,5%)]/85">
      <div className="relative mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* ESQUERDA — Voltar ao site (mobile: só a seta) */}
        <Link
          to={localizeInternal('/', locale)}
          aria-label="Voltar ao site"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-900 dark:text-white/60 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline">Voltar ao site</span>
        </Link>

        {/* CENTRO — logo centralizado de verdade (absolute), clicável → home */}
        <Link
          to={localizeInternal('/', locale)}
          aria-label="Página inicial Dominex"
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        >
          <img
            src={isDark ? logoVerde : logoPreto}
            alt="Dominex"
            className="h-9 w-auto"
          />
        </Link>

        {/* DIREITA — seletor de idioma (com bandeiras) + toggle de tema (Sol/Lua).
            Site público: verde fixo da marca, nunca white-label.
            No mobile o seletor esconde o label de texto (só bandeira + código). */}
        <div className="flex items-center gap-2">
          <LanguageSelector surface={isDark ? 'dark' : 'light'} className="max-sm:[&>span]:hidden" />
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={isDark ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
            title={isDark ? 'Tema claro' : 'Tema escuro'}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-neutral-200 bg-white text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-white/15 dark:bg-white/[0.04] dark:text-white/80 dark:hover:bg-white/10"
          >
            {isDark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
          </button>
        </div>
      </div>
    </header>
  );
}
