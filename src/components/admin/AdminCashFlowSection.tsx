import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FinancialStatusBadge, financialAmountClass } from "./FinancialRecordBadges";
import { DateField } from "@/components/ui/date-field";
import { adminKpiClass } from "@/components/admin/adminKpiStyles";
import { useMemo, useState, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowDownLeft, ArrowUpRight, CalendarDays, Download, Plus, RefreshCw, Wallet } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { toast } from 'sonner';

type Day = { day: string; realized_income: number; realized_expense: number; pending_income: number; pending_expense: number; balance_adjustment?: number };
type Plan = { id: string; direction: string; description: string; amount: number; due_date: string; status: string; bank_account_id?: string | null };
type Report = { opening_balance: number; first_movement: string | null; overdue_income: number; confirmed_without_date?: number; plans_count?: number; days: Day[]; plans: Plan[] };
type Account = { id: string; name: string; provider: string; account_kind: 'asaas'|'external' };
const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dayLabel = (value: string) => value.slice(0, 10).split('-').reverse().join('/');
const localDay = (value: Date) => `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`;

export function AdminCashFlowSection({ canManage = false, onManageAccounts }: { canManage?: boolean; onManageAccounts: (direction: 'credit'|'debit') => void }) {
  const today = new Date();
  const [start, setStart] = useState(localDay(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [end, setEnd] = useState(localDay(new Date(today.getFullYear(), today.getMonth()+1, 0)));
  const [view, setView] = useState<'realized' | 'forecast'>('forecast');
  const [granularity, setGranularity] = useState<'day' | 'month'>('day');
  const [accountId, setAccountId] = useState<string>('');
  const [includeEstimates, setIncludeEstimates] = useState(false);
  const [creating, setCreating] = useState(false);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [due, setDue] = useState(localDay(today));
  const [direction, setDirection] = useState('debit');
  const qc = useQueryClient();
  const planRequest = useRef(crypto.randomUUID());
  const validPeriod = !!start && !!end && start <= end && (Date.parse(end)-Date.parse(start))/86400000 <= 365;
  const accounts = useQuery({ queryKey:['admin-cash-flow-accounts'], queryFn: async () => { const { data, error } = await (supabase as any).from('admin_bank_accounts').select('id,name,provider,account_kind').order('account_kind').order('name'); if(error) throw error; return (data ?? []) as Account[]; } });
  const report = useQuery({
    queryKey: ['admin-cash-flow', start, end, accountId], enabled: validPeriod,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('admin_cash_flow_report_v2', { p_start: start, p_end: end, p_account_id: accountId || null });
      if (error) throw error;
      return data as Report;
    },
  });
  const estimates = useQuery({ queryKey:['admin-subscription-forecast',start,end], enabled: includeEstimates && !accountId && validPeriod, queryFn: async () => { const {data,error}=await (supabase as any).rpc('admin_subscription_forecast',{p_start:start,p_end:end}); if(error) throw error; return data as {days:{day:string;income:number}[]}; } });
  const mutation = useMutation({
    mutationFn: async () => {
        const value = Number(amount.replace(/\./g,'').replace(',','.'));
        if (!description.trim() || !Number.isFinite(value) || value <= 0 || !due) throw new Error('Confira descrição, valor e vencimento.');
        const { error } = await (supabase as any).rpc('admin_create_cash_flow_plan',{p_request_id:planRequest.current,p_bank_account_id:accountId||null,p_direction:direction,p_description:description.trim(),p_amount:value,p_due_date:due});
        if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-cash-flow'] }); setCreating(false); setDescription(''); setAmount(''); planRequest.current=crypto.randomUUID(); toast.success('Previsão atualizada.'); },
    onError: () => toast.error('Não foi possível salvar a previsão. Confira os dados e tente novamente.'),
  });
  const rows = useMemo(() => {
    let realized = Number(report.data?.opening_balance ?? 0);
    let forecast = realized;
    return (report.data?.days ?? []).map(day => {
      const estimate = includeEstimates && !accountId ? Number(estimates.data?.days?.find(item=>item.day===day.day)?.income ?? 0) : 0;
      realized += Number(day.realized_income)-Number(day.realized_expense)+Number(day.balance_adjustment ?? 0);
      forecast += Number(day.realized_income)+Number(day.pending_income)+estimate-Number(day.realized_expense)-Number(day.pending_expense)+Number(day.balance_adjustment ?? 0);
      return { ...day, estimate, realized, forecast };
    });
  }, [report.data, estimates.data, includeEstimates, accountId]);
  const totals = rows.reduce((sum,d) => ({ income: sum.income+Number(d.realized_income), expense: sum.expense+Number(d.realized_expense), pendingIncome: sum.pendingIncome+Number(d.pending_income), pendingExpense: sum.pendingExpense+Number(d.pending_expense) }), {income:0,expense:0,pendingIncome:0,pendingExpense:0});
  const displayedRows = useMemo(() => {
    if (granularity === 'day') return rows;
    const grouped = new Map<string, typeof rows[number]>();
    for (const row of rows) { const key = row.day.slice(0,7); const current = grouped.get(key); grouped.set(key, current ? {...current, realized_income:current.realized_income+row.realized_income, realized_expense:current.realized_expense+row.realized_expense, pending_income:current.pending_income+row.pending_income, pending_expense:current.pending_expense+row.pending_expense, balance_adjustment:Number(current.balance_adjustment??0)+Number(row.balance_adjustment??0), estimate:current.estimate+row.estimate, realized:row.realized, forecast:row.forecast} : {...row, day:key+'-01'}); }
    return [...grouped.values()];
  }, [rows, granularity]);
  const exportCsv = () => {
    const content = ['Data;Entradas realizadas;Saídas realizadas;A receber;A pagar;Estimativa de renovação;Transferências e saldo inicial;Saldo realizado;Saldo projetado', ...rows.map(d => [dayLabel(d.day),d.realized_income,d.realized_expense,d.pending_income,d.pending_expense,d.estimate,d.balance_adjustment??0,d.realized,d.forecast].join(';'))].join('\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF'+content],{type:'text/csv;charset=utf-8'}));
    const a = document.createElement('a'); a.href=url; a.download=`fluxo-de-caixa-${start}-${end}.csv`; a.click(); URL.revokeObjectURL(url);
  };
  return <section className="space-y-5" aria-label="Fluxo de caixa">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="text-lg font-semibold">Fluxo de caixa</h2><p className="text-sm text-muted-foreground">Realizado e previsto por conta, ou consolidado sem duplicar transferências vinculadas.</p></div>
      <div className="flex flex-wrap items-end gap-2">
        <div><Label htmlFor="dfc-start">De</Label><DateField id="dfc-start" value={start} onChange={e=>setStart(e)} /></div>
        <div><Label htmlFor="dfc-end">Até</Label><DateField id="dfc-end" value={end} onChange={e=>setEnd(e)} /></div>
        <div><Label htmlFor="dfc-account">Conta</Label><Select value={(accountId) || "__all__"} onValueChange={value => {setAccountId((value === "__all__" ? "" : value));setIncludeEstimates(false);setCreating(false);}}><SelectTrigger id="dfc-account" className="flex h-10 rounded-md border bg-white text-zinc-900 px-3"><SelectValue /></SelectTrigger><SelectContent className="max-w-[calc(100vw-2rem)]"><SelectItem value="__all__">Consolidado</SelectItem>{accounts.data?.map(a=><SelectItem key={a.id} value={a.id}>{a.name} · {a.provider}</SelectItem>)}</SelectContent></Select></div>
        <Button variant="outline" onClick={()=>report.refetch()} disabled={report.isFetching || !validPeriod}><RefreshCw className="mr-2 h-4 w-4"/>Atualizar</Button>
      </div>
    </div>
    {!validPeriod ? <p role="alert">Escolha um período de até 366 dias, com início anterior ao fim.</p> : (report.isLoading || accounts.isLoading || (includeEstimates && !accountId && estimates.isLoading)) ? <p role="status">Carregando fluxo de caixa…</p> : (report.isError || accounts.isError || (includeEstimates && !accountId && estimates.isError)) ? <div role="alert" className="rounded-lg border bg-white text-zinc-900 p-5"><p>Não foi possível carregar o fluxo de caixa.</p><Button variant="outline" onClick={()=>{report.refetch();accounts.refetch();if(includeEstimates)estimates.refetch();}}>Tentar novamente</Button></div> : <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[{label:'Saldo inicial',value:Number(report.data?.opening_balance ?? 0),Icon:Wallet,tone:'blue' as const},{label:'Entradas realizadas',value:totals.income,Icon:ArrowDownLeft,tone:'emerald' as const},{label:'Saídas realizadas',value:totals.expense,Icon:ArrowUpRight,tone:'rose' as const},{label:view==='forecast'?'Saldo projetado no fim':'Saldo realizado no fim',value:(view==='forecast'?rows[rows.length - 1]?.forecast:rows[rows.length - 1]?.realized)??0,Icon:CalendarDays,tone:'violet' as const}].map(({label,value,Icon,tone})=><div key={label} className={adminKpiClass(tone, 'rounded-xl border p-4')}><div className="flex items-center justify-between text-sm"><span>{label}</span><Icon className="h-4 w-4"/></div><p className="mt-3 text-xl font-semibold tabular-nums">{money(value)}</p></div>)}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3"><div role="group" aria-label="Visão do fluxo" className="inline-flex rounded-xl border bg-background p-1">{(['forecast','realized'] as const).map(mode=><Button key={mode} size="sm" variant="ghost" aria-pressed={view===mode} className={view===mode?'rounded-lg bg-black text-white hover:bg-zinc-800 hover:text-white':'rounded-lg'} onClick={()=>setView(mode)}>{mode==='forecast'?'Previsto e realizado':'Realizado'}</Button>)}</div><div role="group" aria-label="Agrupamento do fluxo" className="inline-flex rounded-xl border bg-background p-1">{(['day','month'] as const).map(mode=><Button key={mode} size="sm" variant="ghost" aria-pressed={granularity===mode} className={granularity===mode?'rounded-lg bg-black text-white hover:bg-zinc-800 hover:text-white':'rounded-lg'} onClick={()=>setGranularity(mode)}>{mode==='day'?'Diário':'Mensal'}</Button>)}</div></div>
        <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={!!accountId} aria-pressed={includeEstimates} onClick={()=>setIncludeEstimates(v=>!v)}>Renovações {includeEstimates?'incluídas':'estimadas'}</Button><Button variant="outline" onClick={exportCsv}><Download className="mr-2 h-4 w-4"/>Exportar CSV</Button><Button className="bg-black text-white hover:bg-zinc-800" disabled={!canManage} onClick={()=>setCreating(!creating)}><Plus className="mr-2 h-4 w-4"/>Nova previsão</Button></div>
      </div>
      {view==='forecast' && <p className="text-sm">A receber: <strong>{money(totals.pendingIncome)}</strong> · A pagar: <strong>{money(totals.pendingExpense)}</strong>. Cobranças vencidas antes do período: <strong>{money(Number(report.data?.overdue_income ?? 0))}</strong>.</p>}
      {Number(report.data?.confirmed_without_date ?? 0)>0 && <p role="status" className="rounded-lg border bg-white text-zinc-900 p-3 text-sm">Cartões confirmados sem data estimada: <strong>{money(Number(report.data?.confirmed_without_date))}</strong>. Esses recebíveis ainda não entram no saldo projetado.</p>}
      {includeEstimates && <p className="text-xs text-muted-foreground">Estimativas de próxima renovação: <strong>{money(rows.reduce((total,row)=>total+row.estimate,0))}</strong>. São hipóteses baseadas nas assinaturas ativas, separadas de cobranças emitidas. {estimates.isError?'Não foi possível buscar as estimativas agora.':''}</p>}
      {rows.some(row=>Number(row.balance_adjustment ?? 0)!==0) && <p className="text-xs text-muted-foreground">O saldo inclui ajustes de capital inicial e transferências entre contas. Eles não são contados como receita ou despesa.</p>}
      <div className="rounded-xl border bg-white text-zinc-900 p-4"><h3 className="mb-3 font-semibold">Evolução do saldo</h3><div className="h-64" role="img" aria-label="Evolução do saldo realizado e projetado no período"><ResponsiveContainer width="100%" height="100%"><LineChart data={rows}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="day" tickFormatter={value=>dayLabel(value).slice(0,5)} minTickGap={40}/><YAxis tickFormatter={value=>new Intl.NumberFormat('pt-BR',{notation:'compact'}).format(value)} width={65}/><Tooltip labelFormatter={value=>dayLabel(String(value))} formatter={(value:number)=>money(value)}/><Legend/><Line type="monotone" dataKey="realized" name="Saldo realizado" stroke="#18181b" strokeWidth={2} dot={false} isAnimationActive={false}/>{view==='forecast'&&<Line type="monotone" dataKey="forecast" name="Saldo projetado" stroke="#2563eb" strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false}/>}</LineChart></ResponsiveContainer></div></div>
      {creating && <form className="grid gap-3 rounded-xl border bg-white text-zinc-900 p-4 sm:grid-cols-2" onSubmit={e=>{e.preventDefault();if(!mutation.isPending)mutation.mutate();}}>
        <div className="sm:col-span-2"><Label htmlFor="dfc-description">Descrição do compromisso</Label><Input id="dfc-description" required value={description} onChange={e=>setDescription(e.target.value)} placeholder="Ex.: hospedagem do próximo mês"/></div>
        <div><Label htmlFor="dfc-direction">Tipo</Label><Select value={direction} onValueChange={value => setDirection(value)}><SelectTrigger id="dfc-direction" className="flex h-10 w-full rounded-md border bg-white text-zinc-900 px-3"><SelectValue /></SelectTrigger><SelectContent className="max-w-[calc(100vw-2rem)]"><SelectItem value="debit">Pagamento previsto</SelectItem><SelectItem value="credit">Recebimento avulso previsto</SelectItem></SelectContent></Select></div>
        <div><Label htmlFor="dfc-amount">Valor (R$)</Label><Input id="dfc-amount" inputMode="decimal" required value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0,00"/></div>
        <div><Label htmlFor="dfc-due">Vencimento</Label><DateField id="dfc-due" required value={due} onChange={e=>setDue(e)}/></div>
        <p className="text-sm text-muted-foreground">Conta da previsão: <strong>{accounts.data?.find(a=>a.id===accountId)?.name??'Conta Asaas'}</strong>. Cobranças de assinatura já entram automaticamente; não repita a mesma cobrança aqui.</p>
        <div className="flex gap-2 sm:col-span-2"><Button type="submit" disabled={!canManage || mutation.isPending} className="bg-black text-white hover:bg-zinc-800">{mutation.isPending?'Salvando…':'Salvar previsão'}</Button><Button type="button" variant="outline" onClick={()=>setCreating(false)}>Cancelar</Button></div>
      </form>}
      <div className="relative overflow-x-auto rounded-xl border bg-white text-zinc-900"><table className="w-full text-sm"><caption className="sr-only">Movimentações e saldo acumulado</caption><thead><tr className="border-b">{[granularity==='day'?'Data':'Mês','Entradas','Saídas',...(view==='forecast'?['A receber','A pagar',...(includeEstimates?['Renovações estimadas']:[])]:[]),'Transferências / saldo inicial','Saldo realizado',...(view==='forecast'?['Saldo projetado']:[])].map(h=><th key={h} className="whitespace-nowrap p-3 text-right first:text-left">{h}</th>)}</tr></thead><tbody>{displayedRows.map(d=><tr key={d.day} className="border-b last:border-0"><td className="whitespace-nowrap p-3">{granularity==='day'?dayLabel(d.day):d.day.slice(5,7)+'/'+d.day.slice(0,4)}</td>{[d.realized_income,d.realized_expense,...(view==='forecast'?[d.pending_income,d.pending_expense,...(includeEstimates?[d.estimate]:[])]:[]),d.balance_adjustment??0,d.realized,...(view==='forecast'?[d.forecast]:[])].map((value,index)=>{const outgoing=index===1||(view==='forecast'&&index===3);return <td key={index} className={"whitespace-nowrap p-3 text-right "+financialAmountClass(outgoing||Number(value)<0?'debit':'credit')}>{outgoing&&Number(value)>0?'−':''}{money(Number(value))}</td>;})}</tr>)}</tbody></table></div>
      <div><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">Contas agendadas no período</h3><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={()=>onManageAccounts('debit')}>Contas a pagar</Button><Button variant="outline" onClick={()=>onManageAccounts('credit')}>Contas a receber</Button></div></div>{!report.data?.plans.length?<p className="text-sm text-muted-foreground">Nenhuma conta agendada neste período.</p>:<ul className="divide-y">{report.data.plans.map(p=><li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-3"><div><span className="font-medium">{p.description}</span><p className="text-sm text-muted-foreground">{dayLabel(p.due_date)} · {p.direction==='credit'?'Entrada':'Saída'} · <span className={financialAmountClass(p.direction)}>{p.direction==='credit'?'+':'−'}{money(Number(p.amount))}</span></p></div><FinancialStatusBadge status={p.status}/></li>)}</ul>}</div>
      {Number(report.data?.plans_count ?? 0)>500 && <p role="status" className="text-sm">Exibindo os primeiros 500 de {report.data?.plans_count} compromissos. Reduza o período para consultar os demais; os totais incluem todos.</p>}
      <p className="text-xs text-muted-foreground">Realizado: movimentos liquidados Asaas e OFX das contas selecionadas. Projeção: cobranças abertas, cartões na data estimada de crédito e compromissos pendentes; estimativas de renovação entram apenas quando ativadas. Tarifas futuras desconhecidas não são estimadas. Confira os vínculos ao liquidar compromissos.</p>
    </>}
  </section>;
}
