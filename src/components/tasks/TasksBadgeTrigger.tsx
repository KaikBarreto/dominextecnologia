/**
 * TasksBadgeTrigger — apenas o botão de ícone + badge de pendentes.
 *
 * É um trigger PURO: não renderiza o drawer. Quem renderiza o drawer é o
 * AppLayout (controlado via estado compartilhado). Este componente recebe
 * `onOpen` como callback e é injetado nos headers de todos os shells.
 *
 * Badge: saturado (bg-destructive) + texto branco. Regra CEO.
 */

import { CheckSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { useTenantTasks } from '@/hooks/useTenantTasks';

interface TasksBadgeTriggerProps {
  onOpen: () => void;
  /** Tamanho do botão — padrão 'icon' (h-9 w-9). */
  size?: 'icon' | 'sm';
}

export function TasksBadgeTrigger({ onOpen, size = 'icon' }: TasksBadgeTriggerProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.tasks;
  const { pendingCount } = useTenantTasks();

  const ariaLabel =
    pendingCount === 0
      ? t.badgeAriaLabelNone
      : pendingCount === 1
        ? t.badgeAriaLabelOne
        : t.badgeAriaLabel.replace('{n}', String(pendingCount));

  return (
    <Button
      variant="ghost"
      size={size === 'icon' ? 'icon' : 'sm'}
      className="relative h-9 w-9"
      onClick={onOpen}
      aria-label={ariaLabel}
      title={ariaLabel}
    >
      <CheckSquare className="h-5 w-5" />
      {pendingCount > 0 && (
        <Badge
          variant="destructive"
          className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 flex items-center justify-center text-[10px] font-semibold border-2 border-background"
        >
          {pendingCount > 99 ? '99+' : pendingCount}
        </Badge>
      )}
    </Button>
  );
}
