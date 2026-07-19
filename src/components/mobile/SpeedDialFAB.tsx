import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n';

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
  /**
   * Imagem do botão principal (opt-in). Quando setada, o botão renderiza a
   * IMAGEM preenchendo o círculo (object-cover) em vez do `bg-primary` + ícone.
   * Mantém forma/sombra/aria-label. Ausente → comportamento atual (ícone/accent).
   */
  mainImageUrl?: string;
  /** Rótulo de acessibilidade do FAB (default genérico de "menu de ferramentas"). */
  ariaLabel?: string;
  /**
   * Quando há UMA única ação, o toque no FAB a dispara DIRETO (sem abrir o
   * speed-dial). Ideal pra FAB de função única. Default false (sempre speed-dial).
   */
  directWhenSingle?: boolean;
  /**
   * Rebaixa o FAB pra ATRÁS de um backdrop externo (z-30 em vez de z-50). Use
   * quando outro overlay da tela (ex.: menu hambúrguer do rodapé da OS) abre um
   * backdrop z-40 e o FAB deve ficar borrado/escurecido junto. Default false.
   */
  dimmed?: boolean;
  /**
   * Cor do glow (disco radial desfocado atrás do FAB). Hex, ex. '#06b6d4'.
   * Default '#00C597' (verde Dominex — comportamento anterior).
   */
  glowColor?: string;
  /**
   * Nó React a ser usado como FUNDO do botão principal (preenche absolute inset-0,
   * atrás do ícone). Quando setado, ignora `mainImageUrl` e renderiza esse node
   * como plano de fundo com o `mainIcon` sobreposto (relative z-10).
   * Ideal pra DarkVeilBackground tingido na cor do segmento.
   */
  mainBackgroundNode?: ReactNode;
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
  mainImageUrl,
  ariaLabel,
  directWhenSingle = false,
  dimmed = false,
  glowColor = '#00C597',
  mainBackgroundNode,
}: SpeedDialFABProps) {
  const [open, setOpen] = useState(false);
  const { locale } = useAppLocaleContext();
  const tP = MESSAGES[locale].app.shell.mobilePrimitives;
  // Imagem do FAB falhou ao carregar → cai pro ícone/accent (fallback).
  const [imageFailed, setImageFailed] = useState(false);
  // FAB de função única: o toque dispara a ação direto, sem speed-dial.
  const isDirect = directWhenSingle && actions.length === 1;
  // mainBackgroundNode tem prioridade sobre mainImageUrl.
  const hasCustomBg = !!mainBackgroundNode;
  // Mostra a imagem quando há URL válida (sem node de fundo custom) e o FAB
  // não está no estado "aberto" (que mostra o X de fechar). Em isDirect nunca
  // há estado aberto.
  const showImage = !hasCustomBg && !!mainImageUrl && !imageFailed && (isDirect || !open);
  // Glow ativo no modo imagem OU no modo fundo-custom (veil), mas nunca quando dimmed.
  const showGlow = (showImage || (hasCustomBg && (isDirect || !open))) && !dimmed;

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
          aria-label={tP.fabCloseMenu}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm animate-in fade-in"
        />
      )}

      <div
        className={cn(
          'fixed flex flex-col gap-3 transition-[filter] duration-150',
          // Rebaixado pra trás de um backdrop externo (z-40) quando dimmed; senão
          // o nível padrão do FAB (z-50, acima do backdrop do próprio speed-dial).
          // ALÉM do z-index: quando dimmed, escurecemos+borramos o PRÓPRIO FAB e
          // o tornamos inerte. Z-index sozinho não basta porque o glow usa
          // mix-blend-mode: plus-lighter, que cria um stacking context isolado e
          // "fura" o backdrop — o FAB aparecia aceso por cima. Dim direto resolve
          // independente de empilhamento.
          dimmed ? 'z-30 blur-sm brightness-50 pointer-events-none' : 'z-50',
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
            o ícone próprio (ex.: ferramenta). Senão → speed-dial (abre/fecha).
            Wrapper relativo SEM overflow pro glow vazar pra fora do círculo. */}
        <div className="relative">
          {/* Glow: disco radial desfocado atrás do FAB. Por padrão verde-Dominex;
              quando glowColor é passado, usa essa cor (ex.: cor do segmento).
              Escondido quando dimmed: plus-lighter "fura" backdrops via stacking
              context isolado, deixando o FAB aceso por cima do escurecimento. */}
          {showGlow && (
            <span
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 scale-[1.5] rounded-full blur-2xl opacity-80"
              style={{
                background: `radial-gradient(circle, ${glowColor} 0%, ${glowColor} 45%, transparent 72%)`,
                mixBlendMode: 'plus-lighter',
              }}
            />
          )}
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
                  ? tP.fabCloseMenu
                  : ariaLabel ?? tP.fabOpenMenu
            }
            aria-expanded={isDirect ? undefined : open}
            className={cn(
              'relative z-10 flex h-14 w-14 items-center justify-center overflow-hidden rounded-full shadow-lg transition-transform active:scale-90',
              // Modo fundo-custom (veil): sem bg concorrente, o node preenche.
              // Modo imagem: bg-card como fundo de fallback enquanto carrega.
              // Modo padrão (só ícone): bg-primary com cor de texto e sombra.
              hasCustomBg
                ? 'shadow-black/30'
                : showImage
                  ? 'bg-card ring-1 ring-black/10 shadow-black/30'
                  : 'bg-primary text-primary-foreground shadow-primary/30',
            )}
          >
            {/* Modo fundo-custom: node de fundo (absolute inset-0) + ícone por cima */}
            {hasCustomBg && (isDirect || !open) ? (
              <>
                <span aria-hidden className="absolute inset-0 rounded-full overflow-hidden">
                  {mainBackgroundNode}
                </span>
                {/* Ícone 32px (h-8 w-8) centralizado pelo flex do botão 56px. */}
                <span className="relative z-10 text-white">
                  <MainIcon className="h-8 w-8" />
                </span>
              </>
            ) : showImage ? (
              <img
                src={mainImageUrl}
                alt=""
                aria-hidden
                draggable={false}
                onError={() => setImageFailed(true)}
                className="h-full w-full rounded-full object-cover"
              />
            ) : isDirect ? (
              <MainIcon className="h-6 w-6" />
            ) : open ? (
              <X className="h-6 w-6" />
            ) : (
              <MainIcon className="h-6 w-6" />
            )}
          </button>
        </div>
      </div>
    </>
  );

  return createPortal(content, document.body);
}
