import { useEffect, useState, type ComponentType } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SpeedDialAction {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}

interface SpeedDialFABProps {
  actions: SpeedDialAction[];
  /** Lado do FAB. Default 'left' (canto inferior esquerdo). */
  side?: 'left' | 'right';
  className?: string;
}

/**
 * FAB speed-dial genérico (mobile-first).
 *
 * Toque no botão de "3 pontinhos" abre um backdrop com blur + escurecimento e
 * sobe os botões de ação ancorados ACIMA do FAB, cada um com ícone + rótulo.
 * Backdrop, Esc ou o próprio FAB fecham.
 *
 * Renderizado via createPortal no body: escapa de qualquer ancestral com
 * `transform` (RouteTransition / MobilePullToRefresh viram containing block e
 * quebrariam `position: fixed`).
 */
export function SpeedDialFAB({ actions, side = 'left', className }: SpeedDialFABProps) {
  const [open, setOpen] = useState(false);

  // Esc fecha (desktop).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const sideClass = side === 'left' ? 'left-4 items-start' : 'right-4 items-end';

  const content = (
    <>
      {/* Backdrop com blur + escurecimento */}
      {open && (
        <button
          type="button"
          aria-label="Fechar menu"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm animate-in fade-in"
        />
      )}

      <div
        className={cn(
          'fixed z-50 flex flex-col gap-3',
          sideClass,
          className,
        )}
        style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
      >
        {/* Ações — sobem ancoradas acima do FAB */}
        {open && (
          <div className={cn('flex flex-col gap-2.5', side === 'left' ? 'items-start' : 'items-end')}>
            {actions.map((action, i) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.label}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    action.onClick();
                  }}
                  style={{ animationDelay: `${i * 40}ms` }}
                  className="flex h-12 items-center gap-2 rounded-full bg-card pl-3.5 pr-4 text-foreground shadow-lg shadow-black/20 transition-transform active:scale-95 animate-in fade-in slide-in-from-bottom-2"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="text-sm font-medium whitespace-nowrap">{action.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* FAB principal (3 pontinhos) */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? 'Fechar menu' : 'Abrir menu de ferramentas'}
          aria-expanded={open}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform active:scale-90"
        >
          {open ? <X className="h-6 w-6" /> : <MoreVertical className="h-6 w-6" />}
        </button>
      </div>
    </>
  );

  return createPortal(content, document.body);
}
