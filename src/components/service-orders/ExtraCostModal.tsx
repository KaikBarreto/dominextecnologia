import { useState } from 'react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyField } from '@/components/ui/CurrencyField';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Car, Wrench, HardHat, Fuel, ShieldCheck, MoreHorizontal, Plus } from 'lucide-react';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { readPastedCents } from '@/lib/money-paste-mask';
import { getCurrencySymbol } from '@/lib/format';

// Internal key → icon mapping (keys are stable, labels come from i18n)
const EXTRA_COST_ICONS = [
  { key: 'vehicle' as const, icon: Car },
  { key: 'tools' as const, icon: Wrench },
  { key: 'epi' as const, icon: ShieldCheck },
  { key: 'fuel' as const, icon: Fuel },
  { key: 'equipment' as const, icon: HardHat },
  { key: 'other' as const, icon: MoreHorizontal },
];

interface ExtraCostModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (label: string, amount: number) => void;
}

export function ExtraCostModal({ open, onOpenChange, onAdd }: ExtraCostModalProps) {
  const { locale, currency } = useAppLocaleContext();
  const currencySymbol = getCurrencySymbol(currency, locale);
  const t = MESSAGES[locale].app.crm.costModals;

  const [typeKey, setTypeKey] = useState<string>('vehicle');
  const [customLabel, setCustomLabel] = useState('');
  const [amount, setAmount] = useState(0);

  const typeLabel = t.extraCostTypes[typeKey as keyof typeof t.extraCostTypes] ?? typeKey;
  const label = typeKey === 'other' ? (customLabel || typeLabel) : typeLabel;

  const handleAdd = () => {
    if (amount <= 0) return;
    onAdd(label, amount);
    setAmount(0);
    setCustomLabel('');
    onOpenChange(false);
  };

  // `<input type="number">` deixa colar "4.550" como float válido do HTML
  // (ponto = decimal), e o navegador normaliza pra "4.55" — 1000x menor que
  // os R$ 4.550,00 pretendidos (bug real, 2026-09-17). DIGITAR não muda:
  // continua number nativo, dígitos e "." decimal como sempre. Só o COLAR é
  // interceptado e reinterpretado como valor pronto via `readPastedCents`
  // (mesma leitura PT-BR/internacional do `money-paste-mask.ts`).
  const handleAmountPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const cents = readPastedCents(e);
    if (cents == null) return;
    setAmount(cents / 100);
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={t.extraCostTitle}
      footer={
        <div className="flex gap-2">
          <Button variant="cancel" onClick={() => onOpenChange(false)} className="h-11 flex-1">{t.extraCostCancel}</Button>
          <Button onClick={handleAdd} disabled={amount <= 0} className="h-11 flex-1 bg-primary font-semibold text-primary-foreground hover:bg-primary/90">
            <Plus className="h-3.5 w-3.5 mr-1" />{t.extraCostAdd}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="quote-extra-type" className="text-sm font-semibold text-foreground">{t.extraCostTypeLabel}</Label>
          <Select value={typeKey} onValueChange={setTypeKey}>
            <SelectTrigger id="quote-extra-type" className="min-h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXTRA_COST_ICONS.map(({ key, icon: Icon }) => (
                <SelectItem key={key} value={key}>
                  <div className="flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5" />
                    {t.extraCostTypes[key]}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {typeKey === 'other' && (
          <div className="space-y-1.5">
            <Label htmlFor="quote-extra-description" className="text-sm font-semibold text-foreground">{t.extraCostDescLabel}</Label>
            <Input
              id="quote-extra-description"
              className="h-11 text-base"
              value={customLabel}
              onChange={e => setCustomLabel(e.target.value)}
              placeholder={t.extraCostDescPlaceholder}
            />
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="quote-extra-amount" className="text-sm font-semibold text-foreground">{t.extraCostAmountLabel}</Label>
          <CurrencyField symbol={currencySymbol} className="max-w-48">
          <Input
            id="quote-extra-amount"
            className="h-11 text-right text-base"
            type="number" min={0} step="0.01"
            value={amount || ''}
            onChange={e => setAmount(Number(e.target.value) || 0)}
            onPaste={handleAmountPaste}
            placeholder={t.extraCostAmountPlaceholder}
          />
          </CurrencyField>
        </div>
      </div>
    </ResponsiveModal>
  );
}
