import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallBanner() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem('pwa-install-dismissed');
    if (dismissed) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!prompt) return;
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') setShow(false);
  };

  const handleDismiss = () => {
    localStorage.setItem('pwa-install-dismissed', 'true');
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 z-[90] md:left-auto md:right-6 md:bottom-6 md:w-80">
      <div className="rounded-xl border bg-card p-4 shadow-lg">
        <div className="flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Download className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm text-foreground">Instalar Dominex</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Adicione à tela inicial para acesso rápido, mesmo offline.
            </p>
            <div className="flex gap-2 mt-3">
              <Button size="sm" onClick={handleInstall} className="h-7 text-xs">
                Instalar
              </Button>
              <Button size="sm" variant="ghost" onClick={handleDismiss} className="h-7 text-xs">
                Agora não
              </Button>
            </div>
          </div>
          <button onClick={handleDismiss} className="self-start text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
