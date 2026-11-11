import { Gift } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NumericInput } from '@/components/ui/numeric-input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { readPastedCents } from '@/lib/money-paste-mask';
import {
  calculatePromotionalMonthlyValue,
  promotionItemKey,
  remainingPromotionCycles,
  type SubscriptionPromotionDraft,
  type SubscriptionPromotionItem,
} from '@/lib/subscriptionPromotions';

interface SubscriptionPromotionsEditorProps {
  items: SubscriptionPromotionItem[];
  promotions: SubscriptionPromotionDraft[];
  normalMonthlyValue: number;
  onChange: (promotions: SubscriptionPromotionDraft[]) => void;
  disabledReason?: string | null;
  isLoading?: boolean;
}

const formatMoney = (value: number) => value.toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
});

const formatMoneyInput = (value: number) => Math.max(0, value).toLocaleString('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function SubscriptionPromotionsEditor({
  items,
  promotions,
  normalMonthlyValue,
  onChange,
  disabledReason,
  isLoading = false,
}: SubscriptionPromotionsEditorProps) {
  const effectiveValue = calculatePromotionalMonthlyValue(normalMonthlyValue, promotions);

  const findPromotion = (item: SubscriptionPromotionItem) => promotions.find((promotion) => (
    promotionItemKey(promotion.scope_type, promotion.module_code) === item.key
  ));

  const updatePromotion = (
    item: SubscriptionPromotionItem,
    patch: Partial<SubscriptionPromotionDraft>,
  ) => {
    const existing = findPromotion(item);
    if (!existing) return;
    onChange(promotions.map((promotion) => (
      promotion === existing ? { ...promotion, ...patch } : promotion
    )));
  };

  const togglePromotion = (item: SubscriptionPromotionItem, enabled: boolean) => {
    if (!enabled) {
      onChange(promotions.filter((promotion) => (
        promotionItemKey(promotion.scope_type, promotion.module_code) !== item.key
      )));
      return;
    }

    onChange([...promotions, {
      scope_type: item.scope_type,
      module_code: item.module_code,
      quantity: item.quantity,
      standard_unit_price: item.standard_unit_price,
      promotional_unit_price: 0,
      billing_cycles: 3,
      consumed_cycles: 0,
      reason: '',
    }]);
  };

  return (
    <section className="space-y-3 rounded-lg border p-3" aria-labelledby="subscription-promotions-title">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 id="subscription-promotions-title" className="flex items-center gap-2 text-sm font-medium">
            <Gift className="h-4 w-4" aria-hidden="true" />
            Condições promocionais
          </h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            O acesso é liberado agora. O valor normal entra automaticamente após as cobranças promocionais confirmadas.
          </p>
        </div>
        {promotions.length > 0 && !disabledReason ? (
          <Badge className="border-0 bg-amber-500 text-white hover:bg-amber-500">
            {promotions.length} {promotions.length === 1 ? 'condição ativa' : 'condições ativas'}
          </Badge>
        ) : null}
      </div>

      {disabledReason ? (
        <p className="rounded-md bg-muted px-3 py-2 text-xs leading-5 text-muted-foreground" role="note">
          {disabledReason}
        </p>
      ) : isLoading ? (
        <p className="py-2 text-sm text-muted-foreground">Carregando condições promocionais...</p>
      ) : items.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">
          Selecione um módulo pago ou adicione usuários para criar uma condição promocional.
        </p>
      ) : (
        <div className="divide-y">
          {items.map((item) => {
            const promotion = findPromotion(item);
            const isEnabled = !!promotion;
            const remaining = promotion ? remainingPromotionCycles(promotion) : 0;
            const isFree = promotion?.promotional_unit_price === 0;

            return (
              <div key={item.key} className="space-y-3 py-3 first:pt-1 last:pb-1">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{item.label}</p>
                      <Badge variant="outline" className="whitespace-nowrap tabular-nums">
                        {formatMoney(item.standard_unit_price)}{item.scope_type === 'extra_users' ? ' por usuário' : '/mês'}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      id={`promotion-${item.key}`}
                      checked={isEnabled}
                      onCheckedChange={(checked) => togglePromotion(item, checked)}
                    />
                    <Label htmlFor={`promotion-${item.key}`} className="cursor-pointer text-xs">
                      Aplicar promoção
                    </Label>
                  </div>
                </div>

                {promotion ? (
                  <div className="grid gap-3 rounded-md bg-muted/40 p-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor={`promotion-price-${item.key}`} className="text-xs">
                        {item.scope_type === 'extra_users' ? 'Valor por usuário durante a promoção' : 'Valor durante a promoção'}
                      </Label>
                      <Input
                        id={`promotion-price-${item.key}`}
                        inputMode="numeric"
                        value={formatMoneyInput(promotion.promotional_unit_price)}
                        onChange={(event) => updatePromotion(item, {
                          promotional_unit_price: Math.max(
                            0,
                            (Number(event.target.value.replace(/\D/g, '')) || 0) / 100,
                          ),
                        })}
                        onPaste={(event) => {
                          const cents = readPastedCents(event);
                          if (cents == null) return;
                          updatePromotion(item, { promotional_unit_price: cents / 100 });
                        }}
                        className="tabular-nums"
                      />
                      <p className={cn(
                        'text-xs',
                        promotion.promotional_unit_price > item.standard_unit_price
                          ? 'text-destructive'
                          : 'text-muted-foreground',
                      )}>
                        {isFree ? 'Gratuito durante o período promocional.' : `Preço normal: ${formatMoney(item.standard_unit_price)}.`}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`promotion-cycles-${item.key}`} className="text-xs">
                        Próximas cobranças
                      </Label>
                      <NumericInput
                        id={`promotion-cycles-${item.key}`}
                        min={Math.max(1, promotion.consumed_cycles + 1)}
                        max={60}
                        value={String(promotion.billing_cycles)}
                        onValueChange={(value) => updatePromotion(item, {
                          billing_cycles: Math.min(
                            60,
                            Math.max(promotion.consumed_cycles + 1, Number(value) || 1),
                          ),
                        })}
                      />
                      <p className="text-xs text-muted-foreground">
                        {promotion.consumed_cycles > 0
                          ? `${remaining} ${remaining === 1 ? 'cobrança restante' : 'cobranças restantes'} de ${promotion.billing_cycles}.`
                          : 'O prazo começa na próxima cobrança confirmada.'}
                      </p>
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label htmlFor={`promotion-reason-${item.key}`} className="text-xs">
                        Motivo ou acordo comercial <span className="font-normal text-muted-foreground">(opcional)</span>
                      </Label>
                      <Input
                        id={`promotion-reason-${item.key}`}
                        value={promotion.reason}
                        maxLength={240}
                        placeholder="Ex.: fidelização por 3 cobranças"
                        onChange={(event) => updatePromotion(item, { reason: event.target.value })}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {promotions.length > 0 && !disabledReason ? (
        <div className="grid gap-2 border-t pt-3 sm:grid-cols-2" aria-live="polite">
          <div>
            <p className="text-xs text-muted-foreground">Próxima mensalidade</p>
            <p className="text-lg font-semibold tabular-nums">{formatMoney(effectiveValue)}</p>
          </div>
          <div className="sm:text-right">
            <p className="text-xs text-muted-foreground">Após todas as promoções</p>
            <p className="text-lg font-semibold tabular-nums">{formatMoney(normalMonthlyValue)}</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
