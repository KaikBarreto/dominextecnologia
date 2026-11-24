import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { ExternalLink, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyModules } from '@/hooks/useCompanyModules';
import { canReadPdvDemoPreview, isTrustedPdvDemoBridgeEvent, PDV_DEMO_EMAIL, usePdvLiveDemoReview } from '@/hooks/usePdvLiveDemoReview';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return <main className="flex min-h-dvh items-center justify-center bg-background p-4"><Card className="w-full max-w-lg"><CardContent className="space-y-4 p-6"><h1 className="text-xl font-bold">{title}</h1>{children}</CardContent></Card></main>;
}

function AuthenticatedDemoPreview() {
  const auth = useAuth();
  const modules = useCompanyModules();
  const access = {
    development: import.meta.env.DEV,
    email: auth.user?.email,
    userId: auth.user?.id,
    companyId: auth.profile?.company_id,
    loading: auth.loading || auth.profileLoading || modules.isLoading,
    active: auth.profile?.is_active !== false,
    moduleAllowed: modules.hasModule('pdv') && modules.hasScreen('screen:pdv'),
    screenAllowed: auth.hasScreenAccess('screen:pdv'),
  };
  const allowed = canReadPdvDemoPreview(access);
  const query = usePdvLiveDemoReview(access, auth.hasScreenAccess('screen:customers') && modules.hasScreen('screen:customers'));
  const frame = useRef<HTMLIFrameElement>(null);
  const [nonce] = useState(() => crypto.randomUUID());
  const previewOrigin = window.location.origin;
  const [connected, setConnected] = useState(false);
  const send = useCallback(() => {
    if (!allowed || !query.data || query.isError || !frame.current?.contentWindow) return;
    frame.current.contentWindow.postMessage({ type: 'dominex-demo-data', nonce, payload: query.data }, previewOrigin);
  }, [allowed, query.data, query.isError, nonce, previewOrigin]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (!isTrustedPdvDemoBridgeEvent(event, frame.current?.contentWindow ?? null, nonce, previewOrigin)) return;
      setConnected(true);
      send();
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [nonce, send, previewOrigin]);
  useEffect(() => { if (connected) send(); }, [connected, send]);

  if (access.loading) return <Notice title="Confirmando acesso"><p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Aguarde a conta demo carregar.</p></Notice>;
  if (!allowed) return <Notice title="PDV indisponível nesta conta"><p className="text-sm text-muted-foreground">A conta demo precisa de empresa ativa, módulo PDV e permissão para operar o caixa.</p><Button asChild variant="outline"><Link to="/">Voltar ao app</Link></Button></Notice>;
  if (query.isPending) return <Notice title="Carregando dados reais"><p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Buscando produtos, fotos, clientes e contas da demo.</p></Notice>;
  if (query.isError || !query.data) return <Notice title="Não foi possível carregar a demo"><p className="text-sm text-muted-foreground">Confira a conexão e o acesso ao PDV. Nenhum pedido foi criado ou alterado.</p><Button onClick={() => void query.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Tentar novamente</Button></Notice>;

  return <main className="flex h-dvh flex-col bg-background">
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
      <div><h1 className="flex items-center gap-2 text-sm font-bold"><ShieldCheck className="h-4 w-4" />{query.data.company.name} · catálogo real</h1><p className="mt-1 text-xs text-muted-foreground">Produtos, fotos, clientes e contas reais. Pedidos, cupons, créditos e pagamentos são simulações locais.</p></div>
      <div className="flex items-center gap-2"><Button size="sm" variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching}><RefreshCw className="mr-2 h-4 w-4" />Atualizar dados</Button><Button size="sm" variant="outline" asChild><Link to="/pdv"><ExternalLink className="mr-2 h-4 w-4" />Abrir app</Link></Button></div>
    </header>
    <iframe ref={frame} title="Proposta do PDV com catálogo real da conta demo" className="min-h-0 w-full flex-1 border-0" src={`${previewOrigin}/.context/pdv-live-preview/index.html?real-demo=1&bridge=${encodeURIComponent(nonce)}`} sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-downloads" />
    {!connected && <p role="status" className="shrink-0 px-4 py-2 text-xs text-muted-foreground">Aguardando a prévia conectar aos dados da conta demo.</p>}
  </main>;
}

/** Rota exclusivamente DEV; o hook confirma a sessão no Auth antes de consultar. */
export default function PdvLiveDemoReview() {
  const { user, loading, profileLoading } = useAuth();
  const [params] = useSearchParams();
  if (!import.meta.env.DEV) return null;
  if (loading || profileLoading) return <Notice title="Confirmando sessão"><p className="text-sm text-muted-foreground">Aguarde.</p></Notice>;
  if (!user) return <Notice title="Entre na conta demo"><p className="text-sm text-muted-foreground">Entre pelo login normal com {PDV_DEMO_EMAIL}. Depois, volte para esta página. Não é necessário compartilhar sua senha com o agente.</p><Button asChild><Link to="/login">Abrir login do app</Link></Button></Notice>;
  if (user.email?.trim().toLowerCase() !== PDV_DEMO_EMAIL) return <Notice title="Use a conta demo"><p className="text-sm text-muted-foreground">Esta prévia só consulta a conta {PDV_DEMO_EMAIL}. Troque de conta no app e volte para esta página.</p><Button asChild variant="outline"><Link to="/">Voltar ao app</Link></Button></Notice>;
  // O destino padrão é a aplicação real, com o shell e as operações canônicas.
  // A ponte HTML permanece somente como laboratório explícito de comparação.
  return params.get('laboratorio') === 'catalogo' ? <AuthenticatedDemoPreview /> : <Navigate to="/pdv" replace />;
}
