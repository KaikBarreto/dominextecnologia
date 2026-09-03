import {
  Clock,
  Loader2,
  CheckCircle2,
  XCircle,
  Ban,
  AlertTriangle,
  FileEdit,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { NfseStatus } from '@/hooks/useNfse';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

interface StatusMeta {
  /** Label removido — sempre resolvido via i18n em NfseStatusBadge. */
  icon: LucideIcon;
  /** classes do badge (cor de fundo/texto) */
  badgeClass: string;
  /** cor do ícone na legenda */
  iconClass: string;
}

/** Mapa de status da NFS-e — somente metadados visuais (ícone + cores).
 *  Labels são sempre resolvidos via MESSAGES[locale].app.nfse.status.
 *
 *  Badge é SATURADO por regra da casa: fundo na cor + texto e ícone brancos.
 *  O tom pastel de antes (bg-*-100/text-*-700) sumia no tema escuro e tinha
 *  cara de UI genérica. `iconClass` é a versão colorida do ícone, usada só na
 *  LEGENDA (onde o ícone aparece sobre a superfície da tela, sem fundo). */
const STATUS_META: Record<string, StatusMeta> = {
  rascunho: {
    icon: FileEdit,
    badgeClass: 'bg-slate-500 text-white hover:bg-slate-500 border-transparent',
    iconClass: 'text-slate-500',
  },
  pendente: {
    icon: Clock,
    badgeClass: 'bg-amber-500 text-white hover:bg-amber-500 border-transparent',
    iconClass: 'text-amber-500',
  },
  processando: {
    icon: Loader2,
    badgeClass: 'bg-indigo-500 text-white hover:bg-indigo-500 border-transparent',
    iconClass: 'text-indigo-500',
  },
  autorizada: {
    icon: CheckCircle2,
    badgeClass: 'bg-emerald-500 text-white hover:bg-emerald-500 border-transparent',
    iconClass: 'text-emerald-500',
  },
  rejeitada: {
    icon: XCircle,
    badgeClass: 'bg-red-500 text-white hover:bg-red-500 border-transparent',
    iconClass: 'text-red-500',
  },
  cancelada: {
    icon: Ban,
    // Cancelada não é erro nem sucesso: cinza-escuro, o mesmo tratamento dado
    // ao card de canceladas.
    // No tema escuro o cinza-900 encostava no fundo da linha e o selo sumia;
    // sobe pro cinza-600 pra continuar legível sem virar outra cor.
    badgeClass:
      'bg-gray-800 text-white hover:bg-gray-800 dark:bg-gray-600 dark:hover:bg-gray-600 border-transparent',
    iconClass: 'text-gray-500',
  },
  falhou: {
    icon: AlertTriangle,
    badgeClass: 'bg-red-600 text-white hover:bg-red-600 border-transparent',
    iconClass: 'text-red-500',
  },
  // Cancelamento pedido e ainda em processamento na prefeitura — estado
  // transitório (âmbar, como `pendente`) que vira `cancelada` no fim.
  cancelamento_pendente: {
    icon: Loader2,
    badgeClass: 'bg-amber-500 text-white hover:bg-amber-500 border-transparent',
    iconClass: 'text-amber-500',
  },
};

const FALLBACK: StatusMeta = {
  icon: AlertTriangle,
  badgeClass: 'bg-muted text-muted-foreground border-transparent',
  iconClass: 'text-muted-foreground',
};

/**
 * Status TERMINAIS: a nota chegou a um desfecho e NÃO deve mais ser pollada.
 * Inclui as duas grafias (PT-BR canônica do banco + variantes EN do provedor),
 * pra o polling parar mesmo que o status venha cru da integração.
 *
 * ATENÇÃO: `cancelamento_pendente` NÃO entra aqui — é transitório e o polling
 * precisa continuar até o status virar `cancelada`.
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
  { value: 'rascunho' },
  { value: 'pendente' },
  { value: 'processando' },
  { value: 'autorizada' },
  { value: 'rejeitada' },
  { value: 'cancelamento_pendente' },
  { value: 'cancelada' },
  { value: 'falhou' },
] as const;

export function NfseStatusBadge({ status, className }: { status: NfseStatus; className?: string }) {
  const { locale } = useAppLocaleContext();
  const tStatus = MESSAGES[locale].app.nfse.status;
  const meta = getNfseStatusMeta(status);
  const Icon = meta.icon;
  // Label sempre via i18n; fallback para a chave 'unknown' (nunca PT-BR hardcoded).
  const label = tStatus[status as keyof typeof tStatus] ?? tStatus.unknown ?? status;
  return (
    <Badge className={cn('gap-1 font-medium', meta.badgeClass, className)}>
      <Icon
        className={cn(
          'h-3 w-3',
          (status === 'processando' || status === 'cancelamento_pendente') && 'animate-spin',
        )}
      />
      {label}
    </Badge>
  );
}
