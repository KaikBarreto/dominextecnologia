import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, Loader2, FileText, Download } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ProposalRenderer } from '@/components/quotes/ProposalRenderer';
import { extractQuoteToken } from '@/utils/prettyLinks';
import type { Quote } from '@/hooks/useQuotes';
import type { CompanySettings } from '@/hooks/useCompanySettings';
import { PublicAppLocaleProvider, useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { getLocaleDef, type LocaleCode } from '@/lib/i18n/locales';

// Fingerprint estável por navegador, guardado em localStorage. Serve só pro
// dedupe de refresh (a RPC ignora visitas do mesmo fingerprint em 30min). Não é
// identificação pessoal — é um uuid aleatório que vive no aparelho do visitante.
const FP_KEY = '__pv_fp';
function getViewerFingerprint(): string {
  try {
    let fp = localStorage.getItem(FP_KEY);
    if (!fp) {
      fp = (crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
      localStorage.setItem(FP_KEY, fp);
    }
    return fp;
  } catch {
    // localStorage indisponível (modo privado/storage bloqueado): sem fingerprint,
    // a RPC conta cada carga (NULL nunca deduplica) — aceitável como fallback.
    return '';
  }
}

function useOgMeta(company: CompanySettings | null, locale: LocaleCode) {
  useEffect(() => {
    if (!company) return;
    const cs = company as any;
    const isWhiteLabel = cs.white_label_enabled;
    const companyName = cs.name || 'Proposta';

    const tp = MESSAGES[locale].app.crm.proposals;
    const pageTitle = tp.publicTitle;
    const pageDesc = tp.publicDesc.replace('{company}', companyName);
    const ogLocale = getLocaleDef(locale).ogLocale;

    // Update title
    document.title = `${companyName} — ${pageTitle}`;

    // Set OG meta tags
    const setMeta = (property: string, content: string) => {
      let el = document.querySelector(`meta[property="${property}"]`) ||
               document.querySelector(`meta[name="${property}"]`);
      if (!el) {
        el = document.createElement('meta');
        if (property.startsWith('og:')) {
          el.setAttribute('property', property);
        } else {
          el.setAttribute('name', property);
        }
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    setMeta('og:title', `${companyName} — ${pageTitle}`);
    setMeta('twitter:title', `${companyName} — ${pageTitle}`);
    setMeta('og:description', pageDesc);
    setMeta('twitter:description', pageDesc);
    setMeta('og:locale', ogLocale);

    if (isWhiteLabel) {
      const logoUrl = cs.white_label_logo_url || cs.logo_url;
      if (logoUrl) {
        setMeta('og:image', logoUrl);
        setMeta('twitter:image', logoUrl);
        setMeta('twitter:card', 'summary');
      }
    }

    return () => {
      document.title = 'Dominex — Gestão de Equipes de Campo e Ordens de Serviço';
    };
  }, [company, locale]);
}

interface CompanyLocale {
  language: string | null;
  currency: string | null;
  timezone: string | null;
}

// Inner component — consumes PublicAppLocaleProvider already set up by the outer.
function ProposalPublicContent({
  token,
  isPreview,
  viewRecordedRef,
  onLocaleReady,
}: {
  token: string | null;
  isPreview: boolean;
  viewRecordedRef: React.MutableRefObject<boolean>;
  onLocaleReady: (l: CompanyLocale) => void;
}) {
  const { locale } = useAppLocaleContext();
  const tp = MESSAGES[locale].app.crm.proposals;

  const [quote, setQuote] = useState<Quote | null>(null);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [templateSlug, setTemplateSlug] = useState('classico');
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState(false);
  const [done, setDone] = useState(false);
  // Mensagem amigável exibida quando a resposta NÃO persistiu agora:
  // 'already' = o orçamento já tinha sido respondido (não travamos como "aprovado agora");
  // 'error'   = falha de rede (permite tentar de novo, não trava done).
  const [respondNotice, setRespondNotice] = useState<'already' | 'error' | null>(null);

  useOgMeta(company, locale);

  useEffect(() => {
    if (!token) return;
    (async () => {
      // Payload público anon-safe: a RPC (SECURITY DEFINER) resolve quote + itens +
      // cliente + EMPRESA DO ORÇAMENTO escopada por quote.company_id. Substitui as
      // leituras client-side antigas (company_settings.limit(1) era bloqueada pelo
      // RLS anônimo → caía na "Empresa" genérica sem logo/cores). null = token inválido.
      const { data } = await supabase.rpc('get_quote_public_payload', { _token: token });
      const payload = (data ?? null) as {
        quote: any;
        items: any[];
        customer: { name: string; email: string | null; phone: string | null } | null;
        company: any | null;
      } | null;

      const quoteRow = payload?.quote ?? null;
      if (quoteRow) {
        // Monta o shape que o renderer já espera: quote_items ← items, customers ← customer.
        const q = {
          ...quoteRow,
          quote_items: Array.isArray(payload?.items) ? payload!.items : [],
          customers: payload?.customer ?? null,
        };
        setQuote(q);

        // A empresa vem do tenant DONO do orçamento (company_id), não do tenant
        // logado (que no link anônimo nem existe). proposal_customization sai daqui.
        if (payload?.company) {
          setCompany(payload.company as unknown as CompanySettings);
          // Repassa o idioma/moeda/fuso da empresa para o PublicAppLocaleProvider pai.
          onLocaleReady({
            language: payload.company.language ?? null,
            currency: payload.company.currency ?? null,
            timezone: payload.company.timezone ?? null,
          });
        }

        // Registra a visualização do cliente — 1x por carga, nunca no preview do dono.
        // Falha é silenciosa: tracking nunca quebra a proposta.
        if (!isPreview && !viewRecordedRef.current && token) {
          viewRecordedRef.current = true;
          supabase
            .rpc('record_quote_view', {
              _token: token,
              _fingerprint: getViewerFingerprint() || undefined,
              _user_agent: navigator.userAgent,
            })
            .then(() => { /* contador atualizado server-side; nada a fazer aqui */ })
            .catch(() => { /* silencioso: tracking nunca quebra a proposta */ });
        }
        if (q.proposal_template_id) {
          const { data: tpl } = await supabase
            .from('proposal_templates')
            .select('slug')
            .eq('id', q.proposal_template_id)
            .single();
          if (tpl) setTemplateSlug(tpl.slug);
        }
      }
      setLoading(false);
    })();
  }, [token]);

  const respond = async (status: 'aprovado' | 'rejeitado') => {
    if (!token) return;
    setResponding(true);
    setRespondNotice(null);

    // A transição enviado -> aprovado|rejeitado roda numa RPC SECURITY DEFINER.
    // Contexto anônimo NÃO pode dar UPDATE direto em quotes (o RLS bloqueia
    // silenciosamente, 0 linhas), então a fonte da verdade é o retorno da RPC:
    // { ok, status?, error? }. Nunca confiamos no status do client.
    const { data, error } = await supabase.rpc('respond_quote_public', {
      _token: token,
      _status: status,
    });
    const result = (data ?? null) as { ok: boolean; status?: string; error?: string } | null;

    // Falha de rede/servidor: NÃO trava done — o cliente pode tentar de novo.
    if (error) {
      setRespondNotice('error');
      setResponding(false);
      return;
    }

    if (result?.ok === true) {
      // Persistiu de verdade → só aqui notificamos a empresa e travamos a tela.
      // Best-effort e server-side: mandamos SÓ o token — a edge resolve status,
      // empresa e destinatários (admins) com service_role. Falha na notificação
      // NUNCA quebra a resposta do cliente, igual ao record_quote_view.
      void (async () => {
        try {
          await supabase.functions.invoke('notify-quote-response', { body: { token } });
        } catch {
          /* silencioso: notificação nunca quebra a proposta */
        }
      })();

      setQuote(prev => (prev ? { ...prev, status: (result.status ?? status) } : prev));
      setResponding(false);
      setDone(true);
      return;
    }

    // ok:false → não transicionou. Caso mais comum: 'not_pending' (já respondido).
    // Sincronizamos o status local com o que o servidor diz (fonte da verdade) e
    // mostramos "já respondido", sem fingir que aprovamos agora.
    if (result?.status) {
      setQuote(prev => (prev ? { ...prev, status: result.status! } : prev));
    }
    setRespondNotice('already');
    setResponding(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 gap-4">
        <FileText className="h-16 w-16 text-gray-300" />
        <p className="text-gray-500 text-lg">{tp.notFound}</p>
      </div>
    );
  }

  const alreadyResponded = ['aprovado', 'rejeitado'].includes(quote.status);
  const canRespond = quote.status === 'enviado' && !alreadyResponded;

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Baixar PDF: botão flutuante no canto inferior direito (desktop + mobile,
          respeitando o safe-area do iOS). Sólido escuro com texto/ícone claro →
          contraste garantido inclusive no hover. Esconde-se no print. */}
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="lg"
              className="fixed right-4 z-50 gap-2 rounded-full shadow-2xl bg-slate-900 text-white hover:bg-slate-800 hover:text-white print:hidden"
              style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }}
              onClick={() => window.print()}
              title={tp.downloadPDFHint}
            >
              <Download className="h-5 w-5" /> {tp.downloadPDF}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left" className="max-w-xs text-center">
            {tp.downloadPDFHint}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <div className="max-w-3xl mx-auto py-8 px-4">
        <div className="print-area proposal-public-pages shadow-xl rounded-xl overflow-hidden">
          <ProposalRenderer quote={quote} company={company} templateSlug={templateSlug} customization={company?.proposal_customization} />
        </div>

        {canRespond && !done && respondNotice !== 'already' && (
          <>
            <div className="flex gap-3 mt-6 max-w-md mx-auto">
              <Button
                className="flex-1 bg-green-600 hover:bg-green-700 text-white h-12 text-base"
                onClick={() => respond('aprovado')}
                disabled={responding}
              >
                <CheckCircle2 className="h-5 w-5 mr-2" /> {tp.approveBtn}
              </Button>
              <Button
                className="flex-1 bg-red-600 hover:bg-red-700 text-white h-12 text-base"
                onClick={() => respond('rejeitado')}
                disabled={responding}
              >
                <XCircle className="h-5 w-5 mr-2" /> {tp.rejectBtn}
              </Button>
            </div>
            {/* Falha de rede: mensagem amigável, botões seguem habilitados p/ retry. */}
            {respondNotice === 'error' && (
              <p className="text-center text-sm text-red-600 mt-3 max-w-md mx-auto">
                {tp.responseError}
              </p>
            )}
          </>
        )}

        {/* Respondeu enquanto olhava (corrida): o servidor disse que já não estava
            pendente. Não fingimos "aprovado agora" — mostramos "já respondido". */}
        {respondNotice === 'already' && !done && (
          <div className="text-center py-6">
            <p className="text-sm text-gray-400">{tp.alreadyResponded}</p>
          </div>
        )}

        {done && (
          <div className="text-center py-6">
            <p className="text-lg font-medium text-gray-600">
              {quote.status === 'aprovado' ? `✅ ${tp.approvedFeedback}` : `❌ ${tp.rejectedFeedback}`}
            </p>
          </div>
        )}

        {alreadyResponded && !done && (
          <div className="text-center py-6">
            <p className="text-sm text-gray-400">
              {quote.status === 'aprovado' ? tp.alreadyApproved : tp.alreadyRejected}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ProposalPublic() {
  const { token: tokenParam } = useParams<{ token: string }>();
  // O param pode vir como token puro (link antigo, 64 hex) OU como
  // `slug-do-destinatario-<token>` (link amigável novo). Extrai sempre o token real.
  const token = extractQuoteToken(tokenParam) ?? tokenParam ?? null;
  const [searchParams] = useSearchParams();
  // `?preview=1` = o próprio vendedor pré-visualizando. Não conta como visualização.
  const isPreview = searchParams.get('preview') === '1';
  // Garante 1 registro de view por carga (evita re-disparo em re-render).
  const viewRecordedRef = useRef(false);

  // Locale da empresa dona do orçamento — preenchido quando o payload chega.
  // O PublicAppLocaleProvider aceita null e cai em pt-br/BRL/São Paulo enquanto
  // os dados não chegam. Ao chamar onLocaleReady o provider re-renderiza com os
  // valores reais da empresa (idioma/moeda/fuso).
  const [companyLocale, setCompanyLocale] = useState<CompanyLocale>({
    language: null,
    currency: null,
    timezone: null,
  });
  const handleLocaleReady = useCallback((l: CompanyLocale) => setCompanyLocale(l), []);

  return (
    <PublicAppLocaleProvider
      language={companyLocale.language}
      currency={companyLocale.currency}
      timezone={companyLocale.timezone}
    >
      <ProposalPublicContent
        token={token}
        isPreview={isPreview}
        viewRecordedRef={viewRecordedRef}
        onLocaleReady={handleLocaleReady}
      />
    </PublicAppLocaleProvider>
  );
}