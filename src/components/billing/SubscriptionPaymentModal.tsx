import { useEffect, useRef, useState } from 'react';
import { useIsCompact } from '@/hooks/use-mobile';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  CreditCard,
  QrCode,
  Barcode,
  Loader2,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { cpfCnpjMask } from '@/utils/masks';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatBRL } from '@/utils/currency';
import { cn } from '@/lib/utils';
import { PixPaymentView } from '@/components/checkout/PixPaymentView';
import { BoletoPaymentView } from '@/components/checkout/BoletoPaymentView';
import { CardPaymentForm } from '@/components/checkout/CardPaymentForm';
import { useAsaasPayment, type CardData } from '@/hooks/useAsaasPayment';

/**
 * Modal de pagamento da assinatura embutido na tela /assinatura (Billing).
 *
 * Substitui o redirect pro /checkout no fluxo de renovação/ativação de um plano
 * JÁ DEFINIDO (o cliente não escolhe plano aqui — o valor vem da empresa). Reusa
 * o `useAsaasPayment` (fronteira única com as edge `create-asaas-payment` /
 * `check-asaas-payment`) e os views de método do /checkout, sem duplicar lógica.
 *
 * Sucesso finaliza igual ao Checkout.tsx:
 *   - renovação → edge `confirm-sale-payment`
 *   - ativação (1ª venda / trial expirado) → edge `activate-subscription`
 * e invalida as queries de assinatura da tela.
 *
 * A escolha de plano (trial sem plano definido) continua no /checkout — este
 * modal só cobra um valor já resolvido, espelhando o modal do EcoSistema.
 */

interface SubscriptionPaymentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  /** Valor a cobrar (já resolvido: mensal, ou anual com desconto para Pix/Boleto). */
  amount: number;
  /**
   * Valor mensal base sem desconto anual — usado no cartão (cartão = mensal
   * recorrente sempre). Se ausente, cai no `amount`.
   */
  cardAmount?: number;
  /** true = renovação (confirm-sale-payment); false = ativação (activate-subscription). */
  isRenewal: boolean;
  /** Código do plano — enviado na ativação (1ª venda) para validação server-side. */
  planCode?: string | null;
  /** Ciclo de cobrança da empresa (minúsculo: monthly/yearly). */
  billingCycle?: 'monthly' | 'yearly';
  /** CNPJ/CPF já cadastrado na empresa (pré-preenche). */
  companyCnpj?: string | null;
  /** Dados para pré-preencher o form de cartão. */
  companyPhone?: string | null;
  companyAddress?: string | null;
  userEmail?: string | null;
  companyName?: string | null;
  /** Chamado quando o pagamento é confirmado (após invalidar as queries). */
  onSuccess?: () => void;
}

type View = 'select' | 'pix' | 'boleto' | 'card';
type Status = 'idle' | 'creating' | 'waiting' | 'success';

export function SubscriptionPaymentModal({
  open,
  onOpenChange,
  companyId,
  amount,
  cardAmount,
  isRenewal,
  planCode,
  billingCycle = 'monthly',
  companyCnpj,
  companyPhone,
  companyAddress,
  userEmail,
  onSuccess,
}: SubscriptionPaymentModalProps) {
  const isCompact = useIsCompact();
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.settings.billing.paymentModal;

  const {
    isCreating,
    paymentData,
    createPixPayment,
    createBoletoPayment,
    createCardPayment,
    startPolling,
    stopPolling,
    reset,
  } = useAsaasPayment();

  const [view, setView] = useState<View>('select');
  const [status, setStatus] = useState<Status>('idle');
  const [creatingMethod, setCreatingMethod] = useState<View | null>(null);
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [needsCpfCnpj, setNeedsCpfCnpj] = useState(false);
  const [pixRecurring, setPixRecurring] = useState(true);
  const [cardError, setCardError] = useState<string | null>(null);
  const [cardErrorSection, setCardErrorSection] = useState<'card' | 'holder' | 'address' | null>(null);

  const queryClient = useQueryClient();
  // Trava anti-dupla-ativação (polling + confirmação de cartão podem disparar juntos).
  const activatedRef = useRef(false);

  const cardChargeAmount = cardAmount ?? amount;

  // Pré-preenche CPF/CNPJ do cadastro; se ausente/ inválido, exige input.
  useEffect(() => {
    if (!open) return;
    const clean = (companyCnpj || '').replace(/\D/g, '');
    const isValid = clean.length === 11 || clean.length === 14;
    setNeedsCpfCnpj(!isValid);
    setCpfCnpj(isValid ? cpfCnpjMask(companyCnpj || '') : '');
  }, [open, companyCnpj]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const getCleanCpfCnpj = () => {
    const clean = cpfCnpj.replace(/\D/g, '');
    return clean.length === 11 || clean.length === 14 ? clean : undefined;
  };
  const canProceed = !needsCpfCnpj || !!getCleanCpfCnpj();

  const description = `Assinatura Dominex${planCode ? ` - ${planCode}` : ''}`;
  const purpose = isRenewal ? 'renewal' : undefined;
  // 1ª venda: envia plan_code pra validação server-side bater no preço do plano.
  const sendPlanCode = isRenewal ? undefined : (planCode ?? undefined);

  // Finaliza igual ao Checkout.tsx: renovação → confirm-sale-payment;
  // ativação → activate-subscription. Idempotente via activatedRef.
  const finalizeSuccess = async (paymentId: string | null) => {
    if (activatedRef.current) return;
    activatedRef.current = true;
    try {
      if (isRenewal) {
        await supabase.functions.invoke('confirm-sale-payment', {
          body: { company_id: companyId, payment_id: paymentId ?? undefined },
        });
      } else {
        await supabase.functions.invoke('activate-subscription', {
          body: {
            company_id: companyId,
            plan_code: planCode ?? undefined,
            billing_cycle: billingCycle,
            payment_id: paymentId ?? undefined,
          },
        });
      }
    } catch (err) {
      console.error('Activation error:', err);
    } finally {
      setStatus('success');
      stopPolling();
      // Refresh das queries de assinatura da tela Billing.
      queryClient.invalidateQueries({ queryKey: ['my-company'] });
      queryClient.invalidateQueries({ queryKey: ['subscription-payment-history'] });
      queryClient.invalidateQueries({ queryKey: ['company-modules'] });
      queryClient.invalidateQueries({ queryKey: ['company-modules-info'] });
      queryClient.invalidateQueries({ queryKey: ['company-user-count'] });
      onSuccess?.();
    }
  };

  const detectCardErrorSection = (message: string): 'card' | 'holder' | 'address' => {
    const m = message.toLowerCase();
    if (m.includes('cep') || m.includes('endereço') || m.includes('postal') || m.includes('número')) return 'address';
    if (m.includes('cpf') || m.includes('e-mail') || m.includes('email') || m.includes('telefone') || m.includes('titular')) return 'holder';
    return 'card';
  };

  const handlePix = async (recurring?: boolean) => {
    if (!canProceed) { toast.error(t.cpfCnpjInvalid); return; }
    const useRecurring = recurring ?? pixRecurring;
    setPixRecurring(useRecurring);
    setCreatingMethod('pix');
    setStatus('creating');
    setView('pix');
    // Regenera: limpa o PIX anterior antes de gerar o novo (toggle recorrência).
    reset();
    try {
      const data = await createPixPayment(companyId, amount, getCleanCpfCnpj(), {
        recurring: useRecurring,
        billingCycle,
        description,
        purpose,
        planCode: sendPlanCode,
      });
      setStatus('waiting');
      if (data.payment_id) startPolling(data.payment_id, () => finalizeSuccess(data.payment_id ?? null));
    } catch {
      // toast já disparado pelo hook
      setStatus('idle');
      setView('select');
    } finally {
      setCreatingMethod(null);
    }
  };

  const handleBoleto = async () => {
    if (!canProceed) { toast.error(t.cpfCnpjInvalid); return; }
    setCreatingMethod('boleto');
    setStatus('creating');
    setView('boleto');
    reset();
    try {
      const data = await createBoletoPayment(companyId, amount, getCleanCpfCnpj(), {
        billingCycle,
        description,
        purpose,
        planCode: sendPlanCode,
      });
      setStatus('waiting');
      if (data.payment_id) startPolling(data.payment_id, () => finalizeSuccess(data.payment_id ?? null), 30000);
    } catch {
      setStatus('idle');
      setView('select');
    } finally {
      setCreatingMethod(null);
    }
  };

  const handleCard = () => {
    if (!canProceed) { toast.error(t.cpfCnpjInvalid); return; }
    setCardError(null);
    setCardErrorSection(null);
    setView('card');
  };

  const handleCardSubmit = async (cardData: CardData & { totalAmount: number }) => {
    setStatus('creating');
    setCardError(null);
    setCardErrorSection(null);
    try {
      // Cartão = mensal recorrente sempre (B9). Usa o valor mensal base.
      const data = await createCardPayment(companyId, cardChargeAmount, cardData, getCleanCpfCnpj(), {
        billingCycle: 'monthly',
        description,
        purpose,
        planCode: sendPlanCode,
      });
      if (data.status === 'CONFIRMED' || data.status === 'RECEIVED') {
        await finalizeSuccess(data.payment_id ?? null);
      } else if (data.payment_id) {
        setStatus('waiting');
        startPolling(data.payment_id, () => finalizeSuccess(data.payment_id ?? null));
      } else {
        // Cartão recorrente sem payment.id (webhook confirma depois) → segue ativado.
        await finalizeSuccess(null);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t.errorGeneric;
      setCardError(message);
      setCardErrorSection(detectCardErrorSection(message));
      setStatus('idle');
      toast.error(message);
    }
  };

  const handleBack = () => {
    setView('select');
    setStatus('idle');
    setCreatingMethod(null);
    setCardError(null);
    setCardErrorSection(null);
    stopPolling();
    reset();
  };

  const handleClose = () => {
    setView('select');
    setStatus('idle');
    setCreatingMethod(null);
    setCpfCnpj('');
    setPixRecurring(true);
    setCardError(null);
    setCardErrorSection(null);
    activatedRef.current = false;
    stopPolling();
    reset();
    onOpenChange(false);
  };

  const parsedCep = (() => {
    const m = companyAddress?.match(/CEP:\s*(\d{5}-?\d{3})/i);
    return m ? m[1] : undefined;
  })();
  const parsedAddressNumber = (() => {
    const parts = companyAddress?.split(' - ')?.[0]?.split(', ');
    return parts && parts.length > 1 ? parts[1]?.trim() : undefined;
  })();

  const methodButton = (
    key: View,
    icon: React.ReactNode,
    title: string,
    desc: string,
    onClick: () => void,
    badge?: string,
    accent?: string,
  ) => (
    <button
      type="button"
      className={cn(
        'group relative flex h-20 items-center gap-4 rounded-xl border-2 bg-card p-4 text-left transition-all',
        'hover:border-primary hover:shadow-lg active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed',
        badge ? 'border-primary/30' : 'border-muted',
      )}
      onClick={onClick}
      disabled={isCreating}
    >
      <span className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white', accent)}>
        {creatingMethod === key ? <Loader2 className="h-6 w-6 animate-spin" /> : icon}
      </span>
      <span className="flex-1">
        <span className="block font-semibold">{title}</span>
        <span className="block text-sm text-muted-foreground">{desc}</span>
      </span>
      <ArrowRight className="h-5 w-5 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100 -translate-x-2" />
      {badge && (
        <span className="absolute -top-2 right-3 rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase leading-none text-primary-foreground">
          {badge}
        </span>
      )}
    </button>
  );

  const content = (
    <>
      {status === 'success' ? (
        <div className="flex flex-col items-center justify-center gap-4 py-8">
          <CheckCircle2 className="h-16 w-16 text-emerald-500" />
          <p className="text-center text-lg font-semibold">{t.successTitle}</p>
          <p className="text-center text-sm text-muted-foreground">{t.successDesc}</p>
        </div>
      ) : view === 'select' ? (
        <div className="space-y-6">
          <div className="rounded-xl border bg-muted/50 p-4 text-center">
            <p className="mb-1 text-sm text-muted-foreground">{t.amountLabel}</p>
            <p className="text-3xl font-bold tracking-tight">R$ {formatBRL(amount)}</p>
          </div>

          {needsCpfCnpj && (
            <div className="space-y-2">
              <Label htmlFor="modal-cpfcnpj">
                {t.cpfCnpjLabel} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="modal-cpfcnpj"
                placeholder={t.cpfCnpjPlaceholder}
                value={cpfCnpj}
                onChange={(e) => setCpfCnpj(cpfCnpjMask(e.target.value))}
                className={!canProceed && cpfCnpj ? 'border-destructive' : ''}
              />
              <p className="text-xs text-muted-foreground">{t.cpfCnpjHint}</p>
            </div>
          )}

          <div className="grid gap-3">
            {methodButton('card', <CreditCard className="h-6 w-6" />, t.methodCardTitle, t.methodCardDesc, handleCard, t.methodCardBadge, 'bg-blue-500')}
            {methodButton('pix', <QrCode className="h-6 w-6" />, t.methodPixTitle, t.methodPixDesc, () => handlePix(), undefined, 'bg-emerald-500')}
            {methodButton('boleto', <Barcode className="h-6 w-6" />, t.methodBoletoTitle, t.methodBoletoDesc, handleBoleto, undefined, 'bg-orange-500')}
          </div>

          <p className="text-center text-xs text-muted-foreground">{t.secureNote}</p>
        </div>
      ) : view === 'pix' ? (
        <PixPaymentView
          pixQrCode={paymentData?.pix_qr_code}
          pixCopyPaste={paymentData?.pix_copy_paste}
          pixExpirationDate={paymentData?.pix_expiration_date}
          isLoading={status === 'creating'}
          onBack={handleBack}
          isRecurring={pixRecurring}
          onRecurringChange={(v) => handlePix(v)}
          isRecurringSupported
        />
      ) : view === 'boleto' ? (
        <BoletoPaymentView
          invoiceUrl={paymentData?.invoice_url}
          bankSlipUrl={paymentData?.bank_slip_url}
          identificationField={paymentData?.identification_field}
          dueDate={paymentData?.due_date}
          isLoading={status === 'creating'}
          onBack={handleBack}
        />
      ) : (
        <CardPaymentForm
          amount={cardChargeAmount}
          isLoading={status === 'creating'}
          onSubmit={handleCardSubmit}
          onBack={handleBack}
          errorMessage={cardError}
          errorSection={cardErrorSection}
          allowInstallments={false}
          initialData={{
            holderEmail: userEmail || undefined,
            holderPhone: companyPhone || undefined,
            holderPostalCode: parsedCep,
            holderAddressNumber: parsedAddressNumber,
          }}
        />
      )}
    </>
  );

  const title = status === 'success' ? t.titleSuccess : t.title;

  if (isCompact) {
    return (
      <Drawer open={open} onOpenChange={(o) => { if (!o) handleClose(); }} handleOnly>
        <DrawerContent
          className="flex max-h-[92dvh] flex-col"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DrawerHeader className="text-left">
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription className="sr-only">{t.title}</DrawerDescription>
          </DrawerHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
            {content}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent
        className="flex max-h-[90vh] flex-col sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="pr-8">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">{content}</div>
      </DialogContent>
    </Dialog>
  );
}
