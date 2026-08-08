import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/mobile/EmptyState';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAdminNotifications, type AdminNotification } from '@/hooks/useAdminNotifications';
import { cn } from '@/lib/utils';

/**
 * Sino de notificações do painel master Auctus (pt-br, sem i18n — uso interno).
 *
 * Consome `useAdminNotifications` (RLS já filtra: notificação direcionada ao
 * vendedor via `target_user_id`, ou aviso geral pra admins com `target_user_id`
 * nulo). Aqui é só UX/runtime.
 *
 * - Mobile: `Drawer` de baixo (padrão Dominex de modal mobile).
 * - Desktop: `DropdownMenu` `align="end"`.
 * - Badge saturado (vermelho + branco) só quando `unreadCount > 0`.
 * - Item `type === 'new_lead'`: navega pro detalhe da empresa
 *   (`/admin/empresas/:id` via `data.company_id`) e marca como lido.
 * - "Marcar todas como lidas" só aparece com não-lidas.
 */

function relativeTime(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ptBR });
  } catch {
    return '';
  }
}

interface AdminNotificationListProps {
  notifications: AdminNotification[];
  unreadCount: number;
  isLoading: boolean;
  onItemClick: (n: AdminNotification) => void;
  onMarkAll: () => void;
}

function AdminNotificationList({
  notifications,
  unreadCount,
  isLoading,
  onItemClick,
  onMarkAll,
}: AdminNotificationListProps) {
  return (
    <div className="flex flex-col">
      {unreadCount > 0 && (
        <div className="flex justify-end px-1 pb-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[11px] text-muted-foreground hover:bg-primary hover:text-primary-foreground"
            onClick={onMarkAll}
          >
            <CheckCheck className="h-3.5 w-3.5 mr-1" />
            Marcar todas como lidas
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">Carregando...</div>
      ) : notifications.length === 0 ? (
        <EmptyState
          size="compact"
          icon={<Bell className="h-full w-full" />}
          title="Nenhuma notificação"
          description="Você verá aqui os avisos do painel e novos leads."
        />
      ) : (
        <ScrollArea className="max-h-[60vh] sm:max-h-96">
          <div className="divide-y">
            {notifications.map((n) => {
              const unread = !n.is_read;
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => onItemClick(n)}
                  className={cn(
                    'w-full text-left px-3 py-2.5 flex items-start gap-2.5 transition-colors',
                    'hover:bg-accent/50',
                    unread && 'bg-primary/5',
                  )}
                >
                  <div className="flex-1 min-w-0">
                    {n.title && (
                      <p className={cn('text-sm leading-snug', unread && 'font-semibold')}>
                        {n.title}
                      </p>
                    )}
                    {n.message && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                        {n.message}
                      </p>
                    )}
                    <p className="text-[11px] text-muted-foreground/70 mt-1">
                      {relativeTime(n.created_at)}
                    </p>
                  </div>
                  {unread && (
                    <span
                      className="h-2 w-2 rounded-full bg-primary flex-shrink-0 mt-1.5"
                      aria-label="Não lida"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

export function AdminNotificationBell() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const { notifications, unreadCount, isLoading, markAsRead, markAllAsRead } =
    useAdminNotifications();

  const handleItemClick = (n: AdminNotification) => {
    if (!n.is_read) markAsRead(n.id);
    setOpen(false);
    if (n.type === 'new_lead' && n.data?.company_id) {
      navigate(`/admin/empresas/${n.data.company_id}`);
    }
  };

  const badgeText = unreadCount > 9 ? '9+' : String(unreadCount);

  const Trigger = (
    <Button
      variant="ghost"
      size="icon"
      className="relative h-9 w-9"
      onClick={isMobile ? () => setOpen(true) : undefined}
      aria-label={unreadCount > 0 ? `Notificações (${unreadCount} não lidas)` : 'Notificações'}
    >
      <Bell className="h-5 w-5" />
      {unreadCount > 0 && (
        <Badge
          variant="destructive"
          className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 flex items-center justify-center text-[10px] font-semibold border-2 border-background"
        >
          {badgeText}
        </Badge>
      )}
    </Button>
  );

  if (isMobile) {
    return (
      <>
        {Trigger}
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerContent>
            <DrawerHeader className="text-left">
              <DrawerTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-primary" />
                Notificações
                {unreadCount > 0 && (
                  <Badge variant="destructive" className="ml-auto">
                    {unreadCount}
                  </Badge>
                )}
              </DrawerTitle>
            </DrawerHeader>
            <div className="px-4 pb-6">
              <AdminNotificationList
                notifications={notifications}
                unreadCount={unreadCount}
                isLoading={isLoading}
                onItemClick={handleItemClick}
                onMarkAll={markAllAsRead}
              />
            </div>
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>{Trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-96 p-2">
        <div className="px-2 py-1.5 mb-1 border-b">
          <div className="text-sm font-semibold flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            Notificações
            {unreadCount > 0 && (
              <Badge variant="destructive" className="ml-auto">
                {unreadCount}
              </Badge>
            )}
          </div>
        </div>
        <AdminNotificationList
          notifications={notifications}
          unreadCount={unreadCount}
          isLoading={isLoading}
          onItemClick={handleItemClick}
          onMarkAll={markAllAsRead}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
