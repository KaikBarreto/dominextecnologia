import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateField } from "@/components/ui/date-field";
import { AdminBankStatementSummary } from './AdminBankStatementSummary';
import { type ReactNode, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Landmark, Plus, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { parseOfx } from '@/utils/ofx/parseOfx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Account = { id: string; name: string; provider: string; account_kind: 'asaas'|'external'; is_active: boolean };

async function sha256(file: File) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, '0')).join('');
}

/** Superfície administrativa isolada: não mistura contas/OFX de nenhum tenant. */
export function AdminBankAccountsSection({ canManage = false, renderTransactions }: { canManage?: boolean; renderTransactions?: (accountId: string) => ReactNode }) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [provider, setProvider] = useState('');
  const [openingBalance, setOpeningBalance] = useState('0,00');
  const [openingDate, setOpeningDate] = useState('');
  const accounts = useQuery({ queryKey: ['admin-bank-accounts'], queryFn: async () => {
    const { data, error } = await (supabase as any).from('admin_bank_accounts').select('id,name,provider,account_kind,is_active').order('account_kind').order('name');
    if (error) throw error; return (data ?? []) as Account[];
  }});
  const external = useMemo(() => accounts.data?.filter(a => a.account_kind === 'external') ?? [], [accounts.data]);
  const create = useMutation({ mutationFn: async () => {
    const balance = Number(openingBalance.replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(balance) || !openingDate) throw new Error('Informe o saldo inicial e a data de referência.');
    const { error } = await (supabase as any).rpc('admin_create_external_bank_account', { p_name: name.trim(), p_provider: provider.trim(), p_opening_balance: balance, p_opening_balance_date: openingDate });
    if (error) throw error;
  }, onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['admin-bank-accounts'] }); setName(''); setProvider(''); setOpeningBalance('0,00'); setOpeningDate(''); setCreating(false); toast.success('Conta externa criada.'); }, onError: () => toast.error('Não foi possível criar a conta. Confira nome, instituição, saldo e data.') });
  const importOfx = useMutation({ mutationFn: async (file: File) => {
    if (!selected) throw new Error('Selecione a conta de destino.');
    const statement = parseOfx(await file.arrayBuffer());
    if (statement.warnings.some(w => w.includes('TRNAMT'))) throw new Error('ofx_invalid_amount');
    if (!statement.entries.length) throw new Error('O OFX não contém movimentações válidas.');
    if ('allPositive' in statement && statement.allPositive) throw new Error('Este OFX traz débitos sem sinal. Corrija o extrato no banco antes de importar.');
    const entries = statement.entries.map(entry => ({ fitid: entry.fitid, posted_at: entry.postedAt, amount: entry.amount, trn_type: entry.trnType, memo: entry.memo, name: entry.name }));
    const { data, error } = await (supabase as any).rpc('admin_import_ofx', { p_account_id: selected, p_file_hash: await sha256(file), p_file_name: file.name, p_entries: entries, p_bank_id: statement.bankId, p_account_identifier: statement.acctId, p_ledger_balance: statement.ledgerBalanceDate ? statement.ledgerBalance : null, p_ledger_balance_date: statement.ledgerBalance != null ? statement.ledgerBalanceDate : null });
    if (error) throw error; return data as { inserted: number; duplicates: number; already_imported: boolean };
  }, onSuccess: result => { toast.success(result.already_imported ? 'Este arquivo já foi importado nesta conta.' : `${result.inserted} movimento(s) importado(s); ${result.duplicates} duplicado(s) ignorado(s).`); queryClient.invalidateQueries({ queryKey: ['admin-cash-flow'] }); queryClient.invalidateQueries({ queryKey: ['admin-bank-movements'] }); queryClient.invalidateQueries({ queryKey: ['admin-bank-statement-summary'] }); }, onError: (error: Error) => { const message = error.message ?? ''; toast.error(message.includes('ofx_account_mismatch') ? 'Este OFX pertence a outra conta bancária. Selecione a conta correta.' : message.includes('ofx_invalid_amount') ? 'O extrato tem uma transação sem valor válido. Corrija o arquivo antes de importar.' : message.includes('ofx_identity_conflict') ? 'O mesmo FITID veio com dados diferentes. Revise o extrato antes de importar.' : message.includes('ofx_ambiguous_fallback_identity') ? 'Há movimentações idênticas sem identificador no OFX. Exporte um arquivo com FITID.' : message.includes('ofx_before_opening_balance') ? 'O OFX contém lançamentos anteriores ao saldo inicial informado.' : 'Não foi possível importar o OFX.'); } });
  return <section className="space-y-4" aria-label="Contas bancárias administrativas">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-semibold">Contas bancárias</h2><p className="text-sm text-muted-foreground">A Asaas é sincronizada automaticamente. OFX só entra em contas externas, sem misturar dados de clientes.</p></div><Button className="bg-black text-white hover:bg-zinc-800" disabled={!canManage} onClick={() => setCreating(v => !v)}><Plus className="mr-2 h-4 w-4"/>Nova conta externa</Button></div>
    {creating && <form className="grid gap-3 rounded-xl border bg-white text-zinc-900 p-4 sm:grid-cols-2" onSubmit={e => { e.preventDefault(); create.mutate(); }}><div><Label htmlFor="bank-name">Nome da conta</Label><Input id="bank-name" required value={name} onChange={e => setName(e.target.value)} placeholder="Ex.: Itaú operacional"/></div><div><Label htmlFor="bank-provider">Instituição</Label><Input id="bank-provider" required value={provider} onChange={e => setProvider(e.target.value)} placeholder="Ex.: Itaú"/></div><div><Label htmlFor="bank-opening-balance">Saldo inicial (R$)</Label><Input id="bank-opening-balance" required inputMode="decimal" value={openingBalance} onChange={e => setOpeningBalance(e.target.value)} placeholder="0,00"/></div><div><Label htmlFor="bank-opening-date">Data do saldo</Label><DateField id="bank-opening-date" required value={openingDate} onChange={e => setOpeningDate(e)}/></div><p className="text-sm text-muted-foreground sm:col-span-2">Use o saldo disponível no início desta data. Importe movimentações posteriores para não somar o mesmo período duas vezes.</p><div className="flex gap-2 sm:col-span-2"><Button disabled={create.isPending}>{create.isPending ? 'Criando…' : 'Criar conta'}</Button><Button type="button" variant="outline" onClick={() => setCreating(false)}>Cancelar</Button></div></form>}
    {accounts.isLoading ? <p role="status">Carregando contas…</p> : accounts.isError ? <p role="alert">Não foi possível carregar as contas.</p> : <div className="grid gap-3 md:grid-cols-2">{accounts.data?.map(account => <button type="button" key={account.id} onClick={() => account.account_kind === 'external' && setSelected(account.id)} className={`rounded-xl border bg-white text-zinc-900 p-4 text-left transition ${selected === account.id ? 'border-black ring-1 ring-black' : ''}`}><div className="flex items-center gap-2"><Landmark className="h-4 w-4"/><span className="font-semibold">{account.name}</span></div><p className="mt-1 text-sm text-muted-foreground">{account.provider} · {account.account_kind === 'asaas' ? 'Sincronizada' : account.is_active ? 'Externa' : 'Inativa'}</p></button>)}</div>}
    {external.length === 0 ? <p className="text-sm text-muted-foreground">Crie uma conta externa para importar um OFX.</p> : <div className="rounded-xl border bg-white text-zinc-900 p-4"><Label htmlFor="ofx-account">Conta externa para importar</Label><Select value={selected ?? ''} onValueChange={value => setSelected(value || null)}><SelectTrigger id="ofx-account" className="mt-1 flex h-10 w-full rounded-md border bg-white text-zinc-900 px-3"><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent className="max-w-[calc(100vw-2rem)]">{external.map(a => <SelectItem key={a.id} value={a.id}>{a.name} · {a.provider}</SelectItem>)}</SelectContent></Select><input ref={fileRef} className="sr-only" type="file" accept=".ofx,application/x-ofx,text/ofx" onChange={e => { const file = e.target.files?.[0]; if (file) importOfx.mutate(file); e.currentTarget.value = ''; }}/><Button className="mt-3" variant="outline" disabled={!canManage || !selected || importOfx.isPending} onClick={() => fileRef.current?.click()}><Upload className="mr-2 h-4 w-4"/>{importOfx.isPending ? 'Importando…' : 'Importar OFX'}</Button><p className="mt-2 text-xs text-muted-foreground">O arquivo não é salvo. A importação é idempotente por conta, FITID ou hash seguro da movimentação.</p></div>}
    {selected && <AdminBankStatementSummary accountId={selected} />}
    {selected && renderTransactions?.(selected)}
  </section>;
}
