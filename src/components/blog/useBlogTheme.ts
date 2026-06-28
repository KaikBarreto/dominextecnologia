import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Tema PRÓPRIO do blog.
 *
 * O blog é CLARO por padrão (legibilidade em leitura longa); o usuário pode
 * alternar pro dark pelo toggle do BlogNavbar. A escolha persiste em
 * localStorage (`blog-theme`).
 *
 * A app inteira usa Tailwind dark mode por CLASSE (`.dark`) no <html>. O
 * `index.html` adiciona `.dark` no <html> via script de tema — e o Tailwind
 * dispara `dark:` quando QUALQUER ancestral tem `.dark`. Por isso escopar `dark`
 * num container interno do blog NÃO funciona: o `<html>.dark` mantém todas as
 * variantes `dark:` ligadas e o "light" nunca aparece.
 *
 * Correção: este hook CONTROLA a classe `.dark` no <html> enquanto o blog está
 * montado — remove em light, adiciona em dark — e RESTAURA o estado original do
 * <html> ao desmontar, pra não vazar o tema do blog pro resto do site.
 *
 * Anti-flash: a aplicação no <html> acontece num useLayoutEffect (síncrono, antes
 * do paint) já no 1º mount, com o tema lido cedo do localStorage (default claro).
 */
export type BlogTheme = 'light' | 'dark';

const STORAGE_KEY = 'blog-theme';

function readInitialTheme(): BlogTheme {
  if (typeof window === 'undefined') return 'light';
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    /* localStorage indisponível (privado/SSR) → cai no default claro */
  }
  return 'light';
}

// useLayoutEffect só roda no client; no SSR cai pra useEffect pra evitar warning.
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export function useBlogTheme() {
  const [theme, setTheme] = useState<BlogTheme>(readInitialTheme);
  // Guarda se o <html> já tinha `.dark` ANTES de o blog montar, pra restaurar no unmount.
  const hadDarkOnHtmlRef = useRef<boolean | null>(null);

  // Aplica/remove `.dark` no <html> conforme o tema do blog. Restaura no unmount.
  useIsomorphicLayoutEffect(() => {
    if (typeof document === 'undefined') return;
    const html = document.documentElement;

    // Captura o estado original do <html> só uma vez (no mount).
    if (hadDarkOnHtmlRef.current === null) {
      hadDarkOnHtmlRef.current = html.classList.contains('dark');
    }

    if (theme === 'dark') {
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
    }

    return () => {
      // Cleanup roda a cada mudança de tema E no unmount. Só restaura de fato no
      // unmount real do componente — mas como o effect re-aplica logo em seguida
      // quando é só troca de tema, restaurar aqui é seguro: o próximo run corrige.
      if (hadDarkOnHtmlRef.current) {
        html.classList.add('dark');
      } else {
        html.classList.remove('dark');
      }
    };
  }, [theme]);

  // Persiste a escolha.
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* ignora falha de persistência */
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  return { theme, toggleTheme, setTheme, isDark: theme === 'dark' };
}
