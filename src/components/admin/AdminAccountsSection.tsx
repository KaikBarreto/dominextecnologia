import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FinancialStatusBadge, financialAmountClass } from "./FinancialRecordBadges";
import { DateField } from "@/components/ui/date-field";
import { adminKpiClass } from "@/components/admin/adminKpiStyles";
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CalendarDays, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { AdminAccountForm } from './AdminAccountForm';
import { accountDate, accountError, accountMoney, accountToday, ScheduledAccount, ScheduledBank } from './adminScheduledAccounts';

type Summary={open_count:number;open_amount:number;overdue_count:number;overdue_amount:number;settled_count:number;settled_amount:number;cancelled_count:number;cancelled_amount:number};
type Report={items:ScheduledAccount[];total:number;summary:Summary;page:number;page_size:number};
type Candidate={id:string;amount:number;occurred_at:string;source:'bank'|'asaas';description?:string|null;counterparty?:string|null;asaas_transaction_id?:string};
const selectClass='h-10 min-w-0 w-full rounded-md border bg-white text-zinc-900 px-3 text-sm text-zinc-900';
export function AdminAccountsSection({direction,canManage=false}:{direction:'credit'|'debit';canManage?:boolean}) {
  const qc=useQueryClient();
  const outgoing=direction==='debit';
  const [search,setSearch]=useState('');
  const [query,setQuery]=useState('');
  const [status,setStatus]=useState('open');
  const [start,setStart]=useState('');
  const [end,setEnd]=useState('');
  const [bankId,setBankId]=useState('');
  const [page,setPage]=useState(1);
  const [form,setForm]=useState<ScheduledAccount|null|undefined>(undefined);
  const [action,setAction]=useState<{kind:'cancel'|'settle'|'unlink';account:ScheduledAccount}|null>(null);
  const [scope,setScope]=useState('one');
  const [candidateId,setCandidateId]=useState('');
  const [candidateStart,setCandidateStart]=useState('');
  const [candidateEnd,setCandidateEnd]=useState('');
  const [candidatePage,setCandidatePage]=useState(0);
  const [settledAmount,setSettledAmount]=useState('');
  const [updateFuture,setUpdateFuture]=useState(false);
  const realizedAmount=Number(settledAmount);
  const realizedValid=Number.isFinite(realizedAmount)&&realizedAmount>0&&Math.abs(realizedAmount*100-Math.round(realizedAmount*100))<0.00001;
  const amountChanged=!!action&&Math.abs(realizedAmount-Number(action.account.amount))>=0.005;
  useEffect(()=>{const timeout=setTimeout(()=>{setQuery(search);setPage(1);},300);return()=>clearTimeout(timeout);},[search]);
  const banks=useQuery({queryKey:['admin-scheduled-banks'],queryFn:async()=>{
    const {data,error}=await (supabase as any).from('admin_bank_accounts').select('id,name,account_kind,is_active').order('name');if(error)throw error;return (data??[]) as ScheduledBank[];
  }});
  const validPeriod=!start||!end||start<=end;
  const report=useQuery({queryKey:['admin-scheduled-accounts',direction,status,query,start,end,bankId,page],enabled:validPeriod,queryFn:async()=>{
    const {data,error}=await (supabase as any).rpc('admin_list_scheduled_accounts',{p_direction:direction,p_status:status,p_search:query,p_start:start||null,p_end:end||null,p_account_id:bankId||null,p_page:page,p_page_size:25});if(error)throw error;return data as Report;
  }});
  useEffect(() => {
    if (validPeriod && report.data && !report.isFetching && !report.isError && page > 1 && (page - 1) * 25 >= report.data.total) {
      setPage(Math.max(1, Math.ceil(report.data.total / 25)));
    }
  }, [validPeriod, report.data, report.isFetching, report.isError, page]);
  async function refresh(){await Promise.all([qc.invalidateQueries({queryKey:['admin-scheduled-accounts']}),qc.invalidateQueries({queryKey:['admin-cash-flow']}),qc.invalidateQueries({queryKey:['admin-account-candidates']})]);}
  const mutation=useMutation({mutationFn:async()=>{
    if(!action)throw new Error('invalid_action');
    const a=action.account;
    if(action.kind==='cancel'){
      const {error}=await (supabase as any).rpc('admin_cancel_scheduled_account',{p_id:a.id,p_expected_version:a.version,p_scope:scope});if(error)throw error;
    }else{
      const candidate=candidates.data?.find(c=>c.id===candidateId);
      if(action.kind==='settle'&&!candidate)throw new Error('invalid_movement');
      const {error}=await (supabase as any).rpc('admin_settle_scheduled_account',{p_id:a.id,p_expected_version:a.version,p_ledger_id:action.kind==='settle'&&candidate?.source==='asaas'?candidate.id:null,p_bank_transaction_id:action.kind==='settle'&&candidate?.source==='bank'?candidate.id:null,p_settled_amount:action.kind==='settle'?realizedAmount:undefined,p_update_future:action.kind==='settle'&&amountChanged&&!!a.series_id&&updateFuture});if(error)throw error;
    }
  },onSuccess:async()=>{setAction(null);await refresh();toast.success('Conta atualizada. O DFC foi recalculado.');},onError:()=>{void refresh();}});
  const candidates=useQuery({queryKey:['admin-account-candidates',action?.account.id,realizedAmount,candidateStart,candidateEnd,candidatePage,banks.data],enabled:action?.kind==='settle'&&realizedValid&&!!banks.data&&!!candidateStart&&!!candidateEnd&&candidateStart<=candidateEnd,queryFn:async()=>{
    const a=action!.account;
    const external=banks.data?.find(b=>b.id===a.bank_account_id)?.account_kind==='external';
    const from=`${candidateStart}T00:00:00-03:00`;
    const next=new Date(`${candidateEnd}T12:00:00Z`);next.setUTCDate(next.getUTCDate()+1);
    const to=`${next.toISOString().slice(0,10)}T00:00:00-03:00`;
    let query=(supabase as any).from(external?'admin_bank_transactions':'admin_realized_asaas_movements').select(external?'id,amount,occurred_at,description,counterparty':'id,amount,occurred_at,asaas_transaction_id,description:raw_payload->>description').eq('amount',external&&a.direction==='debit'?-realizedAmount:realizedAmount).gte('occurred_at',from).lt('occurred_at',to);
    query=external?query.eq('bank_account_id',a.bank_account_id):query.eq('direction',a.direction);
    const {data,error}=await query.order('occurred_at',{ascending:false}).order('id').range(candidatePage*25,candidatePage*25+24);if(error)throw error;
    return (data??[]).map((c:Candidate)=>({...c,source:external?'bank':'asaas'})) as Candidate[];
  }});
  function openAction(kind:'cancel'|'settle'|'unlink',account:ScheduledAccount){
    mutation.reset();setScope('one');setCandidateId('');setCandidatePage(0);setSettledAmount(Number(account.amount).toFixed(2));setUpdateFuture(false);
    const from=new Date(`${account.due_date}T12:00:00Z`);from.setUTCDate(from.getUTCDate()-30);
    const to=new Date(`${account.due_date}T12:00:00Z`);to.setUTCDate(to.getUTCDate()+30);
    setCandidateStart(from.toISOString().slice(0,10));setCandidateEnd(to.toISOString().slice(0,10));setAction({kind,account});
  }
  const summary=report.data?.summary;
  const total=Number(report.data?.total??0);
  const filtered=!!query||!!start||!!end||!!bankId||status!=='open';
  return <section className="space-y-5" aria-label={outgoing?'Contas a pagar':'Contas a receber'}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">{outgoing?'Contas a pagar':'Contas a receber'}</h2><p className="mt-1 max-w-2xl text-sm text-muted-foreground">{outgoing?'Organize os próximos pagamentos e acompanhe o que já venceu.':'Organize recebimentos avulsos. As cobranças de assinatura continuam automáticas no DFC.'}</p></div><Button className="bg-black text-white hover:bg-zinc-800" disabled={!canManage||banks.isLoading||banks.isError} onClick={()=>setForm(null)}><Plus className="mr-2 h-4 w-4"/>{outgoing?'Agendar pagamento':'Agendar recebimento'}</Button></div>
    <div className="grid gap-3 sm:grid-cols-3">{[{label:'Em aberto',value:summary?.open_amount,count:summary?.open_count,style:adminKpiClass('blue')},{label:'Vencidas',value:summary?.overdue_amount,count:summary?.overdue_count,style:adminKpiClass('rose')},{label:outgoing?'Pagas':'Recebidas',value:summary?.settled_amount,count:summary?.settled_count,style:adminKpiClass('emerald')}].map(s=><div key={s.label} className={`rounded-xl p-3 sm:p-4 ${s.style}`}><p className="text-sm">{s.label}</p><strong className="mt-1 block break-words text-base tabular-nums sm:text-2xl">{report.isLoading?'…':report.isError?'—':accountMoney(Number(s.value??0))}</strong><p className="mt-1 text-xs">{Number(s.count??0)} {Number(s.count??0)===1?'conta':'contas'}</p></div>)}</div>
    <p className="text-xs text-muted-foreground">Totais do período, busca e conta bancária selecionados. Vencidas estão incluídas no total em aberto.</p>
    <div className="grid grid-cols-2 gap-3 [&>div]:min-w-0 [&_input]:min-w-0 xl:grid-cols-5"><div className="col-span-2 xl:col-span-1"><Label htmlFor="accounts-search">Buscar conta</Label><Input id="accounts-search" placeholder="Descrição ou pessoa" value={search} onChange={e=>setSearch(e.target.value)}/></div><div><Label htmlFor="accounts-status">Situação</Label><Select value={status} onValueChange={value => {setStatus(value);setPage(1);}}><SelectTrigger id="accounts-status" className={selectClass}><SelectValue /></SelectTrigger><SelectContent className="max-w-[calc(100vw-2rem)]"><SelectItem value="open">Em aberto</SelectItem><SelectItem value="overdue">Vencidas</SelectItem><SelectItem value="settled">{outgoing?'Pagas':'Recebidas'}</SelectItem><SelectItem value="cancelled">Canceladas</SelectItem><SelectItem value="all">Todas</SelectItem></SelectContent></Select></div><div><Label htmlFor="accounts-start">Vencimento de</Label><DateField id="accounts-start" value={start} onChange={e=>{setStart(e);setPage(1);}}/></div><div><Label htmlFor="accounts-end">Até</Label><DateField id="accounts-end" value={end} onChange={e=>{setEnd(e);setPage(1);}}/></div><div><Label htmlFor="accounts-bank">Conta bancária</Label><Select value={(bankId) || "__all__"} onValueChange={value => {setBankId((value === "__all__" ? "" : value));setPage(1);}}><SelectTrigger id="accounts-bank" className={selectClass}><SelectValue /></SelectTrigger><SelectContent className="max-w-[calc(100vw-2rem)]"><SelectItem value="__all__">Todas as contas</SelectItem>{banks.data?.map(b=><SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent></Select></div></div>
    <div className="flex items-center justify-between gap-3"><p className="text-sm">{!start&&!end?'Todos os vencimentos, incluindo contas atrasadas.':`${start?accountDate(start):'Início'} até ${end?accountDate(end):'sem limite'}`}</p><div className="flex gap-2">{filtered&&<Button variant="outline" onClick={()=>{setSearch('');setQuery('');setStart('');setEnd('');setStatus('open');setBankId('');setPage(1);}}>Limpar filtros</Button>}<Button variant="outline" aria-label="Atualizar contas" disabled={report.isFetching} onClick={()=>{void report.refetch();void banks.refetch();}}><RefreshCw className="h-4 w-4"/></Button></div></div>
    {!validPeriod?<p role="alert" className="text-sm text-red-700">A data final deve ser igual ou posterior à inicial.</p>:report.isError||banks.isError?<div role="alert" className="rounded-xl border p-5"><p>Não foi possível carregar as contas. Seus agendamentos foram preservados.</p><Button variant="outline" className="mt-3" onClick={()=>{void report.refetch();void banks.refetch();}}>Tentar novamente</Button></div>:report.isLoading?<p role="status" className="py-8 text-center">Carregando contas…</p>:!report.data?.items.length?<div className="rounded-xl border bg-white text-zinc-900 px-5 py-10 text-center"><CalendarDays className="mx-auto mb-3 h-7 w-7"/><h3 className="font-semibold">{filtered?'Nenhuma conta corresponde aos filtros':'Nenhuma conta em aberto'}</h3><p className="mt-2 text-sm text-muted-foreground">{filtered?'Ajuste a busca ou consulte outros vencimentos.':'Agende uma conta única ou recorrente para organizar seu caixa.'}</p></div>:<div className="relative overflow-x-auto rounded-xl border bg-white text-zinc-900"><table className="w-full text-sm"><caption className="sr-only">{outgoing?'Pagamentos agendados':'Recebimentos agendados'}</caption><thead><tr className="border-b text-left"><th className="p-3">Vencimento</th><th className="p-3">Conta</th><th className="p-3">Situação</th><th className="p-3 text-right">Valor</th><th className="p-3"><span className="sr-only">Ações</span></th></tr></thead><tbody>{report.data.items.map(a=>{const overdue=a.status==='pending'&&a.due_date<accountToday();return <tr key={a.id} className="border-b last:border-0"><td className="whitespace-nowrap p-3">{accountDate(a.due_date)}</td><td className="min-w-44 max-w-xs p-3"><p className="break-words font-medium">{a.description}</p>{a.counterparty&&<p className="break-words text-xs text-muted-foreground">{a.counterparty}</p>}<p className="text-xs text-muted-foreground">{banks.data?.find(b=>b.id===a.bank_account_id)?.name??'Conta Asaas'}{a.series_id?' · Mensal':''}</p></td><td className="whitespace-nowrap p-3"><FinancialStatusBadge status={overdue?'overdue':a.status==='settled'?(outgoing?'paid':'received'):a.status}/></td><td className={"whitespace-nowrap p-3 text-right "+financialAmountClass(direction)}>{outgoing?'−':'+'}{accountMoney(a.amount)}</td><td className="p-3">{canManage&&<div className="flex flex-wrap justify-end gap-2">{a.status==='pending'?<><Button size="sm" variant="outline" onClick={()=>setForm(a)}>Editar</Button><Button size="sm" className="bg-black text-white hover:bg-zinc-800" onClick={()=>openAction('settle',a)}>Vincular movimento</Button><Button size="sm" variant="outline" onClick={()=>openAction('cancel',a)}>Cancelar</Button></>:a.status==='settled'?<Button size="sm" variant="outline" onClick={()=>openAction('unlink',a)}>Desfazer vínculo</Button>:null}</div>}</td></tr>;})}</tbody></table></div>}
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><span>{total} {total===1?'conta':'contas'} · Página {page} de {Math.max(1,Math.ceil(total/25))}</span><div className="flex gap-2"><Button variant="outline" disabled={page===1||report.isFetching} onClick={()=>setPage(p=>p-1)}>Anterior</Button><Button variant="outline" disabled={page*25>=total||report.isFetching} onClick={()=>setPage(p=>p+1)}>Próxima</Button></div></div>
    {form!==undefined&&<AdminAccountForm direction={direction} account={form} banks={banks.data??[]} onClose={()=>setForm(undefined)} onSaved={()=>{setForm(undefined);void refresh();toast.success('Agendamento salvo e incluído no DFC previsto.');}}/>}
    {action&&<Dialog open onOpenChange={open=>{if(!open&&!mutation.isPending)setAction(null);}}><DialogContent className="max-h-[90dvh] overflow-y-auto bg-white text-zinc-900"><DialogHeader><DialogTitle>{action.kind==='cancel'?'Cancelar agendamento':action.kind==='unlink'?'Desfazer vínculo':'Vincular movimentação confirmada'}</DialogTitle><DialogDescription>{action.account.description} · {accountMoney(action.account.amount)}</DialogDescription></DialogHeader>
      {action.kind==='cancel'?<><p className="text-sm">A conta sai do previsto no DFC. Isso não cancela uma cobrança ou pagamento no banco.</p>{action.account.series_id&&<div><Label htmlFor="cancel-account-scope">Cancelar</Label><Select value={scope} onValueChange={value => setScope(value)}><SelectTrigger id="cancel-account-scope" className={selectClass}><SelectValue /></SelectTrigger><SelectContent className="max-w-[calc(100vw-2rem)]"><SelectItem value="one">Somente esta ocorrência</SelectItem><SelectItem value="future">Esta e as próximas em aberto</SelectItem></SelectContent></Select></div>}</>:action.kind==='unlink'?<p className="text-sm">A conta volta a ficar em aberto no previsto. A movimentação bancária continua registrada; esta ação não estorna dinheiro.</p>:<><p className="text-sm">Escolha o movimento que quitou esta conta. O webhook continua registrando as movimentações; este vínculo evita contar o compromisso novamente no previsto. A categoria do realizado é conferida na conciliação.</p><div className="space-y-2"><Label htmlFor="settled-account-amount">Valor realizado</Label><Input id="settled-account-amount" type="number" inputMode="decimal" min="0.01" step="0.01" value={settledAmount} disabled={mutation.isPending} onChange={e=>{setSettledAmount(e.target.value);setCandidateId('');setCandidatePage(0);setUpdateFuture(false);}}/>{!realizedValid?<p role="alert" className="text-sm text-red-700">Informe um valor positivo com até duas casas decimais.</p>:amountChanged&&<><p className="text-sm">Previsto: {accountMoney(action.account.amount)} · Realizado: {accountMoney(realizedAmount)}</p><p className="text-xs text-muted-foreground">{updateFuture?'As próximas contas abertas que ainda têm o valor previsto anterior serão atualizadas. Contas já ajustadas serão preservadas.':'O ajuste vale somente para esta ocorrência.'}</p>{action.account.series_id&&<div className="flex items-center gap-3"><Switch id="settled-update-future" checked={updateFuture} onCheckedChange={setUpdateFuture} disabled={mutation.isPending}/><Label htmlFor="settled-update-future">Atualizar o valor previsto das próximas contas</Label></div>}</>}</div><div className="grid grid-cols-2 gap-3"><div><Label htmlFor="match-start">Movimento de</Label><DateField id="match-start" value={candidateStart} onChange={e=>{setCandidateStart(e);setCandidateId('');setCandidatePage(0);}}/></div><div><Label htmlFor="match-end">Até</Label><DateField id="match-end" value={candidateEnd} onChange={e=>{setCandidateEnd(e);setCandidateId('');setCandidatePage(0);}}/></div></div>{candidateStart>candidateEnd?<p role="alert">Confira o intervalo de datas.</p>:candidates.isLoading?<p role="status">Consultando movimentos confirmados…</p>:candidates.isError?<p role="alert">Falha ao consultar movimentos. <button className="underline" onClick={()=>candidates.refetch()}>Tentar novamente</button></p>:!candidates.data?.length?<p className="text-sm">Nenhum movimento de mesmo valor neste período. Confira as datas ou aguarde a confirmação pelo webhook.</p>:<fieldset className="space-y-2"><legend className="mb-2 text-sm font-medium">Movimentos do mesmo valor e direção</legend>{candidates.data.map(c=><label key={c.id} className="flex cursor-pointer items-center gap-3 rounded-md border bg-white text-zinc-900 p-3"><input type="radio" name="account-movement" value={c.id} checked={candidateId===c.id} onChange={()=>setCandidateId(c.id)}/><span className="min-w-0 flex-1 text-sm">{new Date(c.occurred_at).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'})} · {new Date(c.occurred_at).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'})}{(c.description||c.counterparty)&&<span className="block break-words">{c.description||c.counterparty}</span>}<span className="block break-all text-xs text-muted-foreground">Referência {c.asaas_transaction_id??c.id.slice(0,8)}</span></span><strong className={financialAmountClass(direction)}>{outgoing?'−':'+'}{accountMoney(Math.abs(c.amount))}</strong></label>)}</fieldset>}<div className="flex justify-between"><Button variant="outline" disabled={candidatePage===0||candidates.isFetching} onClick={()=>{setCandidatePage(p=>p-1);setCandidateId('');}}>Anterior</Button><Button variant="outline" disabled={(candidates.data?.length??0)<25||candidates.isFetching} onClick={()=>{setCandidatePage(p=>p+1);setCandidateId('');}}>Mais movimentos</Button></div></>}
      {mutation.isError&&<p role="alert" className="rounded bg-red-600 p-3 text-sm text-white">{accountError(mutation.error)}</p>}
      <div className="flex justify-end gap-2"><Button variant="outline" disabled={mutation.isPending} onClick={()=>setAction(null)}>Voltar</Button><Button className="bg-black text-white hover:bg-zinc-800" disabled={!canManage||mutation.isPending||(action.kind==='settle'&&(!realizedValid||!candidateId||candidates.isFetching||candidates.isError))} onClick={()=>mutation.mutate()}>{mutation.isPending?'Salvando…':action.kind==='cancel'?'Confirmar cancelamento':action.kind==='unlink'?'Desfazer vínculo':'Confirmar vínculo'}</Button></div>
    </DialogContent></Dialog>}
  </section>;
}
