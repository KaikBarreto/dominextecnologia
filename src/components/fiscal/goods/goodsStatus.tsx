import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
  FileEdit,
  Loader2,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface GoodsStatusMeta {
  label: string;
  icon: LucideIcon;
  /** Selo SATURADO por régua da casa: fundo na cor + texto e ícone brancos. */
  badgeClass: string;
  spin?: boolean;
}

/**
 * Situações da NF-e/NFC-e. Mesma paleta do selo da NFS-e (`nfseStatus.tsx`) para
 * que a mesma situação tenha a mesma cor nas três telas fiscais.
 */
const STATUS_META: Record<string, GoodsStatusMeta> = {
  draft: { label: 'Rascunho', icon: FileEdit, badgeClass: 'bg-slate-500 text-white hover:bg-slate-500 border-transparent' },
  queued: { label: 'Na fila', icon: Clock, badgeClass: 'bg-amber-500 text-white hover:bg-amber-500 border-transparent' },
  preparing: { label: 'Preparando', icon: Loader2, spin: true, badgeClass: 'bg-indigo-500 text-white hover:bg-indigo-500 border-transparent' },
  signed: { label: 'Envio pendente', icon: Clock, badgeClass: 'bg-amber-500 text-white hover:bg-amber-500 border-transparent' },
  transmitting: { label: 'Enviando', icon: Loader2, spin: true, badgeClass: 'bg-indigo-500 text-white hover:bg-indigo-500 border-transparent' },
  uncertain: { label: 'Aguardando SEFAZ', icon: Loader2, spin: true, badgeClass: 'bg-indigo-500 text-white hover:bg-indigo-500 border-transparent' },
  authorized: { label: 'Autorizada', icon: CheckCircle2, badgeClass: 'bg-emerald-500 text-white hover:bg-emerald-500 border-transparent' },
  rejected: { label: 'Rejeitada', icon: XCircle, badgeClass: 'bg-red-500 text-white hover:bg-red-500 border-transparent' },
  cancellation_pending: { label: 'Cancelando', icon: Loader2, spin: true, badgeClass: 'bg-amber-500 text-white hover:bg-amber-500 border-transparent' },
  cancelled: {
    label: 'Cancelada',
    icon: Ban,
    badgeClass: 'bg-gray-800 text-white hover:bg-gray-800 dark:bg-gray-600 dark:hover:bg-gray-600 border-transparent',
  },
};

const FALLBACK: GoodsStatusMeta = {
  label: 'Situação desconhecida',
  icon: AlertTriangle,
  badgeClass: 'bg-muted text-muted-foreground border-transparent',
};

export const goodsStatusLabel = (status: unknown) => (STATUS_META[String(status)] ?? FALLBACK).label;

/** Ordem do filtro: do que pede ação para o que já terminou. */
export const GOODS_STATUS_FILTER_OPTIONS = [
  'draft',
  'signed',
  'uncertain',
  'rejected',
  'authorized',
  'cancellation_pending',
  'cancelled',
].map((value) => ({ value, label: goodsStatusLabel(value) }));

/** Situações que o filtro agrupa sob um mesmo rótulo visível. */
export function goodsStatusFilterKey(status: unknown): string {
  const value = String(status);
  if (value === 'queued' || value === 'preparing' || value === 'transmitting') return 'uncertain';
  return value;
}

export function GoodsStatusBadge({
  status,
  hint,
  className,
}: {
  status: unknown;
  /** Explicação curta da situação (motivo da rejeição, por exemplo). */
  hint?: string | null;
  className?: string;
}) {
  const meta = STATUS_META[String(status)] ?? FALLBACK;
  const Icon = meta.icon;
  const badge = (
    <Badge className={cn('gap-1 font-medium whitespace-nowrap', meta.badgeClass, hint && 'cursor-help', className)}>
      <Icon className={cn('h-3 w-3', meta.spin && 'animate-spin')} />
      {meta.label}
    </Badge>
  );
  if (!hint) return badge;
  return (
    <TooltipProvider>
      <Tooltip>
        {/* O Badge não repassa ref; o gatilho do tooltip precisa de um elemento que repasse. */}
        <TooltipTrigger asChild>
          <span className="inline-flex">{badge}</span>
        </TooltipTrigger>
        <TooltipContent className="max-w-[300px]">
          <p className="text-sm">{hint}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
