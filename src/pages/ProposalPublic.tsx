import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, Loader2, FileText } from 'lucide-react';
import { ProposalRenderer } from '@/components/quotes/ProposalRenderer';
import type { Quote } from '@/hooks/useQuotes';
import type { CompanySettings } from '@/hooks/useCompanySettings';

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
  const { token } = useParams<{ token: string }>();
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
      const [quoteRes, companyRes] = await Promise.all([
        supabase.rpc('get_quote_by_token', { _token: token }),
        supabase.from('company_settings').select('*').limit(1).single(),
      ]);

      const quoteRow = Array.isArray(quoteRes.data) ? quoteRes.data[0] : quoteRes.data;
      if (quoteRow) {
        // Carregar itens e cliente separadamente (RPC retorna apenas a quote)
        const [itemsRes, customerRes] = await Promise.all([
          supabase.from('quote_items').select('*').eq('quote_id', (quoteRow as any).id),
          (quoteRow as any).customer_id
            ? supabase.from('customers').select('name, email, phone').eq('id', (quoteRow as any).customer_id).maybeSingle()
            : Promise.resolve({ data: null }),
        ]);
        const q = { ...(quoteRow as any), quote_items: itemsRes.data || [], customers: customerRes.data };
        setQuote(q);
        if (q.proposal_template_id) {
          const { data: tpl } = await supabase
            .from('proposal_templates')
            .select('slug')
            .eq('id', q.proposal_template_id)
            .single();
          if (tpl) setTemplateSlug(tpl.slug);
        }
      }
      if (companyRes.data) setCompany(companyRes.data as unknown as CompanySettings);
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
      <div className="max-w-3xl mx-auto py-8 px-4">
        <div className="shadow-xl rounded-xl overflow-hidden">
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