import { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function UpdateBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const handler = () => setShow(true);
    window.addEventListener('pwa-update-available', handler);
    return () => window.removeEventListener('pwa-update-available', handler);
  }, []);

  const handleUpdate = () => {
    navigator.serviceWorker.ready.then((reg) => {
      reg.waiting?.postMessage({ type: 'SKIP_WAITING' });
      window.location.reload();
    });
  };

  if (!show) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-between gap-3 bg-primary px-4 py-2.5 text-primary-foreground text-sm">
      <div className="flex items-center gap-2">
        <RefreshCw className="h-4 w-4" />
        <span>Nova versão disponível</span>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" onClick={handleUpdate} className="h-7 text-xs">
          Atualizar agora
        </Button>
        <button onClick={() => setShow(false)} className="opacity-70 hover:opacity-100">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
