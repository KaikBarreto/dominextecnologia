import { useQuery } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Clock3, CreditCard, RefreshCw, ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

type Change = { id: string; kind: string; status: string; amount: number; createdAt: string; paidAt: string | null; appliedAt: string | null; paymentStatus: string | null; paymentVerified: boolean; paymentCheckFailed: boolean };
type Recurrence = { state: 'none' | 'active' | 'inactive' | 'unavailable'; kind: 'card' | 'pix_invoice' | 'boleto' | 'pix_automatic' | null; value: number | null; expectedAmount: number | null; grouped: boolean; mismatch: boolean; manualCreation: boolean; nextDueDate?: string | null };
type Status = { checkedAt: string; changes: Change[]; recurrence: Recurrence };
const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const date = (value: string | null) => value ? new Date(value).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';
const kinds: Record<string, string> = { upgrade: 'Ampliação do plano', downgrade: 'Redução do plano', upgrade_installment: 'Ampliação na próxima parcela', courtesy: 'Cortesia', same: 'Ajuste do plano' };
const recurrenceLabels = { card: 'Cartão recorrente', pix_invoice: 'Cobrança recorrente por PIX', boleto: 'Boleto recorrente', pix_automatic: 'Pix Automático' };
function State({ children, tone }: { children: React.ReactNode; tone: 'green' | 'amber' | 'slate' }) {
  const Icon = tone === 'green' ? CheckCircle2 : tone === 'amber' ? AlertCircle : Clock3;
  return <span className={`inline-flex max-w-full items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-white ${tone === 'green' ? 'bg-emerald-700' : tone === 'amber' ? 'bg-amber-700' : 'bg-slate-600'}`}><Icon className="h-3.5 w-3.5 shrink-0" />{children}</span>;
}
export function CompanyBillingStatus({ companyId }: { companyId: string }) {
  const { user } = useAuth();
  const permission = useQuery({ queryKey: ['admin-billing-read', user?.id], enabled: !!user, queryFn: async () => {
    const { data, error } = await (supabase as any).rpc('can_read_admin_financial', { _user_id: user!.id });
    if (error) throw error; return data === true;
  }});
  const report = useQuery({ queryKey: ['admin-company-billing-status', companyId, user?.id], enabled: !!companyId && permission.data === true, staleTime: 30_000, queryFn: async (): Promise<Status> => {
    const { data, error } = await supabase.functions.invoke('admin-company-billing-status', { body: { companyId } });
    if (error || data?.error) throw new Error('Não foi possível consultar a cobrança.');
    return data as Status;
  }});
  if (!permission.isLoading && !permission.isError && permission.data !== true) return null;
  const recurrence = report.data?.recurrence;
  return <section aria-label="Situação do plano e da cobrança" className="mb-6 space-y-5 rounded-xl bg-white p-4 text-slate-950 sm:p-6 dark:bg-background dark:text-foreground">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-base font-semibold">Plano e cobrança</h2><p className="mt-1 text-sm text-muted-foreground">Acompanhe o pagamento, a liberação e a próxima cobrança.</p></div>
      <Button size="sm" variant="outline" className="gap-2" disabled={report.isFetching || permission.isFetching} onClick={() => { if (permission.isError) void permission.refetch(); else void report.refetch(); }}><RefreshCw className={`h-4 w-4 ${report.isFetching ? 'animate-spin' : ''}`} />Atualizar</Button>
    </div>
    {permission.isError || report.isError ? <div role="alert" className="flex items-start gap-2 border-l-2 border-amber-700 pl-3"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" /><p className="text-sm">Não foi possível confirmar os dados de cobrança. Use Atualizar para tentar novamente; nenhum pagamento foi alterado.</p></div>
      : permission.isLoading || report.isLoading ? <div role="status" aria-label="Consultando cobrança" className="space-y-3"><Skeleton className="h-5 w-48" /><Skeleton className="h-20 w-full" /></div>
      : recurrence && <>
        <div className="flex items-start gap-3 border-b pb-5">
          <CreditCard className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold">Próxima cobrança{recurrence.grouped ? ' do grupo' : ''}</h3>
              <State tone={recurrence.state === 'active' && !recurrence.mismatch ? 'green' : recurrence.state === 'unavailable' || recurrence.mismatch ? 'amber' : 'slate'}>{recurrence.mismatch ? 'Valor divergente' : recurrence.state === 'active' ? 'Ativa no gateway' : recurrence.state === 'inactive' ? 'Recorrência inativa' : recurrence.state === 'unavailable' ? 'Não foi possível verificar' : 'Sem recorrência vinculada'}</State>
            </div>
            {recurrence.state === 'none' ? <p className="text-sm text-muted-foreground">O pagamento pode ser feito pela tela Assinatura da empresa. Autorizações antigas no banco precisam ser conferidas com o cliente.</p>
              : recurrence.state === 'unavailable' ? <p className="text-sm text-muted-foreground">Existe um vínculo cadastrado, mas o estado no gateway não foi confirmado. Tente atualizar antes de orientar o cliente.</p>
              : <p className="text-sm">{recurrence.kind && recurrenceLabels[recurrence.kind]}{recurrence.value !== null && <> · <strong className="tabular-nums">{money(recurrence.value)}</strong></>}{recurrence.nextDueDate && <> · próximo vencimento {date(`${recurrence.nextDueDate}T12:00:00-03:00`)}</>}</p>}
            {recurrence.mismatch && <div className="space-y-1 text-sm"><p>O valor esperado é <strong>{money(recurrence.expectedAmount!)}</strong>. O plano já liberado e a cobrança do gateway precisam ser conferidos separadamente.</p><p className="text-muted-foreground">{recurrence.kind === 'pix_automatic' ? 'Para um Pix Automático de valor fixo, combine nova autorização com o cliente ou pagamento pela tela Assinatura. Não gere outra cobrança sem conferir a existente.' : 'Revise a recorrência existente antes do próximo vencimento para evitar uma cobrança com valor incorreto.'}</p></div>}
            {recurrence.state === 'active' && recurrence.manualCreation && !recurrence.mismatch && <p className="text-xs text-muted-foreground">A autorização está ativa, mas cada cobrança precisa ser gerada para o ciclo correspondente.</p>}
          </div>
        </div>
        <div><h3 className="mb-3 text-sm font-semibold">Alterações recentes</h3>
          {!report.data?.changes.length ? <p className="text-sm text-muted-foreground">Nenhuma alteração de plano solicitada por este fluxo. O histórico abaixo reúne as demais alterações.</p>
            : <div className="divide-y">{report.data.changes.map(change => {
              const applied = change.status === 'applied' && !!change.appliedAt;
              const failed = ['failed', 'cancelled', 'expired'].includes(change.status);
              const noCharge = change.amount === 0;
              const needsReview = change.paymentVerified && !applied;
              return <article key={change.id} className="grid gap-3 py-4 first:pt-0 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]">
                <div><p className="text-sm font-medium">{kinds[change.kind] ?? 'Alteração do plano'}</p><p className="mt-1 text-xs text-muted-foreground">Solicitada em {date(change.createdAt)}{!noCharge && <> · <span className="font-semibold tabular-nums text-foreground">{money(change.amount)}</span></>}</p></div>
                <div><p className="mb-1.5 text-xs text-muted-foreground">Pagamento</p><State tone={change.paymentVerified ? 'green' : change.paymentCheckFailed ? 'amber' : 'slate'}>{noCharge ? 'Sem cobrança' : change.paymentVerified ? 'Confirmado' : change.paymentCheckFailed ? 'Consulta indisponível' : failed ? 'Solicitação encerrada' : 'Aguardando pagamento'}</State>{change.paidAt && <p className="mt-1 text-xs text-muted-foreground">{date(change.paidAt)}</p>}</div>
                <div><p className="mb-1.5 text-xs text-muted-foreground">Liberação do plano</p><State tone={applied ? 'green' : needsReview || change.status === 'failed' ? 'amber' : 'slate'}>{applied ? 'Aplicada' : needsReview ? 'Pagamento recebido · revisar' : failed ? 'Não aplicada' : change.kind === 'upgrade_installment' ? 'Na próxima parcela' : 'Aguardando confirmação'}</State>{change.appliedAt && <p className="mt-1 text-xs text-muted-foreground">{date(change.appliedAt)}</p>}</div>
              </article>;
            })}</div>}
        </div>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5 shrink-0" />Consulta de status. Nenhuma cobrança ou assinatura é alterada aqui.</p>
      </>}
  </section>;
}
