import { useState } from 'react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Car, Wrench, HardHat, Fuel, ShieldCheck, MoreHorizontal, Plus } from 'lucide-react';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

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
  const { locale } = useAppLocaleContext();
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

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={t.extraCostTitle}
      footer={
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">{t.extraCostCancel}</Button>
          <Button onClick={handleAdd} disabled={amount <= 0} className="flex-1">
            <Plus className="h-3.5 w-3.5 mr-1" />{t.extraCostAdd}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs">{t.extraCostTypeLabel}</Label>
          <Select value={typeKey} onValueChange={setTypeKey}>
            <SelectTrigger>
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
            <Label className="text-xs">{t.extraCostDescLabel}</Label>
            <Input
              value={customLabel}
              onChange={e => setCustomLabel(e.target.value)}
              placeholder={t.extraCostDescPlaceholder}
            />
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-xs">{t.extraCostAmountLabel}</Label>
          <Input
            type="number" min={0} step="0.01"
            value={amount || ''}
            onChange={e => setAmount(Number(e.target.value) || 0)}
            placeholder={t.extraCostAmountPlaceholder}
          />
        </div>
      </div>
    </ResponsiveModal>
  );
}
