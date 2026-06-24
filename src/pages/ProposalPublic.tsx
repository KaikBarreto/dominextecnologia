import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, Loader2, FileText, Download } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ProposalRenderer } from '@/components/quotes/ProposalRenderer';
import { extractQuoteToken } from '@/utils/prettyLinks';
import type { Quote } from '@/hooks/useQuotes';
import type { CompanySettings } from '@/hooks/useCompanySettings';

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

function useOgMeta(company: CompanySettings | null) {
  useEffect(() => {
    if (!company) return;
    const cs = company as any;
    const isWhiteLabel = cs.white_label_enabled;
    const companyName = cs.name || 'Proposta';

    // Update title
    document.title = `${companyName} — Proposta Comercial`;

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

    setMeta('og:title', `${companyName} — Proposta Comercial`);
    setMeta('twitter:title', `${companyName} — Proposta Comercial`);
    setMeta('og:description', `Proposta comercial de ${companyName}`);
    setMeta('twitter:description', `Proposta comercial de ${companyName}`);

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
  }, [company]);
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
  const [quote, setQuote] = useState<Quote | null>(null);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [templateSlug, setTemplateSlug] = useState('classico');
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState(false);
  const [done, setDone] = useState(false);

  useOgMeta(company);

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
        if (payload?.company) setCompany(payload.company as unknown as CompanySettings);

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
    await supabase.from('quotes').update({ status }).eq('token', token);
    setQuote(prev => prev ? { ...prev, status } : prev);
    setResponding(false);
    setDone(true);
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
        <p className="text-gray-500 text-lg">Proposta não encontrada.</p>
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
              title="Na janela de impressão, escolha 'Salvar como PDF' e mantenha 'Gráficos de fundo' ligado."
            >
              <Download className="h-5 w-5" /> Baixar PDF
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left" className="max-w-xs text-center">
            Na janela de impressão, escolha "Salvar como PDF" e mantenha "Gráficos de fundo" ligado.
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <div className="max-w-3xl mx-auto py-8 px-4">
        <div className="print-area proposal-public-pages shadow-xl rounded-xl overflow-hidden">
          <ProposalRenderer quote={quote} company={company} templateSlug={templateSlug} customization={company?.proposal_customization} />
        </div>

        {canRespond && !done && (
          <div className="flex gap-3 mt-6 max-w-md mx-auto">
            <Button
              className="flex-1 bg-green-600 hover:bg-green-700 text-white h-12 text-base"
              onClick={() => respond('aprovado')}
              disabled={responding}
            >
              <CheckCircle2 className="h-5 w-5 mr-2" /> Aprovar
            </Button>
            <Button
              className="flex-1 bg-red-600 hover:bg-red-700 text-white h-12 text-base"
              onClick={() => respond('rejeitado')}
              disabled={responding}
            >
              <XCircle className="h-5 w-5 mr-2" /> Rejeitar
            </Button>
          </div>
        )}

        {done && (
          <div className="text-center py-6">
            <p className="text-lg font-medium text-gray-600">
              {quote.status === 'aprovado' ? '✅ Proposta aprovada! Obrigado.' : '❌ Proposta rejeitada.'}
            </p>
          </div>
        )}

        {alreadyResponded && !done && (
          <div className="text-center py-6">
            <p className="text-sm text-gray-400">
              Esta proposta foi {quote.status === 'aprovado' ? 'aprovada' : 'rejeitada'}.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}