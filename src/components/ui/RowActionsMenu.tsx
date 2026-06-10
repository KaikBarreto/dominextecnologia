import { useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export type RowActionVariant = 'default' | 'edit' | 'delete';

export interface RowAction {
  label: string;
  icon: LucideIcon;
  onClick: (e?: React.MouseEvent) => void;
  variant?: RowActionVariant;
  disabled?: boolean;
  hidden?: boolean;
}

interface RowActionsMenuProps {
  actions: RowAction[];
  align?: 'start' | 'end' | 'center';
  triggerClassName?: string;
  ariaLabel?: string;
  /**
   * Quando passado, o trigger vira um botão com texto ao lado do ícone (visível
   * só no desktop). Ausente = comportamento padrão (ícone-only, size="icon").
   */
  label?: string;
}

const variantClasses: Record<RowActionVariant, string> = {
  default:
    'focus:bg-primary focus:text-primary-foreground hover:bg-primary hover:text-primary-foreground data-[highlighted]:bg-primary data-[highlighted]:text-primary-foreground',
  edit:
    'focus:bg-warning focus:text-white hover:bg-warning hover:text-white data-[highlighted]:bg-warning data-[highlighted]:text-white',
  delete:
    'focus:bg-destructive focus:text-white hover:bg-destructive hover:text-white data-[highlighted]:bg-destructive data-[highlighted]:text-white',
};

// Delay pra abrir filtra cursor de passagem (evita piscar quando o mouse só
// "atravessa" o trigger indo pra outro elemento). Delay pra fechar dá grace
// pro usuário atravessar do trigger ao content sem o menu sumir.
const HOVER_OPEN_DELAY_MS = 80;
const HOVER_CLOSE_DELAY_MS = 200;

export function RowActionsMenu({
  actions,
  align = 'end',
  triggerClassName,
  ariaLabel = 'Ações',
  label,
}: RowActionsMenuProps) {
  const visible = actions.filter((a) => !a.hidden);
  const [open, setOpen] = useState(false);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (visible.length === 0) return null;

  const cancelTimers = () => {
    if (openTimerRef.current) { clearTimeout(openTimerRef.current); openTimerRef.current = null; }
    if (closeTimerRef.current) { clearTimeout(closeTimerRef.current); closeTimerRef.current = null; }
  };

  // Só agenda abrir se ainda não está aberto — re-renders do Radix (que dispara
  // data-state="open" e pode re-disparar onPointerEnter) viram no-op.
  const scheduleOpen = () => {
    cancelTimers();
    if (open) return;
    openTimerRef.current = setTimeout(() => setOpen(true), HOVER_OPEN_DELAY_MS);
  };

  const scheduleClose = () => {
    cancelTimers();
    closeTimerRef.current = setTimeout(() => setOpen(false), HOVER_CLOSE_DELAY_MS);
  };

  return (
    // modal={false}: evita o `pointer-events: none` que o Radix aplica fora do
    // conteúdo ao abrir — ele disparava um pointerleave falso no trigger,
    // fechando e reabrindo o menu (o "piscar 2x" no hover).
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={label ? 'sm' : 'icon'}
          className={cn(
            'active:scale-95 transition-transform',
            label ? 'h-8 gap-1.5 px-2' : 'h-8 w-8',
            triggerClassName,
          )}
          aria-label={ariaLabel}
          onClick={(e) => e.stopPropagation()}
          onPointerEnter={(e) => { if (e.pointerType === 'mouse') scheduleOpen(); }}
          onPointerLeave={(e) => { if (e.pointerType === 'mouse') scheduleClose(); }}
        >
          <MoreVertical className="h-4 w-4" />
          {label && <span className="hidden sm:inline">{label}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        className="min-w-[180px]"
        onClick={(e) => e.stopPropagation()}
        onPointerEnter={cancelTimers}
        onPointerLeave={(e) => { if (e.pointerType === 'mouse') scheduleClose(); }}
      >
        {visible.map((action, i) => {
          const Icon = action.icon;
          return (
            <DropdownMenuItem
              key={i}
              onClick={(e) => {
                e.stopPropagation();
                action.onClick(e);
                setOpen(false);
              }}
              disabled={action.disabled}
              className={cn(
                'gap-2 cursor-pointer',
                variantClasses[action.variant ?? 'default'],
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{action.label}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
