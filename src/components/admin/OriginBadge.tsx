import type { ReactNode } from 'react';
import * as LucideIcons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  resolveOrigin,
  UNKNOWN_ORIGIN_ICON,
  type CatalogOrigin,
  type ResolvedOrigin,
} from '@/utils/companyOriginCatalog';

/** Ícone lucide por nome. Cai no `Globe` se o nome cadastrado não existir mais. */
export function OriginIcon({ name, className }: { name?: string | null; className?: string }) {
  const icons = LucideIcons as unknown as Record<string, LucideIcon>;
  const Icon = (name && icons[name]) || icons[UNKNOWN_ORIGIN_ICON];
  if (!Icon) return null;
  return <Icon className={className || 'h-3 w-3'} />;
}

interface OriginBadgeProps {
  /** Nome salvo em `companies.origin` / `admin_leads.source`. */
  name: string | null | undefined;
  /** Catálogo `company_origins`. */
  origins: CatalogOrigin[] | null | undefined;
  className?: string;
  iconClassName?: string;
  /** O que renderizar quando NÃO há origem (null/vazia). Default: nada. */
  emptyFallback?: ReactNode;
  /** Oculta o ícone (listagens muito apertadas). */
  hideIcon?: boolean;
}

/**
 * Badge saturado de origem: fundo na cor da origem, texto e ícone brancos.
 *
 * Origem fora do catálogo NÃO vira texto cru nem "N/A": vira badge cinza neutro
 * com o texto que existe e ícone `Globe`. Origem ausente é outra coisa — cai no
 * `emptyFallback` (por padrão nada), nunca num badge cinza.
 */
export function OriginBadge({
  name,
  origins,
  className,
  iconClassName,
  emptyFallback = null,
  hideIcon = false,
}: OriginBadgeProps) {
  const resolved = resolveOrigin(name, origins);
  if (!resolved) return <>{emptyFallback}</>;
  return (
    <ResolvedOriginBadge
      origin={resolved}
      className={className}
      iconClassName={iconClassName}
      hideIcon={hideIcon}
    />
  );
}

/** Mesma pintura, pra quem já resolveu a origem antes (evita resolver 2x). */
export function ResolvedOriginBadge({
  origin,
  className,
  iconClassName,
  hideIcon = false,
}: {
  origin: ResolvedOrigin;
  className?: string;
  iconClassName?: string;
  hideIcon?: boolean;
}) {
  return (
    <Badge
      className={cn('text-white border-0 gap-1 max-w-full', className)}
      style={{ backgroundColor: origin.color }}
    >
      {!hideIcon && <OriginIcon name={origin.icon} className={cn('shrink-0', iconClassName || 'h-3 w-3')} />}
      <span className="min-w-0 truncate">{origin.name}</span>
    </Badge>
  );
}
