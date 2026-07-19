import { useMemo, useState } from 'react';
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
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n';
import { NotificationItem } from './NotificationItem';
import { NotificationDetailModal } from './NotificationDetailModal';

type GroupKey = 'today' | 'yesterday' | 'week' | 'older';

const GROUP_ORDER: GroupKey[] = ['today', 'yesterday', 'week', 'older'];

/**
 * Índice do dia (número de dias desde a época) no fuso de Brasília (UTC-3 fixo,
 * conforme régua do projeto). Subtrai 3h do instante UTC e divide por 1 dia —
 * assim notificações criadas após 21:00 UTC já caem no dia seguinte BRT.
 */
function brtDayIndex(iso: string): number {
  const ms = new Date(iso).getTime() - 3 * 60 * 60 * 1000;
  return Math.floor(ms / 86_400_000);
}

/** Classifica uma notificação num bucket de data relativo a "agora" (BRT). */
function notificationGroup(createdAt: string, todayIndex: number): GroupKey {
  const dayIndex = brtDayIndex(createdAt);
  const diff = todayIndex - dayIndex;
  if (diff <= 0) return 'today';
  if (diff === 1) return 'yesterday';
  if (diff <= 6) return 'week';
  return 'older';
}

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
 * - Lista agrupada por data (Hoje / Ontem / Esta semana / Anteriores) com
 *   cabeçalhos discretos; dentro do grupo mantém a ordem `created_at DESC`.
 */
export function NotificationsBell() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<UserNotification | null>(null);
  const { notifications, unreadCount, markAsRead, markAllAsRead, dismiss } = useUserNotifications();
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.shell.notifications;

  // Agrupa por data (BRT). Preserva a ordem original (created_at DESC) dentro
  // de cada bucket porque iteramos sobre `notifications` já ordenada pelo hook.
  const groupedNotifications = useMemo(() => {
    const todayIndex = brtDayIndex(new Date().toISOString());
    const buckets: Record<GroupKey, UserNotification[]> = {
      today: [],
      yesterday: [],
      week: [],
      older: [],
    };
    for (const n of notifications) {
      buckets[notificationGroup(n.created_at, todayIndex)].push(n);
    }
    const groupLabels: Record<GroupKey, string> = {
      today: t.groupToday,
      yesterday: t.groupYesterday,
      week: t.groupWeek,
      older: t.groupOlder,
    };
    return GROUP_ORDER.map((key) => ({ key, label: groupLabels[key], items: buckets[key] })).filter(
      (g) => g.items.length > 0,
    );
  }, [notifications, t]);

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
      aria-label={unreadCount > 0 ? t.ariaLabelUnread.replace('{n}', String(unreadCount)) : t.ariaLabel}
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
          <p className="text-sm">{t.empty}</p>
        </div>
      ) : (
        <>
          {groupedNotifications.map((group) => (
            <div key={group.key} className="space-y-2">
              <p className="px-1 pt-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                {group.label}
              </p>
              {group.items.map((n) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  onClick={() => handleClick(n)}
                  onDismiss={handleDismiss(n.id)}
                />
              ))}
            </div>
          ))}
          {unreadCount > 0 && (
            <div className="pt-2 border-t">
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-muted-foreground hover:bg-primary hover:text-primary-foreground"
                onClick={() => markAllAsRead()}
              >
                {t.markAllRead}
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
                {t.title}
                {unreadCount > 0 && (
                  <Badge variant="destructive" className="ml-auto">
                    {(unreadCount !== 1 ? t.badgeNewPlural : t.badgeNew).replace('{n}', String(unreadCount))}
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
              {t.title}
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
