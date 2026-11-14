import { useEffect, useMemo, useState } from 'react';
import { BellRing, Loader2, Share, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useToast } from '@/hooks/use-toast';
import { isInstalledPwa } from '@/lib/pwaStandalone';
import { OVERLAY_PRIORITY, useOverlaySlot } from '@/contexts/OverlayCoordinatorContext';

const INVITE_DELAY_MS = 1_800;
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1_000;

function isIosDevice() {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}

function snoozeKey(userId: string, companyId: string) {
  return `dominex:push-invite:snoozed-until:${companyId}:${userId}`;
}

function isSnoozed(key: string, now = Date.now()) {
  const value = Number(window.localStorage.getItem(key));
  return Number.isFinite(value) && value > now;
}

export function PushActivationInvite() {
  const { user, profile, isAdminUser } = useAuth();
  const push = usePushNotifications();
  const { toast } = useToast();
  const [visible, setVisible] = useState(false);
  const companyId = profile?.company_id ?? null;
  const storageKey = useMemo(
    () => user?.id && companyId ? snoozeKey(user.id, companyId) : null,
    [companyId, user?.id],
  );
  const iosNeedsInstall = isIosDevice() && !isInstalledPwa();
  const canInvitePush = push.support === 'supported' && push.state === 'available';
  const canInviteInstall = push.support === 'unsupported' && iosNeedsInstall;
  const isActiveOverlay = useOverlaySlot(visible, {
    id: 'push-activation-invite',
    priority: OVERLAY_PRIORITY.backgroundPrompt,
  });

  useEffect(() => {
    setVisible(false);
    if (
      !user?.id
      || !companyId
      || isAdminUser
      || push.isLoading
      || !storageKey
      || isSnoozed(storageKey)
      || (!canInvitePush && !canInviteInstall)
    ) return;

    const timer = window.setTimeout(() => setVisible(true), INVITE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [canInviteInstall, canInvitePush, companyId, isAdminUser, push.isLoading, storageKey, user?.id]);

  const snooze = () => {
    if (storageKey) window.localStorage.setItem(storageKey, String(Date.now() + SNOOZE_MS));
    setVisible(false);
  };

  const enable = async () => {
    try {
      await push.enable();
      setVisible(false);
      toast({
        title: 'Notificações ativadas',
        description: 'Este aparelho receberá os avisos escolhidos por você.',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Não foi possível ativar as notificações',
        description: error instanceof Error ? error.message : 'Confira sua conexão e tente novamente.',
      });
    }
  };

  if (!visible || !isActiveOverlay) return null;

  return (
    <aside
      aria-label="Convite para ativar notificações"
      className="fixed bottom-20 left-3 right-3 z-[80] sm:bottom-6 sm:left-auto sm:right-6 sm:w-[390px]"
    >
      <div className="overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-2xl">
        <div className="flex items-start gap-3 bg-foreground px-4 py-4 text-background">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-background/10">
            {canInviteInstall ? <Share className="h-5 w-5" /> : <BellRing className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              {canInviteInstall ? 'Instale para receber avisos' : 'Não perca nenhum aviso importante'}
            </p>
            <p className="mt-1 text-sm leading-relaxed opacity-75">
              {canInviteInstall
                ? 'No iPhone, toque em Compartilhar e depois em “Adicionar à Tela de Início”. Abra o Dominex instalado para ativar as notificações.'
                : 'Receba lembretes de agenda, pagamentos, chamados, teste e mensalidade, mesmo com o Dominex fechado.'}
            </p>
          </div>
          <button
            type="button"
            aria-label="Fechar e lembrar depois"
            onClick={snooze}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md opacity-70 transition hover:bg-background/10 hover:opacity-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-3">
          <Button type="button" variant="ghost" size="sm" onClick={snooze}>
            Agora não
          </Button>
          {canInvitePush ? (
            <Button type="button" size="sm" onClick={enable} disabled={push.isPending}>
              {push.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Ativar notificações
            </Button>
          ) : (
            <Button type="button" size="sm" onClick={snooze}>Entendi</Button>
          )}
        </div>
      </div>
    </aside>
  );
}
