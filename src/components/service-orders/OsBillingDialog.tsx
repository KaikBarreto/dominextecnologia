import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
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
import { OS_BILLING_FLAGS_KEY } from '@/hooks/useOsBillingFlags';
import { OS_REVENUE_SUMMARY_KEY } from '@/hooks/useOsRevenueSummary';
import type { OsRevenueContext } from '@/hooks/useOsFinishRevenuePrompt';
import { buildOsRevenueDescription, buildOsRevenuePrefill } from '@/lib/os-revenue';
import {
  getOsBillingStatus,
  getRevenueOptionDecision,
  getChargeOptionDecision,
  isOsRevenueBlockedByChargeError,
  type OsBillingBlockReason,
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

/**
 * Mantém sincronizadas as três leituras do faturamento da OS:
 * resumo, diálogo individual e selos em lote da lista/quadro/agenda.
 *
 * O cache dos selos inclui empresa e o lote de IDs na chave; por isso a
 * invalidação usa apenas o prefixo raiz, cobrindo todas as visões ativas sem
 * tentar reconstruir `Map`s otimistas com respostas parciais da cobrança.
 */
export function invalidateOsBillingQueries(
  queryClient: Pick<QueryClient, 'invalidateQueries'>,
  serviceOrderId: string,
) {
  queryClient.invalidateQueries({ queryKey: [OS_REVENUE_SUMMARY_KEY] });
  queryClient.invalidateQueries({ queryKey: [OS_BILLING_STATE_KEY, serviceOrderId] });
  queryClient.invalidateQueries({ queryKey: [OS_BILLING_FLAGS_KEY] });
}

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

  /**
   * Motivos de bloqueio a exibir, SEM repetição. As duas opções costumam cair
   * pelo mesmo motivo ("já tem receita", "já tem cobrança") e dois banners
   * idênticos lado a lado é ruído, não informação. A opção de cobrança só
   * entra na conta quando ela chega a ser oferecida (`canOfferCharge`).
   */
  const blockedReasons = Array.from(
    new Set(
      [
        revenueDecision.enabled ? null : revenueDecision.reason,
        canOfferCharge && !chargeDecision.enabled ? chargeDecision.reason : null,
      ].filter((r): r is OsBillingBlockReason => !!r),
    ),
  );

  const osNumberLabel =
    context.osNumber != null ? t.osLabel.replace('{number}', String(context.osNumber)) : null;

  const invalidateBillingQueries = () => {
    invalidateOsBillingQueries(queryClient, context.serviceOrderId);
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
              {/* `text-primary-foreground`, NUNCA `text-white` cravado: `bg-primary`
                  é a cor de marca DO TENANT e pode ser clara. Medido no QA de
                  15/10/2026 num tenant com primary rgb(224,224,224): branco em
                  cima dava ~1.3:1 de contraste e o ícone sumia. O design system
                  já resolve isso derivando o foreground da marca (ver o
                  comentário de `--primary-foreground` em `src/index.css`). */}
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary">
                <CreditCard className="h-5 w-5 text-primary-foreground" />
              </span>
              <span className="text-sm font-semibold text-foreground">{t.option.chargeTitle}</span>
              <span className="text-xs text-muted-foreground">{t.option.chargeDescription}</span>
            </button>
          )}
        </div>

        {/* Motivo de cada opção desabilitada — nunca some em silêncio, mas
            TAMBÉM nunca repetido: quando as duas opções caem pelo mesmo motivo
            (o caso comum, "já tem receita" / "já tem cobrança"), o aviso é UM
            só. Sem o dedupe, o QA de 15/10/2026 mostrou o mesmo banner laranja
            empilhado duas vezes, idêntico, embaixo das opções. */}
        {blockedReasons.map((reason) => (
          <NoticeBanner key={reason} variant="warning">
            {t.blocked[reason]}
          </NoticeBanner>
        ))}
      </div>
    ) : null;

  return (
    <>
      {/* Número da OS vai na DESCRIÇÃO, não no título. Medido no QA de
          15/10/2026 a 390px: o header do drawer reserva `px-20` (80px) pro
          botão "FECHAR", mas o botão rotulado ocupa 102px a partir da borda, e
          título longo passa POR BAIXO do botão (colidia em x 288..302). Como a
          reserva do primitivo é compartilhada por todos os drawers do app, a
          correção aqui é manter o título curto. */}
      <ResponsiveModal
        open={open && step === 'choice'}
        onOpenChange={onOpenChange}
        title={t.dialogTitle}
        description={osNumberLabel ? `${osNumberLabel} · ${t.hint}` : t.hint}
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
