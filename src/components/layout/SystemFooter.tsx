import { Link } from 'react-router-dom';
import { APP_VERSION } from '@/config/version';

interface SystemFooterProps {
  variant?: 'light' | 'dark';
}

export function SystemFooter({ variant = 'light' }: SystemFooterProps) {
  const textClass = variant === 'dark' ? 'text-white/40' : 'text-muted-foreground';
  const linkClass = 'font-semibold text-primary hover:text-primary/80 transition-colors';

  return (
    <div className={`text-center text-[10px] ${textClass} space-y-0.5`}>
      <p>
        <Link
          to="/changelog"
          className="font-bold hover:text-foreground transition-colors"
        >
          Sistema v{APP_VERSION}
        </Link>
        {' · Desenvolvido por '}
        <a
          href="https://auctustech.com.br"
          target="_blank"
          rel="noopener noreferrer"
          className={linkClass}
        >
          Auctus
        </a>
      </p>
      <p>Copyright © {new Date().getFullYear()} | Todos os Direitos Reservados</p>
    </div>
  );
}
