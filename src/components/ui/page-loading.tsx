import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface PageLoadingProps {
  /** Texto fixo. Se omitido, cicla as mensagens padrão em loop. */
  message?: string;
  className?: string;
}

/** Mensagens que ciclam em loop abaixo da roda durante o loading geral. */
const LOADING_MESSAGES = ['Carregando...', 'Sincronizando...', 'Processando...'] as const;

/** Intervalo de troca de cada mensagem (ms). */
const CYCLE_MS = 2000;

/**
 * Texto que cicla as mensagens de loading em loop, com fade suave entre elas.
 * Cleanup do interval no unmount (sem leak / sem rodar após desmontar).
 */
function CyclingMessage() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
    }, CYCLE_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="relative min-h-[1.25rem]">
      <AnimatePresence mode="wait">
        <motion.p
          key={index}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.35, ease: 'easeInOut' }}
          className="text-sm text-muted-foreground"
        >
          {LOADING_MESSAGES[index]}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}

/**
 * Loading padrão de página — ring spinner Dominex (cor primária) + mensagem.
 * Sem `message`, exibe as mensagens padrão ciclando em loop abaixo da roda.
 */
export function PageLoading({ message, className }: PageLoadingProps) {
  return (
    <div className={cn('flex min-h-screen flex-col items-center justify-center gap-3 bg-background', className)}>
      <div className="loader" />
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : <CyclingMessage />}
    </div>
  );
}

/**
 * Loading sobreposto (overlay full-screen) — usado em transições críticas sobre conteúdo já renderizado.
 */
export function ContentLoading({ message, className }: PageLoadingProps) {
  return (
    <div className={cn('fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-background/95 backdrop-blur-sm', className)}>
      <div className="loader" />
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : <CyclingMessage />}
    </div>
  );
}
