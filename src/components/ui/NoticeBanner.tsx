/**
 * NoticeBanner — a ÚNICA forma de fazer caixa de aviso no Dominex.
 *
 * Régua do CEO (reforçada em 2026-09-29, print do "8 materiais abaixo do mínimo"):
 * aviso é SATURADO com texto e ícone BRANCOS. Está proibido o tint pastel
 * (`bg-destructive/10` + `text-destructive`) — lê como rascunho desbotado.
 *
 * Só há duas saídas aceitas:
 *   1. cor cheia + texto/ícone brancos  → variantes destructive | warning | success | info
 *   2. caixa neutra (cinza), sem tingir → variante neutral
 *
 * NÃO use este componente para CARD DE ESTADO (erro de conexão, "não foi possível
 * carregar"). Esse tem régua própria: fundo branco/neutro, cor saturada só no ícone
 * e no título em negrito.
 */
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

const noticeVariants = cva(
  'flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left',
  {
    variants: {
      variant: {
        destructive: 'bg-destructive text-destructive-foreground',
        warning: 'bg-warning text-warning-foreground',
        success: 'bg-success text-success-foreground',
        info: 'bg-info text-info-foreground',
        neutral: 'bg-muted text-foreground',
      },
      interactive: {
        true: 'transition-opacity hover:opacity-90 cursor-pointer',
        false: '',
      },
    },
    defaultVariants: { variant: 'info', interactive: false },
  },
);

type NoticeVariant = NonNullable<VariantProps<typeof noticeVariants>['variant']>;

const DEFAULT_ICON: Record<NoticeVariant, LucideIcon> = {
  destructive: XCircle,
  warning: AlertTriangle,
  success: CheckCircle2,
  info: Info,
  neutral: Info,
};

export interface NoticeBannerProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'>,
    VariantProps<typeof noticeVariants> {
  /** Ícone à esquerda. Omitido = ícone padrão da variante. `null` = sem ícone. */
  icon?: LucideIcon | null;
  /** Linha em negrito acima do corpo. Opcional — aviso de uma linha só usa children. */
  title?: React.ReactNode;
  /** Conteúdo à direita (link, contador, botão). Não encolhe no mobile. */
  action?: React.ReactNode;
  /** Torna a faixa inteira clicável (vira <button>). */
  onClick?: React.MouseEventHandler<HTMLElement>;
}

/**
 * Faixa de aviso saturada. Mobile-first: o texto quebra, a ação fica fixa à direita.
 *
 * ```tsx
 * <NoticeBanner variant="destructive" onClick={openNew} action={t.lowStockAlert.action}>
 *   {t.lowStockAlert.plural.replace('{count}', String(count))}
 * </NoticeBanner>
 * ```
 */
export const NoticeBanner = React.forwardRef<HTMLDivElement, NoticeBannerProps>(
  ({ className, variant, icon, title, action, children, onClick, ...props }, ref) => {
    const resolved = (variant ?? 'info') as NoticeVariant;
    const Icon = icon === null ? null : (icon ?? DEFAULT_ICON[resolved]);
    const Tag = (onClick ? 'button' : 'div') as 'div';

    return (
      <Tag
        ref={ref}
        role={onClick ? undefined : 'alert'}
        {...(onClick ? { type: 'button' as const, onClick } : {})}
        className={cn(noticeVariants({ variant, interactive: !!onClick }), className)}
        {...props}
      >
        {Icon && <Icon className="h-4 w-4 shrink-0" />}
        <span className="min-w-0 flex-1 text-sm">
          {title && <span className="block font-semibold">{title}</span>}
          {children}
        </span>
        {action && <span className="shrink-0 text-xs font-medium">{action}</span>}
      </Tag>
    );
  },
);
NoticeBanner.displayName = 'NoticeBanner';
