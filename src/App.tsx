import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { useForcedLogout } from "@/hooks/useForcedLogout";
import { useCompanyModules, type ModuleCode } from "@/hooks/useCompanyModules";
import { ModuleGateModal, MODULE_INFO } from "@/components/ModuleGateModal";

import { usePageTitle } from "@/hooks/usePageTitle";

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
            <p className="text-muted-foreground text-sm">{this.state.error?.message}</p>
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

// Pages
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import Registration from "./pages/Registration";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import ServiceOrders from "./pages/ServiceOrders";
import ServicesPage from "./pages/Services";
import QuestionnairesPage from "./pages/Questionnaires";
import QuestionnaireDetail from "./pages/QuestionnaireDetail";
import Schedule from "./pages/Schedule";
import Customers from "./pages/Customers";
import CustomerDetail from "./pages/CustomerDetail";
import EquipmentPage from "./pages/Equipment";
import EquipmentDetail from "./pages/EquipmentDetail";
import CRM from "./pages/CRM";
import Inventory from "./pages/Inventory";
import Finance from "./pages/Finance";
import PMOC from "./pages/PMOC";
import Contracts from "./pages/Contracts";
import ContractDetail from "./pages/ContractDetail";
import Users from "./pages/Users";
import Settings from "./pages/Settings";
import Profile from "./pages/Profile";
import MobileMenu from "./pages/MobileMenu";
import Teams from "./pages/Teams";
import TechnicianOS from "./pages/TechnicianOS";
import NotFound from "./pages/NotFound";
import ServiceRating from "./pages/ServiceRating";
import Changelog from "./pages/Changelog";
import Tutorials from "./pages/Tutorials";
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

import AdminCompanies from "./pages/admin/AdminCompanies";
import AdminCompanyDetail from "./pages/admin/AdminCompanyDetail";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminSubscriptions from "./pages/admin/AdminSubscriptions";
import AdminFinancial from "./pages/admin/AdminFinancial";

// Layout
import { AppLayout } from "@/components/layout/AppLayout";

const queryClient = new QueryClient();

// Loading spinner component
const LoadingSpinner = () => (
  <div className="flex min-h-screen items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
  </div>
);

// Determine the default authenticated route based on permissions
function useDefaultRoute() {
  const { hasScreenAccess } = useAuth();
  if (hasScreenAccess('screen:dashboard')) return '/dashboard';
  if (hasScreenAccess('screen:schedule')) return '/agenda';
  if (hasScreenAccess('screen:service_orders')) return '/ordens-servico';
  return '/perfil';
}

// Protected Route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  useForcedLogout();
  
  if (loading) return <LoadingSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  
  return <>{children}</>;
}

// Permission-gated route — redirects to default route if no access
function PermissionRoute({ screenKey, children }: { screenKey: string; children: React.ReactNode }) {
  const { hasScreenAccess, loading, user, roles, permissions } = useAuth();
  const defaultRoute = useDefaultRoute();

  if (loading) return <LoadingSpinner />;
  // If user is authenticated but permissions/roles haven't loaded yet, show spinner instead of redirecting
  if (user && roles.length === 0 && permissions.length === 0) return <LoadingSpinner />;
  if (!hasScreenAccess(screenKey)) return <Navigate to={defaultRoute} replace />;

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

const AppRoutes = () => (
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
    {/* Public rating page */}
    <Route path="/avaliacao/:token" element={<ServiceRating />} />
    {/* Public quote page */}
    <Route path="/orcamento/:token" element={<QuotePublic />} />
    <Route path="/proposta/:token" element={<ProposalPublic />} />
    {/* Public customer portal */}
    <Route path="/portal/:token" element={<CustomerPortal />} />

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
      <Route path="/questionarios" element={<Navigate to="/servicos" replace />} />
      <Route path="/questionarios/:id" element={<PermissionRoute screenKey="screen:services"><QuestionnaireDetail /></PermissionRoute>} />
      <Route path="/agenda" element={<PermissionRoute screenKey="screen:schedule"><Schedule /></PermissionRoute>} />
      <Route path="/clientes" element={<PermissionRoute screenKey="screen:customers"><Customers /></PermissionRoute>} />
      <Route path="/clientes/:id" element={<PermissionRoute screenKey="screen:customers"><CustomerDetail /></PermissionRoute>} />
      <Route path="/equipamentos" element={<PermissionRoute screenKey="screen:equipment"><EquipmentPage /></PermissionRoute>} />
      <Route path="/equipamentos/:id" element={<PermissionRoute screenKey="screen:equipment"><EquipmentDetail /></PermissionRoute>} />
      <Route path="/crm" element={<PermissionRoute screenKey="screen:crm"><ModuleRoute moduleKey="crm"><CRM /></ModuleRoute></PermissionRoute>} />
      <Route path="/orcamentos" element={<PermissionRoute screenKey="screen:crm"><Quotes /></PermissionRoute>} />
      <Route path="/estoque" element={<PermissionRoute screenKey="screen:inventory"><Inventory /></PermissionRoute>} />
      <Route path="/financeiro" element={<PermissionRoute screenKey="screen:finance"><Finance /></PermissionRoute>} />
      <Route path="/financeiro/movimentacoes" element={<PermissionRoute screenKey="screen:finance"><Finance /></PermissionRoute>} />
      <Route path="/financeiro/contas" element={<PermissionRoute screenKey="screen:finance"><Finance /></PermissionRoute>} />
      <Route path="/financeiro/caixas-bancos" element={<PermissionRoute screenKey="screen:finance"><Finance /></PermissionRoute>} />
      <Route path="/financeiro/categorias" element={<PermissionRoute screenKey="screen:finance"><Finance /></PermissionRoute>} />
      <Route path="/financeiro/dre" element={<PermissionRoute screenKey="screen:finance"><Finance /></PermissionRoute>} />
      <Route path="/pmoc" element={<Navigate to="/contratos" replace />} />
      <Route path="/contratos" element={<PermissionRoute screenKey="screen:contracts"><Contracts /></PermissionRoute>} />
      <Route path="/contratos/:id" element={<PermissionRoute screenKey="screen:contracts"><ContractDetail /></PermissionRoute>} />
      <Route path="/usuarios" element={<Navigate to="/configuracoes?tab=usuarios" replace />} />
      <Route path="/configuracoes" element={<PermissionRoute screenKey="screen:settings"><Settings /></PermissionRoute>} />
      <Route path="/perfil" element={<Profile />} />
      <Route path="/equipes" element={<Navigate to="/funcionarios" replace />} />
      <Route path="/funcionarios" element={<PermissionRoute screenKey="screen:employees"><ModuleRoute moduleKey="rh"><Employees /></ModuleRoute></PermissionRoute>} />
      <Route path="/ponto" element={<TimeClock />} />
      <Route path="/rastreamento" element={<Navigate to="/mapa-ao-vivo" replace />} />
      <Route path="/mapa-ao-vivo" element={<LiveMap />} />
      <Route path="/assinatura" element={<Billing />} />
      <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
      <Route path="/admin/dashboard" element={<AdminDashboard />} />
      <Route path="/admin/empresas" element={<AdminCompanies />} />
      <Route path="/admin/empresas/:id" element={<AdminCompanyDetail />} />
      <Route path="/admin/assinaturas" element={<AdminSubscriptions />} />
      <Route path="/admin/financeiro" element={<AdminFinancial />} />
      <Route path="/menu" element={<MobileMenu />} />
      <Route path="/changelog" element={<Changelog />} />
      <Route path="/tutoriais" element={<Tutorials />} />
    </Route>

    {/* Catch-all */}
    <Route path="*" element={<NotFound />} />
  </Routes>
);

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        
        
        <OfflineIndicator />
        <BrowserRouter>
          <PageTitleUpdater />
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
