/**
 * PortalCallsAlert — aviso dispensável de chamados abertos do portal.
 *
 * Aparece UMA vez por sessão do usuário quando há chamados com created_at
 * posterior à última marca "visto" (localStorage por userId). Ao dispensar
 * (qualquer botão), a marca é atualizada pro maior created_at dos chamados
 * abertos atuais, garantindo que o mesmo lote não reaparece.
 *
 * Estilo: fundo SATURADO (primary) + texto e ícone BRANCOS — regra CEO.
 * Layout: Drawer no mobile (via ResponsiveModal), Dialog no desktop.
 */

import { useEffect, useState, useCallback } from 'react';
import { Megaphone } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useIsCompact } from '@/hooks/use-mobile';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
} from '@/components/ui/drawer';
import type { ServiceOrder } from '@/types/database';

// ---------------------------------------------------------------------------
// localStorage key helper — chave por usuário para não vazar entre contas
// ---------------------------------------------------------------------------

function storageKey(userId: string): string {
  return `dominex:portal-tickets-seen:${userId}`;
}

function getSeenMark(userId: string): Date | null {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

function setSeenMark(userId: string, mark: Date): void {
  try {
    localStorage.setItem(storageKey(userId), mark.toISOString());
  } catch {
    // localStorage pode falhar em modo privado com storage cheio — ignora silenciosamente
  }
}

/** Calcula o maior created_at entre os chamados, ou agora como fallback. */
function latestCreatedAt(calls: ServiceOrder[]): Date {
  if (calls.length === 0) return new Date();
  const max = calls.reduce((best, os) => {
    const d = new Date(os.created_at);
    return d > best ? d : best;
  }, new Date(0));
  return max.getTime() === 0 ? new Date() : max;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PortalCallsAlertProps {
  /** Lista completa de chamados abertos (de useDashboardStats.portalCalls). */
  portalCalls: ServiceOrder[];
  /** true enquanto os stats ainda estão carregando — não exibe durante loading. */
  isLoading: boolean;
  /** ID do usuário logado (de useAuth().user.id). */
  userId: string;
}

// ---------------------------------------------------------------------------
// Conteúdo interno saturado — reutilizado no Dialog e no Drawer
// ---------------------------------------------------------------------------

interface AlertBodyProps {
  count: number;
  title: string;
  onViewCalls: () => void;
  onDismiss: () => void;
  labelViewCalls: string;
  labelDismiss: string;
}

function AlertBody({
  count,
  title,
  onViewCalls,
  onDismiss,
  labelViewCalls,
  labelDismiss,
}: AlertBodyProps) {
  return (
    // Fundo sólido saturado (bg-primary) + tudo branco — regra CEO obrigatória.
    // NÃO usa tint/pastel. O "rounded-2xl" fecha bem dentro do drawer/dialog.
    <div className="bg-primary rounded-2xl p-5 flex flex-col gap-4">
      {/* Ícone + título */}
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5">
          <Megaphone className="h-6 w-6 text-white" aria-hidden="true" />
        </div>
        <p className="text-white font-semibold text-base leading-snug">
          {title.replace('{n}', String(count))}
        </p>
      </div>

      {/* Botões: primário = branco sólido com texto na cor do fundo (primary);
           secundário = outline branco translúcido. Ambos com contraste sobre bg-primary. */}
      <div className="flex flex-col sm:flex-row gap-2">
        <Button
          onClick={onViewCalls}
          className="flex-1 bg-white text-primary hover:bg-white/90 active:bg-white/80 font-semibold border-0 shadow-none"
        >
          {labelViewCalls}
        </Button>
        <Button
          onClick={onDismiss}
          variant="outline"
          className="flex-1 bg-transparent border-white/50 text-white hover:bg-white/10 hover:text-white active:bg-white/20 font-medium"
        >
          {labelDismiss}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export function PortalCallsAlert({
  portalCalls,
  isLoading,
  userId,
}: PortalCallsAlertProps) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const isCompact = useIsCompact();
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.dashboard.portalCallsAlert;

  // Chamados NÃO vistos: created_at posterior à marca localStorage
  const unseenCalls = (() => {
    if (!userId || portalCalls.length === 0) return [];
    const mark = getSeenMark(userId);
    if (!mark) return portalCalls; // nunca marcou → todos são novos
    return portalCalls.filter((os) => new Date(os.created_at) > mark);
  })();

  // Mostra o aviso uma única vez após o carregamento dos stats
  useEffect(() => {
    if (isLoading) return;
    if (!userId) return;
    if (unseenCalls.length > 0) {
      setOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, userId]);
  // Nota: `unseenCalls` não entra nas deps propositalmente — o aviso deve
  // aparecer somente UMA vez ao montar, não reabrir se a lista mudar depois.

  const dismiss = useCallback(() => {
    if (userId && portalCalls.length > 0) {
      setSeenMark(userId, latestCreatedAt(portalCalls));
    }
    setOpen(false);
  }, [userId, portalCalls]);

  const viewCalls = useCallback(() => {
    dismiss();
    navigate('/ordens-servico');
  }, [dismiss, navigate]);

  if (!open) return null;

  const count = unseenCalls.length > 0 ? unseenCalls.length : portalCalls.length;
  const title = count === 1 ? t.titleOne : t.titleOther;

  const body = (
    <AlertBody
      count={count}
      title={title}
      onViewCalls={viewCalls}
      onDismiss={dismiss}
      labelViewCalls={t.viewCalls}
      labelDismiss={t.dismiss}
    />
  );

  // Mobile: Drawer de baixo (padrão do app). Desktop: Dialog centralizado.
  if (isCompact) {
    return (
      <Drawer open={open} onOpenChange={(v) => { if (!v) dismiss(); }}>
        <DrawerContent className="pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          <div className="px-4 pt-2 pb-4">
            {body}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) dismiss(); }}>
      <DialogContent
        className="sm:max-w-md p-0 overflow-hidden border-0 bg-transparent shadow-none"
        aria-describedby={undefined}
      >
        <div className="p-2">
          {body}
        </div>
      </DialogContent>
    </Dialog>
  );
}
