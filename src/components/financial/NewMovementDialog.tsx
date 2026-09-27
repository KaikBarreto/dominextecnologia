import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { cn } from '@/lib/utils';

type MovementKind = 'entrada' | 'saida' | 'transferencia';

interface NewMovementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (kind: MovementKind) => void;
  transferDisabled?: boolean;
}
export function NewMovementDialog({
  open,
  onOpenChange,
  onSelect,
  transferDisabled = false,
}: NewMovementDialogProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.finance.newMovement;

  const options = [
    {
      value: 'entrada' as const,
      label: t.revenue,
      description: t.revenueDescription,
      icon: ArrowDownLeft,
      className: 'hover:border-success hover:bg-success focus-visible:bg-success',
    },
    {
      value: 'saida' as const,
      label: t.expense,
      description: t.expenseDescription,
      icon: ArrowUpRight,
      className: 'hover:border-destructive hover:bg-destructive focus-visible:bg-destructive',
    },
    {
      value: 'transferencia' as const,
      label: t.transfer,
      description: transferDisabled ? t.transferDisabled : t.transferDescription,
      icon: ArrowLeftRight,
      className: 'hover:border-info hover:bg-info focus-visible:bg-info',
      disabled: transferDisabled,
    },
  ];

  const choose = (kind: MovementKind) => {
    onOpenChange(false);
    onSelect(kind);
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={t.title}
      description={t.description}
      className="sm:max-w-[680px]"
    >
      <div className="grid grid-cols-1 gap-3 py-1 sm:grid-cols-3">
        {options.map((option) => {
          const Icon = option.icon;
          return (
            <button
              key={option.value}
              type="button"
              disabled={option.disabled}
              onClick={() => choose(option.value)}
              className={cn(
                'group flex min-h-28 w-full items-start gap-3 rounded-xl border bg-background p-4 text-left transition-colors',
                'hover:text-white focus-visible:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border disabled:hover:bg-background disabled:hover:text-foreground',
                option.className,
              )}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-foreground transition-colors group-hover:bg-white/20 group-hover:text-white group-focus-visible:bg-white/20 group-focus-visible:text-white">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold">{option.label}</span>
                <span className="mt-1 block text-xs leading-relaxed text-muted-foreground transition-colors group-hover:text-white/80 group-focus-visible:text-white/80">
                  {option.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </ResponsiveModal>
  );
}
