import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import { useLocation } from 'react-router-dom';

/**
 * Rotas públicas (marketing / autenticação / portais públicos) onde o aviso de
 * offline NÃO faz sentido. O PWA offline é contrato apenas no app autenticado e
 * no app do técnico em campo (/os-tecnico) — esses NÃO entram nesta lista.
 */
const PUBLIC_PATHS_EXACT = new Set([
  '/',
  '/login',
  '/auth',
  '/cadastro',
  '/reset-password',
  '/checkout',
]);

const PUBLIC_PATH_PREFIXES = [
  '/orcamento/',
  '/proposta/',
  '/portal/',
  '/contrato/unidade/',
  '/pmoc/unidade/',
];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS_EXACT.has(pathname)) return true;
  return PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const { pathname } = useLocation();

  useEffect(() => {
    const goOnline = () => {
      setIsOnline(true);
      toast.success('Conexão restaurada');
    };
    const goOffline = () => setIsOnline(false);

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  if (isOnline) return null;
  // Suprime o aviso nas rotas públicas (landing/marketing/auth/portais públicos).
  if (isPublicPath(pathname)) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-center gap-2 bg-destructive px-4 py-2 text-destructive-foreground text-xs">
      <WifiOff className="h-3.5 w-3.5" />
      <span>Você está offline — alterações serão sincronizadas quando reconectar</span>
    </div>
  );
}
