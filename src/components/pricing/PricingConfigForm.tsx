import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Calculator, Save } from 'lucide-react';
import { usePricingSettings } from '@/hooks/usePricingSettings';

export function PricingConfigForm() {
  const { settings, isLoading, upsertSettings } = usePricingSettings();

  const [taxRate, setTaxRate] = useState(10);
  const [adminRate, setAdminRate] = useState(12);
  const [profitRate, setProfitRate] = useState(10);
  const [kmCost, setKmCost] = useState(1);
  const [cardDiscountRate, setCardDiscountRate] = useState(6);
  const [cardInstallments, setCardInstallments] = useState(10);

  useEffect(() => {
    if (!settings) return;
    setTaxRate(Number(settings.tax_rate ?? 10));
    setAdminRate(Number(settings.admin_indirect_rate ?? 12));
    setProfitRate(Number(settings.default_profit_rate ?? 10));
    setKmCost(Number(settings.km_cost ?? 1));
    setCardDiscountRate(Number(settings.card_discount_rate ?? 6));
    setCardInstallments(Number(settings.card_installments ?? 10));
  }, [settings]);

  const bdiFactor = useMemo(() => {
    const raw = (100 - (taxRate + adminRate + profitRate)) / 100;
    return Math.max(0.01, raw);
  }, [taxRate, adminRate, profitRate]);

  const bdiRemainder = Math.max(0, 100 - taxRate - adminRate - profitRate);

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
              <Input type="number" min={0} step="0.01" value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value) || 0)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Adm. Indireta (%)</Label>
              <Input type="number" min={0} step="0.01" value={adminRate} onChange={(e) => setAdminRate(Number(e.target.value) || 0)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Lucro Padrão (%)</Label>
              <Input type="number" min={0} step="0.01" value={profitRate} onChange={(e) => setProfitRate(Number(e.target.value) || 0)} />
            </div>
          </div>

          {/* Barra de composição */}
          <div>
            <div className="flex rounded-full overflow-hidden h-2.5">
              <div style={{ width: `${taxRate}%` }} className="bg-destructive transition-all" title={`Imposto: ${taxRate}%`} />
              <div style={{ width: `${adminRate}%` }} className="bg-warning transition-all" title={`Adm. Indireta: ${adminRate}%`} />
              <div style={{ width: `${profitRate}%` }} className="bg-success transition-all" title={`Lucro: ${profitRate}%`} />
              <div style={{ width: `${bdiRemainder}%` }} className="bg-primary transition-all" title={`BDI restante: ${bdiRemainder.toFixed(1)}%`} />
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-destructive inline-block" />
                Imposto {taxRate}%
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-warning inline-block" />
                Adm. {adminRate}%
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-success inline-block" />
                Lucro {profitRate}%
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
                tax_rate: taxRate,
                admin_indirect_rate: adminRate,
                default_profit_rate: profitRate,
                km_cost: kmCost,
                card_discount_rate: cardDiscountRate,
                card_installments: cardInstallments,
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
              <Input type="number" min={0} step="0.01" value={kmCost} onChange={(e) => setKmCost(Number(e.target.value) || 0)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Desconto à vista (%)</Label>
              <Input type="number" min={0} step="0.01" value={cardDiscountRate} onChange={(e) => setCardDiscountRate(Number(e.target.value) || 0)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Parcelas (cartão)</Label>
              <Input type="number" min={1} step="1" value={cardInstallments} onChange={(e) => setCardInstallments(Math.max(1, Number(e.target.value) || 1))} />
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={() => upsertSettings.mutate({
                tax_rate: taxRate,
                admin_indirect_rate: adminRate,
                default_profit_rate: profitRate,
                km_cost: kmCost,
                card_discount_rate: cardDiscountRate,
                card_installments: cardInstallments,
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
