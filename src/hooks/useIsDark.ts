import { useEffect, useState } from 'react';

/**
 * Detecta se o tema escuro está ativo lendo a classe `dark` no `<html>`.
 *
 * O app NÃO usa ThemeProvider/next-themes — `useTheme()` retorna sempre
 * undefined. O dark mode é aplicado via `document.documentElement.classList`,
 * então a única fonte da verdade é a classe no `<html>`. Observamos mudanças
 * com um MutationObserver pra reagir quando o usuário troca de tema.
 */
export function useIsDark(): boolean {
  const [isDark, setIsDark] = useState<boolean>(() =>
    typeof document !== 'undefined'
      ? document.documentElement.classList.contains('dark')
      : false
  );

  useEffect(() => {
    const root = document.documentElement;
    const update = () => setIsDark(root.classList.contains('dark'));

    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });

    return () => observer.disconnect();
  }, []);

  return isDark;
}
