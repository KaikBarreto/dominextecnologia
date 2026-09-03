import { FileText, Loader2 } from 'lucide-react';
import { formatMoney, formatDate } from '@/lib/format';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { MobileListItem } from '@/components/mobile/MobileListItem';
import { NfseStatusBadge } from './nfseStatus';
import { nfseDisplayDate, type NfseListRow } from './nfseRow';

interface NfseVisaoGeralProps {
  /** Últimas notas do período (a página já chega ordenada e recortada). */
  rows: NfseListRow[];
  loading?: boolean;
  /** Abre o detalhe de uma nota (mesmo modal da aba NFS-e). */
  onOpenDetail: (row: NfseListRow) => void;
}

/**
 * Visão Geral da tela de Notas Fiscais.
 *
 * Os contadores e o total emitido saíram daqui: agora vivem ACIMA do menu de
 * abas (NfseStatsCards), visíveis nas duas abas. O que sobra é o atalho das
 * últimas emissões — não é a listagem completa, é o "o que aconteceu por
 * último".
 */
export function NfseVisaoGeral({ rows, loading = false, onOpenDetail }: NfseVisaoGeralProps) {
  const { locale, currency, timezone } = useAppLocaleContext();
  const t = MESSAGES[locale].app.nfse;

  if (loading) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-3 py-16"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">{t.list.loading}</p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <FileText className="h-12 w-12 mx-auto mb-3 opacity-40" />
        <p>{t.overview.empty}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{t.overview.recentTitle}</p>
      <div className="rounded-xl border bg-card overflow-hidden divide-y divide-border/60">
        {rows.map((row) => {
          // Título: número da nota quando já existe; senão a descrição do
          // serviço; senão o status por extenso. NUNCA o nome do cliente — ele
          // já é o começo do subtítulo, e repetir virava
          // "FULANO LTDA / FULANO LTDA · 02/09 · R$ 2,00".
          const statusLabel =
            (t.status as Record<string, string>)[row.status] ?? t.status.unknown;
          const title = row.numero_nfse
            ? `${t.list.notePrefix} ${row.numero_nfse}`
            : row.descricao_servico || statusLabel;

          // Data exibida = COMPETÊNCIA, igual à coluna "Data" da listagem.
          const dateStr = nfseDisplayDate(row);

          return (
            <MobileListItem
              key={row.id}
              onClick={() => onOpenDetail(row)}
              leading={<FileText className="h-5 w-5 text-muted-foreground" />}
              title={<span className="line-clamp-1">{title}</span>}
              subtitle={
                <span className="line-clamp-1">
                  {row.customer_name || t.list.customerFallback}
                  {dateStr ? ` · ${formatDate(dateStr, locale, timezone)}` : ''}
                  {row.valor_servico != null
                    ? ` · ${formatMoney(row.valor_servico, currency, locale)}`
                    : ''}
                </span>
              }
              trailing={<NfseStatusBadge status={row.status} />}
            />
          );
        })}
      </div>
    </div>
  );
}
