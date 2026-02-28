import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";

// Pages
import Auth from "./pages/Auth";
import Registration from "./pages/Registration";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import ServiceOrders from "./pages/ServiceOrders";
import Schedule from "./pages/Schedule";
import Customers from "./pages/Customers";
import EquipmentPage from "./pages/Equipment";
import EquipmentDetail from "./pages/EquipmentDetail";
import CRM from "./pages/CRM";
import Inventory from "./pages/Inventory";
import Finance from "./pages/Finance";
import PMOC from "./pages/PMOC";
import Users from "./pages/Users";
import Settings from "./pages/Settings";
import MobileMenu from "./pages/MobileMenu";
import TechnicianOS from "./pages/TechnicianOS";
import NotFound from "./pages/NotFound";
import Changelog from "./pages/Changelog";

// Layout
import { AppLayout } from "@/components/layout/AppLayout";

const queryClient = new QueryClient();

// Protected Route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/auth" replace />;
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
    {/* Public Routes */}
    <Route path="/" element={<Navigate to="/dashboard" replace />} />
    <Route
      path="/auth"
      element={
        <PublicRoute>
          <Auth />
        </PublicRoute>
      }
    />
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
      <Route path="/agenda" element={<Schedule />} />
      <Route path="/clientes" element={<Customers />} />
      <Route path="/equipamentos" element={<EquipmentPage />} />
      <Route path="/crm" element={<CRM />} />
      <Route path="/estoque" element={<Inventory />} />
      <Route path="/financeiro" element={<Finance />} />
      <Route path="/pmoc" element={<PMOC />} />
      <Route path="/usuarios" element={<Users />} />
      <Route path="/configuracoes" element={<Settings />} />
      <Route path="/menu" element={<MobileMenu />} />
      <Route path="/changelog" element={<Changelog />} />
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
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
