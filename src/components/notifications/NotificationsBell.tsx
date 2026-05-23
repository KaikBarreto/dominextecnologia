import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useIsMobile } from '@/hooks/use-mobile';
import { useUserNotifications, type UserNotification } from '@/hooks/useUserNotifications';
import { NotificationItem } from './NotificationItem';
import { NotificationDetailModal } from './NotificationDetailModal';

/**
 * Sino de notificações do header.
 *
 * - Mobile (`useIsMobile === true`): trigger abre `Drawer` de baixo
 *   (padrão Dominex de modal mobile).
 * - Desktop: trigger abre `DropdownMenu` `align="end"`.
 * - Badge `destructive` com contador (`9+` se >9).
 * - Click em item: dispara `markAsRead` (se não-lido) + abre
 *   `NotificationDetailModal`. No mobile fecha o drawer antes.
 * - Click no X do item: `stopPropagation` + `dismiss` (DELETE).
 * - "Marcar todas como lidas" aparece só quando `unreadCount > 0`.
 */
export function NotificationsBell() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<UserNotification | null>(null);
  const { notifications, unreadCount, markAsRead, markAllAsRead, dismiss } = useUserNotifications();

  // Click na notif: marca como lida + abre detalhe (em vez de navegar direto).
  // Detalhe tem botão "Abrir" que dispara o action_url efetivo.
  const handleClick = (notification: UserNotification) => {
    if (notification.read_at === null) markAsRead(notification.id);
    setSelectedNotification(notification);
    if (isMobile) setDrawerOpen(false);
  };

  // Botão dentro do detalhe — navega pro action_url e fecha modal.
  const handleActionClick = (notification: UserNotification) => {
    setSelectedNotification(null);
    if (notification.action_url) navigate(notification.action_url);
  };

  const handleDismiss = (id: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    dismiss(id);
  };

  const Trigger = (
    <Button
      variant="ghost"
      size="icon"
      className="relative h-9 w-9"
      onClick={isMobile ? () => setDrawerOpen(true) : undefined}
      aria-label={unreadCount > 0 ? `${unreadCount} notificações não lidas` : 'Notificações'}
    >
      <Bell className="h-5 w-5" />
      {unreadCount > 0 && (
        <Badge
          variant="destructive"
          className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 flex items-center justify-center text-[10px] font-semibold border-2 border-background"
        >
          {unreadCount > 9 ? '9+' : unreadCount}
        </Badge>
      )}
    </Button>
  );

  const List = (
    <div className="space-y-2">
      {notifications.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          <Bell className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Nenhuma notificação</p>
        </div>
      ) : (
        <>
          {notifications.map((n) => (
            <NotificationItem
              key={n.id}
              notification={n}
              onClick={() => handleClick(n)}
              onDismiss={handleDismiss(n.id)}
            />
          ))}
          {unreadCount > 0 && (
            <div className="pt-2 border-t">
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-muted-foreground hover:bg-primary hover:text-primary-foreground"
                onClick={() => markAllAsRead()}
              >
                Marcar todas como lidas
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );

  const detailModal = (
    <NotificationDetailModal
      notification={selectedNotification}
      open={!!selectedNotification}
      onOpenChange={(open) => !open && setSelectedNotification(null)}
      onActionClick={handleActionClick}
    />
  );

  if (isMobile) {
    return (
      <>
        {Trigger}
        <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
          <DrawerContent>
            <DrawerHeader className="text-left">
              <DrawerTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-primary" />
                Notificações
                {unreadCount > 0 && (
                  <Badge variant="destructive" className="ml-auto">
                    {unreadCount} nova{unreadCount !== 1 ? 's' : ''}
                  </Badge>
                )}
              </DrawerTitle>
            </DrawerHeader>
            <div className="px-4 pb-6 max-h-[70dvh] overflow-y-auto">{List}</div>
          </DrawerContent>
        </Drawer>
        {detailModal}
      </>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{Trigger}</DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={8}
          className="w-96 max-h-[480px] overflow-y-auto p-2"
        >
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
          {List}
        </DropdownMenuContent>
      </DropdownMenu>
      {detailModal}
    </>
  );
}
