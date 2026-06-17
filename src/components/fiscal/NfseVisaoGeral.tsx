import { useMemo } from 'react';
import { CheckCircle2, Loader2, XCircle, Ban, FileText } from 'lucide-react';
import { formatBRL } from '@/utils/currency';
import { MobileListItem } from '@/components/mobile/MobileListItem';
import { NfseStatusBadge } from './nfseStatus';
import type { NfseEmission } from '@/hooks/useNfse';

interface NfseVisaoGeralProps {
  emissions: NfseEmission[];
  customerName: (id: string | null) => string;
  /** Abre o detalhe de uma emissão (reusa o modal da aba NFS-e). */
  onOpenDetail: (e: NfseEmission) => void;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

/**
 * Visão Geral da aba Notas Fiscais — AGREGA (não repete a listagem).
 * Mostra contadores honestos por status, total emitido (autorizadas) e as
 * últimas 5 emissões como atalho. Todos os números saem do mesmo dataset do
 * `useNfse`, sem inflar.
 */
export function NfseVisaoGeral({ emissions, customerName, onOpenDetail }: NfseVisaoGeralProps) {
  const stats = useMemo(() => {
    let autorizadas = 0;
    let processando = 0;
    let rejeitadas = 0;
    let canceladas = 0;
    let totalEmitido = 0; // só notas autorizadas contam no valor faturado
    for (const e of emissions) {
      switch (e.status) {
        case 'autorizada':
          autorizadas += 1;
          totalEmitido += e.valor_servico ?? 0;
          break;
        case 'processando':
        case 'pendente':
          processando += 1;
          break;
        case 'rejeitada':
        case 'falhou':
          rejeitadas += 1;
          break;
        case 'cancelada':
          canceladas += 1;
          break;
        default:
          break;
      }
    }
    return { autorizadas, processando, rejeitadas, canceladas, totalEmitido };
  }, [emissions]);

  const recent = useMemo(() => emissions.slice(0, 5), [emissions]);

  if (emissions.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <FileText className="h-12 w-12 mx-auto mb-3 opacity-40" />
        <p>Nenhuma nota fiscal emitida ainda. Clique em "Nova Nota" para começar.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Card-herói: total emitido (autorizadas) — moeda em card próprio,
          NÃO no StatCarousel (que formata como inteiro). */}
      <div className="rounded-xl border bg-card p-4">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          Total emitido no período
        </p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{formatBRL(stats.totalEmitido)}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Soma das notas autorizadas ({stats.autorizadas}).
        </p>
      </div>

      {/* Contadores por status */}
      <div className="grid grid-cols-2 gap-3">
        <CountCard
          icon={CheckCircle2}
          iconClass="text-green-500"
          label="Autorizadas"
          value={stats.autorizadas}
        />
        <CountCard
          icon={Loader2}
          iconClass="text-indigo-500"
          label="Processando"
          value={stats.processando}
        />
        <CountCard
          icon={XCircle}
          iconClass="text-red-500"
          label="Rejeitadas"
          value={stats.rejeitadas}
        />
        <CountCard icon={Ban} iconClass="text-gray-500" label="Canceladas" value={stats.canceladas} />
      </div>

      {/* Últimas emissões (atalho — não é a listagem completa) */}
      <div className="space-y-2">
        <p className="text-sm font-medium">Últimas emissões</p>
        <div className="rounded-xl border bg-card overflow-hidden divide-y divide-border/60">
          {recent.map((e) => (
            <MobileListItem
              key={e.id}
              onClick={() => onOpenDetail(e)}
              leading={<FileText className="h-5 w-5 text-muted-foreground" />}
              title={e.numero_nfse ? `Nota nº ${e.numero_nfse}` : customerName(e.customer_id)}
              subtitle={
                <span>
                  {customerName(e.customer_id)} · {formatDate(e.created_at)}
                  {e.valor_servico != null ? ` · ${formatBRL(e.valor_servico)}` : ''}
                </span>
              }
              trailing={<NfseStatusBadge status={e.status} />}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function CountCard({
  icon: Icon,
  iconClass,
  label,
  value,
}: {
  icon: typeof CheckCircle2;
  iconClass: string;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border bg-card p-3.5">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className={`h-4 w-4 ${iconClass}`} />
        <span className="text-xs">{label}</span>
      </div>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
