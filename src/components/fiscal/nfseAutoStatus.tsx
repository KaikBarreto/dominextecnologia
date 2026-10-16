import {
  Clock,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Ban,
  Lock,
  PlugZap,
  Gauge,
  HelpCircle,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { NfseAutoJobStatus } from '@/hooks/useNfseAutoJobs';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

interface AutoStatusMeta {
  icon: LucideIcon;
  /** Badge SATURADO: fundo na cor + texto/ícone branco (régua da casa). */
  badgeClass: string;
}

/**
 * Metadados visuais dos 9 status de `nfse_auto_jobs`. Vocabulário e
 * significado exatos vêm dos comentários de
 * `supabase/migrations/20261016140000_nfse_automatica_por_contrato_onda1.sql`.
 * Label sempre via i18n (`MESSAGES[locale].app.nfse.auto.status`), nunca
 * hardcoded aqui.
 */
const STATUS_META: Record<string, AutoStatusMeta> = {
  pendente: {
    icon: Clock,
    badgeClass: 'bg-amber-500 text-white hover:bg-amber-500 border-transparent',
  },
  processando: {
    icon: Loader2,
    badgeClass: 'bg-indigo-500 text-white hover:bg-indigo-500 border-transparent',
  },
  emitida: {
    icon: CheckCircle2,
    badgeClass: 'bg-emerald-500 text-white hover:bg-emerald-500 border-transparent',
  },
  falhou: {
    icon: AlertTriangle,
    badgeClass: 'bg-red-600 text-white hover:bg-red-600 border-transparent',
  },
  // As três portas fechadas (R7 do plano): tom âmbar-queimado, distinto do
  // "pendente" comum e do "falhou" vermelho — não é erro, é bloqueio reversível.
  bloqueada_assinatura: {
    icon: Lock,
    badgeClass: 'bg-orange-500 text-white hover:bg-orange-500 border-transparent',
  },
  bloqueada_modulo: {
    icon: PlugZap,
    badgeClass: 'bg-orange-500 text-white hover:bg-orange-500 border-transparent',
  },
  bloqueada_cota: {
    icon: Gauge,
    badgeClass: 'bg-orange-500 text-white hover:bg-orange-500 border-transparent',
  },
  // Nunca volta sozinho (R7.5) — cor própria, nem erro nem bloqueio comum.
  aguardando_decisao: {
    icon: HelpCircle,
    badgeClass: 'bg-sky-500 text-white hover:bg-sky-500 border-transparent',
  },
  cancelada: {
    icon: Ban,
    badgeClass:
      'bg-gray-800 text-white hover:bg-gray-800 dark:bg-gray-600 dark:hover:bg-gray-600 border-transparent',
  },
};

const FALLBACK: AutoStatusMeta = {
  icon: AlertTriangle,
  badgeClass: 'bg-muted text-muted-foreground border-transparent',
};

export function getNfseAutoStatusMeta(status: NfseAutoJobStatus): AutoStatusMeta {
  return STATUS_META[status] ?? FALLBACK;
}

export function NfseAutoStatusBadge({
  status,
  className,
}: {
  status: NfseAutoJobStatus;
  className?: string;
}) {
  const { locale } = useAppLocaleContext();
  const tStatus = MESSAGES[locale].app.nfse.auto.status;
  const meta = getNfseAutoStatusMeta(status);
  const Icon = meta.icon;
  const label = tStatus[status as keyof typeof tStatus] ?? tStatus.unknown ?? status;
  return (
    <Badge className={cn('gap-1 font-medium', meta.badgeClass, className)}>
      <Icon className={cn('h-3 w-3', status === 'processando' && 'animate-spin')} />
      {label}
    </Badge>
  );
}
