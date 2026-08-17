import { useCallback, useEffect, useState } from 'react';

export type NavTheme = 'dark' | 'system';

const STORAGE_KEY = 'nav-theme-preference';
const NAV_ATTR = 'data-nav-theme';
const DEFAULT: NavTheme = 'dark';

/**
 * Aplica/remove o atributo `data-nav-theme="dark"` no <html>.
 * - `'dark'`   → seta o atributo → tokens escuros de NAV entram (index.css).
 * - `'system'` → remove o atributo → a nav volta a seguir o tema (claro/escuro).
 */
function applyNavTheme(value: NavTheme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (value === 'dark') root.setAttribute(NAV_ATTR, 'dark');
  else root.removeAttribute(NAV_ATTR);
}

function readStored(): NavTheme {
  if (typeof window === 'undefined') return DEFAULT;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === 'dark' || raw === 'system') return raw;
  } catch {
    /* localStorage indisponível (modo privado) → default */
  }
  return DEFAULT;
}

/**
 * Preferência do TEMA DO MENU (sidebar/topbar/mobile) — separada do tema do
 * sistema. Default `'dark'`: a nav é escura por padrão dentro do app. A opção
 * `'system'` faz a nav seguir o tema claro/escuro do app.
 *
 * Persistência: localStorage (chave `nav-theme-preference`). Sincroniza entre
 * abas via evento `storage`. Um script anti-flash inline no index.html já aplica
 * o atributo antes do 1º paint — este hook garante consistência em runtime.
 *
 * (Persistir em `profiles` fica pra follow-up — por ora só localStorage.)
 */
export function useNavThemePreference() {
  const [navTheme, setNavThemeState] = useState<NavTheme>(readStored);

  // Reaplica no mount (cobre navegação client-side onde o script inline não roda
  // de novo) e sempre que o valor muda.
  useEffect(() => {
    applyNavTheme(navTheme);
  }, [navTheme]);

  // Sincroniza entre abas: outra aba mudou a preferência → reflete aqui.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      const next = e.newValue === 'system' ? 'system' : 'dark';
      setNavThemeState(next);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setNavTheme = useCallback((value: NavTheme) => {
    setNavThemeState(value);
    applyNavTheme(value);
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch {
      /* ignora falha de persistência */
    }
  }, []);

  return { navTheme, setNavTheme, isDarkNav: navTheme === 'dark' };
}
