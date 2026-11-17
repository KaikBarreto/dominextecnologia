import { FinancialSmartDescription } from '@/components/financial/FinancialSmartDescription';
import { AdminCategoryPill } from "@/components/admin/financial/AdminCategoryPill";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateField } from "@/components/ui/date-field";
import { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAdminFinancialCategories } from '@/hooks/useAdminFinancialCategories';
import { accountDate, accountError, accountMoney, accountToday, recurringDates, ScheduledAccount, ScheduledBank } from './adminScheduledAccounts';

const selectClass='h-10 w-full rounded-md border bg-white text-zinc-900 px-3 text-sm';
export function AdminAccountForm({direction,account,banks,onClose,onSaved}:{direction:'credit'|'debit';account:ScheduledAccount|null;banks:ScheduledBank[];onClose:()=>void;onSaved:()=>void}) {
  const [description,setDescription]=useState(account?.description??'');
  const [counterparty,setCounterparty]=useState(account?.counterparty??'');
  const [category,setCategory]=useState(account?.category_id??'');
  const [amount,setAmount]=useState(account?Number(account.amount).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}):'');
  const [due,setDue]=useState(account?.due_date??accountToday());
  const [bank,setBank]=useState(account?.bank_account_id??banks.find(b=>b.account_kind==='asaas'&&b.is_active)?.id??'');
  const [notes,setNotes]=useState(account?.notes??'');
  const [count,setCount]=useState(1);
  const [scope,setScope]=useState('one');
  const [review,setReview]=useState(false);
  const [validation,setValidation]=useState('');
  const request=useRef(crypto.randomUUID());
  const categories=useAdminFinancialCategories();
  const value=/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(amount)?Number(amount.replace(/\./g,'').replace(',','.')):NaN;
  const dates=recurringDates(due,count);
  const saving=useMutation({mutationFn:async()=>{
    const {error}=await (supabase as any).rpc('admin_save_scheduled_account',{
      p_request_id:request.current,p_id:account?.id??null,p_expected_version:account?.version??null,p_scope:scope,
      p_direction:direction,p_description:description.trim(),p_counterparty:counterparty.trim()||null,
      p_category_id:category||null,p_amount:value,p_due_date:due,p_bank_account_id:bank||null,
      p_notes:notes.trim()||null,p_occurrences:count,
    });if(error)throw error;
  },onSuccess:onSaved});
  const outgoing=direction==='debit';
  function check(){
    if(!description.trim()||!Number.isFinite(value)||value<=0||!due||!bank||dates.length!==count){setValidation('Preencha descrição, valor maior que zero, vencimento e conta bancária. Use o formato 1.250,00.');return;}
    setValidation('');setReview(true);
  }
  return <Dialog open onOpenChange={open=>{if(!open&&!saving.isPending)onClose();}}><DialogContent className="max-h-[92dvh] w-[calc(100%-1rem)] max-w-3xl overflow-y-auto bg-white text-zinc-900 [--background:0_0%_100%] [--foreground:240_10%_4%] [--muted-foreground:240_5%_35%]"><DialogHeader><DialogTitle>{account?'Editar conta':outgoing?'Nova conta a pagar':'Nova conta a receber'}</DialogTitle><DialogDescription>{review?'Confira os vencimentos e valores antes de confirmar.':'Agende o compromisso para acompanhar o vencimento e o caixa previsto.'}</DialogDescription></DialogHeader>
    <form onSubmit={e=>{e.preventDefault();if(saving.isPending)return;if(review)saving.mutate();else check();}} className="space-y-6">
      {review?<div className="space-y-4"><div className="flex flex-wrap justify-between gap-3 rounded-lg bg-zinc-900 p-5 text-white"><div><p className="font-semibold">{description}</p><p className="text-sm">{counterparty|| (outgoing?'Pagamento previsto':'Recebimento previsto')}</p></div><div className="text-right"><span className="block text-xs">{account?'Valor por conta':'Total agendado'}</span><strong className="text-xl tabular-nums">{accountMoney(value*count)}</strong></div></div><p className="text-sm">{banks.find(b=>b.id===bank)?.name} · {account?scope==='future'?'Esta e as próximas ocorrências em aberto':'Somente esta ocorrência':count===1?'Conta única':`${count} contas mensais de ${accountMoney(value)}`}</p>{scope==='future'&&<p className="text-sm">Cada ocorrência futura pendente receberá o valor informado. Contas já baixadas ou canceladas serão preservadas.</p>}<ol className="max-h-60 divide-y overflow-y-auto rounded-lg border">{dates.map((d,i)=><li key={d} className="flex justify-between gap-3 px-4 py-3"><span>{count>1?`${i+1}/${count} · `:''}{accountDate(d)}</span><strong>{accountMoney(value)}</strong></li>)}</ol></div>:<>
      <div className="grid gap-4 sm:grid-cols-2"><div className="sm:col-span-2"><Label htmlFor="scheduled-description">Descrição *</Label><FinancialSmartDescription id="scheduled-description" value={description} onChange={setDescription} placeholder={outgoing?'Ex.: hospedagem, aluguel, contador':'Ex.: serviço avulso a receber'} enabled={!account && !review} scope="admin" context="bill" direction={outgoing?'saida':'entrada'} values={{category,counterparty,account_id:bank}} replaceableKeys={['account_id']} allowedValues={{account_id:banks.filter(item=>item.is_active).map(item=>item.id)}} onPatch={patch=>{if('category' in patch)setCategory(patch.category||'');if('counterparty' in patch)setCounterparty(patch.counterparty||'');if('account_id' in patch)setBank(patch.account_id||'');}} onApplied={()=>document.getElementById('scheduled-due')?.focus()}/></div><div><Label htmlFor="scheduled-due">Vencimento *</Label><DateField id="scheduled-due" value={due} onChange={e=>setDue(e)} required/></div><div><Label htmlFor="scheduled-value">Valor por conta (R$) *</Label><Input id="scheduled-value" inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="1.250,00" required/></div><div><Label htmlFor="scheduled-party">{outgoing?'Favorecido / fornecedor':'Pagador'}</Label><Input id="scheduled-party" maxLength={200} value={counterparty} onChange={e=>setCounterparty(e.target.value)}/></div><div><Label htmlFor="scheduled-category">Categoria</Label><Select value={(category) || "__all__"} onValueChange={value => setCategory((value === "__all__" ? "" : value))}><SelectTrigger id="scheduled-category" className={selectClass}><SelectValue /></SelectTrigger><SelectContent className="max-w-[calc(100vw-2rem)]"><SelectItem value="__all__">Definir depois</SelectItem>{(categories.data??[]).filter(c=>c.type===(outgoing?'expense':'income')&&(c as {is_manually_selectable?:boolean}).is_manually_selectable!==false&&(c as {is_active?:boolean}).is_active!==false&&c.affects_result!==false&&!['sale','first_sale','renewal','upgrade'].includes(c.name)).map(c=><SelectItem key={c.id} value={c.id}><AdminCategoryPill name={c.name} categories={[c]} /></SelectItem>)}</SelectContent></Select>{categories.isError&&<p role="alert" className="text-sm text-red-700">Não foi possível carregar categorias. <button type="button" className="underline" onClick={()=>categories.refetch()}>Tentar novamente</button></p>}</div><div className="sm:col-span-2"><Label htmlFor="scheduled-bank">Conta bancária *</Label><Select value={bank} onValueChange={value => setBank(value)} required><SelectTrigger id="scheduled-bank" className={selectClass}><SelectValue placeholder="Selecione a conta" /></SelectTrigger><SelectContent className="max-w-[calc(100vw-2rem)]">{banks.filter(b=>b.is_active||b.id===bank).map(b=><SelectItem key={b.id} value={b.id} disabled={!b.is_active}>{b.name}{!b.is_active?' (inativa)':''}</SelectItem>)}</SelectContent></Select></div></div>
      {!account?<div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="scheduled-repeat">Repetição</Label><Select value={count===1?'once':'monthly'} onValueChange={value => setCount(value==='once'?1:12)}><SelectTrigger id="scheduled-repeat" className={selectClass}><SelectValue /></SelectTrigger><SelectContent className="max-w-[calc(100vw-2rem)]"><SelectItem value="once">Não repetir</SelectItem><SelectItem value="monthly">Mensal</SelectItem></SelectContent></Select></div>{count!==1&&<div><Label htmlFor="scheduled-count">Quantidade de contas (até 60)</Label><Input id="scheduled-count" type="number" min={2} max={60} value={count} onChange={e=>setCount(Number(e.target.value))}/></div>}</div>:account.series_id&&<div><Label htmlFor="scheduled-scope">Aplicar alterações</Label><Select value={scope} onValueChange={value => setScope(value)}><SelectTrigger id="scheduled-scope" className={selectClass}><SelectValue /></SelectTrigger><SelectContent className="max-w-[calc(100vw-2rem)]"><SelectItem value="one">Somente esta ocorrência</SelectItem><SelectItem value="future">Esta e as próximas em aberto</SelectItem></SelectContent></Select></div>}
      <div><Label htmlFor="scheduled-notes">Observações</Label><textarea id="scheduled-notes" className="min-h-20 w-full rounded-md border bg-white text-zinc-900 p-3 text-sm" maxLength={2000} value={notes} onChange={e=>setNotes(e.target.value)}/></div>
      </>}
      <p className="text-sm text-muted-foreground">{outgoing?'O agendamento não executa o pagamento no banco. A baixa será vinculada à movimentação confirmada.':'Cobranças de assinatura já entram no DFC automaticamente. Cadastre aqui apenas recebimentos avulsos, sem repetir a mesma cobrança.'}</p>
      {(validation||saving.isError)&&<p role="alert" className="rounded-md bg-red-600 p-3 text-sm text-white">{validation||accountError(saving.error)}</p>}
      <div className="flex flex-wrap justify-end gap-2 border-t pt-4"><Button type="button" variant="outline" disabled={saving.isPending} onClick={()=>review?setReview(false):onClose()}>{review?'Voltar':'Cancelar'}</Button><Button type="submit" className="bg-black text-white hover:bg-zinc-800" disabled={saving.isPending}>{saving.isPending?'Salvando…':review?'Confirmar agendamento':'Revisar agendamento'}</Button></div>
    </form>
  </DialogContent></Dialog>;
}
