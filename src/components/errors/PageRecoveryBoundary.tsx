import React from "react";
import { House, RefreshCw, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  autoHealStaleBundleIfNeeded,
  clearCachesAndReload,
  isStaleBundleError,
} from "@/lib/pwa";
import { getSanitizedErrorDiagnostic } from "@/utils/errorMessages";

interface PageRecoveryBoundaryProps {
  children: React.ReactNode;
  homePath: string;
  resetKey: string;
}

interface PageRecoveryBoundaryState {
  error: Error | null;
  resetKey: string;
  automaticRetries: number;
  refreshingApp: boolean;
}

// Backoff curto o bastante para não segurar um erro real por muito tempo, mas
// amplo o bastante para cobrir contexto/cache/chunk que termina de estabilizar
// depois da navegação. O fallback só aparece após as três falhas consecutivas.
const AUTOMATIC_RETRY_DELAYS_MS = [300, 900, 1_800] as const;

class PageRecoveryBoundaryCore extends React.Component<
  PageRecoveryBoundaryProps & { onGoHome: () => void },
  PageRecoveryBoundaryState
> {
  state: PageRecoveryBoundaryState = {
    error: null,
    resetKey: this.props.resetKey,
    automaticRetries: 0,
    refreshingApp: false,
  };

  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  static getDerivedStateFromError(error: Error): Partial<PageRecoveryBoundaryState> {
    return { error };
  }

  static getDerivedStateFromProps(
    props: PageRecoveryBoundaryProps,
    state: PageRecoveryBoundaryState,
  ): Partial<PageRecoveryBoundaryState> | null {
    if (props.resetKey === state.resetKey) return null;
    return { error: null, resetKey: props.resetKey, automaticRetries: 0, refreshingApp: false };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("PageRecoveryBoundary caught:", {
      ...getSanitizedErrorDiagnostic(error),
      componentStack: info.componentStack?.split("\n").slice(0, 8).join("\n"),
    });
    void autoHealStaleBundleIfNeeded(error.message);

    // Um erro de render pode acontecer durante a troca de rota enquanto
    // contexto, cache ou um chunk ainda está se estabilizando. A primeira
    // falha ganha tentativas automáticas progressivas; só exibimos o aviso
    // quando a mesma tela continua falhando após todo o backoff. O limite evita
    // mascarar erro persistente e impede loop de renderização.
    if (this.state.automaticRetries < AUTOMATIC_RETRY_DELAYS_MS.length) {
      if (this.retryTimer) clearTimeout(this.retryTimer);
      const failedResetKey = this.props.resetKey;
      const retryDelay = AUTOMATIC_RETRY_DELAYS_MS[this.state.automaticRetries];
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        this.setState((state) => {
          if (state.resetKey !== failedResetKey) return null;
          return {
            error: null,
            automaticRetries: state.automaticRetries + 1,
          };
        });
      }, retryDelay);
    }
  }

  componentWillUnmount() {
    this.unmounted = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
  }

  private unmounted = false;

  private retry = () => {
    // Bundle antigo após um deploy: o React.lazy guarda para sempre o chunk que
    // não veio, então redesenhar repete o MESMO erro e o botão não fazia nada.
    // Só buscar a versão nova resolve — mesma limpeza forte do ErrorBoundary
    // raiz. Se o host não responder, a função desiste sem recarregar e o botão
    // volta a ficar disponível.
    if (this.state.error && isStaleBundleError(this.state.error.message)) {
      if (this.state.refreshingApp) return;
      this.setState({ refreshingApp: true });
      void clearCachesAndReload().finally(() => {
        if (!this.unmounted) this.setState({ refreshingApp: false });
      });
      return;
    }
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;

    if (this.state.automaticRetries < AUTOMATIC_RETRY_DELAYS_MS.length) {
      return (
        <div
          className="flex min-h-[60dvh] flex-col items-center justify-center gap-3"
          role="status"
          aria-live="polite"
        >
          <div className="loader" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Recuperando esta tela…</p>
        </div>
      );
    }

    return (
      <section
        className="flex min-h-[60dvh] items-center justify-center px-5 py-10"
        role="status"
        aria-live="polite"
        aria-labelledby="page-recovery-title"
      >
        <div className="w-full max-w-lg text-center">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Sparkles className="h-6 w-6" aria-hidden="true" />
          </div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Vamos retomar daqui
          </p>
          <h1 id="page-recovery-title" className="text-3xl font-bold tracking-tight text-foreground">
            Esta tela só precisa de uma nova tentativa
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
            Seus dados continuam protegidos. Tente abrir o conteúdo novamente ou
            volte ao início para seguir trabalhando.
          </p>
          <div className="mx-auto mt-6 flex max-w-sm flex-col gap-3 sm:flex-row sm:justify-center">
            <Button
              className="min-h-11 flex-1 font-bold"
              onClick={this.retry}
              disabled={this.state.refreshingApp}
            >
              <RefreshCw
                aria-hidden="true"
                className={this.state.refreshingApp ? "animate-spin" : undefined}
              />
              Tentar novamente
            </Button>
            <Button
              className="min-h-11 flex-1"
              variant="outline"
              onClick={this.props.onGoHome}
            >
              <House aria-hidden="true" />
              Ir para o início
            </Button>
          </div>
        </div>
      </section>
    );
  }
}

export function PageRecoveryBoundary(props: PageRecoveryBoundaryProps) {
  const navigate = useNavigate();
  return (
    <PageRecoveryBoundaryCore
      {...props}
      onGoHome={() => navigate(props.homePath)}
    />
  );
}
