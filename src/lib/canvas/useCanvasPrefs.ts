/**
 * Preferências de um canvas React Flow — persistidas por usuário no localStorage.
 *
 * COMPARTILHADO entre o Organograma (`dominex:orgchart:prefs`) e os Processos
 * (`dominex:process:prefs`). A chave é parâmetro: cada canvas lembra as suas
 * sem contaminar o outro.
 *
 * Cada preferência tem um default seguro e o read faz MERGE sobre os defaults,
 * então chave nova no shape nunca quebra dado já gravado no navegador.
 */

import { useState, useCallback, useMemo } from 'react';

export interface CanvasPrefs {
  /** Estilo das linhas: curva (bezier) ou reta de canto reto (smoothstep). */
  edgeStyle: 'curved' | 'straight';
  /** Fundo do canvas. */
  background: 'dots' | 'lines' | 'cross' | 'none';
  /** Mostrar minimapa. */
  minimap: boolean;
  /** Encaixar na grade ao arrastar. */
  snapGrid: boolean;
  /** Guias de alinhamento inteligentes (helper lines). */
  smartGuides: boolean;
}

export const CANVAS_PREFS_DEFAULTS: CanvasPrefs = {
  edgeStyle: 'curved',
  background: 'dots',
  minimap: false,
  snapGrid: false,
  smartGuides: true,
};

/** Chaves de storage em uso — centralizadas pra não colidirem por digitação. */
export const CANVAS_PREFS_KEYS = {
  orgChart: 'dominex:orgchart:prefs',
  process: 'dominex:process:prefs',
} as const;

function readFromStorage(storageKey: string, defaults: CanvasPrefs): CanvasPrefs {
  try {
    if (typeof window === 'undefined') return defaults;
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<CanvasPrefs>;
    // Merge: default como base, sobrescreve com o que existe no storage.
    return { ...defaults, ...parsed };
  } catch {
    return defaults;
  }
}

function writeToStorage(storageKey: string, prefs: CanvasPrefs): void {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(storageKey, JSON.stringify(prefs));
  } catch {
    // Quota exceeded ou modo privado sem storage — ignora silenciosamente.
  }
}

/**
 * @param storageKey  Chave do localStorage (use `CANVAS_PREFS_KEYS`).
 * @param overrides   Defaults específicos do canvas (ex.: processo nasce com
 *                    aresta reta, que é o idioma de fluxograma).
 */
export function useCanvasPrefs(storageKey: string, overrides?: Partial<CanvasPrefs>) {
  const defaults = useMemo<CanvasPrefs>(
    () => ({ ...CANVAS_PREFS_DEFAULTS, ...overrides }),
    // Defaults são literais estáveis por canvas; não re-derivar a cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [storageKey],
  );
  const [prefs, setPrefs] = useState<CanvasPrefs>(() => readFromStorage(storageKey, defaults));

  const setPref = useCallback(
    <K extends keyof CanvasPrefs>(key: K, value: CanvasPrefs[K]) => {
      setPrefs((prev) => {
        const next = { ...prev, [key]: value };
        writeToStorage(storageKey, next);
        return next;
      });
    },
    [storageKey],
  );

  return { prefs, setPref };
}
