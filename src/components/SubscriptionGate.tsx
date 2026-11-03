import { useState } from "react";
import { useSubscriptionBlock } from "@/hooks/useSubscriptionBlock";
import { Navigate, useLocation } from "react-router-dom";
import { AlertTriangle, Loader2, LogOut, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageLoading } from "@/components/ui/page-loading";
import { DarkVeilPage } from "@/components/ui/DarkVeilPage";
import { useAuth } from "@/contexts/AuthContext";
import { useWhiteLabel } from "@/hooks/useWhiteLabel";
import { idealForeground } from "@/lib/colorContrast";

const DOMINEX_ACCENT = "#00C597";

interface SubscriptionUnavailableScreenProps {
  retry: () => Promise<void>;
  signOut: () => Promise<void>;
  accentColor: string;
}

export function SubscriptionUnavailableScreen({
  retry,
  signOut,
  accentColor,
}: SubscriptionUnavailableScreenProps) {
  const [pendingAction, setPendingAction] = useState<
    "retry" | "sign-out" | null
  >(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const accentForeground = idealForeground(accentColor);

  const handleRetry = async () => {
    setPendingAction("retry");
    setActionError(null);
    try {
      await retry();
    } catch {
      setActionError(
        "A validação continua indisponível. Aguarde um instante e tente novamente.",
      );
    } finally {
      setPendingAction(null);
    }
  };

  const handleSignOut = async () => {
    setPendingAction("sign-out");
    setActionError(null);
    try {
      await signOut();
    } catch {
      setActionError("Não foi possível encerrar a sessão. Tente novamente.");
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <DarkVeilPage accentColor={accentColor} contentClassName="max-w-4xl">
      <section role="alert" aria-labelledby="subscription-unavailable-title">
        <div className="mx-auto mb-7 flex h-12 w-12 items-center justify-center rounded-full border border-amber-300/30 bg-amber-400/10 text-amber-300 shadow-[0_0_40px_rgba(251,191,36,0.12)] sm:mb-9 sm:h-14 sm:w-14">
          <AlertTriangle className="h-6 w-6 sm:h-7 sm:w-7" aria-hidden="true" />
        </div>

        <p className="mb-3 text-xs font-bold uppercase tracking-[0.24em] text-white/55 sm:text-sm">
          Acesso pausado por segurança
        </p>
        <h1
          id="subscription-unavailable-title"
          className="mx-auto max-w-4xl text-balance text-4xl font-black leading-[0.98] tracking-[-0.045em] text-white sm:text-6xl lg:text-7xl"
          style={{ fontFamily: "'Lufga', sans-serif", fontWeight: 900 }}
        >
          Não foi possível validar sua assinatura
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-pretty text-base leading-relaxed text-white/65 sm:mt-7 sm:text-lg">
          Não conseguimos confirmar o acesso desta empresa agora. Seus dados
          continuam protegidos; tente novamente ou encerre a sessão.
        </p>

        <div className="mx-auto mt-9 flex max-w-xl flex-col gap-3 sm:mt-10 sm:flex-row sm:justify-center">
          <Button
            size="lg"
            className="min-h-12 w-full border-0 px-6 font-bold shadow-lg shadow-black/20 hover:brightness-110 sm:w-auto sm:min-w-56"
            style={{ backgroundColor: accentColor, color: accentForeground }}
            onClick={() => {
              void handleRetry();
            }}
            disabled={pendingAction !== null}
            aria-busy={pendingAction === "retry"}
          >
            {pendingAction === "retry" ? (
              <Loader2
                className="animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            ) : (
              <RefreshCw aria-hidden="true" />
            )}
            Tentar novamente
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="min-h-12 w-full border-white/25 bg-white/[0.07] px-6 font-semibold text-white backdrop-blur-sm hover:bg-white/15 hover:text-white sm:w-auto sm:min-w-40"
            onClick={() => {
              void handleSignOut();
            }}
            disabled={pendingAction !== null}
            aria-busy={pendingAction === "sign-out"}
          >
            {pendingAction === "sign-out" ? (
              <Loader2
                className="animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            ) : (
              <LogOut aria-hidden="true" />
            )}
            {pendingAction === "sign-out" ? "Saindo…" : "Sair"}
          </Button>
        </div>
        <p
          className="mt-4 min-h-5 text-sm text-amber-200"
          role="status"
          aria-live="polite"
        >
          {actionError}
        </p>
      </section>
    </DarkVeilPage>
  );
}

function SubscriptionUnavailableGateScreen({
  retry,
  signOut,
}: Omit<SubscriptionUnavailableScreenProps, "accentColor">) {
  const { enabled: whiteLabelEnabled, primaryColor } = useWhiteLabel();
  const accentColor =
    whiteLabelEnabled && primaryColor ? primaryColor : DOMINEX_ACCENT;
  return (
    <SubscriptionUnavailableScreen
      retry={retry}
      signOut={signOut}
      accentColor={accentColor}
    />
  );
}

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
      <SubscriptionUnavailableGateScreen retry={retry} signOut={signOut} />
    );
  }

  if (blocked) {
    return <>{screen}</>;
  }

  return <>{children}</>;
}
