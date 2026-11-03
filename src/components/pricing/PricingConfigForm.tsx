import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { NumericInput } from '@/components/ui/numeric-input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Calculator, CheckCircle2, Loader2, Save } from 'lucide-react';
import { usePricingSettings, type PricingSettingsUpdate } from '@/hooks/usePricingSettings';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

// Converte a string crua do input para number, com fallback se estiver vazia/inválida.
const num = (s: string, fallback = 0) => {
  const n = parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
};

export interface PricingPreviewSettings {
  taxRate: number;
  adminRate: number;
  profitRate: number;
  kmCost: number;
  cardDiscountRate: number;
  cardInstallments: number;
}

interface PricingConfigFormProps {
  /** Atualiza somente a prévia em memória; persistência continua exclusiva do CTA Salvar. */
  onPreviewChange?: (settings: PricingPreviewSettings) => void;
}

export function PricingConfigForm({ onPreviewChange }: PricingConfigFormProps = {}) {
  const { locale } = useAppLocaleContext();
  const tp = MESSAGES[locale].app.crm.pricing;
  const { settings, isLoading, upsertSettings } = usePricingSettings();

  const [taxRate, setTaxRate] = useState('10');
  const [adminRate, setAdminRate] = useState('12');
  const [profitRate, setProfitRate] = useState('10');
  const [kmCost, setKmCost] = useState('1');
  const [cardDiscountRate, setCardDiscountRate] = useState('6');
  const [cardInstallments, setCardInstallments] = useState('10');

  useEffect(() => {
    if (!settings) return;
    setTaxRate(String(Number(settings.tax_rate ?? 10)));
    setAdminRate(String(Number(settings.admin_indirect_rate ?? 12)));
    setProfitRate(String(Number(settings.default_profit_rate ?? 10)));
    setKmCost(String(Number(settings.km_cost ?? 1)));
    setCardDiscountRate(String(Number(settings.card_discount_rate ?? 6)));
    setCardInstallments(String(Number(settings.card_installments ?? 10)));
  }, [settings]);

  const taxNum = num(taxRate, 10);
  const adminNum = num(adminRate, 12);
  const profitNum = num(profitRate, 10);

  const bdiFactor = useMemo(() => {
    const raw = (100 - (taxNum + adminNum + profitNum)) / 100;
    return Math.max(0.01, raw);
  }, [taxNum, adminNum, profitNum]);

  const payload = useMemo<PricingSettingsUpdate>(() => ({
    tax_rate: num(taxRate, 10),
    admin_indirect_rate: num(adminRate, 12),
    default_profit_rate: num(profitRate, 10),
    km_cost: num(kmCost, 1),
    card_discount_rate: num(cardDiscountRate, 6),
    card_installments: Math.max(1, num(cardInstallments, 10)),
  }), [adminRate, cardDiscountRate, cardInstallments, kmCost, profitRate, taxRate]);

  useEffect(() => {
    onPreviewChange?.({
      taxRate: payload.tax_rate ?? 10,
      adminRate: payload.admin_indirect_rate ?? 12,
      profitRate: payload.default_profit_rate ?? 10,
      kmCost: payload.km_cost ?? 1,
      cardDiscountRate: payload.card_discount_rate ?? 6,
      cardInstallments: payload.card_installments ?? 10,
    });
  }, [onPreviewChange, payload]);

  const isDirty = !!settings && (
    payload.tax_rate !== Number(settings.tax_rate ?? 10)
    || payload.admin_indirect_rate !== Number(settings.admin_indirect_rate ?? 12)
    || payload.default_profit_rate !== Number(settings.default_profit_rate ?? 10)
    || payload.km_cost !== Number(settings.km_cost ?? 1)
    || payload.card_discount_rate !== Number(settings.card_discount_rate ?? 6)
    || payload.card_installments !== Number(settings.card_installments ?? 10)
  );

  const handleSave = () => upsertSettings.mutate(payload);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Card><CardContent className="p-5"><Skeleton className="h-24" /></CardContent></Card>
        <Card><CardContent className="p-5 space-y-3"><Skeleton className="h-5 w-40" /><Skeleton className="h-10" /><Skeleton className="h-10" /></CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Card educativo - fundo saturado */}
      <div className="rounded-xl bg-primary p-5">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-lg bg-white/15 flex items-center justify-center flex-shrink-0">
            <Calculator size={20} className="text-primary-foreground" />
          </div>
          <div>
            <p className="text-sm font-semibold text-primary-foreground">{tp.bdiMethodTitle}</p>
            <p className="text-xs text-primary-foreground/80 mt-1 leading-relaxed">
              {tp.bdiMethodDesc}
            </p>
            <div className="mt-3 font-mono text-sm bg-white/15 rounded-md px-3 py-2 text-primary-foreground border border-white/20 inline-block">
              {tp.bdiFormula}
            </div>
          </div>
        </div>
      </div>

      {/* Card Taxas BDI */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">{tp.bdiRatesTitle}</p>
            <div className="flex flex-col items-end">
              <span className="text-[11px] text-muted-foreground">{tp.bdiCurrentLabel}</span>
              <span className="text-2xl font-extrabold text-primary leading-tight">{bdiFactor.toFixed(4)}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{tp.taxLabel}</Label>
              <NumericInput decimal maxDecimals={2} value={taxRate} onValueChange={setTaxRate} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{tp.adminLabel}</Label>
              <NumericInput decimal maxDecimals={2} value={adminRate} onValueChange={setAdminRate} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{tp.profitLabel}</Label>
              <NumericInput decimal maxDecimals={2} value={profitRate} onValueChange={setProfitRate} />
            </div>
          </div>

        </CardContent>
      </Card>

      {/* Card Deslocamento e Pagamento */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <p className="text-sm font-semibold text-foreground">{tp.displacementTitle}</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">{tp.kmCostLabel}</Label>
              <NumericInput decimal maxDecimals={2} value={kmCost} onValueChange={setKmCost} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{tp.cashDiscountLabel}</Label>
              <NumericInput decimal maxDecimals={2} value={cardDiscountRate} onValueChange={setCardDiscountRate} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{tp.installmentsLabel}</Label>
              <NumericInput value={cardInstallments} onValueChange={(v) => setCardInstallments(v)} />
            </div>
          </div>

        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 rounded-xl border bg-background p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          {!isDirty && <CheckCircle2 className="h-4 w-4 text-success" />}
          {isDirty ? 'Há alterações de precificação ainda não salvas.' : 'Configurações de precificação atualizadas.'}
        </p>
        <Button onClick={handleSave} disabled={!isDirty || upsertSettings.isPending} className="shrink-0">
          {upsertSettings.isPending
            ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            : <Save className="mr-2 h-4 w-4" />}
          {upsertSettings.isPending ? tp.savingButton : tp.saveButton}
        </Button>
      </div>
    </div>
  );
}
