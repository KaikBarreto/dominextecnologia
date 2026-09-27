/* eslint-disable react-refresh/only-export-components -- exports puros/componentes usados pelos testes de estados públicos. */
import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import {
  AlertCircle,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  Loader2,
  LockKeyhole,
  QrCode,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { BrandedQRCode } from '@/components/BrandedQRCode';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  useTenantSubscriptionCheckout,
  type TenantSubscriptionCheckoutPayload,
} from '@/hooks/useTenantSubscriptionCheckout';
import { formatDate, formatMoney } from '@/lib/format';
import { extractShortCode } from '@/utils/prettyLinks';
import { cn } from '@/lib/utils';

const NEUTRAL_PANEL = 'checkout-neutral-panel';
const AUTHORIZED = new Set(['authorized', 'active', 'approved', 'confirmed']);
const CANCELLED = new Set(['cancelled', 'canceled', 'rejected', 'revoked']);
const EXPIRED = new Set(['expired']);
const PENDING = new Set(['pending', 'awaiting_authorization', 'created']);

const CYCLE_LABELS: Record<string, string> = {
  WEEKLY: 'Semanal',
  BIWEEKLY: 'Quinzenal',
  MONTHLY: 'Mensal',
  QUARTERLY: 'Trimestral',
  SEMIANNUALLY: 'Semestral',
  YEARLY: 'Anual',
  ANNUALLY: 'Anual',
};

export type PublicSubscriptionView =
  | 'pending_pix_auto'
  | 'external_asaas'
  | 'authorized'
  | 'cancelled'
  | 'expired'
  | 'invalid';

export function resolvePublicSubscriptionView(
  payload: TenantSubscriptionCheckoutPayload,
): PublicSubscriptionView {
  const status = payload.checkout.status.toLowerCase();
  if (AUTHORIZED.has(status)) return 'authorized';
  if (CANCELLED.has(status)) return 'cancelled';
  if (EXPIRED.has(status)) return 'expired';
  if (payload.checkout.kind === 'asaas' && payload.checkout.checkout_url) return 'external_asaas';
  if (
    payload.checkout.kind === 'pix_auto' &&
    PENDING.has(status) &&
    (payload.checkout.copy_paste || payload.checkout.qr_code)
  ) return 'pending_pix_auto';
  return 'invalid';
}

function useStandaloneLightTheme() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const hadDark = root.classList.contains('dark');
    const previousColorScheme = root.style.colorScheme;
    root.classList.remove('dark');
    root.style.colorScheme = 'light';
    document.body.classList.add(NEUTRAL_PANEL);
    return () => {
      if (hadDark) root.classList.add('dark');
      root.style.colorScheme = previousColorScheme;
      document.body.classList.remove(NEUTRAL_PANEL);
    };
  }, []);
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <main className={cn(NEUTRAL_PANEL, 'min-h-screen bg-slate-100 px-4 py-8 text-foreground sm:px-6 lg:py-12')}>
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-5xl items-center justify-center">
        {children}
      </div>
    </main>
  );
}

function MerchantHeader({ merchant }: { merchant: TenantSubscriptionCheckoutPayload['merchant'] }) {
  return (
    <header className="flex min-h-14 items-center gap-3">
      {merchant.logo_url ? (
        <img
          src={merchant.logo_url}
          alt={`Logo de ${merchant.name}`}
          className="max-h-12 max-w-[180px] object-contain object-left"
        />
      ) : (
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-white">
          <ShieldCheck className="h-6 w-6" />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-white/50">Assinatura segura</p>
        <p className="truncate text-lg font-semibold text-white">{merchant.name}</p>
      </div>
    </header>
  );
}

function Summary({ payload }: { payload: TenantSubscriptionCheckoutPayload }) {
  const { subscription, merchant, customer } = payload;
  return (
    <section className="flex flex-col justify-between gap-10 bg-slate-950 p-6 text-white sm:p-8 lg:min-h-[620px] lg:w-[43%] lg:p-10">
      <div className="space-y-10">
        <MerchantHeader merchant={merchant} />
        <div className="space-y-2">
          {customer.first_name && <p className="text-sm text-white/65">Olá, {customer.first_name}</p>}
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/50">Valor recorrente</p>
          <p className="text-4xl font-bold tabular-nums sm:text-5xl">
            {formatMoney(subscription.value, 'BRL', 'pt-br')}
          </p>
          {subscription.description && (
            <p className="max-w-sm pt-2 text-sm leading-relaxed text-white/70">{subscription.description}</p>
          )}
        </div>
        <dl className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-4 text-sm">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-white/55">Frequência</dt>
            <dd className="font-semibold">{CYCLE_LABELS[subscription.cycle.toUpperCase()] ?? subscription.cycle}</dd>
          </div>
          {subscription.next_due_date && (
            <div className="flex items-center justify-between gap-4 border-t border-white/10 pt-3">
              <dt className="flex items-center gap-2 text-white/55"><CalendarDays className="h-4 w-4" />Primeira cobrança</dt>
              <dd className="font-semibold">{formatDate(subscription.next_due_date, 'pt-br', 'America/Sao_Paulo')}</dd>
            </div>
          )}
        </dl>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-white/10 pt-5 text-xs text-white/50">
        <span className="inline-flex items-center gap-1.5"><LockKeyhole className="h-3.5 w-3.5" />Conexão protegida</span>
        <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" />Dados seguros</span>
      </div>
    </section>
  );
}

function StateCard({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-md space-y-5 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted">{icon}</div>
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}

function qrImageSource(value: string | null): string | null {
  if (!value) return null;
  if (/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=\s]+$/i.test(value)) return value;
  if (/^[a-z0-9+/=\s]+$/i.test(value)) return `data:image/png;base64,${value}`;
  return null;
}

export function PublicSubscriptionCheckoutContent({
  payload,
  isLoading,
  isError,
  onRetry,
}: {
  payload: TenantSubscriptionCheckoutPayload | null;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2_000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  if (isLoading) {
    return (
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
        <p className="mt-4 text-sm text-muted-foreground">Carregando sua assinatura…</p>
      </div>
    );
  }

  if (isError || !payload) {
    return (
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <StateCard
          icon={<AlertCircle className="h-8 w-8 text-destructive" />}
          title="Link indisponível"
          description="Não encontramos esta assinatura ou o link não está mais disponível. Confira o endereço recebido."
        >
          <Button type="button" variant="outline" onClick={onRetry}>
            <RefreshCw className="mr-2 h-4 w-4" />Tentar novamente
          </Button>
        </StateCard>
      </div>
    );
  }

  const view = resolvePublicSubscriptionView(payload);
  const { checkout } = payload;

  const handleCopy = async () => {
    if (!checkout.copy_paste) return;
    try {
      await navigator.clipboard.writeText(checkout.copy_paste);
      setCopied(true);
    } catch {
      toast({ variant: 'destructive', title: 'Não foi possível copiar', description: 'Selecione o código e copie manualmente.' });
    }
  };

  const content = (() => {
    if (view === 'authorized') {
      return <StateCard icon={<CheckCircle2 className="h-9 w-9 text-emerald-600" />} title="Pix Automático autorizado" description="Pronto. Seu banco confirmou a autorização e as próximas cobranças seguirão a frequência informada." />;
    }
    if (view === 'cancelled') {
      return <StateCard icon={<XCircle className="h-9 w-9 text-destructive" />} title="Autorização cancelada" description="Este pedido de autorização não está mais ativo. Solicite um novo link à empresa responsável." />;
    }
    if (view === 'expired') {
      return <StateCard icon={<Clock3 className="h-9 w-9 text-amber-600" />} title="Link expirado" description="O prazo para autorizar esta assinatura terminou. Solicite um novo link à empresa responsável." />;
    }
    if (view === 'external_asaas') {
      return (
        <StateCard icon={<ExternalLink className="h-8 w-8 text-primary" />} title="Concluir assinatura" description="Continue no ambiente seguro da Asaas para finalizar esta assinatura.">
          <Button asChild className="w-full sm:w-auto">
            <a href={checkout.checkout_url!} target="_blank" rel="noopener noreferrer">Continuar na Asaas<ExternalLink className="ml-2 h-4 w-4" /></a>
          </Button>
        </StateCard>
      );
    }
    if (view === 'pending_pix_auto') {
      const imageSource = qrImageSource(checkout.qr_code);
      return (
        <div className="space-y-6">
          <div className="space-y-2 text-center lg:text-left">
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
              <QrCode className="h-3.5 w-3.5" />Pix Automático
            </div>
            <h1 className="text-2xl font-bold">Autorize no app do seu banco</h1>
            <p className="text-sm leading-relaxed text-muted-foreground">Escaneie o QR Code ou copie o código Pix. Você autoriza uma vez e acompanha a confirmação nesta página.</p>
          </div>
          <div className="flex justify-center rounded-xl border bg-white p-4">
            {checkout.copy_paste ? (
              <BrandedQRCode value={checkout.copy_paste} size={220} logoUrl={payload.merchant.logo_url} allowPlatformLogoFallback={false} />
            ) : imageSource ? (
              <img src={imageSource} alt="QR Code para autorizar o Pix Automático" className="h-[220px] w-[220px] object-contain" />
            ) : null}
          </div>
          {checkout.copy_paste && (
            <div className="space-y-2">
              <label htmlFor="pix-auto-code" className="text-sm font-semibold">Pix copia e cola</label>
              <textarea id="pix-auto-code" readOnly value={checkout.copy_paste} rows={3} className="w-full resize-none rounded-lg border bg-muted/40 p-3 font-mono text-xs text-foreground outline-none" />
              <Button type="button" className="w-full" onClick={handleCopy}>
                {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                {copied ? 'Código copiado' : 'Copiar código Pix'}
              </Button>
            </div>
          )}
          <div className="rounded-lg bg-muted/60 px-4 py-3 text-xs leading-relaxed text-muted-foreground">A autorização não realiza uma cobrança agora por si só. Os débitos seguirão o valor e a frequência mostrados no resumo.</div>
        </div>
      );
    }
    return <StateCard icon={<AlertCircle className="h-8 w-8 text-destructive" />} title="Link indisponível" description="Este link não possui uma forma de autorização válida. Solicite um novo link à empresa responsável." />;
  })();

  return (
    <div className="w-full overflow-hidden rounded-2xl bg-white shadow-2xl lg:flex">
      <Summary payload={payload} />
      <section className="flex min-h-[430px] flex-1 items-center justify-center p-6 sm:p-10 lg:p-12">
        <div className="w-full max-w-md">{content}</div>
      </section>
    </div>
  );
}

export default function PublicSubscriptionCheckout() {
  useStandaloneLightTheme();
  const { code } = useParams<{ code: string }>();
  const shortCode = extractShortCode(code) ?? undefined;
  const query = useTenantSubscriptionCheckout(shortCode);

  return (
    <Frame>
      <PublicSubscriptionCheckoutContent
        payload={query.data ?? null}
        isLoading={query.isLoading && !!shortCode}
        isError={!shortCode || query.isError}
        onRetry={() => { void query.refetch(); }}
      />
    </Frame>
  );
}
