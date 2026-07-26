import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft } from 'lucide-react';
import { useSidebarSafe } from '@/components/ui/sidebar';
import type { OrgChart } from '@/hooks/useOrgCharts';
import { OrgChartCanvas } from './OrgChartCanvas';

/**
 * Editor de organograma em TELA CHEIA.
 *
 * Renderiza (via portal no body) um container que se ancora sobre o `<main>` do
 * shell do app — ou seja, cobre exatamente a região de conteúdo (abaixo do
 * header, acima do footer, ao lado do sidebar) SEM esconder a navegação. O
 * sub-nav das abas de Funcionários some porque o `OrgChartTab` deixa de
 * renderizá-lo enquanto este overlay está montado.
 *
 * A ancoragem é feita medindo o retângulo do `<main>` (com ResizeObserver +
 * listeners de resize/scroll), então funciona nos 3 shells (sidebar/topbar/
 * mobile) sem hardcodar alturas de header/footer.
 */
export function OrgChartFullscreen({
  chart,
  onBack,
  backLabel,
}: {
  chart: OrgChart;
  onBack: () => void;
  backLabel: string;
}) {
  const [rect, setRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  // Controla o estado de animação: entra em 'enter' no mount (fade + zoom-in),
  // vai pra 'leave' ao sair (fade + zoom-out) e só então chama onBack.
  const [phase, setPhase] = useState<'enter' | 'shown' | 'leave'>('enter');
  const mainRef = useRef<HTMLElement | null>(null);

  // Localiza o <main> do shell e mede seu retângulo. Reage a resize do main,
  // resize da janela e scroll (o main pode se deslocar em telas curtas).
  useLayoutEffect(() => {
    const main = document.querySelector('main') as HTMLElement | null;
    mainRef.current = main;
    if (!main) return;

    const measure = () => {
      const r = main.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
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

  // Dispara a transição de entrada no próximo frame (permite o browser pintar o
  // estado inicial 'enter' antes de animar para 'shown').
  useEffect(() => {
    const id = requestAnimationFrame(() => setPhase('shown'));
    return () => cancelAnimationFrame(id);
  }, []);

  // Colapsa o sidebar do app ao ENTRAR (só quando o shell tem sidebar e ela está
  // aberta) para dar mais espaço ao canvas; restaura o estado anterior ao sair.
  // Nos shells topbar/mobile useSidebarSafe() é null → não faz nada.
  const sidebar = useSidebarSafe();
  useEffect(() => {
    if (!sidebar) return;
    // Só colapsa se estiver aberto (e não estamos no modo mobile do sidebar).
    if (sidebar.isMobile || !sidebar.open) return;
    sidebar.setOpen(false);
    return () => {
      // Restaura para aberto ao desmontar o editor.
      sidebar.setOpen(true);
    };
    // Roda uma vez no mount; a captura do estado inicial acontece aqui.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Trava o scroll do body enquanto o editor está aberto (o canvas tem pan/zoom
  // próprio; scroll da página atrás atrapalharia).
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const handleBack = () => {
    setPhase('leave');
    // Espera a transição de saída (~220ms) antes de desmontar.
    window.setTimeout(onBack, 220);
  };

  if (!rect) return null;

  return createPortal(
    <div
      className="fixed z-40 bg-background"
      style={{
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        opacity: phase === 'shown' ? 1 : 0,
        transform: phase === 'shown' ? 'scale(1)' : 'scale(0.96)',
        transformOrigin: 'center center',
        transition: 'opacity 250ms ease, transform 250ms ease',
        willChange: 'opacity, transform',
      }}
    >
      <OrgChartCanvas
        chart={chart}
        fullscreen
        onBack={handleBack}
        backLabel={backLabel}
        backIcon={<ChevronLeft className="h-4 w-4" />}
      />
    </div>,
    document.body,
  );
}
