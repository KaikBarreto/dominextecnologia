// ─────────────────────────────────────────────────────────────────────────────
// useUndoRedoShortcuts — Ctrl+Z / Cmd+Z (desfazer) e Ctrl+Shift+Z / Cmd+Shift+Z
// / Ctrl+Y (refazer) para canvas de edição.
//
// COMPARTILHADO entre o Organograma e os Processos: desfazer tem que se
// comportar igual nos dois, e manter duas cópias é como uma delas fica para trás.
//
// ⚠️ ARMADILHA CORRIGIDA AQUI: com Shift pressionado, `event.key` vem com o
// caractere MAIÚSCULO ('Z', não 'z'). A comparação `e.key === 'z'` junto de
// `e.shiftKey` NUNCA casa — era por isso que o refazer por teclado não
// funcionava no Organograma, embora o código parecesse certo. Normalizamos com
// `toLowerCase()`, e usamos `e.code === 'KeyZ'` como rede para layouts onde o
// `key` vem acentuado ou morto.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from 'react';

/** O atalho não pode roubar o Ctrl+Z de quem está digitando num campo. */
function isEditingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  // Nome editável inline (raia, título do grafo) costuma ser contentEditable.
  return el.isContentEditable === true;
}

export interface UndoRedoShortcutOptions {
  onUndo: () => void;
  onRedo: () => void;
  /** Desliga os atalhos (ex.: canvas em modo somente leitura no mobile). */
  enabled?: boolean;
}

export function useUndoRedoShortcuts({ onUndo, onRedo, enabled = true }: UndoRedoShortcutOptions) {
  // Refs pra não re-assinar o listener a cada render (undo/redo mudam de
  // identidade quando o histórico muda, que é exatamente o tempo todo).
  const undoRef = useRef(onUndo);
  const redoRef = useRef(onRedo);
  useEffect(() => { undoRef.current = onUndo; }, [onUndo]);
  useEffect(() => { redoRef.current = onRedo; }, [onRedo]);

  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      if (isEditingTarget(e.target)) return;

      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;

      const isZ = e.key?.toLowerCase() === 'z' || e.code === 'KeyZ';
      const isY = e.key?.toLowerCase() === 'y' || e.code === 'KeyY';

      if (isZ && !e.shiftKey) {
        e.preventDefault();
        undoRef.current();
      } else if ((isZ && e.shiftKey) || (isY && !e.shiftKey)) {
        e.preventDefault();
        redoRef.current();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled]);
}
