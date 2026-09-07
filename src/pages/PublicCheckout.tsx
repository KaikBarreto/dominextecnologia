// PublicCheckout — página pública de pagamento do cliente final (/pagar/:code).
//
// Funciona TOTALMENTE deslogada: a edge `get-tenant-payment-checkout` é anon-safe
// e devolve uma ALLOWLIST estrita (valor, descrição, marca, links de pagamento).
// Nunca custo/margem/refs internas. Toda leitura passa pelo hook.
//
// Casca app-nativo compartilhada (PublicPortalShell, tema claro forçado).
// Marca (regra-lei dos portais): a cor/logo/nome vêm do PAYLOAD (anti-FOUC) —
// tenant sem white-label chega com primary_color=null → topo escuro sóbrio;
// com white-label, a marca do tenant. A página não decide isso.
//
// CARTÃO (checkout PRÓPRIO): o pagador informa o cartão AQUI, na marca do tenant,
// e a edge `tenant-asaas-pay-charge-card` paga a cobrança já existente na Asaas.
// Nada de cartão é guardado por nós (nem em estado global, nem em cache): os
// dados vivem só no formulário e na chamada. O link hospedado da Asaas continua
// existindo como FALLBACK — se a edge falhar, o pagador nunca fica sem caminho.
//
// A confirmação NÃO é otimista: a baixa definitiva vem do webhook da Asaas, então
// a tela faz polling do estado real da cobrança até virar "pago".

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { BrandedQRCode } from '@/components/BrandedQRCode';
import asaasLogo from '@/assets/logo-asaas.png';
import { PublicPortalShell } from '@/components/portal/PublicPortalShell';
import { PublicAppLocaleProvider, useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { CardPaymentForm } from '@/components/checkout/CardPaymentForm';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2, Copy, Check, QrCode, FileText, CreditCard,
  CheckCircle2, AlertCircle, Clock, XCircle, Shield, Lock, ExternalLink,
} from 'lucide-react';
import {
  useTenantPaymentCheckout,
  usePayTenantChargeWithCard,
  type CheckoutPayload,
  type CardPayResult,
} from '@/hooks/useTenantPaymentCheckout';
import { extractShortCode } from '@/utils/prettyLinks';
import { formatMoney, formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

// Status que representam "pago" (baixa automática via webhook já ocorreu).
const PAID_STATUSES = new Set(['received', 'confirmed', 'paid', 'RECEIVED', 'CONFIRMED']);
// Status que indicam cobrança vencida (sem pagamento ainda).
const OVERDUE_STATUSES = new Set(['overdue', 'OVERDUE']);
// Status que indicam cancelamento.
const CANCELLED_STATUSES = new Set(['cancelled', 'canceled', 'CANCELLED', 'CANCELED']);
// Status que indicam estorno.
const REFUNDED_STATUSES = new Set(['refunded', 'REFUNDED', 'chargedback', 'CHARGEBACK']);

/** Shape que o CardPaymentForm entrega no onSubmit (installments/total ignorados
 *  aqui: quem manda no valor é a cobrança já criada na Asaas). */
type CardFormSubmitData = {
  holderName: string;
  holderEmail: string;
  number: string;
  expiryMonth: string;
  expiryYear: string;
  ccv: string;
  holderCpf: string;
  holderPhone: string;
  holderPostalCode: string;
  holderAddressNumber: string;
  installmentCount?: number;
  totalAmount: number;
};

/** Intervalo do polling de confirmação (ms) depois de pagar no cartão. */
const CONFIRM_POLL_MS = 4000;
/** Depois disso paramos de insistir e explicamos que a confirmação pode demorar. */
const CONFIRM_TIMEOUT_MS = 90_000;

// Erros amigáveis do cartão são mapeados pra seção do form (card/holder/address)
// só por heurística de palavra-chave. MESMA regra do /checkout de assinatura
// (Checkout.tsx) — a função de lá é local ao módulo, então repetimos aqui.
function detectCardErrorSection(message: string): 'card' | 'holder' | 'address' | null {
  const m = message.toLowerCase();
  if (m.includes('cep') || m.includes('endereço') || m.includes('postal') || m.includes('número')) return 'address';
  if (m.includes('cpf') || m.includes('e-mail') || m.includes('email') || m.includes('telefone') || m.includes('titular')) return 'holder';
  if (m.includes('cartão') || m.includes('cartao') || m.includes('cvv') || m.includes('validade')) return 'card';
  return 'card';
}

export default function PublicCheckout() {
  const { code } = useParams<{ code: string }>();
  // O último segmento do slug amigável é sempre o short_code (nunca contém '-').
  const shortCode = extractShortCode(code) ?? undefined;

  // Polling ligado só depois de uma tentativa de pagamento no cartão (confirmação
  // real vem do webhook). Fora disso a página segue leve, sem requisição em loop.
  const [pollMs, setPollMs] = useState(0);
  const { data, isLoading, isError } = useTenantPaymentCheckout(shortCode, { pollMs });

  return (
    <PublicAppLocaleProvider language="pt-br" currency="BRL">
      <CheckoutInner
        payload={data ?? null}
        isLoading={isLoading}
        isError={isError}
        shortCode={shortCode}
        onStartPolling={() => setPollMs(CONFIRM_POLL_MS)}
        onStopPolling={() => setPollMs(0)}
      />
    </PublicAppLocaleProvider>
  );
}

function CheckoutInner({
  payload,
  isLoading,
  isError,
  shortCode,
  onStartPolling,
  onStopPolling,
}: {
  payload: CheckoutPayload | null;
  isLoading: boolean;
  isError: boolean;
  shortCode: string | undefined;
  onStartPolling: () => void;
  onStopPolling: () => void;
}) {
  const { locale, currency, timezone } = useAppLocaleContext();
  const t = MESSAGES[locale].app.charges.checkout;
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  // ── Estado do cartão (nada disso guarda dado de cartão) ────────────────────
  const [showCardForm, setShowCardForm] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const [cardErrorSection, setCardErrorSection] = useState<'card' | 'holder' | 'address' | null>(null);
  const [payResult, setPayResult] = useState<CardPayResult | null>(null);
  const [confirmSlow, setConfirmSlow] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  // Âncoras de rolagem: no mobile o botão de pagar fica no fim do formulário, e
  // tanto o erro quanto a confirmação aparecem LÁ EM CIMA. Sem rolar, o pagador
  // acha que "não aconteceu nada" e clica de novo.
  const cardBlockRef = useRef<HTMLDivElement | null>(null);
  const resultBlockRef = useRef<HTMLDivElement | null>(null);

  const { payWithCard, isPaying } = usePayTenantChargeWithCard(shortCode);

  const status = payload?.charge.status ?? '';
  const isPaid = PAID_STATUSES.has(status);

  // Para o polling assim que a cobrança consta paga de verdade.
  useEffect(() => {
    if (isPaid) {
      onStopPolling();
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }
  }, [isPaid, onStopPolling]);

  // Rola até o banner de erro do cartão (ele nasce no topo do formulário).
  useEffect(() => {
    if (cardError) cardBlockRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [cardError]);

  // Rola até a confirmação depois de pagar.
  useEffect(() => {
    if (payResult) resultBlockRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [payResult]);

  // Desliga o polling ao sair da tela (evita loop pendurado).
  useEffect(() => {
    return () => {
      onStopPolling();
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCardSubmit = useCallback(
    async (cardData: CardFormSubmitData) => {
      setCardError(null);
      setCardErrorSection(null);
      try {
        const result = await payWithCard(
          {
            holderName: cardData.holderName,
            holderEmail: cardData.holderEmail,
            number: cardData.number,
            expiryMonth: cardData.expiryMonth,
            expiryYear: cardData.expiryYear,
            ccv: cardData.ccv,
            holderCpf: cardData.holderCpf,
            holderPhone: cardData.holderPhone,
            holderPostalCode: cardData.holderPostalCode,
            holderAddressNumber: cardData.holderAddressNumber,
          },
          MESSAGES[locale].app.charges.checkout.card.genericError,
        );
        setPayResult(result);
        setShowCardForm(false);
        // Confirmação REAL vem do webhook: liga o polling e desiste depois de
        // CONFIRM_TIMEOUT_MS, explicando que pode demorar (nunca mente pro pagador).
        onStartPolling();
        if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
        timeoutRef.current = window.setTimeout(() => {
          onStopPolling();
          setConfirmSlow(true);
        }, CONFIRM_TIMEOUT_MS);
      } catch (err) {
        const message = err instanceof Error && err.message
          ? err.message
          : MESSAGES[locale].app.charges.checkout.card.genericError;
        setCardError(message);
        setCardErrorSection(detectCardErrorSection(message));
      }
    },
    [payWithCard, locale, onStartPolling, onStopPolling],
  );

  if (isLoading) {
    return (
      <PublicPortalShell title={t.subtitle} subtitle="">
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
          <span className="text-sm">{t.loading}</span>
        </div>
      </PublicPortalShell>
    );
  }

  if (isError || !payload) {
    return (
      <PublicPortalShell title={t.subtitle} subtitle="">
        <div className="flex flex-col items-center gap-3 py-14 text-center px-4">
          <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertCircle className="h-7 w-7 text-destructive" />
          </div>
          <p className="text-base font-bold text-destructive">{t.notFound.title}</p>
          <p className="text-sm text-muted-foreground max-w-xs">{t.notFound.description}</p>
        </div>
      </PublicPortalShell>
    );
  }

  const { company, charge } = payload;
  const isOverdue = OVERDUE_STATUSES.has(charge.status);
  const isCancelled = CANCELLED_STATUSES.has(charge.status);
  const isRefunded = REFUNDED_STATUSES.has(charge.status);

  // Cartão no NOSSO checkout: só quando o servidor liberou (conta ativa +
  // preferência do tenant). Sem isso, mantemos o link hospedado de sempre.
  const cardInHouse = charge.allow_card === true;

  const handleCopyPix = async () => {
    if (!charge.pix_copy_paste) return;
    try {
      await navigator.clipboard.writeText(charge.pix_copy_paste);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API indisponível — avisa o usuário.
      toast({ variant: 'destructive', title: t.pixCopyFallback });
    }
  };

  // Fallback: o link hospedado da Asaas nunca some. Se o nosso checkout falhar,
  // o pagador ainda tem um caminho pra pagar.
  const fallbackLink = charge.invoice_url ? (
    <div className="rounded-lg border border-border bg-card px-4 py-3 space-y-1.5">
      <p className="text-xs text-muted-foreground leading-relaxed">{t.card.fallbackNotice}</p>
      <a
        href={charge.invoice_url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary underline underline-offset-2"
      >
        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
        {t.card.fallbackLink}
      </a>
    </div>
  ) : null;

  return (
    <PublicPortalShell
      brandColor={company.primary_color}
      logoUrl={company.logo_url}
      title={company.name}
      subtitle={t.subtitle}
    >
      <div className="space-y-3 pb-2">
        {/* ── Bloco de valor + descrição ── */}
        <div className="rounded-lg border border-border bg-card px-5 py-5">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">
            {t.amountLabel}
          </p>
          <p className="text-4xl font-extrabold tabular-nums leading-none">
            {formatMoney(charge.value, currency, locale)}
          </p>
          {charge.description && (
            <p className="text-sm text-muted-foreground mt-2 leading-snug">{charge.description}</p>
          )}
          {charge.due_date && (
            <p className="text-xs text-muted-foreground mt-1.5">
              {t.dueLabel}: <span className="font-medium text-foreground">{formatDate(charge.due_date, locale, timezone)}</span>
            </p>
          )}
        </div>

        {/* ── Estado pago ── */}
        {isPaid ? (
          <div className="rounded-lg border border-border bg-card px-5 py-8 flex flex-col items-center gap-3 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="h-7 w-7 text-white" />
            </div>
            <div>
              <p className="text-base font-bold text-foreground">{t.status.paidTitle}</p>
              <p className="text-sm text-muted-foreground mt-0.5">{t.status.paidDescription}</p>
            </div>
          </div>
        ) : payResult ? (
          /* ── Tentativa no cartão concluída, aguardando a confirmação REAL ── */
          <div ref={resultBlockRef} className="rounded-lg border border-border bg-card px-5 py-8 flex flex-col items-center gap-3 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-600 flex items-center justify-center">
              {payResult.status === 'processing' ? (
                <Clock className="h-7 w-7 text-white" />
              ) : (
                <CheckCircle2 className="h-7 w-7 text-white" />
              )}
            </div>
            <div>
              <p className="text-base font-bold text-foreground">
                {payResult.status === 'processing'
                  ? t.card.processingTitle
                  : payResult.status === 'already_paid'
                    ? t.status.paidTitle
                    : t.card.approvedTitle}
              </p>
              <p className="text-sm text-muted-foreground mt-0.5 max-w-xs">
                {payResult.status === 'already_paid'
                  ? t.status.paidDescription
                  : confirmSlow
                    ? t.card.slowDescription
                    : payResult.status === 'processing'
                      ? t.card.processingDescription
                      : t.card.approvedDescription}
              </p>
            </div>
            {!confirmSlow && payResult.status !== 'already_paid' && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>{t.card.slowTitle}</span>
              </div>
            )}
          </div>
        ) : isCancelled ? (
          /* ── Cancelada ── */
          <div className="rounded-lg border border-border bg-card px-5 py-8 flex flex-col items-center gap-3 text-center">
            <div className="w-14 h-14 rounded-full bg-slate-600 flex items-center justify-center">
              <XCircle className="h-7 w-7 text-white" />
            </div>
            <div>
              <p className="text-base font-bold text-foreground">{t.status.cancelledTitle}</p>
              <p className="text-sm text-muted-foreground mt-0.5 max-w-xs">{t.status.cancelledDescription}</p>
            </div>
          </div>
        ) : isRefunded ? (
          /* ── Estornada ── */
          <div className="rounded-lg border border-border bg-card px-5 py-8 flex flex-col items-center gap-3 text-center">
            <div className="w-14 h-14 rounded-full bg-slate-600 flex items-center justify-center">
              <XCircle className="h-7 w-7 text-white" />
            </div>
            <div>
              <p className="text-base font-bold text-foreground">{t.status.refundedTitle}</p>
              <p className="text-sm text-muted-foreground mt-0.5 max-w-xs">{t.status.refundedDescription}</p>
            </div>
          </div>
        ) : showCardForm ? (
          /* ── Formulário de cartão NA NOSSA PÁGINA (marca do tenant) ── */
          <div className="space-y-3">
            <div ref={cardBlockRef} className="rounded-lg border border-border bg-card px-5 py-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                  <CreditCard className="h-3.5 w-3.5 text-primary" />
                </div>
                <p className="text-sm font-semibold">{t.card.formTitle}</p>
              </div>

              {/* Selo de segurança em destaque, junto do formulário. */}
              <div className="flex items-start gap-2 rounded-md bg-muted/50 px-3 py-2.5 mb-3">
                <Lock className="h-3.5 w-3.5 shrink-0 mt-0.5 text-muted-foreground" />
                <p className="text-[11px] text-muted-foreground leading-relaxed">{t.card.secureBadge}</p>
              </div>

              <CardPaymentForm
                amount={charge.value}
                isLoading={isPaying}
                onSubmit={handleCardSubmit}
                onBack={() => {
                  setShowCardForm(false);
                  setCardError(null);
                  setCardErrorSection(null);
                }}
                errorMessage={cardError}
                errorSection={cardErrorSection}
                // Parcelamento não se aplica: a Asaas paga a cobrança JÁ criada,
                // e o endpoint de pagamento não aceita número de parcelas.
                allowInstallments={false}
                submitLabel={t.card.submit.replace(
                  '{amount}',
                  formatMoney(charge.value, currency, locale),
                )}
                billingNotice={t.card.notice}
              />
            </div>
            {fallbackLink}
          </div>
        ) : (
          /* ── Pendente ou vencida: mostra opções de pagamento disponíveis ── */
          <div className="space-y-3">
            {/* Banner de vencida — só quando overdue */}
            {isOverdue && (
              <div className="rounded-lg border border-border bg-card px-5 py-4 flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-amber-500 flex items-center justify-center shrink-0 mt-0.5">
                  <Clock className="h-4 w-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">{t.status.overdueTitle}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{t.status.overdueDescription}</p>
                </div>
              </div>
            )}

            {/* ── Pix copia e cola ── */}
            {charge.pix_copy_paste && (
              <div className="rounded-lg border border-border bg-card px-5 py-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                    <QrCode className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <p className="text-sm font-semibold">{t.pix.title}</p>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{t.pix.instructions}</p>
                {/* QR Code visual com logo no centro — fundo branco fixo, lê em qualquer tema.
                    White-label (primary_color presente) → logo do tenant; senão → ícone Dominex. */}
                <div className="mx-auto w-fit rounded-lg border border-border bg-white p-3">
                  <BrandedQRCode
                    value={charge.pix_copy_paste}
                    size={180}
                    logoUrl={company.primary_color ? company.logo_url : null}
                  />
                </div>
                <div
                  className={cn(
                    'rounded-md border bg-muted/50 px-3 py-2.5 text-xs break-all font-mono text-muted-foreground',
                    'max-h-20 overflow-y-auto',
                  )}
                >
                  {charge.pix_copy_paste}
                </div>
                <Button
                  onClick={handleCopyPix}
                  className="w-full rounded-md h-10 font-semibold text-sm gap-2"
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4" />
                      {t.pix.copied}
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      {t.pix.copyCode}
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* ── Boleto — botão integrado ao fundo, sem card separado ── */}
            {charge.boleto_url && (
              <a
                href={charge.boleto_url}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'flex w-full items-center justify-center gap-2.5 rounded-md h-11',
                  'border border-border bg-transparent text-foreground text-sm font-semibold',
                  'transition-colors duration-150',
                  'hover:bg-primary hover:text-primary-foreground hover:border-primary',
                  'active:bg-primary active:text-primary-foreground active:border-primary',
                )}
              >
                <FileText className="h-4 w-4 shrink-0" />
                {t.boleto.open}
              </a>
            )}

            {/* ── Cartão: checkout PRÓPRIO (form nesta página). Sem o cartão
                 liberado server-side, cai no link hospedado de sempre. ── */}
            {cardInHouse ? (
              <button
                type="button"
                onClick={() => setShowCardForm(true)}
                className={cn(
                  'flex w-full items-center justify-center gap-2.5 rounded-md h-11',
                  'border border-border bg-transparent text-foreground text-sm font-semibold',
                  'transition-colors duration-150',
                  'hover:bg-primary hover:text-primary-foreground hover:border-primary',
                  'active:bg-primary active:text-primary-foreground active:border-primary',
                )}
              >
                <CreditCard className="h-4 w-4 shrink-0" />
                {t.card.open}
              </button>
            ) : charge.invoice_url ? (
              <a
                href={charge.invoice_url}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'flex w-full items-center justify-center gap-2.5 rounded-md h-11',
                  'border border-border bg-transparent text-foreground text-sm font-semibold',
                  'transition-colors duration-150',
                  'hover:bg-primary hover:text-primary-foreground hover:border-primary',
                  'active:bg-primary active:text-primary-foreground active:border-primary',
                )}
              >
                <CreditCard className="h-4 w-4 shrink-0" />
                {t.card.open}
              </a>
            ) : null}
          </div>
        )}

        {/* ── Rodapé de segurança ── */}
        <div className="flex items-center justify-center gap-4 pt-1 pb-1">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Shield className="h-3.5 w-3.5 shrink-0" />
            <span>{t.securityNote}</span>
            <img src={asaasLogo} alt="Asaas" className="h-4 w-auto shrink-0" />
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Lock className="h-3.5 w-3.5 shrink-0" />
            <span>SSL</span>
          </div>
        </div>
      </div>
    </PublicPortalShell>
  );
}
