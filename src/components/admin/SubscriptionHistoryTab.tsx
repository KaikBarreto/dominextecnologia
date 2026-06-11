import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface Props {
  companyId: string;
}

interface SubscriptionHistoryRow {
  id: string;
  created_at: string;
  previous_plan: string | null;
  new_plan: string | null;
  previous_value: number | null;
  new_value: number | null;
  previous_status: string | null;
  new_status: string | null;
  reason: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Ativo',
  testing: 'Testando',
  inactive: 'Desativado',
  cancelled: 'Cancelado',
  pending_payment: 'Pagamento Pendente',
};

function formatStatus(status: string | null): string {
  if (!status) return '—';
  return STATUS_LABELS[status] ?? status;
}

function formatCurrency(value: number | null): string {
  if (value == null) return '—';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export function SubscriptionHistoryTab({ companyId }: Props) {
  const { data: history, isLoading } = useQuery({
    queryKey: ['subscription_history', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subscription_history')
        .select(
          'id, created_at, previous_plan, new_plan, previous_value, new_value, previous_status, new_status, reason'
        )
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as SubscriptionHistoryRow[];
    },
    enabled: !!companyId,
  });

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  if (!history || history.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          Nenhuma mudança de plano registrada ainda.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b">
            <tr className="text-left">
              <th className="p-3">Data</th>
              <th className="p-3">Plano</th>
              <th className="p-3">Valor</th>
              <th className="p-3">Status</th>
              <th className="p-3">Motivo</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h) => {
              const planChanged =
                h.previous_plan && h.new_plan && h.previous_plan !== h.new_plan;
              const valueChanged =
                h.previous_value != null &&
                h.new_value != null &&
                h.previous_value !== h.new_value;
              const statusChanged =
                h.previous_status &&
                h.new_status &&
                h.previous_status !== h.new_status;

              return (
                <tr key={h.id} className="border-b last:border-0">
                  <td className="p-3 text-muted-foreground whitespace-nowrap">
                    {format(new Date(h.created_at), 'dd/MM/yyyy HH:mm', {
                      locale: ptBR,
                    })}
                  </td>
                  <td className="p-3 capitalize">
                    {planChanged ? (
                      <span>
                        <strong>{h.previous_plan}</strong> →{' '}
                        <strong>{h.new_plan}</strong>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    {valueChanged ? (
                      <span>
                        {formatCurrency(h.previous_value)} →{' '}
                        {formatCurrency(h.new_value)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="p-3">
                    {statusChanged ? (
                      <span>
                        {formatStatus(h.previous_status)} →{' '}
                        {formatStatus(h.new_status)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {h.reason || '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
