import { useEffect, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { appScreenKey } from '@/lib/i18n/appRouteSlugs';

export function AppRouteTransition({ ownerKey, children }: { ownerKey: string; children: ReactNode }) {
  const location = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    document.querySelectorAll('main, [data-scroll-container]').forEach(element => {
      (element as HTMLElement).scrollTop = 0;
    });
  }, [location.pathname, ownerKey]);

  // Ficha e lista pertencem à mesma tela. Empresa/usuário diferentes sempre
  // descartam o estado transitório; breakpoint e estilo de menu não o descartam.
  // A transição `animate-in fade-in` podia permanecer no frame inicial
  // (opacity: 0) no Safari/WebKit após reload ou HMR, deixando a rota inteira
  // invisível apesar de o conteúdo já estar montado e acessível. A troca de
  // tela continua instantânea e previsível, sem arriscar ocultar o conteúdo.
  return <div key={`${ownerKey}:${appScreenKey(location.pathname)}`} className="min-w-0 max-w-full">{children}</div>;
}
