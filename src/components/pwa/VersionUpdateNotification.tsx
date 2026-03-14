import { useEffect, useRef } from 'react';
import { useVersionUpdate } from '@/hooks/useVersionUpdate';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Sparkles, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

export const VersionUpdateNotification = () => {
  const { showUpdateNotification, currentVersion, dismissNotification } = useVersionUpdate();
  const navigate = useNavigate();
  const hasShownToast = useRef(false);

  useEffect(() => {
    if (showUpdateNotification && !hasShownToast.current) {
      hasShownToast.current = true;
      
      toast.custom((t) => (
        <Alert className="border-primary shadow-lg">
          <Sparkles className="h-4 w-4 text-primary" />
          <AlertTitle className="font-bold flex items-center gap-2">
            Sistema Atualizado! <Sparkles className="h-4 w-4 text-primary" />
          </AlertTitle>
          <AlertDescription className="mt-2">
            <p className="mb-3">
              O Dominex foi atualizado para a versão {currentVersion}.
              Confira as novidades e melhorias!
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => {
                  navigate('/changelog');
                  toast.dismiss(t);
                  dismissNotification();
                }}
              >
                Ver Novidades
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="hover:bg-destructive hover:text-destructive-foreground hover:border-destructive"
                onClick={() => {
                  toast.dismiss(t);
                  dismissNotification();
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ), {
        duration: 10000,
        position: 'top-center',
      });
    }
  }, [showUpdateNotification, currentVersion, dismissNotification, navigate]);

  return null;
};
