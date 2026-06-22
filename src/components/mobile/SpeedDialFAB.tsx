import { useEffect, useState, type ComponentType } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type IconType = ComponentType<{ className?: string }>;

export interface SpeedDialAction {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  /**
   * Ícone "puro": cor saturada (primary) e SEM o fundo circular dessaturado.
   * Default false (mantém o disco bg-primary/10 atrás do ícone).
   */
  bare?: boolean;
}

interface SpeedDialFABProps {
  actions: SpeedDialAction[];
  /** Lado do FAB. Default 'left' (canto inferior esquerdo). */
  side?: 'left' | 'right';
  className?: string;
  /**
   * Offset extra (px) acima do canto inferior — pra o FAB não ser coberto por um
   * rodapé fixo (ex.: a faixa preta de ações da OS no mobile). Soma ao 1rem +
   * safe-area padrão. Default 0.
   */
  bottomOffsetPx?: number;
  /**
   * Ícone do botão principal. Default `MoreVertical` (3 pontinhos). Passe um ícone
   * próprio (ex.: ferramenta) quando o FAB representa UMA função específica.
   */
  mainIcon?: IconType;
  /** Rótulo de acessibilidade do FAB (default genérico de "menu de ferramentas"). */
  ariaLabel?: string;
  /**
   * Quando há UMA única ação, o toque no FAB a dispara DIRETO (sem abrir o
   * speed-dial). Ideal pra FAB de função única. Default false (sempre speed-dial).
   */
  directWhenSingle?: boolean;
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
export function SpeedDialFAB({
  actions,
  side = 'left',
  className,
  bottomOffsetPx = 0,
  mainIcon: MainIcon = MoreVertical,
  ariaLabel,
  directWhenSingle = false,
}: SpeedDialFABProps) {
  const [open, setOpen] = useState(false);
  // FAB de função única: o toque dispara a ação direto, sem speed-dial.
  const isDirect = directWhenSingle && actions.length === 1;

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
      {open && !isDirect && (
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
        style={{ bottom: `calc(1rem + env(safe-area-inset-bottom) + ${bottomOffsetPx}px)` }}
      >
        {/* Ações — sobem ancoradas acima do FAB */}
        {open && !isDirect && (
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
                  <span
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-full text-primary',
                      action.bare ? '' : 'bg-primary/10',
                    )}
                  >
                    <Icon className={cn('h-4 w-4', action.bare && 'h-5 w-5')} />
                  </span>
                  <span className="text-sm font-medium whitespace-nowrap">{action.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* FAB principal. Função única (isDirect) → dispara a ação direto e mostra
            o ícone próprio (ex.: ferramenta). Senão → speed-dial (abre/fecha). */}
        <button
          type="button"
          onClick={() => {
            if (isDirect) {
              actions[0].onClick();
              return;
            }
            setOpen((v) => !v);
          }}
          aria-label={
            isDirect
              ? actions[0].label
              : open
                ? 'Fechar menu'
                : ariaLabel ?? 'Abrir menu de ferramentas'
          }
          aria-expanded={isDirect ? undefined : open}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform active:scale-90"
        >
          {isDirect ? (
            <MainIcon className="h-6 w-6" />
          ) : open ? (
            <X className="h-6 w-6" />
          ) : (
            <MainIcon className="h-6 w-6" />
          )}
        </button>
      </div>
    </>
  );

  return createPortal(content, document.body);
}
