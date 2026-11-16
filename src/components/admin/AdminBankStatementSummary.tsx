import { adminKpiClass } from "@/components/admin/adminKpiStyles";
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';

type Summary = { opening_balance: number; opening_balance_date: string | null; system_balance: number; statement_balance: number | null; statement_date: string | null; difference: number | null; last_imported_at: string | null; pending_count: number };
const money = (n: number) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const date = (day: string | null) => day ? day.slice(0, 10).split('-').reverse().join('/') : 'Sem data';
export function AdminBankStatementSummary({ accountId }: { accountId: string }) {
  const report = useQuery({ queryKey: ['admin-bank-statement-summary', accountId], queryFn: async () => {
    const { data, error } = await (supabase as any).rpc('admin_bank_statement_summary', { p_account_id: accountId });
    if (error) throw error;
    return data as Summary;
  }});
  if (report.isLoading) return <p role="status">Conferindo saldos da conta…</p>;
  if (report.isError || !report.data) return <div role="alert" className="rounded-xl border bg-white p-4">Não foi possível conferir os saldos. <Button variant="outline" onClick={() => report.refetch()}>Tentar novamente</Button></div>;
  const d = report.data;
  const cards = [
    ['Saldo inicial', money(d.opening_balance), `Início de ${date(d.opening_balance_date)}`],
    ['Saldo calculado', money(d.system_balance), d.statement_date ? `Até ${date(d.statement_date)}` : 'Movimentações importadas'],
    ['Saldo do extrato', d.statement_balance == null ? 'Não informado' : money(d.statement_balance), d.statement_date ? `OFX de ${date(d.statement_date)}` : 'Importe um OFX com saldo'],
    ['Diferença', d.difference == null ? 'A conferir' : money(d.difference), d.difference == null ? 'Sem saldo bancário para comparar' : Math.abs(d.difference) < 0.005 ? 'Saldo conferido' : 'Revise saldo inicial e período importado'],
  ];
  return <section className="space-y-3" aria-label="Conferência de saldos bancários"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([label, value, note]) => <div key={label} className={adminKpiClass(label === "Diferença" ? (d.difference == null ? "amber" : Math.abs(d.difference) < 0.005 ? "emerald" : "rose") : "blue", "rounded-xl p-4")}><p className="text-sm text-muted-foreground">{label}</p><strong className="mt-1 block text-xl tabular-nums">{value}</strong><p className="mt-1 text-xs text-muted-foreground">{note}</p></div>)}</div><p className="text-sm text-muted-foreground">{d.pending_count} movimento(s) aguardando conciliação em todo o extrato. {d.last_imported_at ? `Última importação: ${new Date(d.last_imported_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} (Brasília).` : 'Nenhum arquivo importado.'}</p></section>;
}
