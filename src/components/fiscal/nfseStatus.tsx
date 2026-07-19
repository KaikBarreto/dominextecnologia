import {
  Clock,
  Loader2,
  CheckCircle2,
  XCircle,
  Ban,
  AlertTriangle,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { NfseStatus } from '@/hooks/useNfse';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

interface StatusMeta {
  label: string;
  icon: LucideIcon;
  /** classes do badge (cor de fundo/texto) */
  badgeClass: string;
  /** cor do ícone na legenda */
  iconClass: string;
}

/** Mapa canônico PT-BR de status da NFS-e. */
const STATUS_META: Record<string, StatusMeta> = {
  pendente: {
    label: 'Pendente',
    icon: Clock,
    badgeClass: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-transparent',
    iconClass: 'text-amber-500',
  },
  processando: {
    label: 'Processando',
    icon: Loader2,
    badgeClass: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border-transparent',
    iconClass: 'text-indigo-500',
  },
  autorizada: {
    label: 'Autorizada',
    icon: CheckCircle2,
    badgeClass: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300 border-transparent',
    iconClass: 'text-green-500',
  },
  rejeitada: {
    label: 'Rejeitada',
    icon: XCircle,
    badgeClass: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300 border-transparent',
    iconClass: 'text-red-500',
  },
  cancelada: {
    label: 'Cancelada',
    icon: Ban,
    badgeClass: 'bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border-transparent',
    iconClass: 'text-gray-500',
  },
  falhou: {
    label: 'Falhou',
    icon: AlertTriangle,
    badgeClass: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300 border-transparent',
    iconClass: 'text-red-500',
  },
};

const FALLBACK: StatusMeta = {
  label: 'Desconhecido',
  icon: AlertTriangle,
  badgeClass: 'bg-muted text-muted-foreground border-transparent',
  iconClass: 'text-muted-foreground',
};

/**
 * Status TERMINAIS: a nota chegou a um desfecho e NÃO deve mais ser pollada.
 * Inclui as duas grafias (PT-BR canônica do banco + variantes EN da Fisqal),
 * pra o polling parar mesmo que o status venha cru da integração.
 */
const TERMINAL_STATUSES = new Set<string>([
  'autorizada',
  'authorized',
  'rejeitada',
  'rejected',
  'falhou',
  'failed',
  'cancelada',
  'cancelled',
  'canceled',
]);

/**
 * `true` quando o status é final (para o polling). Qualquer outro valor —
 * pendente, processando, validated, signed, queued, sent, etc. — é tratado
 * como NÃO-terminal e segue em polling até estourar o timeout.
 */
export function isNfseTerminal(status: NfseStatus): boolean {
  return TERMINAL_STATUSES.has(String(status).toLowerCase());
}

export function getNfseStatusMeta(status: NfseStatus): StatusMeta {
  return STATUS_META[status] ?? FALLBACK;
}

/** Valores canônicos de status (sem tradução) — usados pelo filtro. */
export const NFSE_STATUS_FILTER_OPTIONS = [
  { value: 'pendente' },
  { value: 'processando' },
  { value: 'autorizada' },
  { value: 'rejeitada' },
  { value: 'cancelada' },
  { value: 'falhou' },
] as const;

export function NfseStatusBadge({ status, className }: { status: NfseStatus; className?: string }) {
  const { locale } = useAppLocaleContext();
  const tStatus = MESSAGES[locale].app.nfse.status;
  const meta = getNfseStatusMeta(status);
  const Icon = meta.icon;
  const label =
    tStatus[status as keyof typeof tStatus] ?? tStatus.unknown ?? meta.label;
  return (
    <Badge className={cn('gap-1 font-medium', meta.badgeClass, className)}>
      <Icon className={cn('h-3 w-3', status === 'processando' && 'animate-spin')} />
      {label}
    </Badge>
  );
}
