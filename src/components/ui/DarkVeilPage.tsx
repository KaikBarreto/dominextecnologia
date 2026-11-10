import type { ReactNode } from "react";
import DarkVeilBackground from "@/components/ui/DarkVeilBackground";
import { cn } from "@/lib/utils";

interface DarkVeilPageProps {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  accentColor?: string;
}

/**
 * Superfície de tela cheia usada por estados terminais do app (404, falha de
 * validação, etc.). Centraliza o Dark Veil, o fallback CSS e o tratamento de
 * movimento reduzido em um único lugar sem impor conteúdo ou ações.
 */
export function DarkVeilPage({
  children,
  className,
  contentClassName,
  accentColor,
}: DarkVeilPageProps) {
  return (
    <main
      className={cn(
        "relative isolate flex min-h-[100dvh] items-center justify-center overflow-hidden bg-neutral-950 px-5 py-10 sm:px-8",
        className,
      )}
    >
      <div className="absolute inset-0 -z-20" aria-hidden="true">
        <DarkVeilBackground
          accentColor={accentColor}
          hueShift={53}
          speed={0.5}
        />
      </div>
      <div
        className="absolute inset-0 -z-10 bg-gradient-to-b from-black/10 via-black/25 to-black/55"
        aria-hidden="true"
      />
      <div className={cn("w-full max-w-5xl text-center", contentClassName)}>
        {children}
      </div>
    </main>
  );
}
