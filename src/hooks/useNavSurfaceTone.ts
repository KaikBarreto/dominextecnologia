import { useEffect, useState } from 'react';
import type { LogoSurfaceTone } from '@/utils/logoInk';

function readNavSurfaceTone(): LogoSurfaceTone {
  if (typeof document === 'undefined') return 'dark';
  const root = document.documentElement;
  return root.dataset.navTheme === 'dark' || root.classList.contains('dark')
    ? 'dark'
    : 'light';
}

/**
 * Tom efetivo da navegação. Observa tanto a preferência própria da nav quanto
 * o tema do app, inclusive quando outra tela altera os atributos na mesma aba.
 */
export function useNavSurfaceTone(): LogoSurfaceTone {
  const [tone, setTone] = useState<LogoSurfaceTone>(readNavSurfaceTone);

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setTone(readNavSurfaceTone());
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ['class', 'data-nav-theme'] });
    return () => observer.disconnect();
  }, []);

  return tone;
}
