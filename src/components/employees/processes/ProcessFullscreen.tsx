// ─────────────────────────────────────────────────────────────────────────────
// ProcessFullscreen — editor de processo em TELA CHEIA.
//
// Molde: `orgchart/OrgChartFullscreen.tsx` (portal sobre o `<main>`, animação
// de entrada/saída, `containerReady` via timeout fixo — ver o cabeçalho de
// `@/lib/canvas/centerViewport.ts` antes de tocar em qualquer coisa de
// viewport: comandos programáticos são NO-OP neste app).
//
// Mais simples que o do organograma: não há ferramentas de árvore/destaque/
// busca aqui — a toolbar (paleta, raia, organizar, undo/redo, export,
// validação, metadados, configurações) já vem embutida no `ProcessCanvas`
// quando `fullscreen` está ativo (overlays nos cantos superiores).
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft } from 'lucide-react';
import { useSidebarSafe } from '@/components/ui/sidebar';
import type { Process } from '@/hooks/useProcesses';
import { ProcessCanvas } from './ProcessCanvas';

interface ProcessFullscreenProps {
  process: Process;
  onBack: () => void;
  backLabel: string;
}

export function ProcessFullscreen({ process, onBack, backLabel }: ProcessFullscreenProps) {
  const [rect, setRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [phase, setPhase] = useState<'enter' | 'shown' | 'leave'>('enter');
  const [containerReady, setContainerReady] = useState(false);

  // Colapsa o sidebar (shell desktop) enquanto o editor está aberto — mais
  // espaço pro canvas. `useSidebarSafe` não lança se o shell atual (topbar/
  // mobile) não montar `SidebarProvider`; nesse caso é `null` e não fazemos nada.
  const sidebar = useSidebarSafe();
  const sidebarWasOpenRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (!sidebar) return;
    sidebarWasOpenRef.current = sidebar.open;
    sidebar.setOpen(false);
    return () => {
      if (sidebarWasOpenRef.current !== null) sidebar.setOpen(sidebarWasOpenRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mede o `<main>` do shell (funciona nos 3 shells sem hardcodar alturas).
  useLayoutEffect(() => {
    const main = document.querySelector('main') as HTMLElement | null;
    if (!main) return;
    const measure = () => {
      const r = main.getBoundingClientRect();
      // O `<main>` tem a altura do CONTEÚDO, não da tela. Num tablet, onde a
      // página é curta, o editor herdava essa altura e sobrava uma faixa preta
      // morta embaixo. Esticamos até o limite real disponível: a borda de cima
      // da navegação inferior quando ela existe, senão o fim da janela.
      const bottomNav = document.querySelector('nav.fixed.bottom-0') as HTMLElement | null;
      const navTop = bottomNav && bottomNav.offsetHeight > 0
        ? bottomNav.getBoundingClientRect().top
        : window.innerHeight;
      const available = Math.max(navTop - r.top, 0);
      setRect({ top: r.top, left: r.left, width: r.width, height: Math.max(r.height, available) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(main);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, []);

  // Entrada: anima no próximo frame. `containerReady` dispara 330ms depois
  // (250ms de transição + 80ms de folga) — `onTransitionEnd` é não-confiável
  // em portais do React, por isso o timeout fixo (mesmo truque do organograma).
  useEffect(() => {
    const rafId = requestAnimationFrame(() => setPhase('shown'));
    const timerId = window.setTimeout(() => setContainerReady(true), 330);
    return () => {
      cancelAnimationFrame(rafId);
      window.clearTimeout(timerId);
    };
  }, []);

  // Trava o scroll do body (o canvas tem pan/zoom próprio).
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const handleBack = () => {
    setPhase('leave');
    window.setTimeout(onBack, 220);
  };

  if (!rect) return null;

  return createPortal(
    <div
      data-process-fullscreen-root
      className="fixed z-40 bg-background"
      style={{
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        opacity: phase === 'shown' ? 1 : 0,
        // Repouso usa transform:none (não scale(1)) — ancestral com transform
        // quebra a medição do React Flow. Entrada anima scale(0.96) → none.
        transform: phase === 'shown' ? 'none' : 'scale(0.96)',
        transformOrigin: 'center center',
        transition: 'opacity 250ms ease, transform 250ms ease',
        willChange: phase === 'shown' ? 'auto' : 'opacity, transform',
      }}
    >
      <ProcessCanvas
        process={process}
        fullscreen
        containerReady={containerReady}
        onBack={handleBack}
        backLabel={backLabel}
        backIcon={<ChevronLeft className="h-4 w-4" />}
      />
    </div>,
    document.body,
  );
}
