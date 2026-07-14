import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { APP_VERSION } from '@/config/version';
import { clearCachesAndReload } from '@/lib/pwa';
import { useLocale } from '@/lib/i18n';
import { toast } from 'sonner';
import { useState } from 'react';

interface SystemFooterProps {
  variant?: 'light' | 'dark';
}

export function SystemFooter({ variant = 'light' }: SystemFooterProps) {
  const [refreshing, setRefreshing] = useState(false);
  // i18n-aware: sob /en, /es, /fr (login/cadastro) traduz; nas rotas do app
  // (sem prefixo) cai no pt-br, que é o idioma do app hoje. "Dominex vX" e
  // "Auctus" (marca/versão) NÃO traduzem.
  const { messages } = useLocale();
  const t = messages.systemFooter;
  const textClass = variant === 'dark' ? 'text-white/40' : 'text-muted-foreground';
  const linkClass = variant === 'dark'
    ? 'font-bold text-white/70 hover:text-white transition-colors'
    : 'font-bold text-foreground hover:text-foreground/80 transition-colors';
  const iconClass = variant === 'dark'
    ? 'text-white/40 hover:text-white/70'
    : 'text-muted-foreground hover:text-foreground';

  const handleRefresh = async () => {
    setRefreshing(true);
    toast.info(t.refreshing);
    await clearCachesAndReload();
  };

  return (
    <div className={`text-center text-[10px] ${textClass} space-y-0.5`}>
      <p className="flex items-center justify-center gap-1.5">
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className={`inline-flex items-center transition-colors ${iconClass}`}
          title={t.refreshTitle}
        >
          <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
        <Link to="/changelog" className={linkClass}>
          Dominex v{APP_VERSION}
        </Link>
        {` · ${t.developedBy} `}
        <a
          href="https://auctustech.com.br"
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass}
        >
          Auctus
        </a>
      </p>
      <p>Copyright © {new Date().getFullYear()} | {t.rights}</p>
    </div>
  );
}
