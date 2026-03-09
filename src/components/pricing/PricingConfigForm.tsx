import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
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

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4 space-y-3">
          <Skeleton className="h-5 w-40" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
          <Skeleton className="h-10 w-28" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div>
          <p className="text-sm font-semibold text-foreground">Configurações BDI</p>
          <p className="text-xs text-muted-foreground">Defina as taxas padrão usadas na precificação.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Taxa de Imposto (%)</Label>
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

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-border p-3 bg-muted/30">
          <div>
            <p className="text-xs text-muted-foreground">BDI (fator)</p>
            <p className="text-sm font-semibold text-foreground">{bdiFactor.toFixed(4)}</p>
          </div>
          <Button
            size="sm"
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
            {upsertSettings.isPending ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
