import * as React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

/**
 * StepTransition — primitivo reaproveitável de animação de troca de etapa em
 * wizards (contrato, orçamento, etc). Anima o conteúdo da etapa atual com um
 * slide + fade DIRECIONAL: avançar entra pela direita, voltar entra pela
 * esquerda. A direção é inferida comparando o `index` atual com o anterior.
 *
 * Régua:
 *  - Mobile-first: slide horizontal sutil (24px) que fica bom no drawer.
 *  - Não força overflow/height — o scroll fica a cargo do container pai
 *    (ResponsiveModal). O motion.div flui natural.
 *  - Respeita `prefers-reduced-motion`: zera o deslocamento horizontal e anima
 *    só a opacidade (sem enjoo pra quem desativou animações).
 *
 * Consumo:
 *   <StepTransition stepKey={currentStepKey} index={step}>
 *     {conteúdoDaEtapa}
 *   </StepTransition>
 */
export interface StepTransitionProps {
  /** Key única do step atual — dirige o AnimatePresence (a troca). */
  stepKey: string;
  /** Posição numérica do step — usada pra saber a direção (avanço/volta). */
  index: number;
  children: React.ReactNode;
  className?: string;
}

const EASE: [number, number, number, number] = [0.4, 0, 0.2, 1];
const OFFSET = 24;

export function StepTransition({ stepKey, index, children, className }: StepTransitionProps) {
  const reduceMotion = useReducedMotion();

  // Index anterior pra inferir a direção. Inicializa com o atual pra que a
  // primeira renderização não dispare slide.
  const prevIndex = React.useRef(index);
  // 1 = avanço (entra da direita), -1 = volta (entra da esquerda).
  const direction = index >= prevIndex.current ? 1 : -1;

  React.useEffect(() => {
    prevIndex.current = index;
  }, [index]);

  // Com prefers-reduced-motion, anima só opacidade (sem deslocamento).
  const enterX = reduceMotion ? 0 : direction * OFFSET;
  const exitX = reduceMotion ? 0 : direction * -OFFSET;

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={stepKey}
        className={className}
        initial={{ opacity: 0, x: enterX }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: exitX }}
        transition={{ duration: 0.18, ease: EASE }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
