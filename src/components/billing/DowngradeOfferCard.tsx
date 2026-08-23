import { ArrowDown, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DowngradeOfferCardProps {
  /** Valor efetivo atual cobrado (usado pra calcular economia). */
  currentValue: number;
  /** Nome do plano alternativo mais barato. */
  cheaperPlanName: string;
  /** Preço mensal do plano alternativo. */
  cheaperPlanPrice: number;
  /** Chamado ao clicar no CTA de aceitar o downgrade. */
  onAccept: () => void;
  /** Exibe estado de carregamento no botão. */
  isLoading?: boolean;
  /** Textos i18n já resolvidos pelo consumidor. */
  i18n: {
    title: string;
    /** Descrição com {plan} e {savings} substituídos. */
    desc: string;
    /** CTA com {plan} substituído. */
    cta: string;
    applying: string;
  };
}

/**
 * Card de oferta de downgrade mostrado no passo de confirmação do
 * CancelSubscriptionModal. Se a economia calculada for <= 0 o componente
 * retorna null (proteção defensiva; o pai já deve pré-filtrar).
 */
export function DowngradeOfferCard({
  currentValue,
  cheaperPlanName,
  cheaperPlanPrice,
  onAccept,
  isLoading,
  i18n,
}: DowngradeOfferCardProps) {
  const savings = currentValue - cheaperPlanPrice;
  if (savings <= 0) return null;

  const fmt = (v: number) =>
    `R$ ${v.toFixed(2).replace('.', ',')}`;

  return (
    <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4 space-y-3">
      {/* Cabeçalho */}
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-primary shrink-0">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <div className="space-y-1">
          <p className="font-semibold text-sm">{i18n.title}</p>
          <p className="text-xs text-muted-foreground">{i18n.desc}</p>
        </div>
      </div>

      {/* Comparação de preço */}
      <div className="flex items-center justify-between bg-background rounded-lg px-3 py-2">
        <div className="text-xs space-y-0.5">
          <p className="text-muted-foreground line-through">
            {fmt(currentValue)}/mês
          </p>
          <p className="font-semibold text-primary text-sm">
            {fmt(cheaperPlanPrice)}/mês
          </p>
        </div>
        <div className="p-1.5 rounded-md bg-primary shrink-0">
          <ArrowDown className="h-3.5 w-3.5 text-white" />
        </div>
      </div>

      {/* CTA */}
      <Button
        onClick={onAccept}
        disabled={isLoading}
        className="w-full"
        size="sm"
      >
        {isLoading ? i18n.applying : i18n.cta}
      </Button>
    </div>
  );
}
