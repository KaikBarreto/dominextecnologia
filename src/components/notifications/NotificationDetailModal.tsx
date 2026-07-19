import { format, formatDistanceToNow } from 'date-fns';
import { ExternalLink, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { cn } from '@/lib/utils';
import type { UserNotification } from '@/hooks/useUserNotifications';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n';
import { getDateFnsLocale } from '@/lib/format';
import { getNotificationIcon } from './NotificationItem';

interface NotificationDetailModalProps {
  notification: UserNotification | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onActionClick: (notification: UserNotification) => void;
}

/**
 * Modal de detalhe ao clicar numa notificação no sino. No mobile vira
 * drawer de baixo (via `ResponsiveModal` → `useIsCompact`).
 *
 * Mostra:
 *   - Ícone grande circular (destructive se for `alert-circle`/erro, primary
 *     senão).
 *   - Título no header do modal + timestamp completo.
 *   - Mensagem completa (`whitespace-pre-wrap`, sem truncate).
 *   - "Expira em DD/MM HH:mm" se `expires_at`.
 *   - Botão "Abrir" que navega pro `action_url` quando houver.
 *   - Caso especial `terms_updated`: o botão "Ler Termos de Uso" abre o modal
 *     de Termos GLOBALMENTE (evento `dominex:open-terms`) em vez de navegar por
 *     rota — assim funciona pra qualquer usuário, sem depender da permissão
 *     `screen:settings` da tela de Configurações.
 */
export function NotificationDetailModal({
  notification,
  open,
  onOpenChange,
  onActionClick,
}: NotificationDetailModalProps) {
  const { locale } = useAppLocaleContext();
  const tPrimitives = MESSAGES[locale].app.shell.mobilePrimitives;
  const dfLocale = getDateFnsLocale(locale);

  if (!notification) return null;
  const Icon = getNotificationIcon(notification.icon);
  const isTermsUpdate = notification.type === 'terms_updated';
  const hasAction = !!notification.action_url;
  const isError = notification.icon === 'alert-circle';

  // Termos atualizados: dispara o gatilho global e fecha o detalhe.
  const handleOpenTerms = () => {
    onOpenChange(false);
    window.dispatchEvent(new CustomEvent('dominex:open-terms'));
  };

  const footer = (
    <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
      <Button variant="outline" onClick={() => onOpenChange(false)}>
        {tPrimitives.modalClose}
      </Button>
      {isTermsUpdate ? (
        <Button onClick={handleOpenTerms} className="gap-2">
          <FileText className="h-4 w-4" />
          {tPrimitives.modalReadTerms}
        </Button>
      ) : (
        hasAction && (
          <Button onClick={() => onActionClick(notification)} className="gap-2">
            <ExternalLink className="h-4 w-4" />
            {tPrimitives.modalOpen}
          </Button>
        )
      )}
    </div>
  );

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title={notification.title} footer={footer}>
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              'shrink-0 h-12 w-12 rounded-full flex items-center justify-center',
              isError ? 'bg-destructive text-destructive-foreground' : 'bg-primary text-primary-foreground',
            )}
          >
            <Icon className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground">
              {format(new Date(notification.created_at), "PPPp", { locale: dfLocale })}
              {' · '}
              {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true, locale: dfLocale })}
            </p>
          </div>
        </div>

        {notification.message && (
          <div className="bg-muted/40 border border-border rounded-lg p-3">
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{notification.message}</p>
          </div>
        )}

        {notification.expires_at && (
          <div className="text-xs text-muted-foreground">
            {tPrimitives.modalAvailableUntil}{' '}
            <strong>
              {format(new Date(notification.expires_at), 'Pp', { locale: dfLocale })}
            </strong>
          </div>
        )}
      </div>
    </ResponsiveModal>
  );
}
