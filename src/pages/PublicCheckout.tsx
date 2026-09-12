// PublicCheckout — página pública de pagamento do cliente final (/pagar/:code).
//
// Funciona TOTALMENTE deslogada: a edge `get-tenant-payment-checkout` é anon-safe
// e devolve uma ALLOWLIST estrita (valor, descrição, marca, links de pagamento).
// Nunca custo/margem/refs internas. Toda leitura passa pelo hook.
//
// LAYOUT (redesenho 2026-09-07, pedido do CEO): checkout de 2 colunas, espelhando
// o /checkout de assinatura (CheckoutLayout.tsx) — mesma hierarquia, mesmo respiro.
//   • ESQUERDA (resumo): fundo escuro + MARCA DO TENANT (logo no tamanho natural,
//     alinhado à esquerda, sem moldura circular; cor da marca só no brilho de
//     fundo). É a identidade de quem está cobrando.
//   • DIREITA (pagamento): SEMPRE tema claro e neutro — não herda `dark` do app
//     nem a cor de white-label do tenant. É onde a pessoa digita o cartão, então
//     tem que ser previsível. Ver `.checkout-neutral-panel` em src/index.css.
// No mobile as colunas empilham (resumo em cima, pagamento embaixo).
//
// Marca (regra-lei dos portais): cor/logo/nome vêm do PAYLOAD (anti-FOUC) e
// NUNCA do cache de white-label do navegador — a cobrança pode ser de um tenant
// diferente do último que o visitante acessou.
//
// CARTÃO (checkout PRÓPRIO): o pagador informa o cartão AQUI, e a edge
// `tenant-asaas-pay-charge-card` paga a cobrança já existente na Asaas. Nada de
// cartão é guardado por nós (nem estado global, nem cache): os dados vivem só no
// formulário e na chamada.
//
// SEM porta de saída pra outra marca: o link hospedado da Asaas (invoice_url)
// NÃO é mais exibido (decisão do CEO — checkout fechado). Quando NENHUMA forma
// de pagamento está liberada, mostramos uma mensagem clara em PT-BR (`noMethods`)
// em vez de uma tela vazia.
//
// A confirmação NÃO é otimista: a baixa definitiva vem do webhook da Asaas, então
// a tela faz polling do estado real da cobrança até virar "pago".

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { BrandedQRCode } from '@/components/BrandedQRCode';
import asaasLogo from '@/assets/logo-asaas.png';
import { PublicAppLocaleProvider, useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { CardPaymentForm } from '@/components/checkout/CardPaymentForm';
import { PAYMENT_METHOD_COLORS } from '@/components/checkout/paymentMethodTheme';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2, Copy, Check, QrCode, FileText, CreditCard, Calendar,
  CheckCircle2, AlertCircle, Clock, XCircle, Shield, Lock, ExternalLink, ArrowLeft,
} from 'lucide-react';
import {
  useTenantPaymentCheckout,
  usePayTenantChargeWithCard,
  type CheckoutCompany,
  type CheckoutPayload,
  type CardPayResult,
} from '@/hooks/useTenantPaymentCheckout';
import { extractShortCode } from '@/utils/prettyLinks';
import { formatMoney, formatDate } from '@/lib/format';
import { cpfCnpjMask, phoneMask } from '@/utils/masks';
import { cn } from '@/lib/utils';

// Status que representam "pago" (baixa automática via webhook já ocorreu).
const PAID_STATUSES = new Set(['received', 'confirmed', 'paid', 'RECEIVED', 'CONFIRMED']);
// Status que indicam cobrança vencida (sem pagamento ainda).
const OVERDUE_STATUSES = new Set(['overdue', 'OVERDUE']);
// Status que indicam cancelamento.
const CANCELLED_STATUSES = new Set(['cancelled', 'canceled', 'CANCELLED', 'CANCELED']);
// Status que indicam estorno.
const REFUNDED_STATUSES = new Set(['refunded', 'REFUNDED', 'chargedback', 'CHARGEBACK']);

/** Formas de pagamento que esta página sabe processar. */
type PayMethod = 'pix' | 'boleto' | 'card';

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

/** Classe que NEUTRALIZA tema/white-label (definida em src/index.css). */
const NEUTRAL_PANEL = 'checkout-neutral-panel';

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

// TEMA CLARO FORÇADO na rota inteira (mesmo padrão do PublicPortalShell /
// PontoPublico): esta é uma rota standalone, fora do AppLayout, e o pagador não
// tem preferência de tema aqui. Some com qualquer variante `dark:` de componente
// reusado. A coluna esquerda é escura por DESIGN (classes explícitas), não por tema.
// Restaura o estado anterior na desmontagem pra não vazar pro resto do app.
function useForceLightTheme() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const hadDark = root.classList.contains('dark');
    root.classList.remove('dark');
    const prevColorScheme = root.style.colorScheme;
    root.style.colorScheme = 'light';
    return () => {
      if (hadDark) root.classList.add('dark');
      root.style.colorScheme = prevColorScheme;
    };
  }, []);
}

// Radix (Select do formulário de cartão) e sonner renderizam em PORTAL, direto no
// <body> — fora da subárvore da coluna direita, então não herdam os tokens
// neutralizados dela. Enquanto esta tela está montada, marcamos o próprio <body>
// com a mesma classe: dropdowns e toasts saem no tema claro neutro, sem a cor do
// white-label. Seguro porque a coluna esquerda não usa token de tema (usa cores
// explícitas + a cor do payload inline).
function useNeutralPortalTheme() {
  useEffect(() => {
    document.body.classList.add(NEUTRAL_PANEL);
    return () => document.body.classList.remove(NEUTRAL_PANEL);
  }, []);
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

// ─────────────────────────────────────────────────────────────────────────────
// Casca do checkout: split 45/55 (empilha no mobile). A esquerda recebe o resumo
// branded; os filhos vão na direita, sempre no tema claro neutro.
// ─────────────────────────────────────────────────────────────────────────────
function CheckoutFrame({ summary, children }: { summary: ReactNode; children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-gray-950">
      <aside className="lg:w-[45%] shrink-0">{summary}</aside>
      <main
        className={cn(
          NEUTRAL_PANEL,
          'lg:w-[55%] flex-1 bg-background text-foreground',
          'px-5 py-8 sm:px-8 lg:px-12 lg:py-12 flex flex-col justify-center',
        )}
      >
        <div className="w-full max-w-lg mx-auto space-y-6">{children}</div>
      </main>
    </div>
  );
}

/** Fundo da coluna de resumo: escuro sóbrio + brilho discreto na cor da marca
 *  (vinda do PAYLOAD). Sem marca → só o escuro Dominex. */
function summaryBackground(brandColor: string | null | undefined): CSSProperties {
  if (!brandColor) {
    return { background: 'linear-gradient(160deg, #18181b 0%, #0a0a0a 65%)' };
  }
  return {
    background:
      `radial-gradient(120% 85% at 0% 0%, color-mix(in srgb, ${brandColor}, #000 62%) 0%, rgba(0,0,0,0) 58%),` +
      ' linear-gradient(160deg, #18181b 0%, #0a0a0a 70%)',
  };
}

/**
 * Identificação do EMISSOR (endereço, contato e documento do tenant), abaixo do
 * nome da empresa — como no cabeçalho de documento do sistema.
 *
 * Os campos chegam do servidor JÁ FILTRADOS pelos toggles `show_*_in_documents`
 * (a edge não envia o que o tenant desligou; é rota anônima). Aqui só formatamos
 * com as máscaras canônicas do repo. Nenhum campo → o bloco não renderiza (nada
 * de espaço vazio nem separador solto).
 *
 * Ordem espelha `src/utils/companyDocumentHeader.ts` (buildDetails):
 * endereço → contato (Tel | e-mail) → CPF/CNPJ.
 */
function IssuerDetails({ company }: { company: CheckoutCompany }) {
  const lines: string[] = [];

  if (company.address_line) lines.push(company.address_line);

  const contact: string[] = [];
  if (company.phone) contact.push(`Tel: ${phoneMask(company.phone)}`);
  if (company.email) contact.push(company.email);
  if (contact.length) lines.push(contact.join(' | '));

  if (company.document) {
    const digits = company.document.replace(/\D/g, '');
    lines.push(`${digits.length <= 11 ? 'CPF' : 'CNPJ'}: ${cpfCnpjMask(company.document)}`);
  }

  if (!lines.length) return null;

  return (
    <div className="space-y-0.5 -mt-5">
      {lines.map((line) => (
        <p key={line} className="text-xs leading-snug text-white/50">{line}</p>
      ))}
    </div>
  );
}

/** Coluna esquerda: marca do tenant + o que está sendo pago. */
function CheckoutSummary({
  brandColor,
  logoUrl,
  companyName,
  issuer,
  children,
}: {
  brandColor?: string | null;
  logoUrl?: string | null;
  companyName?: string | null;
  /** Empresa emissora (só no estado carregado) — alimenta o bloco de identificação. */
  issuer?: CheckoutCompany | null;
  children?: ReactNode;
}) {
  return (
    <div
      className="h-full text-white px-5 py-8 sm:px-8 lg:px-12 lg:py-12 flex flex-col justify-center"
      style={summaryBackground(brandColor)}
    >
      <div className="w-full max-w-md mx-auto space-y-7">
        {/* Logo do tenant no tamanho natural, alinhado à esquerda, object-contain
            e SEM moldura (o círculo cortava marcas horizontais). Muitos logos de
            white-label têm texto branco, por isso o fundo escuro é o certo. */}
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={companyName ?? 'Logo'}
            className="h-12 lg:h-14 w-auto max-w-[240px] object-contain object-left"
          />
        ) : null}

        {/* Sem logo (tenant sem white-label) o NOME é a identidade do credor:
            entra maior e sozinho. A edge nunca manda o logo da plataforma aqui —
            "logo da Dominex + nome do tenant" identificaria o credor errado. */}
        {companyName && (
          <p
            className={cn(
              'font-bold text-white',
              logoUrl ? 'text-lg -mt-3' : 'text-2xl lg:text-3xl leading-tight',
            )}
          >
            {companyName}
          </p>
        )}

        {issuer && <IssuerDetails company={issuer} />}

        {children}
      </div>
    </div>
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
  useForceLightTheme();
  useNeutralPortalTheme();

  // ── Estado do cartão (nada disso guarda dado de cartão) ────────────────────
  const [method, setMethod] = useState<PayMethod | null>(null);
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

  // Formas de pagamento REALMENTE disponíveis pra esta cobrança (o servidor
  // decide: pix/boleto só existem se a Asaas devolveu o artefato; cartão só com
  // `allow_card` — conta ativa + preferência do tenant).
  const available = useMemo<PayMethod[]>(() => {
    const charge = payload?.charge;
    if (!charge) return [];
    const list: PayMethod[] = [];
    if (charge.pix_copy_paste) list.push('pix');
    if (charge.boleto_url) list.push('boleto');
    if (charge.allow_card === true) list.push('card');
    return list;
  }, [payload?.charge]);

  // Pré-seleção SÓ quando existe UMA forma: com 2 ou 3, escolher sozinho
  // esconderia as outras, porque o seletor some assim que o pagador escolhe
  // (decisão do CEO, 2026-09-12). Abrir já no Pix faria o pagador nunca
  // descobrir que dava pra pagar no cartão ou no boleto — venda perdida.
  // Com forma única não há o que escolher, então obrigar um clique seria ruído:
  // a página abre direto no conteúdo (e o card único continua visível como aviso).
  const defaultMethod = available.length === 1 ? available[0] : null;
  useEffect(() => {
    if (defaultMethod) setMethod((prev) => prev ?? defaultMethod);
  }, [defaultMethod]);
  // O efeito NÃO re-seleciona depois de um "Voltar": `defaultMethod` não mudou,
  // então ele não re-roda. E com 2+ formas ele é no-op (defaultMethod = null).

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
        // Confirmação REAL vem do webhook: liga o polling e desiste depois de
        // CONFIRM_TIMEOUT_MS, explicando que pode demorar (nunca mente pro pagador).
        onStartPolling();
        if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
        timeoutRef.current = window.setTimeout(() => {
          onStopPolling();
          setConfirmSlow(true);
        }, CONFIRM_TIMEOUT_MS);
      } catch (err) {
        // Falha da NOSSA edge (ou recusa da operadora): a mensagem PT-BR aparece
        // dentro do formulário, na seção provável, e o form continua preenchido
        // pra o pagador corrigir e tentar de novo. Sem beco sem saída.
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
      <CheckoutFrame summary={<CheckoutSummary />}>
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
          <span className="text-sm">{t.loading}</span>
        </div>
      </CheckoutFrame>
    );
  }

  if (isError || !payload) {
    return (
      <CheckoutFrame summary={<CheckoutSummary />}>
        <div className="flex flex-col items-center gap-3 py-14 text-center">
          <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertCircle className="h-7 w-7 text-destructive" />
          </div>
          <p className="text-base font-bold text-destructive">{t.notFound.title}</p>
          <p className="text-sm text-muted-foreground max-w-xs">{t.notFound.description}</p>
        </div>
      </CheckoutFrame>
    );
  }

  const { company, charge } = payload;
  const isOverdue = OVERDUE_STATUSES.has(charge.status);
  const isCancelled = CANCELLED_STATUSES.has(charge.status);
  const isRefunded = REFUNDED_STATUSES.has(charge.status);
  const amountLabel = formatMoney(charge.value, currency, locale);

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

  const selectMethod = (next: PayMethod) => {
    setMethod(next);
    setCardError(null);
    setCardErrorSection(null);
  };

  // "Voltar": devolve a escolha de forma de pagamento e zera o erro do cartão
  // (senão o banner de erro reapareceria ao abrir o formulário de novo).
  const clearMethod = () => {
    setMethod(null);
    setCardError(null);
    setCardErrorSection(null);
  };

  // O seletor some assim que o pagador escolhe uma forma — a tela fica só com o
  // conteúdo daquele pagamento. EXCEÇÃO: forma única, onde o card não é seletor
  // e sim o AVISO de que esta cobrança aceita só aquela forma; esconder seria
  // esconder informação. Por isso ele fica sempre visível nesse caso.
  const showMethodPicker = !method || available.length === 1;
  // Com forma única não há pra onde voltar, então o "Voltar" de Pix/boleto não
  // aparece (o do cartão continua, pra recolher o formulário).
  const showMethodBack = available.length > 1;

  // ── Resumo (coluna esquerda) ──────────────────────────────────────────────
  const summary = (
    <CheckoutSummary
      brandColor={company.primary_color}
      logoUrl={company.logo_url}
      companyName={company.name}
      issuer={company}
    >
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-white/55">
          {t.amountLabel}
        </p>
        <p className="text-4xl lg:text-5xl font-bold tabular-nums leading-none">{amountLabel}</p>
        {charge.description && (
          <p className="text-sm text-white/70 leading-snug pt-1">{charge.description}</p>
        )}
      </div>

      <div className="space-y-3">
        {charge.due_date && (
          <div className="flex items-center gap-2.5 text-sm bg-white/5 rounded-lg px-3 py-2.5">
            <Calendar className="h-4 w-4 shrink-0 text-white/70" />
            <span className="text-white/80">
              {t.dueLabel}:{' '}
              <span className="font-semibold text-white">
                {formatDate(charge.due_date, locale, timezone)}
              </span>
            </span>
          </div>
        )}

        {isOverdue && !isPaid && (
          <div className="flex items-start gap-2.5 rounded-lg bg-amber-500 px-3 py-2.5 text-white">
            <Clock className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold leading-tight">{t.status.overdueTitle}</p>
              <p className="text-xs leading-snug mt-0.5 text-white/90">{t.status.overdueDescription}</p>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-white/10" />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-white/55">
        <span className="inline-flex items-center gap-1.5">
          <Shield className="h-3.5 w-3.5 shrink-0" />
          {t.sslLabel}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Lock className="h-3.5 w-3.5 shrink-0" />
          SSL
        </span>
      </div>
    </CheckoutSummary>
  );

  // ── Estados finais (pago / cancelada / estornada / confirmando) ────────────
  const finalState = isPaid ? (
    <StatusPanel
      tone="success"
      icon={<CheckCircle2 className="h-8 w-8 text-white" />}
      title={t.status.paidTitle}
      description={t.status.paidDescription}
    />
  ) : payResult ? (
    <div ref={resultBlockRef}>
      <StatusPanel
        tone="success"
        icon={payResult.status === 'processing'
          ? <Clock className="h-8 w-8 text-white" />
          : <CheckCircle2 className="h-8 w-8 text-white" />}
        title={
          payResult.status === 'processing'
            ? t.card.processingTitle
            : payResult.status === 'already_paid'
              ? t.status.paidTitle
              : t.card.approvedTitle
        }
        description={
          payResult.status === 'already_paid'
            ? t.status.paidDescription
            : confirmSlow
              ? t.card.slowDescription
              : payResult.status === 'processing'
                ? t.card.processingDescription
                : t.card.approvedDescription
        }
        footer={
          !confirmSlow && payResult.status !== 'already_paid' ? (
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>{t.card.slowTitle}</span>
            </div>
          ) : null
        }
      />
    </div>
  ) : isCancelled ? (
    <StatusPanel
      tone="neutral"
      icon={<XCircle className="h-8 w-8 text-white" />}
      title={t.status.cancelledTitle}
      description={t.status.cancelledDescription}
    />
  ) : isRefunded ? (
    <StatusPanel
      tone="neutral"
      icon={<XCircle className="h-8 w-8 text-white" />}
      title={t.status.refundedTitle}
      description={t.status.refundedDescription}
    />
  ) : null;

  return (
    <CheckoutFrame summary={summary}>
      {finalState ?? (
        <>
          <div>
            <h1 className="text-xl font-bold text-foreground">{t.payTitle}</h1>
            {available.length > 0 && (
              <p className="text-sm text-muted-foreground mt-0.5">{t.paySubtitle}</p>
            )}
          </div>

          {/* ── Estado degradado: nenhuma forma de pagamento liberada ──
               (sem pix, sem boleto e cartão bloqueado server-side). Nunca
               deixamos a tela vazia nem mandamos o pagador pra fora da marca. */}
          {available.length === 0 ? (
            <div className="rounded-xl border border-border bg-card px-5 py-8 flex flex-col items-center gap-3 text-center">
              <div className="w-12 h-12 rounded-full bg-amber-500 flex items-center justify-center">
                <AlertCircle className="h-6 w-6 text-white" />
              </div>
              <p className="text-base font-bold text-foreground">{t.noMethods.title}</p>
              <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
                {t.noMethods.description}
              </p>
            </div>
          ) : (
            <>
              {/* ── Cards de forma de pagamento (só as disponíveis) ──
                   Aparecem mesmo quando há UMA só: o pagador precisa enxergar
                   que aquela cobrança aceita só aquela forma (e não achar que a
                   página deixou de oferecer as outras). Com 2+ formas, somem
                   depois da escolha (`showMethodPicker`) pra deixar a tela só
                   com o conteúdo do pagamento — o "Voltar" traz de volta. */}
              {showMethodPicker && (
                <div className="space-y-2.5">
                  <p className="text-sm font-semibold text-foreground">{t.methodLabel}</p>
                  <div
                    className={cn(
                      'grid gap-3',
                      available.length >= 3 ? 'grid-cols-3' : available.length === 2 ? 'grid-cols-2' : 'grid-cols-1',
                    )}
                  >
                    {available.map((m) => (
                      <MethodCard
                        key={m}
                        method={m}
                        selected={method === m}
                        name={t.methodNames[m]}
                        hint={t.methodHints[m]}
                        // Forma única: card em linha (ícone à esquerda), pra não
                        // virar um bloco alto e órfão ocupando a largura toda.
                        row={available.length === 1}
                        onSelect={() => selectMethod(m)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* ── Pix ── */}
              {method === 'pix' && charge.pix_copy_paste && (
                <div className="rounded-xl border border-border bg-card px-5 py-5 space-y-4">
                  {showMethodBack && (
                    <Button variant="outline" size="sm" onClick={clearMethod} className="mb-2">
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      {t.methodBack}
                    </Button>
                  )}
                  <div>
                    <p className="text-sm font-bold text-foreground">{t.pix.title}</p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      {t.pix.instructions}
                    </p>
                  </div>
                  {/* QR sempre em fundo branco fixo: lê em qualquer câmera.
                      O logo no centro é o do tenant quando existir — a edge só
                      manda `logo_url` com white-label ligado, então essa é a
                      fonte da verdade. Sem white-label, `allowPlatformLogoFallback=false`
                      mantém o QR limpo (sem marca) — artefato de PAGAMENTO nunca
                      leva a marca da plataforma no centro do QR de outro tenant. */}
                  <div className="mx-auto w-fit rounded-xl border border-border bg-white p-3">
                    <BrandedQRCode
                      value={charge.pix_copy_paste}
                      size={190}
                      logoUrl={company.logo_url}
                      allowPlatformLogoFallback={false}
                    />
                  </div>
                  <div className="rounded-lg border border-border bg-muted/60 px-3 py-2.5 text-xs break-all font-mono text-muted-foreground max-h-20 overflow-y-auto">
                    {charge.pix_copy_paste}
                  </div>
                  <Button onClick={handleCopyPix} className="w-full h-12 font-bold text-sm gap-2">
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

              {/* ── Boleto ── */}
              {method === 'boleto' && charge.boleto_url && (
                <div className="rounded-xl border border-border bg-card px-5 py-5 space-y-4">
                  {showMethodBack && (
                    <Button variant="outline" size="sm" onClick={clearMethod} className="mb-2">
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      {t.methodBack}
                    </Button>
                  )}
                  <div>
                    <p className="text-sm font-bold text-foreground">{t.boleto.title}</p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      {t.boletoNotice}
                    </p>
                  </div>
                  <a
                    href={charge.boleto_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      'flex w-full items-center justify-center gap-2.5 rounded-lg h-12',
                      'bg-primary text-primary-foreground text-sm font-bold',
                      'transition-opacity hover:opacity-90',
                    )}
                  >
                    <ExternalLink className="h-4 w-4 shrink-0" />
                    {t.boleto.open}
                  </a>
                </div>
              )}

              {/* ── Cartão: formulário NA NOSSA PÁGINA ── */}
              {method === 'card' && (
                <div ref={cardBlockRef} className="rounded-xl border border-border bg-card px-5 py-5">
                  <div className="flex items-center gap-2 mb-3">
                    {/* Ícone de identidade do bloco segue a COR DO MEIO de
                        pagamento (mesma paleta dos cards); o botão de ação
                        continua no verde estável do painel. */}
                    <div
                      className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                      style={{ backgroundColor: PAYMENT_METHOD_COLORS.card }}
                    >
                      <CreditCard className="h-3.5 w-3.5 text-white" />
                    </div>
                    <p className="text-sm font-bold">{t.card.formTitle}</p>
                  </div>

                  <div className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2.5 mb-4">
                    <Lock className="h-3.5 w-3.5 shrink-0 mt-0.5 text-muted-foreground" />
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      {t.card.secureBadge}
                    </p>
                  </div>

                  <CardPaymentForm
                    amount={charge.value}
                    isLoading={isPaying}
                    onSubmit={handleCardSubmit}
                    // "Voltar" recolhe o formulário e devolve a escolha de
                    // forma de pagamento (mesmo quando só existe uma).
                    onBack={clearMethod}
                    errorMessage={cardError}
                    errorSection={cardErrorSection}
                    // Parcelamento não se aplica: a Asaas paga a cobrança JÁ criada,
                    // e o endpoint de pagamento não aceita número de parcelas.
                    allowInstallments={false}
                    submitLabel={t.card.submit.replace('{amount}', amountLabel)}
                    billingNotice={t.card.notice}
                  />
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── Selo de processamento (informativo, NÃO é link pra fora) ── */}
      <div className="flex items-center justify-center gap-1.5 pt-1 text-[11px] text-muted-foreground">
        <Shield className="h-3.5 w-3.5 shrink-0" />
        <span>{t.securityNote}</span>
        <img src={asaasLogo} alt="Asaas" className="h-4 w-auto shrink-0" />
      </div>
    </CheckoutFrame>
  );
}

/** Card de forma de pagamento. Selecionado = CARD CHEIO na cor do meio de
 *  pagamento (paleta de paymentMethodTheme) com ícone/título/subtítulo brancos;
 *  não selecionado = fundo claro com borda neutra. */
function MethodCard({
  method,
  selected,
  name,
  hint,
  row,
  onSelect,
}: {
  method: PayMethod;
  selected: boolean;
  name: string;
  hint: string;
  row?: boolean;
  onSelect: () => void;
}) {
  const Icon = method === 'pix' ? QrCode : method === 'boleto' ? FileText : CreditCard;
  const color = PAYMENT_METHOD_COLORS[method];
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      // Selecionado: fundo + borda na cor do meio de pagamento (valor literal,
      // não token — o painel é neutro e não segue a marca do tenant).
      style={selected ? { backgroundColor: color, borderColor: color } : undefined}
      className={cn(
        'group flex rounded-xl border-2 transition-all duration-150',
        row
          ? 'flex-row items-center gap-3 px-4 py-3 text-left'
          : 'flex-col items-center justify-start gap-2 px-2 py-4 text-center',
        selected
          ? 'text-white shadow-sm'
          : 'border-border bg-card hover:border-foreground/25 hover:bg-muted/40',
      )}
    >
      <span
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors',
          // Régua de UI: no card saturado o ícone é BRANCO direto no fundo, sem
          // círculo dessaturado atrás (a caixa some, o tamanho continua igual).
          selected ? 'text-white' : 'bg-muted text-muted-foreground group-hover:text-foreground',
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className={cn('flex flex-col', row ? 'items-start gap-0.5' : 'items-center gap-1')}>
        <span className={cn('text-sm font-bold leading-tight', selected ? 'text-white' : 'text-foreground')}>
          {name}
        </span>
        <span className={cn('text-[11px] leading-tight', selected ? 'text-white' : 'text-muted-foreground')}>
          {hint}
        </span>
      </span>
    </button>
  );
}

/** Painel de estado final (pago / cancelada / estornada / confirmando). */
function StatusPanel({
  tone,
  icon,
  title,
  description,
  footer,
}: {
  tone: 'success' | 'neutral';
  icon: ReactNode;
  title: string;
  description: string;
  footer?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-5 py-10 flex flex-col items-center gap-4 text-center">
      <div
        className={cn(
          'w-16 h-16 rounded-full flex items-center justify-center',
          tone === 'success' ? 'bg-emerald-600' : 'bg-slate-600',
        )}
      >
        {icon}
      </div>
      <div>
        <p className="text-lg font-bold text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm leading-relaxed">{description}</p>
      </div>
      {footer}
    </div>
  );
}
