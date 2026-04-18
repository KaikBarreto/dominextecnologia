import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Plus, Pencil, Trash2, ArrowLeftRight, Landmark, Wallet, CreditCard } from 'lucide-react';
import { useFinancialAccounts, type FinancialAccount, type AccountInput } from '@/hooks/useFinancialAccounts';
import { TransferFormDialog } from './TransferFormDialog';
import { BankInstitutionCombobox, BankLogo } from './BankInstitutionCombobox';
import { cn } from '@/lib/utils';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

const ACCOUNT_TYPES = [
  { value: 'caixa', label: 'Caixa', icon: Wallet },
  { value: 'banco', label: 'Conta Bancária', icon: Landmark },
  { value: 'cartao', label: 'Cartão', icon: CreditCard },
];

const ACCOUNT_COLORS = [
  '#0F172A', '#1E293B', '#334155', '#0EA5E9', '#0284C7', '#1D4ED8',
  '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#ec4899', '#f43f5e',
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e',
  '#10b981', '#14b8a6', '#06b6d4',
];

function getTypeIcon(type: string) {
  const found = ACCOUNT_TYPES.find(t => t.value === type);
  return found?.icon || Landmark;
}

export function FinanceBanks() {
  const { accounts, balances, isLoading, createAccount, updateAccount, deleteAccount, transfer } = useFinancialAccounts();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<FinancialAccount | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [type, setType] = useState('banco');
  const [institution, setInstitution] = useState<{ code: number | null; name: string; ispb?: string | null } | null>(null);
  const [initialBalance, setInitialBalance] = useState(0);
  const [color, setColor] = useState('#3b82f6');

  const openNew = () => {
    setEditing(null);
    setName(''); setType('banco'); setInstitution(null); setInitialBalance(0); setColor('#3b82f6');
    setFormOpen(true);
  };

  const openEdit = (a: FinancialAccount) => {
    setEditing(a);
    setName(a.name);
    setType(a.type);
    setInstitution(a.institution_name ? { code: a.institution_code ?? null, name: a.institution_name, ispb: a.institution_ispb } : (a.bank_name ? { code: null, name: a.bank_name } : null));
    setInitialBalance(a.initial_balance);
    setColor(a.color);
    setFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const input: AccountInput = {
      name,
      type,
      bank_name: institution?.name || undefined,
      institution_code: institution?.code ?? null,
      institution_name: institution?.name ?? null,
      institution_ispb: institution?.ispb ?? null,
      initial_balance: initialBalance,
      color,
    };
    if (editing) {
      await updateAccount.mutateAsync({ ...input, id: editing.id });
    } else {
      await createAccount.mutateAsync(input);
    }
    setFormOpen(false);
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    await deleteAccount.mutateAsync(deletingId);
    setDeletingId(null);
  };

  const handleCurrencyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    setInitialBalance(parseInt(raw || '0', 10) / 100);
  };

  const balanceDisplay = initialBalance
    ? initialBalance.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '';

  const totalBalance = accounts.reduce((sum, a) => sum + (balances[a.id] ?? a.initial_balance), 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold">Caixas e Bancos</h2>
          <p className="text-sm text-muted-foreground">Gerencie suas contas bancárias e controle saldos</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setTransferOpen(true)} disabled={accounts.length < 2}>
            <ArrowLeftRight className="h-4 w-4" /> Transferir
          </Button>
          <Button className="gap-2" onClick={openNew}>
            <Plus className="h-4 w-4" /> Nova Conta
          </Button>
        </div>
      </div>

      {/* Total balance */}
      <Card className="bg-primary border-0">
        <CardContent className="p-4 sm:p-5">
          <p className="text-xs font-medium text-primary-foreground/80 uppercase tracking-wider">Saldo Total</p>
          <p className="text-2xl font-bold text-primary-foreground mt-1">{formatCurrency(totalBalance)}</p>
        </CardContent>
      </Card>

      {/* Account cards */}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {accounts.map(a => {
          const Icon = getTypeIcon(a.type);
          const balance = balances[a.id] ?? a.initial_balance;
          const hasInst = !!(a.institution_name || a.bank_name);
          return (
            <Card key={a.id} className="relative group overflow-hidden">
              <div className="h-1.5 w-full" style={{ backgroundColor: a.color }} />
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    {hasInst ? (
                      <div className="rounded-lg p-1 shrink-0 bg-white border" style={{ borderColor: a.color }}>
                        <BankLogo code={a.institution_code} name={a.institution_name || a.bank_name} size={32} />
                      </div>
                    ) : (
                      <div className="rounded-full p-2.5 shrink-0" style={{ backgroundColor: a.color }}>
                        <Icon className="h-4 w-4 text-white" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{a.name}</p>
                      {(a.institution_name || a.bank_name) && (
                        <p className="text-xs text-muted-foreground truncate">{a.institution_name || a.bank_name}</p>
                      )}
                      <Badge variant="outline" className="text-[10px] mt-1">
                        {ACCOUNT_TYPES.find(t => t.value === a.type)?.label || a.type}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(a)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeletingId(a.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t">
                  <p className="text-xs text-muted-foreground">Saldo atual</p>
                  <p className={`text-lg font-bold ${balance >= 0 ? 'text-success' : 'text-destructive'}`}>
                    {formatCurrency(balance)}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {accounts.length === 0 && !isLoading && (
        <div className="text-center py-12 text-muted-foreground">
          <Landmark className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="font-medium">Nenhuma conta cadastrada</p>
          <p className="text-sm">Crie contas para controlar seus saldos bancários</p>
        </div>
      )}

      {/* Account form modal */}
      <ResponsiveModal open={formOpen} onOpenChange={setFormOpen} title={editing ? 'Editar Conta' : 'Nova Conta'} className="sm:max-w-[480px]">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nome da Conta *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Conta Corrente Principal" required />
          </div>

          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ACCOUNT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {(type === 'banco' || type === 'cartao') && (
            <div className="space-y-1.5">
              <Label>Instituição</Label>
              <BankInstitutionCombobox value={institution} onChange={setInstitution} />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Saldo Inicial (R$)</Label>
            <Input placeholder="0,00" value={balanceDisplay} onChange={handleCurrencyChange} inputMode="numeric" />
            {editing && (
              <p className="text-xs text-muted-foreground">⚠️ Editar o saldo inicial recalcula o saldo atual da conta.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Cor</Label>
            <div className="flex gap-1.5 flex-wrap items-center">
              {ACCOUNT_COLORS.map(c => (
                <button key={c} type="button" onClick={() => setColor(c)}
                  className={cn(
                    'h-7 w-7 rounded-full border-2 transition-all',
                    color === c ? 'border-foreground scale-110 ring-2 ring-foreground/20' : 'border-transparent'
                  )}
                  style={{ backgroundColor: c }} aria-label={`Cor ${c}`} />
              ))}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="h-7 w-7 rounded-full border-2 border-dashed border-muted-foreground flex items-center justify-center text-muted-foreground hover:border-foreground hover:text-foreground transition-all"
                    aria-label="Cor personalizada"
                  >
                    +
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-3">
                  <div className="space-y-2">
                    <Label className="text-xs">Cor personalizada</Label>
                    <input
                      type="color"
                      value={color}
                      onChange={e => setColor(e.target.value)}
                      className="h-10 w-full cursor-pointer rounded border"
                    />
                    <Input value={color} onChange={e => setColor(e.target.value)} className="h-8 text-xs" />
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Pré-visualização */}
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Pré-visualização</Label>
            <Card className="overflow-hidden">
              <div className="h-1.5 w-full" style={{ backgroundColor: color }} />
              <CardContent className="p-3 flex items-center gap-3">
                {institution ? (
                  <div className="rounded-lg p-1 shrink-0 bg-white border" style={{ borderColor: color }}>
                    <BankLogo code={institution.code} name={institution.name} size={32} />
                  </div>
                ) : (
                  <div className="rounded-full p-2 shrink-0" style={{ backgroundColor: color }}>
                    {(() => { const I = getTypeIcon(type); return <I className="h-4 w-4 text-white" />; })()}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{name || 'Nome da conta'}</p>
                  {institution?.name && <p className="text-xs text-muted-foreground truncate">{institution.name}</p>}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={!name || createAccount.isPending || updateAccount.isPending}>
              {editing ? 'Salvar' : 'Criar Conta'}
            </Button>
          </div>
        </form>
      </ResponsiveModal>

      <TransferFormDialog
        open={transferOpen}
        onOpenChange={setTransferOpen}
        accounts={accounts}
        onSubmit={async (d) => { await transfer.mutateAsync(d); }}
        isLoading={transfer.isPending}
      />

      <AlertDialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conta</AlertDialogTitle>
            <AlertDialogDescription>Tem certeza? Transações vinculadas perderão a referência à conta.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
