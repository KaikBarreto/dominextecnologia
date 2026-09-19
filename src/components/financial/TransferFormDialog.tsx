import { useState, useMemo } from 'react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { AccountFormDialog } from './AccountFormDialog';
import { useCanManageFinanceSettings } from '@/hooks/useCanManageFinanceSettings';
import { Loader2, ArrowRight, Plus } from 'lucide-react';
import type { FinancialAccount } from '@/hooks/useFinancialAccounts';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { readPastedCents } from '@/lib/money-paste-mask';
import { cn } from '@/lib/utils';
import { buildAccountOptions } from '@/components/financial/accountSelectOptions';

// Sem campo de centro de custo aqui: DECISÃO DELIBERADA, não esquecimento.
// A transferência fica fora do resultado (par com `transfer_pair_id`) — ver
// a justificativa completa em `useFinancialAccounts.ts` (mutation `transfer`).
interface TransferFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: FinancialAccount[];
  onSubmit: (data: { from_account_id: string; to_account_id: string; amount: number; date: string; description?: string }) => Promise<void>;
  isLoading?: boolean;
}

export function TransferFormDialog({ open, onOpenChange, accounts, onSubmit, isLoading }: TransferFormDialogProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.finance.transferForm;
  // Quem não gerencia configuração não vê o "+" de criar conta/categoria na
  // hora: o banco recusa (RLS pede `can_manage_system`) e o erro chegava sem
  // explicação. Mesmo critério do CostCenterSelect.
  const canManageFinanceSettings = useCanManageFinanceSettings();
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  // Quick-create de conta inline. `accountTarget` diz qual select recebe a nova conta.
  const [accountFormOpen, setAccountFormOpen] = useState(false);
  const [accountInitialName, setAccountInitialName] = useState('');
  const [accountTarget, setAccountTarget] = useState<'from' | 'to'>('from');
  const [fromQuery, setFromQuery] = useState('');
  const [toQuery, setToQuery] = useState('');

  const handleCurrencyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    setAmount(parseInt(raw || '0', 10) / 100);
  };
  // Colar um valor pronto (ex. "4.550" de planilha) NÃO passa pela regra de
  // centavos comum: daria R$ 45,50 (100x menor). Ver `money-paste-mask.ts`.
  const handleCurrencyPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const cents = readPastedCents(e);
    if (cents != null) setAmount(cents / 100);
  };

  const displayValue = amount
    ? amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromId || !toId || fromId === toId || amount <= 0) return;
    await onSubmit({ from_account_id: fromId, to_account_id: toId, amount, date, description: description || undefined });
    setFromId(''); setToId(''); setAmount(0); setDescription('');
    onOpenChange(false);
  };

  const activeAccounts = accounts.filter(a => a.is_active);

  // Opções da origem (todas as contas ativas) e do destino (exclui a origem escolhida).
  const fromOptions = useMemo(
    () => buildAccountOptions(activeAccounts as any, { includeCard: true }),
    [activeAccounts],
  );
  const toOptions = useMemo(
    () => buildAccountOptions(activeAccounts.filter(a => a.id !== fromId) as any, { includeCard: true }),
    [activeAccounts, fromId],
  );

  const footer = (
    <div className="flex justify-end gap-3">
      <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t.cancelLabel}</Button>
      <Button type="submit" form="transfer-form" disabled={isLoading || !fromId || !toId || fromId === toId || amount <= 0}>
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {t.confirmLabel}
      </Button>
    </div>
  );

  return (
    <>
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title={t.title} className="sm:max-w-[460px]" footer={footer}>
      <form id="transfer-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
          <div className="space-y-1.5">
            <Label>{t.originLabel}</Label>
            <div className="flex items-center h-10 rounded-md border border-input bg-background ring-offset-background focus-within:border-ring focus-within:ring-1 focus-within:ring-ring focus-within:ring-offset-0">
              <SearchableSelect
                options={fromOptions}
                value={fromId}
                onValueChange={setFromId}
                onSearchChange={setFromQuery}
                placeholder={t.originPlaceholder}
                searchPlaceholder={t.accountSearchPlaceholder}
                className={cn(
                  'flex-1 min-w-0 justify-between border-0 bg-transparent hover:bg-transparent text-foreground hover:text-foreground shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-3 h-10 font-normal rounded-none',
                  canManageFinanceSettings ? 'rounded-l-md' : 'rounded-md',
                )}
              />
              {canManageFinanceSettings && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setAccountTarget('from');
                    setAccountInitialName(fromQuery);
                    setAccountFormOpen(true);
                  }}
                  className="h-10 w-10 shrink-0 rounded-none rounded-r-md border-l border-input bg-muted text-muted-foreground hover:bg-primary hover:text-primary-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
                  aria-label={t.accountCreateAlwaysLabel}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
          <ArrowRight className="h-5 w-5 text-muted-foreground mb-2" />
          <div className="space-y-1.5">
            <Label>{t.destLabel}</Label>
            <div className="flex items-center h-10 rounded-md border border-input bg-background ring-offset-background focus-within:border-ring focus-within:ring-1 focus-within:ring-ring focus-within:ring-offset-0">
              <SearchableSelect
                options={toOptions}
                value={toId}
                onValueChange={setToId}
                onSearchChange={setToQuery}
                placeholder={t.destPlaceholder}
                searchPlaceholder={t.accountSearchPlaceholder}
                className={cn(
                  'flex-1 min-w-0 justify-between border-0 bg-transparent hover:bg-transparent text-foreground hover:text-foreground shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-3 h-10 font-normal rounded-none',
                  canManageFinanceSettings ? 'rounded-l-md' : 'rounded-md',
                )}
              />
              {canManageFinanceSettings && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setAccountTarget('to');
                    setAccountInitialName(toQuery);
                    setAccountFormOpen(true);
                  }}
                  className="h-10 w-10 shrink-0 rounded-none rounded-r-md border-l border-input bg-muted text-muted-foreground hover:bg-primary hover:text-primary-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
                  aria-label={t.accountCreateAlwaysLabel}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>{t.amountLabel}</Label>
            <Input placeholder={t.amountPlaceholder} value={displayValue} onChange={handleCurrencyChange} onPaste={handleCurrencyPaste} inputMode="numeric" />
          </div>
          <div className="space-y-1.5">
            <Label>{t.dateLabel}</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>{t.descriptionLabel}</Label>
          <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder={t.descriptionPlaceholder} rows={2} />
        </div>

      </form>
    </ResponsiveModal>

    {/* Quick-create de conta — auto-seleciona na origem ou destino conforme o gatilho. */}
    <AccountFormDialog
      open={accountFormOpen}
      onOpenChange={setAccountFormOpen}
      initialName={accountInitialName}
      onCreated={(account) => {
        if (accountTarget === 'from') setFromId(account.id);
        else setToId(account.id);
      }}
    />
    </>
  );
}
