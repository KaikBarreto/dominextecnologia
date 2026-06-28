// Lógica PURA de rótulo de frequência de UMA pergunta de checklist (Fase B —
// contratos agnósticos). Extraída de QuestionFrequencyBadge.tsx pra ser
// reusável sem arrastar React/Radix (usada também no documento "Plano de
// Manutenção", que é uma tela-documento de impressão). FONTE ÚNICA do rótulo:
// o badge do técnico e o documento importam daqui, sem divergir.
//
// Os 6 campos espelham `form_questions` e o motor puro `visitScheduleEngine.ts`
// (ActivitySpec). NULL em tudo = "Toda visita".

/** Configuração de frequência de UMA pergunta (subset de form_questions). */
export interface QuestionFrequency {
  freq_kind?: 'time' | 'visits' | null;
  freq_months?: number | null;
  freq_days?: number | null;
  freq_visits?: number | null;
  start_kind?: 'contract_start' | 'due_now' | 'visit_n' | null;
  start_visit?: number | null;
}

/** Payload completo gravado na pergunta (sempre os 6 campos, NULL quando padrão). */
export interface QuestionFrequencyPayload {
  freq_kind: 'time' | 'visits' | null;
  freq_months: number | null;
  freq_days: number | null;
  freq_visits: number | null;
  start_kind: 'contract_start' | 'due_now' | 'visit_n' | null;
  start_visit: number | null;
}

export const MONTH_PRESETS: { months: number; label: string }[] = [
  { months: 1, label: 'Mensal' },
  { months: 2, label: 'Bimestral' },
  { months: 3, label: 'Trimestral' },
  { months: 6, label: 'Semestral' },
  { months: 12, label: 'Anual' },
];

/** É o padrão "Toda visita" (tudo NULL)? */
export function isEveryVisit(f: QuestionFrequency): boolean {
  return !f.freq_kind;
}

/** Texto curto do selo a partir dos campos da pergunta. */
export function frequencyLabel(f: QuestionFrequency): string {
  if (!f.freq_kind) return 'Toda visita';
  if (f.freq_kind === 'visits') {
    const n = f.freq_visits ?? 1;
    return n <= 1 ? 'Toda visita' : `A cada ${n} visitas`;
  }
  // time: dias têm prioridade sobre meses (espelha o motor).
  const d = f.freq_days ?? 0;
  if (d > 0) return 'Personalizado';
  const m = f.freq_months ?? 0;
  const preset = MONTH_PRESETS.find((p) => p.months === m);
  if (preset) return preset.label;
  // Qualquer valor de meses fora dos presets (ou intervalo ausente) = custom.
  return 'Personalizado';
}

/** Texto longo (popover/title): descreve o intervalo exato. */
export function frequencyDetail(f: QuestionFrequency): string {
  if (!f.freq_kind) return 'Aparece em toda visita.';
  if (f.freq_kind === 'visits') {
    const n = f.freq_visits ?? 1;
    return n <= 1 ? 'Aparece em toda visita.' : `Aparece a cada ${n} visitas.`;
  }
  const d = f.freq_days ?? 0;
  if (d > 0) return `Aparece a cada ${d} dias.`;
  const m = f.freq_months ?? 0;
  return m > 0 ? `Aparece a cada ${m} ${m === 1 ? 'mês' : 'meses'}.` : 'Aparece em toda visita.';
}
