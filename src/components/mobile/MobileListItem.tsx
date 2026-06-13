import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { motion, useAnimation, useMotionValue, type PanInfo } from 'framer-motion';
import { MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export type ItemActionVariant = 'default' | 'edit' | 'destructive' | 'whatsapp' | 'success';

export interface ItemAction {
  key: string;
  label: string;
  icon: ReactNode;
  /** Define cor no swipe e no menu. */
  variant?: ItemActionVariant;
  onClick: () => void;
  /** Quando true, o item aparece no menu mas não é clicável (sem swipe). */
  disabled?: boolean;
}

interface MobileListItemProps {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  className?: string;
  /** Ações secundárias — aparecem no overflow menu (⋮) e no swipe. */
  actions?: ItemAction[];
  /** Habilita gesture swipe-pra-esquerda. Default `true` se `actions` for passada. */
  swipeable?: boolean;
}

// --------------------------------------------------------------------------
// Coordenação "abrir um fecha os outros" sem precisar de Provider no caller.
// Cada instância se inscreve. Quando uma chama setOpenSwipeKey(self), todas
// as outras recebem o evento e fecham seu próprio swipe.
// --------------------------------------------------------------------------
type Listener = (openKey: string | null) => void;
const swipeListeners = new Set<Listener>();
let openSwipeKey: string | null = null;

function broadcastOpenSwipe(key: string | null) {
  openSwipeKey = key;
  swipeListeners.forEach((l) => l(openSwipeKey));
}

function subscribeOpenSwipe(listener: Listener) {
  swipeListeners.add(listener);
  return () => {
    swipeListeners.delete(listener);
  };
}

// Fecha todos os swipes em scroll vertical da página.
let scrollListenerAttached = false;
function ensureScrollListener() {
  if (scrollListenerAttached || typeof window === 'undefined') return;
  scrollListenerAttached = true;
  const handler = () => {
    if (openSwipeKey !== null) broadcastOpenSwipe(null);
  };
  window.addEventListener('scroll', handler, { passive: true, capture: true });
}

// --------------------------------------------------------------------------
// Largura de cada botão de swipe e total revelado.
// --------------------------------------------------------------------------
const SWIPE_BUTTON_WIDTH = 80;
const SWIPE_REVEAL_THRESHOLD = 70;

/**
 * Linha estilo app nativo (altura mínima 72px). Divisor automático embaixo.
 *
 * - Quando `actions` é passada, renderiza um botão ⋮ no trailing (DropdownMenu).
 * - No mobile, se houver ação `variant: 'edit'` ou `'destructive'`, habilita
 *   gesture de swipe-pra-esquerda que revela botões coloridos.
 * - Tap em qualquer botão dispara `action.onClick()`. Não há "swipe completo".
 */
export function MobileListItem({
  leading,
  title,
  subtitle,
  trailing,
  onClick,
  className,
  actions,
  swipeable,
}: MobileListItemProps) {
  const isMobile = useIsMobile();
  const instanceId = useId();

  // Variants que ganham botão colorido no swipe (têm cor própria definida).
  const SWIPE_VARIANTS: ItemActionVariant[] = ['edit', 'destructive', 'whatsapp', 'success'];
  const swipeActions = useMemo(
    () =>
      (actions ?? []).filter(
        (a) => !a.disabled && a.variant != null && SWIPE_VARIANTS.includes(a.variant),
      ),
    [actions],
  );

  const swipeEnabled =
    isMobile &&
    (swipeable ?? Boolean(actions && actions.length > 0)) &&
    swipeActions.length > 0;

  const revealWidth = swipeActions.length * SWIPE_BUTTON_WIDTH;

  const controls = useAnimation();
  const x = useMotionValue(0);
  const isOpenRef = useRef(false);
  const [, force] = useState(0);

  const closeSwipe = useCallback(() => {
    isOpenRef.current = false;
    controls.start({ x: 0, transition: { type: 'spring', stiffness: 500, damping: 40 } });
    force((n) => n + 1);
  }, [controls]);

  const openSwipe = useCallback(() => {
    isOpenRef.current = true;
    broadcastOpenSwipe(instanceId);
    controls.start({ x: -revealWidth, transition: { type: 'spring', stiffness: 500, damping: 40 } });
    force((n) => n + 1);
  }, [controls, instanceId, revealWidth]);

  // Subscribe ao broadcast: se outro item abrir, fecho.
  useEffect(() => {
    if (!swipeEnabled) return;
    ensureScrollListener();
    const unsub = subscribeOpenSwipe((openKey) => {
      if (openKey !== instanceId && isOpenRef.current) {
        closeSwipe();
      }
    });
    return unsub;
  }, [swipeEnabled, instanceId, closeSwipe]);

  const handleDragEnd = useCallback(
    (_e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      if (!swipeEnabled) return;
      // Considera velocidade + offset pra abrir/fechar.
      const offset = info.offset.x;
      const velocity = info.velocity.x;
      const shouldOpen = -offset > SWIPE_REVEAL_THRESHOLD || velocity < -300;
      if (shouldOpen) {
        openSwipe();
      } else {
        closeSwipe();
        if (isOpenRef.current === false && openSwipeKey === instanceId) {
          broadcastOpenSwipe(null);
        }
      }
    },
    [swipeEnabled, openSwipe, closeSwipe, instanceId],
  );

  const handleItemClick = useCallback(() => {
    // Se swipe está aberto, primeiro tap só fecha — não dispara onClick.
    if (isOpenRef.current) {
      closeSwipe();
      broadcastOpenSwipe(null);
      return;
    }
    onClick?.();
  }, [closeSwipe, onClick]);

  const hasActions = Boolean(actions && actions.length > 0);

  // ------------------------------------------------------------------------
  // Conteúdo da linha (igual ao original, com ⋮ adicionado quando há actions)
  // ------------------------------------------------------------------------
  const InnerTag = onClick ? 'button' : 'div';

  const innerContent = (
    <InnerTag
      type={onClick ? 'button' : undefined}
      onClick={handleItemClick}
      className={cn(
        'flex w-full items-center gap-4 min-h-[72px] px-4 py-3.5 border-b border-border/60 last:border-b-0 text-left transition-colors bg-card',
        onClick && 'active:bg-muted/60 hover:bg-muted/40 cursor-pointer',
        className,
      )}
    >
      {leading && <div className="shrink-0 flex items-center justify-center">{leading}</div>}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="text-[15px] font-medium truncate">{title}</div>
        {subtitle && <div className="text-xs text-muted-foreground truncate">{subtitle}</div>}
      </div>
      {trailing && <div className="shrink-0 flex items-center gap-1">{trailing}</div>}
      {hasActions && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Mais ações"
              onClick={(e) => {
                e.stopPropagation();
              }}
              className="shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted active:bg-muted/80 transition-colors"
            >
              <MoreVertical className="h-5 w-5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="bottom" align="end" className="min-w-[180px]">
            {actions!.map((action) => (
              <DropdownMenuItem
                key={action.key}
                disabled={action.disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  if (action.disabled) return;
                  action.onClick();
                }}
                className={cn(
                  'gap-2 cursor-pointer',
                  !action.disabled && action.variant === 'destructive' && 'text-destructive focus:text-destructive',
                  !action.disabled && action.variant === 'edit' && 'text-warning focus:text-warning',
                  !action.disabled && action.variant === 'success' && 'text-success focus:text-success',
                  !action.disabled && action.variant === 'whatsapp' && 'text-[#128C7E] focus:text-[#128C7E]',
                )}
              >
                <span className="shrink-0">{action.icon}</span>
                <span>{action.label}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </InnerTag>
  );

  // ------------------------------------------------------------------------
  // Sem swipe: retorna direto (desktop ou actions sem variant edit/destructive)
  // ------------------------------------------------------------------------
  if (!swipeEnabled) {
    return innerContent;
  }

  // ------------------------------------------------------------------------
  // Com swipe: wrap em container relativo + camada de fundo com botões.
  // ------------------------------------------------------------------------
  return (
    <div className="relative overflow-hidden border-b border-border/60 last:border-b-0">
      {/* Camada de fundo — botões revelados ao swipar pra esquerda. */}
      <div
        className="absolute inset-y-0 right-0 flex items-stretch"
        style={{ width: revealWidth }}
        aria-hidden={!isOpenRef.current}
      >
        {swipeActions.map((action) => (
          <button
            key={action.key}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              action.onClick();
              closeSwipe();
              broadcastOpenSwipe(null);
            }}
            className={cn(
              'flex flex-col items-center justify-center gap-1 text-xs font-medium',
              action.variant === 'edit' && 'bg-warning text-warning-foreground hover:bg-warning/90',
              action.variant === 'destructive' &&
                'bg-destructive text-destructive-foreground hover:bg-destructive/90',
              action.variant === 'success' && 'bg-success text-success-foreground hover:bg-success/90',
              action.variant === 'whatsapp' && 'bg-[#25D366] text-white hover:bg-[#1da851]',
            )}
            style={{ width: SWIPE_BUTTON_WIDTH }}
          >
            <span className="[&_svg]:h-5 [&_svg]:w-5">{action.icon}</span>
            <span>{action.label}</span>
          </button>
        ))}
      </div>

      {/* Linha arrastável (frente). */}
      <motion.div
        drag="x"
        dragConstraints={{ left: -revealWidth, right: 0 }}
        dragElastic={0.1}
        dragMomentum={false}
        animate={controls}
        style={{ x, touchAction: 'pan-y' }}
        onDragEnd={handleDragEnd}
        className="relative bg-card"
      >
        {/* Re-renderiza sem o border-b porque já está no wrapper externo. */}
        <div className="[&>*]:border-b-0">{innerContent}</div>
      </motion.div>
    </div>
  );
}

// Re-export utilitário pros consumers (caso queiram bordas/ícones consistentes).
export { Pencil as MobileListItemEditIcon, Trash2 as MobileListItemDeleteIcon };
