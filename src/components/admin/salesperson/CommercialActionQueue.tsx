import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNowStrict, isBefore, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ArrowRight, CalendarClock, MessageSquareMore, RefreshCw, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

type QueueRow = {
  lead_id: string;
  company_name: string | null;
  contact_name: string | null;
  pipeline_id: string;
  responsible_name: string | null;
  next_action: string | null;
  next_action_at: string | null;
  last_interaction_at: string | null;
};

function dueLabel(date: string | null) {
  if (!date) return 'Sem data';
  const due = new Date(`${date}T12:00:00`);
  if (isBefore(due, startOfDay(new Date()))) return 'Atrasada';
  return `Para ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(due)}`;
}

/** Notas e mudanças internas também são interações; por isso não chamamos este campo de contato. */
export function CommercialActionQueue({ enabled }: { enabled: boolean }) {
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ['admin-commercial-action-queue', 0, 8],
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<QueueRow[]> => {
      const { data, error } = await (supabase as any).rpc('admin_commercial_action_queue', { p_offset: 0, p_limit: 8 });
      if (error) throw error;
      return (data ?? []) as QueueRow[];
    },
  });

  if (!enabled) return null;
  return (
    <section aria-labelledby="commercial-action-queue-title" className="space-y-3 pt-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Operação comercial</p>
          <h2 id="commercial-action-queue-title" className="mt-1 text-lg font-semibold tracking-tight">Próximos contatos</h2>
          <p className="text-sm text-muted-foreground">Prioridades do CRM: atrasadas, sem interação registrada e próximas ações.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate('/admin/crm?tab=crm')}>Abrir CRM <ArrowRight className="ml-2 h-4 w-4" /></Button>
      </div>
      {query.isLoading ? <div className="space-y-2">{[1, 2, 3].map((item) => <Skeleton key={item} className="h-16 w-full" />)}</div> : null}
      {query.isError ? <div role="alert" className="flex flex-wrap items-center justify-between gap-2 border-y border-destructive/20 py-3 text-sm text-destructive"><span>Não foi possível carregar a fila comercial. As oportunidades continuam preservadas no CRM.</span><Button variant="outline" size="sm" onClick={() => query.refetch()} disabled={query.isRefetching}><RefreshCw className="mr-2 h-4 w-4" />Tentar novamente</Button></div> : null}
      {!query.isLoading && !query.isError && query.data?.length === 0 ? <p className="py-4 text-sm text-muted-foreground">Nenhuma oportunidade aberta aguardando ação.</p> : null}
      {query.data?.length ? <div className="divide-y border-y border-border/60 bg-background">
        {query.data.map((lead) => <button key={lead.lead_id} type="button" onClick={() => navigate(`/admin/crm?tab=crm&pipeline=${lead.pipeline_id}&lead=${lead.lead_id}`)} className="grid w-full gap-1 py-3 text-left transition-colors hover:bg-muted/40 sm:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center sm:gap-4">
          <span className="min-w-0"><strong className="block truncate text-sm">{lead.company_name || 'Empresa não informada'}</strong><span className="block truncate text-xs text-muted-foreground">{lead.contact_name || 'Contato não informado'}</span></span>
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"><UserRound className="h-3.5 w-3.5 shrink-0" />{lead.responsible_name || 'Sem responsável'}</span>
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"><MessageSquareMore className="h-3.5 w-3.5 shrink-0" />{lead.last_interaction_at ? `Interação registrada há ${formatDistanceToNowStrict(new Date(lead.last_interaction_at), { addSuffix: false, locale: ptBR })}` : 'Sem interação registrada'}</span>
          <span className="flex min-w-0 items-center justify-between gap-2 text-xs sm:block"><span className="font-medium text-foreground">{lead.next_action?.trim() || 'Definir próxima ação'}</span><span className="ml-2 inline-flex items-center gap-1 text-muted-foreground"><CalendarClock className="h-3.5 w-3.5" />{dueLabel(lead.next_action_at)}</span></span>
        </button>)}
      </div> : null}
    </section>
  );
}
