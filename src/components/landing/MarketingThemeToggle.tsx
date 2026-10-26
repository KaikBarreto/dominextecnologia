import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

type MarketingTheme = 'light' | 'dark';

const STORAGE_KEY = 'dominex-marketing-theme';
const THEME_EVENT = 'dominex-marketing-theme-change';

function readTheme(): MarketingTheme {
  if (typeof window === 'undefined') return 'light';
  return window.localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
}

function applyTheme(theme: MarketingTheme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

export default function MarketingThemeToggle({
  variant = 'corner',
}: {
  variant?: 'corner' | 'compact';
}) {
  const [theme, setTheme] = useState<MarketingTheme>(readTheme);

  useEffect(() => {
    applyTheme(theme);

    const syncTheme = (event: Event) => {
      const next = (event as CustomEvent<MarketingTheme>).detail;
      setTheme(next);
      applyTheme(next);
    };
    window.addEventListener(THEME_EVENT, syncTheme);
    return () => window.removeEventListener(THEME_EVENT, syncTheme);
  }, [theme]);

  const toggle = () => {
    const next: MarketingTheme = theme === 'light' ? 'dark' : 'light';
    window.localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
    setTheme(next);
    window.dispatchEvent(new CustomEvent<MarketingTheme>(THEME_EVENT, { detail: next }));
  };

  const button = (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === 'light' ? 'Ativar tema escuro' : 'Ativar tema claro'}
      title={theme === 'light' ? 'Tema escuro' : 'Tema claro'}
      className={cn(
        'inline-flex items-center justify-center border-0 bg-transparent text-neutral-700 shadow-none transition-opacity',
        'hover:bg-transparent hover:text-neutral-950 hover:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        'dark:border-0 dark:bg-transparent dark:text-white/80 dark:hover:bg-transparent dark:hover:text-white',
        variant === 'compact' ? 'h-[30px] w-[32px]' : 'h-[30px] w-[34px]',
      )}
    >
      {theme === 'light' ? (
        <Moon className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <Sun className="h-3.5 w-3.5" aria-hidden="true" />
      )}
    </button>
  );

  if (variant === 'compact') return button;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="hidden items-center md:flex"
      style={{ position: 'fixed', top: 0, right: 112, height: 64, zIndex: 55 }}
    >
      {button}
    </div>,
    document.body,
  );
}
