import type { PunchType, TimeRecord } from '@/hooks/useTimeRecords';
import { dateInTz, timeInTz } from '@/lib/timezone';

// ─── Agrupamento de batidas em jornadas ────────────────────────────────────
//
// Desde a migration `20260930150000_ponto_multiplas_jornadas.sql` um dia
// (`time_sheets`) pode ter MAIS DE UMA jornada (clock_in → clock_out), porque
// a jornada que atravessa a meia-noite herda o dia da entrada e porque agora
// é permitido bater `clock_out` e depois `clock_in` de novo no mesmo dia
// (plantão, chamado noturno).
//
// `groupIntoShifts` é a ÚNICA implementação desse agrupamento no client —
// consumida por `TimeDayDetailModal`, e serve de referência pro que
// `TimeHistory`/`TimeReport`/`exportTimesheets` precisam saber (contagem de
// jornadas do dia).
//
// Dado sujo é esperado: um `clock_out` sem `clock_in` antes (legado, batida
// perdida) vira uma jornada com `in: null`. Uma jornada aberta no fim da lista
// (sem `clock_out`) entra com `out: null` — é o plantão que ainda está
// rolando ou o esquecimento que o admin ainda não corrigiu. Nenhum dos dois
// casos pode lançar exceção nem sumir com o registro.
export interface Shift {
  in: TimeRecord | null;
  out: TimeRecord | null;
  /** Minutos de intervalo (break_start → break_end) DENTRO desta jornada. */
  breakMin: number;
}

/**
 * Agrupa batidas válidas (ordenadas por `recorded_at`) em jornadas.
 *
 * Cada `clock_in` abre uma jornada nova; cada `clock_out` fecha a jornada
 * aberta (ou, se não houver nenhuma aberta, vira uma jornada órfã só com
 * `out`). `break_start`/`break_end` acumulam em `breakMin` da jornada
 * atualmente aberta; fora de uma jornada aberta, são ignorados (não têm onde
 * acumular, e não podem quebrar o agrupamento das outras).
 *
 * Um segundo `clock_in` sem `clock_out` antes fecha a jornada anterior como
 * está (com `out: null`) e abre a próxima — de novo, dado sujo não pode
 * travar a função nem descartar a jornada anterior.
 */
export function groupIntoShifts(records: TimeRecord[]): Shift[] {
  const sorted = [...records]
    .filter(r => r.is_valid !== false)
    .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());

  const shifts: Shift[] = [];
  let current: Shift | null = null;
  let breakStart: TimeRecord | null = null;

  const closeCurrent = () => {
    if (current) shifts.push(current);
    current = null;
    breakStart = null;
  };

  for (const rec of sorted) {
    switch (rec.type) {
      case 'clock_in':
        // Jornada anterior nunca fechada (esquecimento) entra como está.
        closeCurrent();
        current = { in: rec, out: null, breakMin: 0 };
        break;

      case 'break_start':
        if (current) breakStart = rec;
        break;

      case 'break_end':
        if (current && breakStart) {
          current.breakMin += (new Date(rec.recorded_at).getTime() - new Date(breakStart.recorded_at).getTime()) / 60000;
          breakStart = null;
        }
        break;

      case 'clock_out':
        if (current) {
          current.out = rec;
          shifts.push(current);
          current = null;
          breakStart = null;
        } else {
          // Órfão: clock_out sem clock_in antes. Dado legado sujo, não pode sumir.
          shifts.push({ in: null, out: rec, breakMin: 0 });
        }
        break;
    }
  }

  // Jornada aberta no fim (plantão em andamento, ou esquecimento a corrigir).
  if (current) shifts.push(current);

  return shifts;
}

/**
 * Minutos trabalhados de UMA jornada: intervalo entre entrada e saída, menos
 * o intervalo interno. Sem `in` ou sem `out`, não há como calcular, então
 * conta 0 (o total do dia, calculado por `calculateWorkedMinutes` sobre TODAS
 * as batidas, é quem manda de verdade — este helper só informa o card por
 * jornada).
 *
 * Jornada ainda aberta (`out: null`) conta até agora, igual o total do dia
 * faz enquanto a pessoa está trabalhando.
 */
export function shiftWorkedMinutes(shift: Shift): number {
  if (!shift.in) return 0;
  const end = shift.out ? new Date(shift.out.recorded_at).getTime() : Date.now();
  const start = new Date(shift.in.recorded_at).getTime();
  const worked = (end - start) / 60000 - shift.breakMin;
  return Math.round(Math.max(0, worked));
}

// ─── Contagem de jornadas por dia (badge "N jornadas") ─────────────────────
//
// `TimeHistory`, `TimeReport` e `exportTimesheets` precisam SÓ da CONTAGEM de
// jornadas por (employee_id, date), não da timeline completa — então esses
// consumidores trazem uma consulta enxuta (`employee_id, date, type,
// recorded_at, is_valid`, sem `select('*')`), e este helper aceita esse
// formato mínimo em vez de exigir o `TimeRecord` inteiro.
//
// A contagem é EQUIVALENTE a `groupIntoShifts(...).length` pro mesmo dia: cada
// `clock_in` abre uma jornada nova, e cada `clock_out` sem jornada aberta é
// uma jornada órfã. Reimplementado aqui (mais simples que remontar objetos
// `Shift` completos só pra contar) e coberto pelo mesmo teste que compara
// contra `groupIntoShifts`, pra nunca divergir.
export interface ShiftCountRecord {
  employee_id: string | null;
  date: string;
  type: PunchType;
  recorded_at: string;
  is_valid: boolean | null;
}

export function countShifts(records: ShiftCountRecord[]): number {
  const sorted = [...records]
    .filter(r => r.is_valid !== false)
    .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());

  let count = 0;
  let open = false;
  for (const rec of sorted) {
    if (rec.type === 'clock_in') {
      count += 1;
      open = true;
    } else if (rec.type === 'clock_out') {
      if (!open) count += 1; // órfão: jornada de 1 registro só
      open = false;
    }
  }
  return count;
}

/**
 * Agrupa registros (formato enxuto de `ShiftCountRecord`) por
 * `employee_id|date` e devolve quantas jornadas cada dia teve.
 *
 * Chave de leitura: `` `${employeeId ?? ''}|${date}` ``.
 */
export function countShiftsPerDay(records: ShiftCountRecord[]): Map<string, number> {
  const byKey = new Map<string, ShiftCountRecord[]>();
  for (const rec of records) {
    const key = `${rec.employee_id ?? ''}|${rec.date}`;
    const bucket = byKey.get(key);
    if (bucket) bucket.push(rec);
    else byKey.set(key, [rec]);
  }
  const counts = new Map<string, number>();
  for (const [key, bucket] of byKey) {
    counts.set(key, countShifts(bucket));
  }
  return counts;
}

export function shiftCountKey(employeeId: string | null, date: string): string {
  return `${employeeId ?? ''}|${date}`;
}

// ─── Marcador "+1" da saída que caiu no dia seguinte ───────────────────────
//
// Com a jornada noturna, `last_clock_out` do espelho de um dia pode estar no
// dia CIVIL seguinte (a batida herdou o dia da ENTRADA, não o do relógio).
// Sem marcar isso, "Entrada 08:00 · Saída 01:10" parece erro de digitação.
// Usado por TimeHistory, TimeReport e exportTimesheets — mesma régua nos 3.
export function formatShiftOutTime(
  outIso: string,
  sheetDate: string,
  timeZone: string | null | undefined,
  nextDaySuffix: string,
): string {
  const time = timeInTz(outIso, timeZone);
  const outDate = dateInTz(outIso, timeZone);
  return outDate > sheetDate ? `${time} ${nextDaySuffix}` : time;
}
