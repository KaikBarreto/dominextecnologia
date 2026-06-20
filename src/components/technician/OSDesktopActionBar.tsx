import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

interface OSDesktopActionBarProps {
  children: ReactNode;
}

/**
 * Rodapé de ações fixo da tela de OS — EXCLUSIVO DO DESKTOP (lg+).
 *
 * Renderizado via createPortal no <body> de propósito: a tela de OS vive sob
 * ancestrais com `transform` (RouteTransition / MobilePullToRefresh), e um
 * `position:fixed` dentro de um ancestral transformado ancora no ancestral, não
 * na viewport (bug clássico do shell mobile). O portal escapa esse containing
 * block e fixa de verdade na viewport.
 *
 * z-30: acima do conteúdo (header é z-20), abaixo do FAB backdrop (z-40) e dos
 * overlays/modais (z-[60]/z-[3000]). No mobile fica `hidden` — o FAB e os botões
 * inline do card seguem mandando, sem colisão.
 */
export function OSDesktopActionBar({ children }: OSDesktopActionBarProps) {
  return createPortal(
    <div
      className="hidden lg:flex fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 print:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto w-full max-w-3xl px-4 py-3 flex items-center gap-2">
        {children}
      </div>
    </div>,
    document.body
  );
}
