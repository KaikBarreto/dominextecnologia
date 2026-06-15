import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Loader2, Copy, RefreshCw, Clock, KeyRound } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AdminLoginTokenModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Duração da época do token, em segundos (espelha EPOCH_DURATION_MS da edge function).
const EPOCH_SECONDS = 30 * 60;

/**
 * Modal do "Token de Acesso" do painel master Auctus.
 *
 * Mostra o token global rotativo (HMAC, troca a cada 30 min) gerado pela edge
 * function admin-token-login (action 'generate', gateada por has_role
 * 'super_admin' server-side). O super_admin copia o token e usa como senha em
 * /auth pra entrar como qualquer usuário sem derrubar as sessões reais dele.
 */
export function AdminLoginTokenModal({ open, onOpenChange }: AdminLoginTokenModalProps) {
  const { toast } = useToast();
  const [token, setToken] = useState<string | null>(null);
  const [expiresIn, setExpiresIn] = useState<number>(0);
  const [isGenerating, setIsGenerating] = useState(false);

  // Gera o token global (pede a sessão atual e manda o Bearer pro generate).
  const generateToken = useCallback(async () => {
    setIsGenerating(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData?.session) {
        toast({ variant: 'destructive', title: 'Sessão expirada', description: 'Faça login novamente.' });
        return;
      }

      const { data, error } = await supabase.functions.invoke('admin-token-login', {
        body: { action: 'generate' },
        headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
      });

      if (error) throw error;

      if (data?.token) {
        setToken(data.token);
        setExpiresIn(data.expiresIn || 1800); // fallback 30 min
      }
    } catch (error: any) {
      console.error('Erro ao gerar token:', error);
      toast({
        variant: 'destructive',
        title: 'Erro ao gerar token',
        description: error?.message || 'Tente novamente.',
      });
    } finally {
      setIsGenerating(false);
    }
  }, [toast]);

  // Gera ao abrir; limpa o estado ao fechar.
  useEffect(() => {
    if (open) {
      generateToken();
    } else {
      setToken(null);
      setExpiresIn(0);
    }
  }, [open, generateToken]);

  // Countdown regressivo; ao zerar, regenera automaticamente.
  useEffect(() => {
    if (!open || expiresIn <= 0) return;
    const interval = setInterval(() => {
      setExpiresIn((prev) => {
        if (prev <= 1) {
          generateToken();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [open, expiresIn, generateToken]);

  const formatTimeRemaining = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Cor do countdown: verde > 50% (>15min), laranja 20-50%, vermelho < 20% (<6min).
  // Base de 1800s (30 min). Usa tokens semânticos do projeto.
  const countdownColor =
    expiresIn > EPOCH_SECONDS * 0.5
      ? 'text-success'
      : expiresIn > EPOCH_SECONDS * 0.2
        ? 'text-warning'
        : 'text-destructive';

  const handleCopyToken = async () => {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      toast({ title: 'Token copiado!' });
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao copiar token' });
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Token de Acesso"
      className="sm:max-w-md"
    >
      <div className="space-y-4">
        {/* Display do token */}
        <div className="p-4 rounded-lg bg-muted border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">Token atual</span>
            <div className="flex items-center gap-1.5">
              <Clock className={cn('h-4 w-4', countdownColor)} />
              <span className={cn('text-sm font-mono tabular-nums', countdownColor)}>
                {formatTimeRemaining(expiresIn)}
              </span>
            </div>
          </div>

          <div className="p-4 rounded-md bg-background border font-mono text-3xl tracking-[0.3em] text-center font-bold select-all min-h-[64px] flex items-center justify-center">
            {isGenerating ? (
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            ) : (
              token || '--------'
            )}
          </div>

          <div className="flex gap-2 mt-3">
            <Button className="flex-1" onClick={handleCopyToken} disabled={!token || isGenerating}>
              <Copy className="h-4 w-4 mr-2" />
              Copiar Token
            </Button>
            <Button variant="outline" size="icon" onClick={generateToken} disabled={isGenerating} aria-label="Atualizar token">
              <RefreshCw className={cn('h-4 w-4', isGenerating && 'animate-spin')} />
            </Button>
          </div>
        </div>

        {/* Instruções */}
        <div className="space-y-3">
          <div className="p-3 rounded-lg bg-muted/50 border">
            <p className="text-sm font-medium mb-1">Como usar</p>
            <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
              <li>Copie o token acima.</li>
              <li>Abra a tela de login em outra aba.</li>
              <li>Digite o email do usuário desejado.</li>
              <li>Use o token no lugar da senha.</li>
            </ol>
          </div>

          <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/30">
            <KeyRound className="h-4 w-4 text-warning mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">
              O token expira a cada <strong>30 minutos</strong> e funciona como senha para qualquer
              usuário. Todos os acessos ficam registrados para auditoria.
            </p>
          </div>
        </div>
      </div>
    </ResponsiveModal>
  );
}
