import { differenceInCalendarDays } from 'date-fns';
import { todayInTz } from '@/lib/timezone';

export type ContractVigenciaStatus = 'active' | 'expiringSoon' | 'expired';

export interface ContractVigencia {
  status: ContractVigenciaStatus;
  /** Dias até o vencimento. `null` = prazo indeterminado (sem `end_date`). */
  daysUntilEnd: number | null;
}

/**
 * Status de vigência de um contrato PJ/MEI, pra badge `Ativo` /
 * `Vence em N dias` (≤30) / `Vencido` na aba PJ.
 *
 * "Hoje" é o dia da EMPRESA (fuso de `company_settings.timezone`), igual ao
 * resto do módulo de Funcionários — nunca `new Date()` cru.
 */
export function getContractVigencia(
  endDate: string | null,
  timezone: string | null | undefined,
): ContractVigencia {
  if (!endDate) return { status: 'active', daysUntilEnd: null };

  const today = todayInTz(timezone); // 'yyyy-MM-dd' no fuso da empresa
  const daysUntilEnd = differenceInCalendarDays(new Date(`${endDate}T00:00:00`), new Date(`${today}T00:00:00`));

  if (daysUntilEnd < 0) return { status: 'expired', daysUntilEnd };
  if (daysUntilEnd <= 30) return { status: 'expiringSoon', daysUntilEnd };
  return { status: 'active', daysUntilEnd };
}
