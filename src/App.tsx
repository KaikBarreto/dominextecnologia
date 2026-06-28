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
import { segmentHasTechTools } from "@/config/technicianArea";
import { ModuleGateModal, MODULE_INFO } from "@/components/ModuleGateModal";
import { trackUsage } from "@/lib/trackUsage";
import { podeAcessarDomiflixAdmin } from "@/lib/adminDomiflixAccess";
import { getErrorMessage } from "@/utils/errorMessages";

import { usePageTitle } from "@/hooks/usePageTitle";
import { useMarketingViewport } from "@/hooks/useMarketingViewport";
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
import { SwipeBackProvider } from "@/components/SwipeBack";
import { TermsOfServiceWrapper } from "@/components/TermsOfServiceWrapper";

// Pages
import Landing from "./pages/Landing";
// Landings de segmento (SEO) — públicas, sem redirect. Data-driven em src/pages/segmentos.
import SistemaParaRefrigeracao from "./pages/segmentos/SistemaParaRefrigeracao";
import SistemaParaEletricistas from "./pages/segmentos/SistemaParaEletricistas";
import SistemaParaEnergiaSolar from "./pages/segmentos/SistemaParaEnergiaSolar";
import SistemaParaProvedores from "./pages/segmentos/SistemaParaProvedores";
import SistemaParaCftv from "./pages/segmentos/SistemaParaCftv";
import SistemaParaConstrucaoCivil from "./pages/segmentos/SistemaParaConstrucaoCivil";
import SistemaParaElevadores from "./pages/segmentos/SistemaParaElevadores";
import SistemaParaLimpezaConservacao from "./pages/segmentos/SistemaParaLimpezaConservacao";
import SistemaParaDedetizacao from "./pages/segmentos/SistemaParaDedetizacao";
// Landings de módulo (aba "Soluções", SEO) — públicas, sem redirect. Data-driven
// em src/pages/modulos. Uma rota por slug de modulesData; o prerender captura.
import OsDigital from "./pages/modulos/OsDigital";
import SistemaPmoc from "./pages/modulos/SistemaPmoc";
import CrmModulo from "./pages/modulos/CrmModulo";
import ControleFinanceiro from "./pages/modulos/ControleFinanceiro";
import PontoEFolha from "./pages/modulos/PontoEFolha";
import EmissaoDeNfse from "./pages/modulos/EmissaoDeNfse";
import PortalDoCliente from "./pages/modulos/PortalDoCliente";
import ControleDeEstoque from "./pages/modulos/ControleDeEstoque";
import OrcamentosEContratos from "./pages/modulos/OrcamentosEContratos";
import RastreamentoDeEquipes from "./pages/modulos/RastreamentoDeEquipes";
import AreaDoTecnico from "./pages/modulos/AreaDoTecnico";
// Páginas legais públicas — pequenas, mantidas EAGER (linkadas no rodapé da landing).
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfUse from "./pages/TermsOfUse";
import QuemSomos from "./pages/QuemSomos";
import Blog from "./pages/Blog";
import BlogPost from "./pages/BlogPost";

// ─────────────────────────────────────────────────────────────────────────────
// CODE-SPLITTING POR ROTA — performance da landing pública.
//
// As páginas de MARKETING (Landing, /sistema-para-*, /os-digital, etc. acima) e
// as legais ficam EAGER: precisam estar no caminho mais curto do primeiro paint
// e o prerender (scripts/prerender.mjs) exige que o H1 real já esteja no DOM.
//
// Todo o resto — app autenticado (dashboard, OS, financeiro, admin, Domiflix),
// auth e rotas públicas pontuais (portal, orçamento, ponto) — vira React.lazy:
// o visitante da landing NÃO baixa mais o app inteiro no entry chunk. O fallback
// de Suspense é leve (<PageLoading/>) e nunca aparece no prerender porque o
// prerender só visita rotas de marketing (todas eager).
// ─────────────────────────────────────────────────────────────────────────────
const Auth = React.lazy(() => import("./pages/Auth"));
const Registration = React.lazy(() => import("./pages/Registration"));
const ResetPassword = React.lazy(() => import("./pages/ResetPassword"));
const Dashboard = React.lazy(() => import("./pages/Dashboard"));
const ServiceOrders = React.lazy(() => import("./pages/ServiceOrders"));
const ServicesPage = React.lazy(() => import("./pages/Services"));
const ChecklistDetail = React.lazy(() => import("./pages/ChecklistDetail"));
const Schedule = React.lazy(() => import("./pages/Schedule"));
const Customers = React.lazy(() => import("./pages/Customers"));
const CustomerDetail = React.lazy(() => import("./pages/CustomerDetail"));
const EquipmentPage = React.lazy(() => import("./pages/Equipment"));
const EquipmentDetail = React.lazy(() => import("./pages/EquipmentDetail"));
const CRM = React.lazy(() => import("./pages/CRM"));
const Inventory = React.lazy(() => import("./pages/Inventory"));
const Finance = React.lazy(() => import("./pages/Finance"));
const FiscalSettings = React.lazy(() => import("./pages/FiscalSettings"));
const NotasFiscais = React.lazy(() => import("./pages/NotasFiscais"));
const PMOC = React.lazy(() => import("./pages/PMOC"));
const Contracts = React.lazy(() => import("./pages/Contracts"));
const ContractDetail = React.lazy(() => import("./pages/ContractDetail"));
const ContractSettings = React.lazy(() => import("./pages/ContractSettings"));
const Users = React.lazy(() => import("./pages/Users"));
const Settings = React.lazy(() => import("./pages/Settings"));
const Profile = React.lazy(() => import("./pages/Profile"));
const TechnicianArea = React.lazy(() => import("./pages/TechnicianArea"));
// Lazy: TechnicianOS importa o anonClient. Carregando sob demanda,
// o bundle do /login fica livre de inicializar dois GoTrueClient na mesma aba.
const TechnicianOS = React.lazy(() => import("./pages/TechnicianOS"));
const NotFound = React.lazy(() => import("./pages/NotFound"));
const Changelog = React.lazy(() => import("./pages/Changelog"));
const Employees = React.lazy(() => import("./pages/Employees"));
const PontoPublico = React.lazy(() => import("./pages/PontoPublico"));
const Billing = React.lazy(() => import("./pages/Billing"));
const LiveMap = React.lazy(() => import("./pages/LiveMap"));
const Checkout = React.lazy(() => import("./pages/Checkout"));
const Quotes = React.lazy(() => import("./pages/Quotes"));
const QuotePublic = React.lazy(() => import("./pages/QuotePublic"));
const ProposalPublic = React.lazy(() => import("./pages/ProposalPublic"));
const CustomerPortal = React.lazy(() => import("./pages/CustomerPortal"));
// Portal PMOC público (Onda B — v1.9.1). Lazy: rota pública sem auth,
// só carrega quando o cliente final escaneia o QR Code.
const PmocPublicPortal = React.lazy(() => import("./pages/public/PmocPublicPortal"));

const AdminCompanies = React.lazy(() => import("./pages/admin/AdminCompanies"));
const AdminCompanyDetail = React.lazy(() => import("./pages/admin/AdminCompanyDetail"));
const AdminHealthScore = React.lazy(() => import("./pages/admin/AdminHealthScore"));
const AdminDashboard = React.lazy(() => import("./pages/admin/AdminDashboard"));
const AdminBlog = React.lazy(() => import("./pages/admin/AdminBlog"));
const AdminBlogEditor = React.lazy(() => import("./pages/admin/AdminBlogEditor"));
const AdminFinancial = React.lazy(() => import("./pages/admin/AdminFinancial"));
const AdminCRM = React.lazy(() => import("./pages/admin/AdminCRM"));
const AdminSettings = React.lazy(() => import("./pages/admin/AdminSettings"));
const AdminSalespeople = React.lazy(() => import("./pages/admin/AdminSalespeople"));
const AdminSalespersonDetail = React.lazy(() => import("./pages/admin/AdminSalespersonDetail"));
const AdminDomiflix = React.lazy(() => import("./pages/admin/AdminDomiflix"));

// Domiflix — fullscreen, fora do caminho da landing → tudo lazy.
const DomiflixLayout = React.lazy(() =>
  import("@/components/domiflix/DomiflixLayout").then((m) => ({ default: m.DomiflixLayout }))
);
const DomiflixHome = React.lazy(() => import("./pages/Domiflix"));
const DomiflixTitle = React.lazy(() => import("./pages/DomiflixTitle"));
const DomiflixWatch = React.lazy(() => import("./pages/DomiflixWatch"));
const DomiflixMinhaLista = React.lazy(() => import("./pages/DomiflixMinhaLista"));
const DomiflixAvatarPicker = React.lazy(() => import("./pages/DomiflixAvatarPicker"));

// Layout — só carrega quando entra numa rota autenticada (lazy).
const AppLayout = React.lazy(() =>
  import("@/components/layout/AppLayout").then((m) => ({ default: m.AppLayout }))
);
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

// Área do Técnico™ — libera quando o segmento da empresa tem ferramentas
// no registro (`@/config/technicianArea`). Hoje só refrigeração → comportamento
// idêntico ao SegmentRoute("refrigeracao"); ao adicionar um segmento ao registro,
// a rota passa a liberar sozinha.
function TechnicianAreaRoute({ children }: { children: React.ReactNode }) {
  const { settings, isLoading } = useCompanySettings();

  if (isLoading) return null;
  if (!segmentHasTechTools(settings?.segment)) return <Navigate to="/" replace />;

  return <>{children}</>;
}

// Retrocompat: a rota antiga era `/ferramentas-tecnico` (renomeada para
// `/area-tecnico` na "Área do Técnico™"). Links/deep-links antigos
// (catálogo, gás, modelo) continuam funcionando: preserva subpath + query.
function LegacyTechnicianToolsRedirect() {
  const location = useLocation();
  const rest = location.pathname.replace(/^\/ferramentas-tecnico/, '');
  return <Navigate to={`/area-tecnico${rest}${location.search}`} replace />;
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

// Alterna a meta viewport por rota: zoom liberado no site de marketing (a11y),
// fixo no app logado (sensação de app nativo). Fica dentro do BrowserRouter.
const ViewportManager = () => { useMarketingViewport(); return null; };

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

    {/* Landings de segmento (SEO) — públicas, sem redirect. Uma rota por slug
        de segmentsData; o prerender captura os slugs automaticamente. */}
    <Route path="/sistema-para-refrigeracao" element={<SistemaParaRefrigeracao />} />
    <Route path="/sistema-para-eletricistas" element={<SistemaParaEletricistas />} />
    <Route path="/sistema-para-energia-solar" element={<SistemaParaEnergiaSolar />} />
    <Route path="/sistema-para-provedores" element={<SistemaParaProvedores />} />
    <Route path="/sistema-para-cftv" element={<SistemaParaCftv />} />
    <Route path="/sistema-para-construcao-civil" element={<SistemaParaConstrucaoCivil />} />
    <Route path="/sistema-para-elevadores" element={<SistemaParaElevadores />} />
    <Route path="/sistema-para-limpeza-conservacao" element={<SistemaParaLimpezaConservacao />} />
    <Route path="/sistema-para-dedetizacao" element={<SistemaParaDedetizacao />} />

    {/* Landings de módulo (aba "Soluções", SEO) — públicas, sem redirect. Uma
        rota por slug de modulesData; o prerender captura os slugs.
        NOTA: o slug do módulo CRM é /sistema-crm porque /crm já é a tela
        AUTENTICADA do CRM (bloco protegido abaixo). Colisão de path devolvida
        ao Tech Lead — ver retorno do dev. */}
    <Route path="/os-digital" element={<OsDigital />} />
    <Route path="/sistema-pmoc" element={<SistemaPmoc />} />
    <Route path="/sistema-crm" element={<CrmModulo />} />
    <Route path="/controle-financeiro" element={<ControleFinanceiro />} />
    <Route path="/ponto-e-folha" element={<PontoEFolha />} />
    <Route path="/emissao-de-nfse" element={<EmissaoDeNfse />} />
    <Route path="/portal-do-cliente" element={<PortalDoCliente />} />
    <Route path="/controle-de-estoque" element={<ControleDeEstoque />} />
    <Route path="/orcamentos-e-contratos" element={<OrcamentosEContratos />} />
    <Route path="/rastreamento-de-equipes" element={<RastreamentoDeEquipes />} />
    <Route path="/area-do-tecnico" element={<AreaDoTecnico />} />

    {/* Páginas institucionais / legais públicas — linkadas no rodapé. */}
    <Route path="/quem-somos" element={<QuemSomos />} />
    <Route path="/blog" element={<Blog />} />
    <Route path="/blog/:slug" element={<BlogPost />} />
    <Route path="/privacidade" element={<PrivacyPolicy />} />
    <Route path="/termos" element={<TermsOfUse />} />

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
    {/* Ponto eletrônico por link público — anônimo, fora do AppLayout. O
       funcionário bate o ponto deslogado; tudo passa pela edge time-clock-portal. */}
    <Route path="/ponto/:slug" element={<PontoPublico />} />
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
      <Route path="/rastreamento" element={<Navigate to="/mapa-ao-vivo" replace />} />
      <Route path="/mapa-ao-vivo" element={<LiveMap />} />
      {/* Área do Técnico™ — hub client-side/offline. Sub-rotas internas
         via <Routes> dentro da página, então registra com /* (wildcard). */}
      <Route path="/area-tecnico/*" element={<PermissionRoute screenKey="screen:technician_tools"><TechnicianAreaRoute><TechnicianArea /></TechnicianAreaRoute></PermissionRoute>} />
      {/* Retrocompat da rota antiga → preserva subpath/query. */}
      <Route path="/ferramentas-tecnico/*" element={<LegacyTechnicianToolsRedirect />} />
      <Route path="/assinatura" element={<Billing />} />
      <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
      <Route path="/admin/dashboard" element={<AdminScreenRoute screenKey="admin_dashboard"><AdminDashboard /></AdminScreenRoute>} />
      <Route path="/admin/blog" element={<AdminScreenRoute screenKey="admin_blog"><AdminBlog /></AdminScreenRoute>} />
      <Route path="/admin/blog/novo" element={<AdminScreenRoute screenKey="admin_blog"><AdminBlogEditor /></AdminScreenRoute>} />
      <Route path="/admin/blog/:id" element={<AdminScreenRoute screenKey="admin_blog"><AdminBlogEditor /></AdminScreenRoute>} />
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
          <ViewportManager />
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
