import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { TrendingUp, CreditCard, ArrowRight } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { TransactionFormDialog } from '@/components/financial/TransactionFormDialog';
import { ChargeDialog } from '@/components/financial/ChargeDialog';
import { useFinancial } from '@/hooks/useFinancial';
import { useToast } from '@/hooks/use-toast';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatMoney, formatDate } from '@/lib/format';
import { localizeAppPath } from '@/lib/i18n/appRouteSlugs';
import { cn } from '@/lib/utils';
import { useCompanyModules } from '@/hooks/useCompanyModules';
import { useTenantPaymentAccount } from '@/hooks/useTenantPaymentAccount';
import { useOsBillingState, OS_BILLING_STATE_KEY } from '@/hooks/useOsBillingState';
import { OS_REVENUE_SUMMARY_KEY } from '@/hooks/useOsRevenueSummary';
import type { OsRevenueContext } from '@/hooks/useOsFinishRevenuePrompt';
import { buildOsRevenueDescription, buildOsRevenuePrefill } from '@/lib/os-revenue';
import {
  getOsBillingStatus,
  getRevenueOptionDecision,
  getChargeOptionDecision,
  isOsRevenueBlockedByChargeError,
  type OsBillingOptionDecision,
} from '@/lib/os-billing';

export interface OsBillingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Mesmo contexto do prompt de fechamento (`useOsFinishRevenuePrompt`),
   * reaproveitado de propósito: os dois caminhos (automático e manual) usam a
   * MESMA fonte de `suggestedAmount`, nome do cliente e número da OS.
   */
  context: OsRevenueContext | null;
}

/**
 * Ação manual "Faturar OS": o usuário escolhe entre LANÇAR RECEITA (dinheiro
 * que já entrou) ou GERAR COBRANÇA (PIX/boleto/link pelo Asaas). Nunca
 * obrigatória — o botão que abre este diálogo só existe pra quem já tem a
 * permissão `fn:os_finish_revenue` (gate fica no ponto de entrada, dentro de
 * `ServiceOrderViewDialog`; este componente não re-checa).
 *
 * Esta é a porta manual que faltava: pra quem disse "não" na hora da pergunta
 * automática, ou pra OS concluída antes de o toggle existir. O prompt
 * automático (`useOsFinishRevenuePrompt` + `OsFinishRevenueDialog`) continua
 * intacto — só a fórmula de pré-preenchimento é compartilhada
 * (`src/lib/os-revenue.ts`), nunca o fluxo.
 */
export function OsBillingDialog({ open, onOpenChange, context }: OsBillingDialogProps) {
  // Mesmo atraso de desmontagem do OsFinishRevenueDialog: o drawer do mobile
  // termina a animação de saída antes do conteúdo (e dos hooks pesados do
  // Financeiro) sumirem.
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

  return <OsBillingFlow open={open} onOpenChange={onOpenChange} context={context} />;
}

interface FlowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: OsRevenueContext;
}

type OsBillingStep = 'choice' | 'revenue' | 'charge';

function OsBillingFlow({ open, onOpenChange, context }: FlowProps) {
  const { locale, currency, timezone } = useAppLocaleContext();
  const t = MESSAGES[locale].app.finance.osBilling;
  // A descrição do lançamento/cobrança segue a MESMA convenção de copy do
  // prompt automático ("OS #123 · Cliente") — fórmula compartilhada.
  const tRevenueDesc = MESSAGES[locale].app.finance.osRevenue;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { createTransaction } = useFinancial();
  const { hasModule } = useCompanyModules();
  const { isActive: isPaymentActive } = useTenantPaymentAccount();
  const { snapshot } = useOsBillingState(context.serviceOrderId);

  const [step, setStep] = useState<OsBillingStep>('choice');
  // Fechou (por qualquer caminho): a próxima abertura recomeça na escolha.
  useEffect(() => {
    if (!open) setStep('choice');
  }, [open]);

  const hasCustomer = !!context.customerId;
  // Mesmo gate de `ContractDetail`/`QuoteViewDialog`: módulo `cobrancas`
  // contratado E conta de recebimento ATIVA. Sem isso o botão levaria a uma
  // cobrança que a edge recusaria de qualquer forma.
  const canOfferCharge = hasModule('cobrancas') && isPaymentActive;

  const status = getOsBillingStatus(snapshot);
  const revenueDecision = getRevenueOptionDecision(snapshot);
  const chargeDecision = getChargeOptionDecision(snapshot, { hasCustomer });

  // `decision.reason` é sempre presente (possivelmente `null`) — ver o
  // porquê em `OsBillingOptionDecision` (os-billing.ts).
  function blockedLabel(decision: OsBillingOptionDecision): string | null {
    return decision.reason ? t.blocked[decision.reason] : null;
  }

  const osNumberLabel =
    context.osNumber != null ? t.osLabel.replace('{number}', String(context.osNumber)) : null;

  const invalidateBillingQueries = () => {
    queryClient.invalidateQueries({ queryKey: [OS_REVENUE_SUMMARY_KEY] });
    queryClient.invalidateQueries({ queryKey: [OS_BILLING_STATE_KEY, context.serviceOrderId] });
  };

  const goToFinanceScreen = (path: string) => {
    onOpenChange(false);
    navigate(localizeAppPath(path, locale));
  };

  // ── Opção "Lançar receita" — reaproveita o FORMULÁRIO do Financeiro
  //    (`TransactionFormDialog`), com o MESMO pré-preenchimento do prompt
  //    automático (`src/lib/os-revenue.ts`). Não há passo de pergunta aqui:
  //    escolher o card JÁ é a confirmação. ──────────────────────────────────
  const prefill = useMemo(
    () => buildOsRevenuePrefill(tRevenueDesc, context),
    [tRevenueDesc, context],
  );

  const handleRevenueSubmit = async (payload: any) => {
    try {
      const result = await createTransaction.mutateAsync(payload);
      invalidateBillingQueries();
      return result;
    } catch (err) {
      // Rede de segurança: a tela já desabilita esta opção quando há cobrança
      // viva (`revenueDecision`), então isto só dispara numa corrida real
      // (cobrança criada em outra aba entre abrir o diálogo e salvar). Mapeado
      // pelo CÓDIGO (23001) — a mensagem do trigger só existe em PT-BR, a
      // nossa vale nos 4 idiomas.
      if (isOsRevenueBlockedByChargeError(err)) {
        invalidateBillingQueries();
        toast({
          variant: 'destructive',
          title: t.errors.revenueBlockedByChargeTitle,
          description: t.errors.revenueBlockedByChargeDescription,
        });
      }
      throw err;
    }
  };

  // ── Opção "Gerar cobrança" — reaproveita o `ChargeDialog` inteiro (PIX,
  //    boleto, cartão, multa/juros, lançar ou não no Financeiro). Mesma
  //    origem que o banco e a edge já reconhecem (`service_order`). ─────────
  const presetDescription = buildOsRevenueDescription(tRevenueDesc, context);

  const content =
    step === 'choice' ? (
      <div className="space-y-4">
        {status.kind !== 'none' && (
          <NoticeBanner
            variant="info"
            action={
              <button
                type="button"
                className="inline-flex items-center gap-1 whitespace-nowrap underline underline-offset-2"
                onClick={() =>
                  goToFinanceScreen(
                    status.kind === 'charge' ? '/financeiro/cobrancas' : '/financeiro/movimentacoes',
                  )
                }
              >
                {status.kind === 'charge' ? t.status.viewCharge : t.status.viewRevenue}
                <ArrowRight className="h-3 w-3 shrink-0" />
              </button>
            }
          >
            {status.kind === 'charge'
              ? t.status.charge
                  .replace('{value}', status.value != null ? formatMoney(status.value, currency, locale) : '-')
                  .replace('{date}', status.dueDate ? formatDate(status.dueDate, locale, timezone) : '-')
              : t.status.revenue.replace(
                  '{value}',
                  formatMoney(status.kind === 'revenue' ? status.total : 0, currency, locale),
                )}
          </NoticeBanner>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Lançar receita — ícone branco direto no fundo saturado (régua
              visual): sem círculo dessaturado atrás. */}
          <button
            type="button"
            disabled={!revenueDecision.enabled}
            onClick={() => setStep('revenue')}
            className={cn(
              'flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors',
              revenueDecision.enabled
                ? 'border-border hover:border-success/50 hover:bg-success/5 active:scale-[0.99]'
                : 'cursor-not-allowed border-border bg-muted/40 opacity-60',
            )}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success">
              <TrendingUp className="h-5 w-5 text-white" />
            </span>
            <span className="text-sm font-semibold text-foreground">{t.option.revenueTitle}</span>
            <span className="text-xs text-muted-foreground">{t.option.revenueDescription}</span>
          </button>

          {/* Gerar cobrança — NEM aparece sem módulo/conta ativa (3.3): opção
              some por completo, não fica desabilitada à toa. */}
          {canOfferCharge && (
            <button
              type="button"
              disabled={!chargeDecision.enabled}
              onClick={() => setStep('charge')}
              className={cn(
                'flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors',
                chargeDecision.enabled
                  ? 'border-border hover:border-primary/50 hover:bg-primary/5 active:scale-[0.99]'
                  : 'cursor-not-allowed border-border bg-muted/40 opacity-60',
              )}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary">
                <CreditCard className="h-5 w-5 text-white" />
              </span>
              <span className="text-sm font-semibold text-foreground">{t.option.chargeTitle}</span>
              <span className="text-xs text-muted-foreground">{t.option.chargeDescription}</span>
            </button>
          )}
        </div>

        {/* Motivo de cada opção desabilitada — nunca some em silêncio. */}
        {!revenueDecision.enabled && (
          <NoticeBanner variant="warning">{blockedLabel(revenueDecision)}</NoticeBanner>
        )}
        {canOfferCharge && !chargeDecision.enabled && (
          <NoticeBanner variant="warning">{blockedLabel(chargeDecision)}</NoticeBanner>
        )}
      </div>
    ) : null;

  return (
    <>
      <ResponsiveModal
        open={open && step === 'choice'}
        onOpenChange={onOpenChange}
        title={osNumberLabel ? `${t.dialogTitle} · ${osNumberLabel}` : t.dialogTitle}
        description={t.hint}
        className="sm:max-w-[560px]"
      >
        {content}
      </ResponsiveModal>

      {/* Passo "Lançar receita" — formulário inteiro do Financeiro, igual ao
          do prompt automático. */}
      <TransactionFormDialog
        open={open && step === 'revenue'}
        onOpenChange={(next) => {
          if (!next) onOpenChange(false);
        }}
        onSubmit={handleRevenueSubmit}
        isLoading={createTransaction.isPending}
        defaultType="entrada"
        prefill={prefill}
      />

      {/* Passo "Gerar cobrança" — `ChargeDialog` inteiro, com a origem
          `service_order` (banco/edge já reconhecem; dedupe automático). */}
      <ChargeDialog
        open={open && step === 'charge'}
        onOpenChange={(next) => {
          if (!next) onOpenChange(false);
        }}
        presetCustomerId={context.customerId ?? undefined}
        lockCustomer
        presetAmount={
          typeof context.suggestedAmount === 'number' && context.suggestedAmount > 0
            ? context.suggestedAmount
            : undefined
        }
        presetDescription={presetDescription}
        source={{ type: 'service_order', id: context.serviceOrderId }}
        onCreated={invalidateBillingQueries}
      />
    </>
  );
}
