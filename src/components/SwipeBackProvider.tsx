import * as React from "react";
import { useNavigate } from "react-router-dom";
import { animate, motion, useMotionValue } from "framer-motion";

/**
 * SwipeBackMotion — implementação real do gesto "arrastar da borda esquerda
 * para voltar". Isolada num módulo lazy (ver SwipeBackProvider abaixo): é a
 * ÚNICA coisa que importa framer-motion na raiz da app, e o site público
 * (landing) NUNCA precisa do gesto. Carregar isto sob demanda tira ~5,5MB de
 * framer-motion do entry/landing.
 *
 * Replica o swipe-back nativo do iOS dentro do PWA instalado:
 *   - Só ativa em mobile + display-mode standalone (PWA instalado).
 *     No browser comum, iOS Safari já tem o gesto nativo — dois gestos
 *     competindo dá conflito.
 *   - Detecta toque na borda esquerda (<20px).
 *   - Acompanha o dedo movendo a árvore inteira para a direita via
 *     framer-motion (useMotionValue + animate, sem setState — zero
 *     re-render durante o drag).
 *   - No release, decide:
 *       - Commit (dx > 40% da largura OU velocity > 0.4 px/ms): completa a
 *         animação + navigate(-1) + vibração leve.
 *       - Cancela: spring suave de volta a 0.
 *   - Bloqueia o gesto quando há modal/drawer aberto (Radix marca
 *     [data-state="open"]) ou input em foco — não roubar interação.
 */

// ---- Limiares e constantes ----
// Borda esquerda: distância máxima do toque inicial à borda em px.
const EDGE_THRESHOLD_PX = 20;
// Fração da largura da tela para considerar commit no release.
const COMMIT_DISTANCE_RATIO = 0.4;
// Velocidade mínima (px/ms) para commitar mesmo sem atingir a distância.
const COMMIT_VELOCITY = 0.4;
// Razão vertical/horizontal para cancelar (usuário está rolando vertical).
const VERTICAL_CANCEL_RATIO = 1.5;
// Duração da animação final de commit (ms).
const COMMIT_ANIM_MS = 180;

function SwipeBackMotion({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const x = useMotionValue(0);

  // Refs guardam o estado do gesto em curso sem causar re-render.
  const stateRef = React.useRef({
    isActive: false,
    startX: 0,
    startY: 0,
    startTime: 0,
  });

  // navigate vive em ref para o listener nunca ficar com closure velha.
  const navigateRef = React.useRef(navigate);
  React.useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  React.useEffect(() => {
    // Em SSR não faz nada.
    if (typeof window === "undefined") return;

    /**
     * canSwipeBack — checa todas as pré-condições no momento do touchstart.
     * Tudo aqui é leitura síncrona do DOM/window; ok rodar a cada toque.
     */
    const canSwipeBack = (): boolean => {
      // 1) Precisa estar em modo PWA standalone (instalado). Este componente só
      //    monta em mobile (SwipeBackProvider gateia por useIsMobile), então o
      //    teste de largura saiu — basta confirmar o standalone aqui.
      if (!window.matchMedia("(display-mode: standalone)").matches) return false;

      // 3) Precisa ter histórico para onde voltar.
      if (window.history.length <= 1) return false;

      // 4) Nenhum modal/drawer Radix aberto — não roubar interação.
      if (document.querySelector('[data-state="open"]')) return false;

      // 5) Foco não pode estar em campo editável (digitando = não navegar).
      const active = document.activeElement as HTMLElement | null;
      if (active) {
        const tag = active.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return false;
        if (active.isContentEditable) return false;
      }

      return true;
    };

    const handleTouchStart = (event: TouchEvent) => {
      // Pinça / multi-touch: nunca trata como swipe-back.
      if (event.touches.length > 1) {
        stateRef.current.isActive = false;
        return;
      }

      const touch = event.touches[0];
      if (touch.clientX > EDGE_THRESHOLD_PX) return;
      if (!canSwipeBack()) return;

      stateRef.current.isActive = true;
      stateRef.current.startX = touch.clientX;
      stateRef.current.startY = touch.clientY;
      stateRef.current.startTime = Date.now();
    };

    const handleTouchMove = (event: TouchEvent) => {
      const s = stateRef.current;
      if (!s.isActive) return;

      // Se entrou multi-touch durante o drag, aborta sem animar.
      if (event.touches.length > 1) {
        s.isActive = false;
        animate(x, 0, { type: "spring", stiffness: 300, damping: 30 });
        return;
      }

      const touch = event.touches[0];
      const dx = touch.clientX - s.startX;
      const dy = touch.clientY - s.startY;

      // Scroll vertical detectado → cancela o gesto e libera o scroll nativo.
      if (Math.abs(dy) > Math.abs(dx) * VERTICAL_CANCEL_RATIO) {
        s.isActive = false;
        animate(x, 0, { type: "spring", stiffness: 300, damping: 30 });
        return;
      }

      // Bloqueia o scroll horizontal nativo durante o drag.
      // (touchmove está registrado com passive:false abaixo.)
      event.preventDefault();
      x.set(Math.max(0, dx));
    };

    const handleTouchEnd = (event: TouchEvent) => {
      const s = stateRef.current;
      if (!s.isActive) return;
      s.isActive = false;

      const touch = event.changedTouches[0];
      const dx = Math.max(0, touch.clientX - s.startX);
      const dt = Math.max(1, Date.now() - s.startTime);
      const velocity = dx / dt;

      const width = window.innerWidth;
      const shouldCommit = dx > width * COMMIT_DISTANCE_RATIO || velocity > COMMIT_VELOCITY;

      if (shouldCommit) {
        // Vibração leve (no-op em dispositivos sem suporte / iOS).
        navigator.vibrate?.(8);
        animate(x, width, {
          duration: COMMIT_ANIM_MS / 1000,
          ease: "easeOut",
          onComplete: () => {
            // Volta no histórico e reseta o offset instantâneo. A próxima
            // tela já renderiza em x=0, sem flash da animação anterior.
            navigateRef.current(-1);
            x.set(0);
          },
        });
      } else {
        // Cancela: spring suave de volta ao zero.
        animate(x, 0, { type: "spring", stiffness: 300, damping: 30 });
      }
    };

    const handleTouchCancel = () => {
      const s = stateRef.current;
      if (!s.isActive) return;
      s.isActive = false;
      animate(x, 0, { type: "spring", stiffness: 300, damping: 30 });
    };

    // passive:true para start/end (não bloqueamos), passive:false para move
    // (precisamos do preventDefault para impedir scroll horizontal nativo).
    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });
    document.addEventListener("touchcancel", handleTouchCancel, { passive: true });

    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
      document.removeEventListener("touchcancel", handleTouchCancel);
    };
  }, [x]);

  return (
    <>
      {/* Fundo neutro que aparece "atrás" da tela enquanto o usuário arrasta.
          pointer-events-none para nunca interceptar interação. */}
      <div
        aria-hidden
        className="fixed inset-0 -z-10 bg-muted/60 pointer-events-none"
      />
      <motion.div style={{ x }} className="min-h-screen">
        {children}
      </motion.div>
    </>
  );
}

export default SwipeBackMotion;
