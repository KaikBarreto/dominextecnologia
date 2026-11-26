import { useEffect, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { OsBillingDialog } from '@/components/service-orders/OsBillingDialog';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatMoney } from '@/lib/format';
import type { OsRevenueContext } from '@/hooks/useOsFinishRevenuePrompt';
import { resolveOsRevenueSuggestedAmount } from '@/lib/os-revenue';

export interface OsFinishRevenueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: OsRevenueContext | null;
}

/** O prompt é configurável; a confirmação abre o faturamento canônico da OS. */
export function OsFinishRevenueDialog({ open, onOpenChange, context }: OsFinishRevenueDialogProps) {
  // Monta o conteúdo (e os hooks pesados do Financeiro, incluindo o
  // `useFinancial`, que pagina TODAS as transações da empresa) SÓ enquanto o
  // fluxo está em uso. Este componente fica pendurado nas telas de OS: montar o
  // Financeiro inteiro em toda OS aberta seria caro à toa.
  //
  // O atraso na desmontagem existe pra o drawer do mobile terminar a animação
  // de saída antes de o conteúdo sumir.
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const timer = setTimeout(() => setMounted(false), 300);
    return () => clearTimeout(timer);
  }, [open]);

  if (!mounted || !context) return null;

  return <OsFinishRevenueFlow open={open} onOpenChange={onOpenChange} context={context} />;
}

interface FlowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: OsRevenueContext;
}

function OsFinishRevenueFlow({ open, onOpenChange, context }: FlowProps) {
  const { locale, currency } = useAppLocaleContext();
  const t = MESSAGES[locale].app.finance.osRevenue;

  const [step, setStep] = useState<'ask' | 'form'>('ask');

  // Fechou (por qualquer caminho): a próxima abertura recomeça na pergunta.
  useEffect(() => {
    if (!open) setStep('ask');
  }, [open]);

  const suggestedAmount = resolveOsRevenueSuggestedAmount(context);

  const osNumberLabel = context.osNumber != null ? `#${context.osNumber}` : null;
  const customerName = context.customerName?.trim() || null;

  const askFooter = (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
      <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
        {t.noLabel}
      </Button>
      <Button
        type="button"
        onClick={() => setStep('form')}
      >
        {t.yesLabel}
      </Button>
    </div>
  );

  return (
    <>
      <ResponsiveModal
        open={open && step === 'ask'}
        onOpenChange={onOpenChange}
        title={t.title}
        className="sm:max-w-[460px]"
        footer={askFooter}
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            {/* Ícone branco direto no fundo saturado (régua visual): sem
                círculo dessaturado atrás. */}
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success">
              <TrendingUp className="h-5 w-5 text-white" />
            </span>
            <div className="min-w-0">
              <p className="text-base font-semibold leading-snug">{t.question}</p>
              <p className="mt-1 text-sm text-muted-foreground">{t.hint}</p>
            </div>
          </div>

          <dl className="divide-y divide-border rounded-lg border border-border">
            {osNumberLabel && (
              <div className="flex items-baseline justify-between gap-3 px-3 py-2">
                <dt className="text-sm text-muted-foreground">{t.osLabel}</dt>
                <dd className="text-sm font-semibold tabular-nums">{osNumberLabel}</dd>
              </div>
            )}
            {customerName && (
              <div className="flex items-baseline justify-between gap-3 px-3 py-2">
                <dt className="shrink-0 text-sm text-muted-foreground">{t.customerLabel}</dt>
                <dd className="min-w-0 truncate text-sm font-medium">{customerName}</dd>
              </div>
            )}
            {suggestedAmount != null && suggestedAmount > 0 && (
              <div className="flex items-baseline justify-between gap-3 px-3 py-2">
                <dt className="text-sm text-muted-foreground">{t.osValueLabel}</dt>
                <dd className="text-sm font-bold tabular-nums text-success">
                  {formatMoney(suggestedAmount, currency, locale)}
                </dd>
              </div>
            )}
          </dl>

          {suggestedAmount != null && suggestedAmount > 0 && (
            <p className="text-xs text-muted-foreground">{t.valueHint}</p>
          )}
        </div>
      </ResponsiveModal>

      <OsBillingDialog
        open={open && step === 'form'}
        onOpenChange={onOpenChange}
        context={context}
      />
    </>
  );
}
