import { useEffect, useState } from 'react';
import { type LogoInk, cachedLogoInk, detectLogoInk } from '@/utils/logoInk';

/**
 * Diz se o logo do tenant é de tinta escura ou clara, pra quem desenha o logo
 * decidir se precisa de uma placa clara atrás (menu escuro, topo no tema
 * escuro, prévia das Configurações).
 *
 * Devolve `null` enquanto mede e também quando não dá pra medir (rede, CORS):
 * nesse caso quem chama mantém o visual atual. Nunca derruba a tela por causa
 * de um logo.
 */
export function useLogoInk(url?: string | null): LogoInk | null {
  const [ink, setInk] = useState<LogoInk | null>(() => (url ? cachedLogoInk(url) ?? null : null));

  useEffect(() => {
    if (!url) {
      setInk(null);
      return;
    }
    const known = cachedLogoInk(url);
    if (known !== undefined) {
      setInk(known);
      return;
    }
    let active = true;
    detectLogoInk(url).then((result) => {
      if (active) setInk(result);
    });
    return () => {
      active = false;
    };
  }, [url]);

  return ink;
}
