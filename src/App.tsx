import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { useForcedLogout } from "@/hooks/useForcedLogout";
import { UpdateBanner } from "@/components/pwa/UpdateBanner";

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

// Protected Route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  useForcedLogout();
  
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
}

// Public Route wrapper (redirects authenticated users)
function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      </div>
    );
  }
  
  if (user) {
    return <Navigate to="/dashboard" replace />;
  }
  
  return <>{children}</>;
}

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
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/ordens-servico" element={<ServiceOrders />} />
      <Route path="/servicos" element={<ServicesPage />} />
      <Route path="/questionarios" element={<QuestionnairesPage />} />
      <Route path="/questionarios/:id" element={<QuestionnaireDetail />} />
      <Route path="/agenda" element={<Schedule />} />
      <Route path="/clientes" element={<Customers />} />
      <Route path="/clientes/:id" element={<CustomerDetail />} />
      <Route path="/equipamentos" element={<EquipmentPage />} />
      <Route path="/equipamentos/:id" element={<EquipmentDetail />} />
      <Route path="/crm" element={<CRM />} />
      <Route path="/orcamentos" element={<Quotes />} />
      <Route path="/estoque" element={<Inventory />} />
      <Route path="/financeiro" element={<Finance />} />
      <Route path="/pmoc" element={<Navigate to="/contratos" replace />} />
      <Route path="/contratos" element={<Contracts />} />
      <Route path="/contratos/:id" element={<ContractDetail />} />
      <Route path="/usuarios" element={<Users />} />
      <Route path="/configuracoes" element={<Settings />} />
      <Route path="/perfil" element={<Profile />} />
      <Route path="/equipes" element={<Teams />} />
      <Route path="/funcionarios" element={<Employees />} />
      <Route path="/rastreamento" element={<TechnicianTracking />} />
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
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <UpdateBanner />
      
      <OfflineIndicator />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
