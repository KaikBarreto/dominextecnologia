import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumericInput } from '@/components/ui/numeric-input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Calculator, Save } from 'lucide-react';
import { usePricingSettings } from '@/hooks/usePricingSettings';

// Converte a string crua do input para number, com fallback se estiver vazia/inválida.
const num = (s: string, fallback = 0) => {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : fallback;
};

export function PricingConfigForm() {
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

  const bdiRemainder = Math.max(0, 100 - taxNum - adminNum - profitNum);

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
            <p className="text-sm font-semibold text-primary-foreground">Método BDI</p>
            <p className="text-xs text-primary-foreground/80 mt-1 leading-relaxed">
              O preço final é calculado dividindo o custo real pelo BDI, garantindo que impostos e overhead nunca sejam subprecificados.
            </p>
            <div className="mt-3 font-mono text-sm bg-white/15 rounded-md px-3 py-2 text-primary-foreground border border-white/20 inline-block">
              Preço = Custo Total ÷ BDI
            </div>
          </div>
        </div>
      </div>

      {/* Card Taxas BDI */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">Taxas do BDI</p>
            <div className="flex flex-col items-end">
              <span className="text-[11px] text-muted-foreground">BDI atual</span>
              <span className="text-2xl font-extrabold text-primary leading-tight">{bdiFactor.toFixed(4)}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Imposto (%)</Label>
              <Input type="number" min={0} step="0.01" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Adm. Indireta (%)</Label>
              <Input type="number" min={0} step="0.01" value={adminRate} onChange={(e) => setAdminRate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Lucro Padrão (%)</Label>
              <Input type="number" min={0} step="0.01" value={profitRate} onChange={(e) => setProfitRate(e.target.value)} />
            </div>
          </div>

          {/* Barra de composição */}
          <div>
            <div className="flex rounded-full overflow-hidden h-2.5">
              <div style={{ width: `${taxNum}%` }} className="bg-destructive transition-all" title={`Imposto: ${taxNum}%`} />
              <div style={{ width: `${adminNum}%` }} className="bg-warning transition-all" title={`Adm. Indireta: ${adminNum}%`} />
              <div style={{ width: `${profitNum}%` }} className="bg-success transition-all" title={`Lucro: ${profitNum}%`} />
              <div style={{ width: `${bdiRemainder}%` }} className="bg-primary transition-all" title={`BDI restante: ${bdiRemainder.toFixed(1)}%`} />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-destructive inline-block" />
                Imposto {taxNum}%
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-warning inline-block" />
                Adm. {adminNum}%
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-success inline-block" />
                Lucro {profitNum}%
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-primary inline-block" />
                BDI {bdiRemainder.toFixed(1)}%
              </span>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={() => upsertSettings.mutate({
                tax_rate: num(taxRate, 10),
                admin_indirect_rate: num(adminRate, 12),
                default_profit_rate: num(profitRate, 10),
                km_cost: num(kmCost, 1),
                card_discount_rate: num(cardDiscountRate, 6),
                card_installments: Math.max(1, num(cardInstallments, 10)),
              } as any)}
              disabled={upsertSettings.isPending}
            >
              <Save className="h-4 w-4 mr-2" />
              {upsertSettings.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Card Deslocamento e Pagamento */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <p className="text-sm font-semibold text-foreground">Deslocamento e Pagamento</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Custo por KM (R$)</Label>
              <Input type="number" min={0} step="0.01" value={kmCost} onChange={(e) => setKmCost(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Desconto à vista (%)</Label>
              <Input type="number" min={0} step="0.01" value={cardDiscountRate} onChange={(e) => setCardDiscountRate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Parcelas (cartão)</Label>
              <NumericInput value={cardInstallments} onValueChange={(v) => setCardInstallments(v)} />
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={() => upsertSettings.mutate({
                tax_rate: num(taxRate, 10),
                admin_indirect_rate: num(adminRate, 12),
                default_profit_rate: num(profitRate, 10),
                km_cost: num(kmCost, 1),
                card_discount_rate: num(cardDiscountRate, 6),
                card_installments: Math.max(1, num(cardInstallments, 10)),
              } as any)}
              disabled={upsertSettings.isPending}
            >
              <Save className="h-4 w-4 mr-2" />
              {upsertSettings.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
