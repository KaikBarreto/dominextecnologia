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

import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { BrandedQRCode } from '@/components/BrandedQRCode';
import { PublicPortalShell } from '@/components/portal/PublicPortalShell';
import { PublicAppLocaleProvider, useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2, Copy, Check, QrCode, FileText, CreditCard,
  CheckCircle2, AlertCircle, Clock, XCircle, Shield, Lock,
} from 'lucide-react';
import { useTenantPaymentCheckout, type CheckoutPayload } from '@/hooks/useTenantPaymentCheckout';
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
const REFUNDED_STATUSES = new Set(['refunded', 'REFUNDED', 'chargedback', 'CHARGEDBACK']);

export default function PublicCheckout() {
  const { code } = useParams<{ code: string }>();
  // O último segmento do slug amigável é sempre o short_code (nunca contém '-').
  const shortCode = extractShortCode(code) ?? undefined;

  const { data, isLoading, isError } = useTenantPaymentCheckout(shortCode);

  return (
    <PublicAppLocaleProvider language="pt-br" currency="BRL">
      <CheckoutInner payload={data ?? null} isLoading={isLoading} isError={isError} />
    </PublicAppLocaleProvider>
  );
}

function CheckoutInner({
  payload,
  isLoading,
  isError,
}: {
  payload: CheckoutPayload | null;
  isLoading: boolean;
  isError: boolean;
}) {
  const { locale, currency, timezone } = useAppLocaleContext();
  const t = MESSAGES[locale].app.charges.checkout;
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

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
  const isPaid = PAID_STATUSES.has(charge.status);
  const isOverdue = OVERDUE_STATUSES.has(charge.status);
  const isCancelled = CANCELLED_STATUSES.has(charge.status);
  const isRefunded = REFUNDED_STATUSES.has(charge.status);

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

            {/* ── Cartão / checkout hospedado da Asaas — botão integrado ao fundo ── */}
            {charge.invoice_url && (
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
            )}
          </div>
        )}

        {/* ── Rodapé de segurança ── */}
        <div className="flex items-center justify-center gap-4 pt-1 pb-1">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Shield className="h-3.5 w-3.5 shrink-0" />
            <span>{t.securityNote}</span>
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
