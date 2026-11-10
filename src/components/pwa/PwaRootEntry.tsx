import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { isInstalledPwa } from "@/lib/pwaStandalone";

/**
 * Mantém `/` como site institucional no navegador, mas transforma a mesma URL
 * em uma porta segura para o sistema quando aberta pelo app instalado.
 * `/dashboard` já passa pelo guard de autenticação e leva ao login quando a
 * sessão não existe ou expirou.
 */
export function PwaRootEntry({ children }: { children: ReactNode }) {
  if (isInstalledPwa()) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
