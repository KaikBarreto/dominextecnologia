/**
 * Hook de preferências do Organograma — persistido por usuário via localStorage.
 * Chave: "dominex:orgchart:prefs"
 *
 * Cada preferência tem um default seguro. Novas chaves adicionadas no shape
 * fazem merge sobre os defaults, então dados existentes no localStorage nunca
 * quebram ao evoluir.
 */

export interface OrgChartPrefs {
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

export const ORG_CHART_PREFS_DEFAULTS: OrgChartPrefs = {
  edgeStyle: 'curved',
  background: 'dots',
  minimap: false,
  snapGrid: false,
  smartGuides: true,
};

const STORAGE_KEY = 'dominex:orgchart:prefs';

function readFromStorage(): OrgChartPrefs {
  try {
    if (typeof window === 'undefined') return ORG_CHART_PREFS_DEFAULTS;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return ORG_CHART_PREFS_DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<OrgChartPrefs>;
    // Merge: default como base, sobrescreve com o que existe no storage.
    return { ...ORG_CHART_PREFS_DEFAULTS, ...parsed };
  } catch {
    return ORG_CHART_PREFS_DEFAULTS;
  }
}

function writeToStorage(prefs: OrgChartPrefs): void {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Quota exceeded ou modo privado sem storage — ignora silenciosamente.
  }
}

import { useState, useCallback } from 'react';

export function useOrgChartPrefs() {
  const [prefs, setPrefs] = useState<OrgChartPrefs>(readFromStorage);

  const setPref = useCallback(<K extends keyof OrgChartPrefs>(
    key: K,
    value: OrgChartPrefs[K],
  ) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: value };
      writeToStorage(next);
      return next;
    });
  }, []);

  return { prefs, setPref };
}
