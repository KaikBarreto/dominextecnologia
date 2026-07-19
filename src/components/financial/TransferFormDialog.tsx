import { useState } from 'react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, ArrowRight } from 'lucide-react';
import type { FinancialAccount } from '@/hooks/useFinancialAccounts';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

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
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');

  const handleCurrencyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    setAmount(parseInt(raw || '0', 10) / 100);
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
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title={t.title} className="sm:max-w-[460px]" footer={footer}>
      <form id="transfer-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
          <div className="space-y-1.5">
            <Label>{t.originLabel}</Label>
            <Select value={fromId} onValueChange={setFromId}>
              <SelectTrigger><SelectValue placeholder={t.originPlaceholder} /></SelectTrigger>
              <SelectContent>
                {activeAccounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <ArrowRight className="h-5 w-5 text-muted-foreground mb-2" />
          <div className="space-y-1.5">
            <Label>{t.destLabel}</Label>
            <Select value={toId} onValueChange={setToId}>
              <SelectTrigger><SelectValue placeholder={t.destPlaceholder} /></SelectTrigger>
              <SelectContent>
                {activeAccounts.filter(a => a.id !== fromId).map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>{t.amountLabel}</Label>
            <Input placeholder={t.amountPlaceholder} value={displayValue} onChange={handleCurrencyChange} inputMode="numeric" />
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
  );
}
