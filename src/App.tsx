import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useParams, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useForcedLogout } from "@/hooks/useForcedLogout";
import { useCompanyModules, type ModuleCode } from "@/hooks/useCompanyModules";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { segmentHasTechTools } from "@/config/technicianTools";
import { ModuleGateModal, MODULE_INFO } from "@/components/ModuleGateModal";
import { trackUsage } from "@/lib/trackUsage";
import { podeAcessarDomiflixAdmin } from "@/lib/adminDomiflixAccess";
import { getErrorMessage } from "@/utils/errorMessages";

import { usePageTitle } from "@/hooks/usePageTitle";
import { useToast } from "@/hooks/use-toast";

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-6">
          <div className="text-center max-w-md space-y-4">
            <h1 className="text-2xl font-bold">Algo deu errado</h1>
            <p className="text-muted-foreground text-sm">{getErrorMessage(this.state.error)}</p>
            <button
              onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm"
            >
              Recarregar página
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

import { OfflineIndicator } from "@/components/pwa/OfflineIndicator";
import { SwipeBackProvider } from "@/components/SwipeBackProvider";
import { TermsOfServiceWrapper } from "@/components/TermsOfServiceWrapper";

// Pages
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import Registration from "./pages/Registration";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import ServiceOrders from "./pages/ServiceOrders";
import ServicesPage from "./pages/Services";
import ChecklistDetail from "./pages/ChecklistDetail";
import Schedule from "./pages/Schedule";
import Customers from "./pages/Customers";
import CustomerDetail from "./pages/CustomerDetail";
import EquipmentPage from "./pages/Equipment";
import EquipmentDetail from "./pages/EquipmentDetail";
import CRM from "./pages/CRM";
import Inventory from "./pages/Inventory";
import Finance from "./pages/Finance";
import FiscalSettings from "./pages/FiscalSettings";
import NotasFiscais from "./pages/NotasFiscais";
import PMOC from "./pages/PMOC";
import Contracts from "./pages/Contracts";
import ContractDetail from "./pages/ContractDetail";
import ContractSettings from "./pages/ContractSettings";
import Users from "./pages/Users";
import Settings from "./pages/Settings";
import Profile from "./pages/Profile";
import Teams from "./pages/Teams";
import TechnicianTools from "./pages/TechnicianTools";
// Lazy: TechnicianOS importa o anonClient. Carregando sob demanda,
// o bundle do /login fica livre de inicializar dois GoTrueClient na mesma aba.
const TechnicianOS = React.lazy(() => import("./pages/TechnicianOS"));
import NotFound from "./pages/NotFound";
import Changelog from "./pages/Changelog";
// Tutorials removed — replaced by Domiflix
import Employees from "./pages/Employees";
import TimeClock from "./pages/TimeClock";
import Billing from "./pages/Billing";
import TechnicianTracking from "./pages/TechnicianTracking";
import LiveMap from "./pages/LiveMap";
import Checkout from "./pages/Checkout";
import Quotes from "./pages/Quotes";
import QuotePublic from "./pages/QuotePublic";
import ProposalPublic from "./pages/ProposalPublic";
import CustomerPortal from "./pages/CustomerPortal";
// Portal PMOC público (Onda B — v1.9.1). Lazy: rota pública sem auth,
// só carrega quando o cliente final escaneia o QR Code.
const PmocPublicPortal = React.lazy(() => import("./pages/public/PmocPublicPortal"));

import AdminCompanies from "./pages/admin/AdminCompanies";
import AdminCompanyDetail from "./pages/admin/AdminCompanyDetail";
import AdminHealthScore from "./pages/admin/AdminHealthScore";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminFinancial from "./pages/admin/AdminFinancial";
import AdminCRM from "./pages/admin/AdminCRM";
import AdminSettings from "./pages/admin/AdminSettings";
import AdminSalespeople from "./pages/admin/AdminSalespeople";
import AdminSalespersonDetail from "./pages/admin/AdminSalespersonDetail";
import AdminDomiflix from "./pages/admin/AdminDomiflix";

// Domiflix
import { DomiflixLayout } from "@/components/domiflix/DomiflixLayout";
import DomiflixHome from "./pages/Domiflix";
import DomiflixTitle from "./pages/DomiflixTitle";
import DomiflixWatch from "./pages/DomiflixWatch";
import DomiflixMinhaLista from "./pages/DomiflixMinhaLista";
import DomiflixAvatarPicker from "./pages/DomiflixAvatarPicker";

// Layout
import { AppLayout } from "@/components/layout/AppLayout";
import { PageLoading } from "@/components/ui/page-loading";

const queryClient = new QueryClient();

const LoadingSpinner = () => <PageLoading />;

// Determine the default authenticated route based on permissions
function useDefaultRoute() {
  const { hasScreenAccess, isAdminUser, hasAdminScreenAccess, roles } = useAuth();

  // Admin panel users (master + vendedores) land on the admin panel.
  if (isAdminUser) {
    const adminCandidates: Array<[string, string]> = [
      ['admin_empresas', '/admin/empresas'],
      ['admin_dashboard', '/admin/dashboard'],
      ['admin_crm', '/admin/crm'],
      ['admin_vendedores', '/admin/vendedores'],
      ['admin_financeiro', '/admin/financeiro'],
      ['admin_configuracoes', '/admin/configuracoes'],
    ];
    for (const [key, path] of adminCandidates) {
      if (hasAdminScreenAccess(key)) return path;
    }
    return '/admin/empresas';
  }

  // Usuários do app (técnico, gestor restrito, etc.): o destino padrão é a
  // PRIMEIRA tela que o usuário REALMENTE acessa. Nunca devolver um path fixo
  // (ex: /agenda) sem checar permissão — senão, ao desabilitar a tela de destino
  // de um técnico, o PermissionRoute redireciona pra uma rota negada e entra em
  // loop de redirect / tela branca (incidente Domper). A agenda fica primeiro na
  // lista por ser o destino histórico do técnico, mas é só uma preferência de
  // ordem; se ela estiver negada, cai pra próxima tela permitida.
  const appCandidates: Array<[string, string]> = [
    ['screen:schedule', '/agenda'],
    ['screen:service_orders', '/ordens-servico'],
    ['screen:customers', '/clientes'],
    ['screen:equipment', '/equipamentos'],
    ['screen:dashboard', '/dashboard'],
  ];
  for (const [key, path] of appCandidates) {
    if (hasScreenAccess(key)) return path;
  }

  // Fallback seguro: /perfil renderiza <Profile /> direto, fora de qualquer
  // PermissionRoute/ModuleRoute — sempre acessível a qualquer usuário logado.
  // Garante que NUNCA há loop de redirect, mesmo sem nenhuma tela liberada.
  return '/perfil';
}

// Protected Route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, profile, roles, signOut, isAdminUser } = useAuth();
  const { toast } = useToast();
  const location = useLocation();
  useForcedLogout();

  // Bloqueio de conta desativada (profiles.is_active = false). A coluna tem
  // default true no banco, então usuários existentes nunca caem aqui. Só
  // bloqueamos quando o profile JÁ carregou e veio explicitamente false —
  // `is_active` undefined/null (estado parcial) é tratado como ativo.
  // super_admin nunca é bloqueado.
  const isSuperAdmin = roles.includes('super_admin' as any);
  const isDeactivated =
    !!user && !!profile && profile.is_active === false && !isSuperAdmin;

  // Status da assinatura da empresa do usuário logado. Espelha o EcoSistema:
  // empresa com `pending_payment` (criada via link de venda, aguardando o 1º
  // pagamento) fica travada no /checkout em QUALQUER navegação — não só no
  // login. Admin Auctus (super_admin/vendedores) e qualquer usuário SEM empresa
  // (company_id null) não têm assinatura de tenant: a query não roda e nunca
  // redireciona. React Query revalida na próxima navegação / a cada 60s, então
  // quando o webhook marca `active` o cliente é liberado sozinho.
  const companyId = profile?.company_id;
  const checkSubscription = !!user && !!companyId && !isAdminUser;
  const { data: companyStatus, isLoading: companyLoading } = useQuery({
    queryKey: ['protected-route-company-status', companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data, error } = await supabase
        .from('companies')
        // `payment_lock_bypass`: exceção por empresa que libera o uso mesmo
        // estando `pending_payment` (ligada manualmente só pra empresa específica).
        .select('subscription_status, payment_lock_bypass')
        .eq('id', companyId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: checkSubscription,
    staleTime: 60 * 1000,
  });

  React.useEffect(() => {
    if (isDeactivated) {
      toast({
        variant: 'destructive',
        title: 'Conta desativada',
        description:
          'Sua conta foi desativada. Fale com o administrador da empresa.',
      });
      signOut();
    }
  }, [isDeactivated, signOut, toast]);

  if (loading) return <LoadingSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  // Enquanto o signOut da conta desativada não conclui, não renderiza o app.
  if (isDeactivated) return <Navigate to="/login" replace />;

  // Espera a query da company carregar antes de decidir — evita piscar o app
  // pra só depois redirecionar pro checkout. Com staleTime de 60s isso só pesa
  // na 1ª navegação. Só bloqueia o render quando a query está REALMENTE ativa
  // (usuário de tenant); admin/sem-empresa nunca segura aqui.
  if (checkSubscription && companyLoading) return <LoadingSpinner />;

  // Pagamento pendente → trava no /checkout (única rota liberada pro pendente).
  // Exceção: empresas com `payment_lock_bypass === true` usam o sistema normal
  // mesmo pendentes (liberação manual pontual). `as any` porque a coluna pode
  // ainda não estar nos types regenerados. Futuros pendentes seguem travados.
  const hasPaymentLockBypass =
    (companyStatus as any)?.payment_lock_bypass === true;
  if (
    companyStatus?.subscription_status === 'pending_payment' &&
    !hasPaymentLockBypass &&
    location.pathname !== '/checkout'
  ) {
    return <Navigate to="/checkout" replace />;
  }

  return <>{children}</>;
}

// Permission-gated route — redirects to default route if no access
function PermissionRoute({ screenKey, children }: { screenKey: string; children: React.ReactNode }) {
  const { hasScreenAccess, loading, user, roles, permissions, adminPermissions } = useAuth();
  const defaultRoute = useDefaultRoute();

  if (loading) return <LoadingSpinner />;
  // If user is authenticated but permissions/roles haven't loaded yet, show spinner instead of redirecting
  if (user && roles.length === 0 && permissions.length === 0 && adminPermissions.length === 0) return <LoadingSpinner />;
  if (!hasScreenAccess(screenKey)) return <Navigate to={defaultRoute} replace />;

  return <>{children}</>;
}

// Segment-gated route — só libera a rota quando o segmento da empresa bate.
// Enquanto settings carrega, não decide (null) pra não redirecionar à toa.
function SegmentRoute({ segment, children }: { segment: string; children: React.ReactNode }) {
  const { settings, isLoading } = useCompanySettings();

  if (isLoading) return null;
  if (settings?.segment !== segment) return <Navigate to="/" replace />;

  return <>{children}</>;
}

// Ferramentas do Técnico — libera quando o segmento da empresa tem ferramentas
// no registro (`@/config/technicianTools`). Hoje só refrigeração → comportamento
// idêntico ao SegmentRoute("refrigeracao"); ao adicionar um segmento ao registro,
// a rota passa a liberar sozinha.
function TechnicianToolsRoute({ children }: { children: React.ReactNode }) {
  const { settings, isLoading } = useCompanySettings();

  if (isLoading) return null;
  if (!segmentHasTechTools(settings?.segment)) return <Navigate to="/" replace />;

  return <>{children}</>;
}

// Admin-screen-gated route — protege rotas /admin/* via admin_permissions.
// super_admin sempre passa (hasAdminScreenAccess retorna true). Vendedor admin
// só passa se a screenKey estiver listada em admin_permissions.
function AdminScreenRoute({ screenKey, children }: { screenKey: string; children: React.ReactNode }) {
  const { hasAdminScreenAccess, loading, user, roles, permissions, adminPermissions } = useAuth();
  const defaultRoute = useDefaultRoute();

  if (loading) return <LoadingSpinner />;
  // Espera permissions/roles carregarem antes de decidir redirect (evita flicker e race)
  if (user && roles.length === 0 && permissions.length === 0 && adminPermissions.length === 0) return <LoadingSpinner />;
  if (!hasAdminScreenAccess(screenKey)) return <Navigate to={defaultRoute} replace />;

  // TODO temporário: curadoria Domiflix restrita a um e-mail enquanto o conteúdo é montado.
  // Esconde inclusive de master/admins com a permissão. Defesa de UI/rota (UX), NÃO de dados —
  // a segurança real do conteúdo é o RLS das tabelas domiflix_*.
  if (screenKey === 'admin_domiflix' && !podeAcessarDomiflixAdmin(user?.email)) {
    return <Navigate to={defaultRoute} replace />;
  }

  return <>{children}</>;
}

// Module-gated route — shows gate modal if module not available
function ModuleRoute({ moduleKey, children }: { moduleKey: ModuleCode; children: React.ReactNode }) {
  const { hasModule, isLoading } = useCompanyModules();
  const [gateOpen, setGateOpen] = React.useState(false);
  const defaultRoute = useDefaultRoute();
  const info = MODULE_INFO[moduleKey];

  if (isLoading) return <LoadingSpinner />;
  if (!hasModule(moduleKey)) {
    return (
      <>
        <Navigate to={defaultRoute} replace />
        <ModuleGateModal
          open={true}
          onOpenChange={(open) => { if (!open) setGateOpen(false); }}
          moduleName={info?.name || moduleKey}
          moduleDescription={info?.description}
          modulePrice={info?.price}
          moduleCode={moduleKey}
        />
      </>
    );
  }
  return <>{children}</>;
}

// Public Route wrapper (redirects authenticated users)
function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const defaultRoute = useDefaultRoute();
  
  if (loading) return <LoadingSpinner />;
  if (user) return <Navigate to={defaultRoute} replace />;
  
  return <>{children}</>;
}

const PageTitleUpdater = () => { usePageTitle(); return null; };

// Instrumentação MVP — page views.
// Só dispara quando há user autenticado (evita request em landing/login/cadastro).
// trackUsage internamente também checa user, mas pular o getUser() aqui economiza chamadas.
const UsageTracker = () => {
  const location = useLocation();
  const { user } = useAuth();
  React.useEffect(() => {
    if (!user) return;
    trackUsage('page_view', { path: location.pathname });
  }, [location.pathname, user]);
  return null;
};

const AppRoutes = () => (
  <React.Suspense fallback={<LoadingSpinner />}>
  <Routes>
    {/* Landing page — public, no redirect */}
    <Route path="/" element={<Landing />} />

    {/* Auth routes */}
    <Route
      path="/login"
      element={<Auth />}
    />
    {/* Legacy /auth redirect */}
    <Route path="/auth" element={<Navigate to="/login" replace />} />
    <Route
      path="/cadastro"
      element={
        <PublicRoute>
          <Registration />
        </PublicRoute>
      }
    />
    <Route path="/reset-password" element={<ResetPassword />} />
    
    {/* Technician OS - Public route with OS ID */}
    <Route path="/os-tecnico/:id" element={<TechnicianOS />} />
    {/* Public quote page */}
    <Route path="/orcamento/:token" element={<QuotePublic />} />
    <Route path="/proposta/:token" element={<ProposalPublic />} />
    {/* Public customer portal */}
    <Route path="/portal/:token" element={<CustomerPortal />} />
    {/* Portal PMOC público (Onda B v1.9.1) — fora do auth wall, indexável pelo Google */}
    <Route path="/contrato/unidade/:token" element={<PmocPublicPortal />} />
    {/* Alias legado: QR Codes físicos já impressos apontam pro caminho antigo */}
    <Route path="/pmoc/unidade/:token" element={<PmocPublicPortal />} />

    {/* Checkout - full screen, no layout */}
    <Route path="/checkout" element={<ProtectedRoute><Checkout /></ProtectedRoute>} />

    {/* Protected Routes */}
    <Route
      element={
        <ProtectedRoute>
          <AppLayout />
        </ProtectedRoute>
      }
    >
      <Route path="/dashboard" element={<PermissionRoute screenKey="screen:dashboard"><Dashboard /></PermissionRoute>} />
      <Route path="/ordens-servico" element={<PermissionRoute screenKey="screen:service_orders"><ServiceOrders /></PermissionRoute>} />
      <Route path="/servicos" element={<PermissionRoute screenKey="screen:services"><ServicesPage /></PermissionRoute>} />
      <Route path="/checklists" element={<Navigate to="/servicos" replace />} />
      <Route path="/checklists/:id" element={<PermissionRoute screenKey="screen:services"><ChecklistDetail /></PermissionRoute>} />
      {/* Back-compat: rotas antigas /questionarios redirecionam para as novas /checklists */}
      <Route path="/questionarios" element={<Navigate to="/checklists" replace />} />
      <Route path="/questionarios/:id" element={<RedirectQuestionariosToChecklists />} />
      <Route path="/agenda" element={<PermissionRoute screenKey="screen:schedule"><Schedule /></PermissionRoute>} />
      <Route path="/clientes" element={<PermissionRoute screenKey="screen:customers"><Customers /></PermissionRoute>} />
      <Route path="/clientes/:id" element={<PermissionRoute screenKey="screen:customers"><CustomerDetail /></PermissionRoute>} />
      <Route path="/equipamentos" element={<PermissionRoute screenKey="screen:equipment"><EquipmentPage /></PermissionRoute>} />
      <Route path="/equipamentos/:id" element={<PermissionRoute screenKey="screen:equipment"><EquipmentDetail /></PermissionRoute>} />
      <Route path="/crm" element={<PermissionRoute screenKey="screen:crm"><ModuleRoute moduleKey="crm"><CRM /></ModuleRoute></PermissionRoute>} />
      <Route path="/orcamentos" element={<PermissionRoute screenKey="screen:quotes"><Quotes /></PermissionRoute>} />
      <Route path="/estoque" element={<PermissionRoute screenKey="screen:inventory"><Inventory /></PermissionRoute>} />
      {/* "Financeiro" virou GRUPO com 3 telas próprias (cada uma com no máx. 1
         nível de navegação). /financeiro entra na tela de Relatório. */}
      <Route path="/financeiro" element={<Navigate to="/financeiro/relatorio" replace />} />
      <Route path="/financeiro/relatorio" element={<PermissionRoute screenKey="screen:finance"><Finance /></PermissionRoute>} />
      <Route path="/financeiro/movimentacoes" element={<PermissionRoute screenKey="screen:finance"><Finance /></PermissionRoute>} />
      <Route path="/financeiro/contas" element={<PermissionRoute screenKey="screen:finance"><Finance /></PermissionRoute>} />
      {/* URLs antigas → redirecionam pra não dar 404. */}
      <Route path="/financeiro/dre" element={<Navigate to="/financeiro/relatorio?tab=dre" replace />} />
      <Route path="/financeiro/caixas-bancos" element={<Navigate to="/financeiro/movimentacoes" replace />} />
      <Route path="/financeiro/categorias" element={<Navigate to="/financeiro/movimentacoes" replace />} />
      <Route path="/financeiro/configuracoes" element={<Navigate to="/financeiro/movimentacoes" replace />} />
      {/* Notas Fiscais (NFS-e via Fisqal) — gateada pelo módulo pago `nfe`. */}
      <Route path="/notas-fiscais/configuracoes" element={<PermissionRoute screenKey="screen:fiscal_notes"><ModuleRoute moduleKey="nfe"><FiscalSettings /></ModuleRoute></PermissionRoute>} />
      <Route path="/notas-fiscais" element={<PermissionRoute screenKey="screen:fiscal_notes"><ModuleRoute moduleKey="nfe"><NotasFiscais /></ModuleRoute></PermissionRoute>} />
      <Route path="/pmoc" element={<PMOC />} />
      <Route path="/contratos" element={<PermissionRoute screenKey="screen:contracts"><ModuleRoute moduleKey="contracts"><Contracts /></ModuleRoute></PermissionRoute>} />
      <Route path="/contratos/:id" element={<PermissionRoute screenKey="screen:contracts"><ModuleRoute moduleKey="contracts"><ContractDetail /></ModuleRoute></PermissionRoute>} />
      {/* Path estático (não /contratos/configuracoes) pra não colidir com /contratos/:id do ContractDetail. */}
      <Route path="/configuracoes-contrato" element={<PermissionRoute screenKey="screen:contracts"><ModuleRoute moduleKey="contracts"><ContractSettings /></ModuleRoute></PermissionRoute>} />
      {/* Rota antiga: redireciona direto pra aba RT da nova tela (mantém bookmarks/links). */}
      <Route path="/responsaveis-tecnicos" element={<Navigate to="/configuracoes-contrato?tab=rt" replace />} />
      <Route path="/usuarios" element={<Navigate to="/configuracoes?tab=usuarios" replace />} />
      <Route path="/configuracoes" element={<PermissionRoute screenKey="screen:settings"><Settings /></PermissionRoute>} />
      <Route path="/perfil" element={<Profile />} />
      <Route path="/equipes" element={<Navigate to="/funcionarios" replace />} />
      <Route path="/funcionarios" element={<PermissionRoute screenKey="screen:employees"><ModuleRoute moduleKey="rh"><Employees /></ModuleRoute></PermissionRoute>} />
      <Route path="/ponto" element={<TimeClock />} />
      <Route path="/rastreamento" element={<Navigate to="/mapa-ao-vivo" replace />} />
      <Route path="/mapa-ao-vivo" element={<LiveMap />} />
      {/* Ferramentas do Técnico — hub client-side/offline. Sub-rotas internas
         via <Routes> dentro da página, então registra com /* (wildcard). */}
      <Route path="/ferramentas-tecnico/*" element={<PermissionRoute screenKey="screen:technician_tools"><TechnicianToolsRoute><TechnicianTools /></TechnicianToolsRoute></PermissionRoute>} />
      <Route path="/assinatura" element={<Billing />} />
      <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
      <Route path="/admin/dashboard" element={<AdminScreenRoute screenKey="admin_dashboard"><AdminDashboard /></AdminScreenRoute>} />
      <Route path="/admin/empresas" element={<AdminScreenRoute screenKey="admin_empresas"><AdminCompanies /></AdminScreenRoute>} />
      <Route path="/admin/empresas/:id" element={<AdminScreenRoute screenKey="admin_empresas"><AdminCompanyDetail /></AdminScreenRoute>} />
      <Route path="/admin/health-score" element={<AdminScreenRoute screenKey="admin_health_score"><AdminHealthScore /></AdminScreenRoute>} />
      <Route path="/admin/financeiro" element={<AdminScreenRoute screenKey="admin_financeiro"><AdminFinancial /></AdminScreenRoute>} />
      <Route path="/admin/crm" element={<AdminScreenRoute screenKey="admin_crm"><AdminCRM /></AdminScreenRoute>} />
      <Route path="/admin/vendedores" element={<AdminScreenRoute screenKey="admin_vendedores"><AdminSalespeople /></AdminScreenRoute>} />
      <Route path="/admin/vendedores/:id" element={<AdminScreenRoute screenKey="admin_vendedores"><AdminSalespersonDetail /></AdminScreenRoute>} />
      <Route path="/admin/configuracoes" element={<AdminScreenRoute screenKey="admin_configuracoes"><AdminSettings /></AdminScreenRoute>} />
      <Route path="/admin/domiflix" element={<AdminScreenRoute screenKey="admin_domiflix"><AdminDomiflix /></AdminScreenRoute>} />
      <Route path="/changelog" element={<Changelog />} />
      <Route path="/tutoriais" element={<Navigate to="/domiflix" replace />} />
      <Route path="/tutoriais/:titleId" element={<Navigate to="/domiflix" replace />} />
      <Route path="/tutorials" element={<Navigate to="/domiflix" replace />} />
    </Route>

    {/* Domiflix — fullscreen layout próprio */}
    <Route
      element={
        <ProtectedRoute>
          <div className="domiflix-app min-h-screen">
            <DomiflixLayout />
          </div>
        </ProtectedRoute>
      }
    >
      <Route path="/domiflix" element={<DomiflixHome />} />
      <Route path="/domiflix/minha-lista" element={<DomiflixMinhaLista />} />
      <Route path="/domiflix/perfil" element={<DomiflixAvatarPicker />} />
      <Route path="/domiflix/:titleSlug" element={<DomiflixTitle />} />
    </Route>

    {/* Domiflix Player — rota dedicada tela cheia, sem layout (sem navbar /
        bottom nav / footer) para imersão total no vídeo. */}
    <Route
      path="/domiflix/assistir/:titleSlug/:episodeNumber"
      element={<ProtectedRoute><DomiflixWatch /></ProtectedRoute>}
    />
    <Route
      path="/domiflix/assistir/:titleSlug/:episodeNumber/:startSeconds"
      element={<ProtectedRoute><DomiflixWatch /></ProtectedRoute>}
    />

    {/* Legacy OS share link: /:uuid -> /os-tecnico/:uuid?modo=cliente */}
    <Route path="/:osId" element={<OSRedirect />} />

    {/* Catch-all */}
    <Route path="*" element={<NotFound />} />
  </Routes>
  </React.Suspense>
);

// Redirect legacy OS share links (/:uuid) to /os-tecnico/:uuid?modo=cliente
function OSRedirect() {
  const { osId } = useParams();
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(osId || '');
  if (isUUID) {
    return <Navigate to={`/os-tecnico/${osId}?modo=cliente`} replace />;
  }
  return <NotFound />;
}

// Back-compat: link antigo /questionarios/:id redireciona pro novo /checklists/:id preservando o id.
function RedirectQuestionariosToChecklists() {
  const { id } = useParams();
  return <Navigate to={`/checklists/${id}`} replace />;
}

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />


        <BrowserRouter>
          <OfflineIndicator />
          <PageTitleUpdater />
          <AuthProvider>
            <UsageTracker />
            <SwipeBackProvider>
              <TermsOfServiceWrapper>
                <AppRoutes />
              </TermsOfServiceWrapper>
            </SwipeBackProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
