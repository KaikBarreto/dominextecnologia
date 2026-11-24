import React from "react";
import { House, RefreshCw, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { autoHealStaleBundleIfNeeded } from "@/lib/pwa";
import { getSanitizedErrorDiagnostic } from "@/utils/errorMessages";

interface PageRecoveryBoundaryProps {
  children: React.ReactNode;
  homePath: string;
  resetKey: string;
}

interface PageRecoveryBoundaryState {
  error: Error | null;
  resetKey: string;
}

class PageRecoveryBoundaryCore extends React.Component<
  PageRecoveryBoundaryProps & { onGoHome: () => void },
  PageRecoveryBoundaryState
> {
  state: PageRecoveryBoundaryState = {
    error: null,
    resetKey: this.props.resetKey,
  };

  static getDerivedStateFromError(error: Error): Partial<PageRecoveryBoundaryState> {
    return { error };
  }

  static getDerivedStateFromProps(
    props: PageRecoveryBoundaryProps,
    state: PageRecoveryBoundaryState,
  ): Partial<PageRecoveryBoundaryState> | null {
    if (props.resetKey === state.resetKey) return null;
    return { error: null, resetKey: props.resetKey };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("PageRecoveryBoundary caught:", {
      ...getSanitizedErrorDiagnostic(error),
      componentStack: info.componentStack?.split("\n").slice(0, 8).join("\n"),
    });
    void autoHealStaleBundleIfNeeded(error.message);
  }

  private retry = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;

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
            <Button className="min-h-11 flex-1 font-bold" onClick={this.retry}>
              <RefreshCw aria-hidden="true" />
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
