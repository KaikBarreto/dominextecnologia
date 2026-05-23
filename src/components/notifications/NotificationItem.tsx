import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Bell,
  Package,
  AlertCircle,
  CheckCircle2,
  Info,
  Wrench,
  Calendar,
  FileText,
  DollarSign,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { UserNotification } from '@/hooks/useUserNotifications';

/**
 * Mapa de ícone (string do banco) → componente Lucide. Mantém compatível com
 * tipos novos sem precisar redeployar: backend grava qualquer string e o
 * componente cai no fallback `Bell` se não conhecer.
 */
export const ICON_MAP: Record<string, LucideIcon> = {
  bell: Bell,
  package: Package,
  'alert-circle': AlertCircle,
  'check-circle': CheckCircle2,
  info: Info,
  wrench: Wrench,
  calendar: Calendar,
  'file-text': FileText,
  'dollar-sign': DollarSign,
};

export function getNotificationIcon(name: string): LucideIcon {
  return ICON_MAP[name] ?? Bell;
}

interface NotificationItemProps {
  notification: UserNotification;
  onClick: () => void;
  onDismiss: (e: React.MouseEvent) => void;
}

/**
 * Item individual da lista do sino. Usa tokens semânticos (`bg-card`,
 * `bg-muted/60`, `bg-primary`, `text-primary-foreground`) — sem cor Tailwind
 * crua. Botão X usa `hover:bg-destructive` (token de "excluir").
 */
export function NotificationItem({ notification, onClick, onDismiss }: NotificationItemProps) {
  const Icon = getNotificationIcon(notification.icon);
  const isUnread = notification.read_at === null;

  return (
    <div
      onClick={onClick}
      className="flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors bg-card hover:bg-muted/60"
    >
      <div
        className={cn(
          'shrink-0 mt-0.5 h-8 w-8 rounded-full flex items-center justify-center',
          isUnread ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={cn('text-sm leading-tight', isUnread ? 'font-semibold' : 'font-medium')}>
            {notification.title}
          </p>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 shrink-0 -mt-0.5 -mr-1 hover:bg-destructive hover:text-destructive-foreground"
            onClick={onDismiss}
            aria-label="Dispensar notificação"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
        {notification.message && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
            {notification.message}
          </p>
        )}
        <p className="text-[10px] text-muted-foreground mt-1">
          {formatDistanceToNow(new Date(notification.created_at), {
            addSuffix: true,
            locale: ptBR,
          })}
        </p>
      </div>
    </div>
  );
}
