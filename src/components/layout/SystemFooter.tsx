import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { APP_VERSION } from '@/config/version';
import { clearCachesAndReload } from '@/lib/pwa';
import { useLocale, MESSAGES } from '@/lib/i18n';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { toast } from 'sonner';
import { useState } from 'react';

interface SystemFooterProps {
  variant?: 'light' | 'dark';
}

export function SystemFooter({ variant = 'light' }: SystemFooterProps) {
  const [refreshing, setRefreshing] = useState(false);
  // Site público roda sob /en, /es, /fr → urlLocale reflete a URL.
  // App logado roda sem prefixo → urlLocale === 'pt-br'; usa o idioma REAL do app.
  // "Dominex vX" e "Auctus" (marca/versão) NÃO traduzem.
  const { locale: urlLocale } = useLocale();
  const { locale: appLocale } = useAppLocaleContext();
  const locale = urlLocale !== 'pt-br' ? urlLocale : appLocale;
  const t = MESSAGES[locale].systemFooter;
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
