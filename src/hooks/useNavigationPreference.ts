import { useState, useEffect, useCallback } from 'react';

export type NavigationStyle = 'sidebar' | 'topbar';

const STORAGE_KEY = 'navigation-style';
const EVENT_NAME = 'navigation-style-changed';

function getStoredStyle(): NavigationStyle {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'sidebar' || stored === 'topbar') return stored;
  } catch {}
  return 'sidebar';
}

export function useNavigationPreference() {
  const [navigationStyle, setStyleState] = useState<NavigationStyle>(getStoredStyle);

  const setNavigationStyle = useCallback((style: NavigationStyle) => {
    try {
      localStorage.setItem(STORAGE_KEY, style);
    } catch {}
    setStyleState(style);
    window.dispatchEvent(new Event(EVENT_NAME));
  }, []);

  useEffect(() => {
    const handler = () => setStyleState(getStoredStyle());
    window.addEventListener(EVENT_NAME, handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener(EVENT_NAME, handler);
      window.removeEventListener('storage', handler);
    };
  }, []);

  return { navigationStyle, setNavigationStyle };
}
