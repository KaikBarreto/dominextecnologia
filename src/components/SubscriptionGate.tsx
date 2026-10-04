import { useSubscriptionBlock } from "@/hooks/useSubscriptionBlock";
import { Navigate, useLocation } from "react-router-dom";
import { AlertTriangle, LogOut, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageLoading } from "@/components/ui/page-loading";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Gate de assinatura — espelha o comportamento do EcoSistema (ProtectedRoute):
 * quando o teste/assinatura da empresa vence (ou a empresa é desativada), troca
 * o conteúdo do app pela tela cheia de ativação/renovação, que empurra o cliente
 * pro `/checkout`.
 *
 * A DECISÃO de bloqueio vive no hook `useSubscriptionBlock` (fonte única,
 * reusada por telas fora do AppLayout, ex.: `/os-tecnico/:id` no modo técnico).
 *
 * Decisões:
 * - Admin Auctus (super_admin/vendedores) NÃO tem assinatura de tenant — passa direto.
 * - Renderizado DENTRO do AppLayout, então a rota `/checkout` (fora do layout)
 *   nunca é bloqueada — evita loop "gate ↔ checkout".
 * - Empresa DESATIVADA (`inactive`) bloqueia na hora; trial bloqueia ao vencer;
 *   assinatura paga tem 1 dia de carência. (ver hook)
 */
export function SubscriptionGate({ children }: { children: React.ReactNode }) {
  const { blocked, screen, status, retry } = useSubscriptionBlock();
  const { signOut } = useAuth();
  const location = useLocation();

  // Checkout precisa continuar acessível para ativação/renovação. O hook ainda
  // é chamado (regra de hooks), mas nunca impede a montagem desta rota.
  if (location.pathname === "/checkout") {
    return <>{children}</>;
  }

  if (status === "checking") {
    return <PageLoading />;
  }

  if (status === "payment_required") {
    return <Navigate to="/checkout" replace />;
  }

  if (status === "unavailable") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="w-full max-w-md space-y-5 rounded-lg border bg-card p-6 text-center shadow-sm">
          <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" aria-hidden />
          <div className="space-y-2">
            <h1 className="text-xl font-semibold">Não foi possível validar sua assinatura</h1>
            <p className="text-sm text-muted-foreground">
              Por segurança, o acesso ao sistema foi pausado. Tente novamente ou saia da conta.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Button onClick={retry}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Tentar novamente
            </Button>
            <Button variant="outline" onClick={() => { void signOut(); }}>
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (blocked) {
    return <>{screen}</>;
  }

  return <>{children}</>;
}
