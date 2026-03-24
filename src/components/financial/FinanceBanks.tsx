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
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Plus, Pencil, Trash2, ArrowLeftRight, Landmark, Wallet, CreditCard } from 'lucide-react';
import { useFinancialAccounts, type FinancialAccount, type AccountInput } from '@/hooks/useFinancialAccounts';
import { TransferFormDialog } from './TransferFormDialog';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

const ACCOUNT_TYPES = [
  { value: 'caixa', label: 'Caixa', icon: Wallet },
  { value: 'banco', label: 'Conta Bancária', icon: Landmark },
  { value: 'cartao', label: 'Cartão', icon: CreditCard },
];

const ACCOUNT_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
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
  const [bankName, setBankName] = useState('');
  const [initialBalance, setInitialBalance] = useState(0);
  const [color, setColor] = useState('#3b82f6');

  const openNew = () => {
    setEditing(null);
    setName(''); setType('banco'); setBankName(''); setInitialBalance(0); setColor('#3b82f6');
    setFormOpen(true);
  };

  const openEdit = (a: FinancialAccount) => {
    setEditing(a);
    setName(a.name); setType(a.type); setBankName(a.bank_name || ''); setInitialBalance(a.initial_balance); setColor(a.color);
    setFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const input: AccountInput = { name, type, bank_name: bankName || undefined, initial_balance: initialBalance, color };
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
          return (
            <Card key={a.id} className="relative group">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="rounded-full p-2.5 shrink-0" style={{ backgroundColor: a.color }}>
                      <Icon className="h-4 w-4 text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{a.name}</p>
                      {a.bank_name && <p className="text-xs text-muted-foreground truncate">{a.bank_name}</p>}
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
      <ResponsiveModal open={formOpen} onOpenChange={setFormOpen} title={editing ? 'Editar Conta' : 'Nova Conta'} className="sm:max-w-[420px]">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nome da Conta</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Conta Bradesco" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Saldo Inicial (R$)</Label>
              <Input placeholder="0,00" value={balanceDisplay} onChange={handleCurrencyChange} inputMode="numeric" />
            </div>
          </div>
          {type === 'banco' && (
            <div className="space-y-1.5">
              <Label>Nome do Banco</Label>
              <Input value={bankName} onChange={e => setBankName(e.target.value)} placeholder="Ex: Bradesco, Itaú..." />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Cor</Label>
            <div className="flex gap-2 flex-wrap">
              {ACCOUNT_COLORS.map(c => (
                <button key={c} type="button" onClick={() => setColor(c)}
                  className={`h-8 w-8 rounded-full border-2 transition-all ${color === c ? 'border-foreground scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
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
