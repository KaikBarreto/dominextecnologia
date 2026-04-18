import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

const STORAGE_KEY = 'cookie_consent';

export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem(STORAGE_KEY);
    if (!consent) setVisible(true);
  }, []);

  const accept = (level: 'essential' | 'all') => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ level, accepted_at: new Date().toISOString() }));
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border shadow-lg p-4">
      <div className="mx-auto max-w-5xl flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="flex-1 text-sm text-muted-foreground">
          <p>
            Utilizamos cookies essenciais para o funcionamento da plataforma (autenticação e preferências).
            Não utilizamos cookies de rastreamento ou publicidade.{' '}
            <Link to="/privacidade#cookies" className="text-primary underline">Saiba mais</Link>.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button size="sm" variant="outline" onClick={() => accept('essential')}>
            Aceitar essenciais
          </Button>
          <Button size="sm" onClick={() => accept('all')}>
            Aceitar todos
          </Button>
        </div>
      </div>
    </div>
  );
}
