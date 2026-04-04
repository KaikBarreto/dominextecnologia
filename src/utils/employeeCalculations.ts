export interface EmployeeMovement {
  id: string;
  employee_id: string;
  type: string;
  amount: number;
  balance_after: number;
  description: string | null;
  payment_method: string | null;
  payment_details: any;
  created_by: string | null;
  created_at: string;
}

export interface BalanceSummary {
  totalVales: number;
  totalBonus: number;
  totalFaltas: number;
  totalPagamentos: number;
  currentBalance: number;
}

export function calculateEmployeeBalance(movements: EmployeeMovement[], salary: number): BalanceSummary {
  // Sort by date ascending to find the last reset point
  const sorted = [...movements].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  // Find the last "ajuste" movement (which resets the cycle)
  let lastAjusteIdx = -1;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].type === 'ajuste') {
      lastAjusteIdx = i;
      break;
    }
  }

  let totalVales = 0;
  let totalBonus = 0;
  let totalFaltas = 0;
  let totalPagamentos = 0;
  let baseSalary = salary;

  if (lastAjusteIdx >= 0) {
    // Use the ajuste's balance_after as the base salary for this cycle
    baseSalary = sorted[lastAjusteIdx].balance_after;
    // Only count movements AFTER the ajuste
    const afterAjuste = sorted.slice(lastAjusteIdx + 1);
    for (const m of afterAjuste) {
      switch (m.type) {
        case 'vale': totalVales += Math.abs(m.amount); break;
        case 'bonus': totalBonus += Math.abs(m.amount); break;
        case 'falta': totalFaltas += Math.abs(m.amount); break;
        case 'pagamento': totalPagamentos += Math.abs(m.amount); break;
      }
    }
  } else {
    // No ajuste found — sum all movements (legacy behavior)
    for (const m of sorted) {
      switch (m.type) {
        case 'vale': totalVales += Math.abs(m.amount); break;
        case 'bonus': totalBonus += Math.abs(m.amount); break;
        case 'falta': totalFaltas += Math.abs(m.amount); break;
        case 'pagamento': totalPagamentos += Math.abs(m.amount); break;
      }
    }
  }

  const currentBalance = baseSalary + totalBonus - totalVales - totalFaltas;
  return { totalVales, totalBonus, totalFaltas, totalPagamentos, currentBalance };
}

export function recalculateBalances(movements: EmployeeMovement[], salary: number): EmployeeMovement[] {
  let balance = salary;
  return movements
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map(m => {
      switch (m.type) {
        case 'vale': case 'falta': balance -= Math.abs(m.amount); break;
        case 'bonus': balance += Math.abs(m.amount); break;
        case 'pagamento': balance = salary; break;
        case 'ajuste': balance = m.amount; break;
      }
      return { ...m, balance_after: balance };
    });
}

export function formatMovementType(type: string): string {
  const map: Record<string, string> = {
    vale: 'Vale', bonus: 'Bônus', falta: 'Falta',
    falta_banco: 'Falta (BH)',
    pagamento: 'Pagamento', ajuste: 'Ajuste',
  };
  return map[type] || type;
}

export function getMovementBadgeVariant(type: string): string {
  const map: Record<string, string> = {
    vale: 'destructive', bonus: 'default', falta: 'secondary',
    falta_banco: 'outline',
    pagamento: 'outline', ajuste: 'secondary',
  };
  return map[type] || 'default';
}

export function currencyMask(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  const num = parseInt(digits) / 100;
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function parseCurrency(value: string): number {
  const digits = value.replace(/\D/g, '');
  return parseInt(digits || '0') / 100;
}

/**
 * Calculate hourly rate for an employee based on salary and monthly hours.
 */
export function calculateHourlyRate(salary: number, monthlyHours: number = 176): number {
  if (monthlyHours <= 0) return 0;
  return salary / monthlyHours;
}

/**
 * Calculate daily value based on salary and working days per month.
 */
export function calculateDailyValue(salary: number, workDaysPerMonth: number = 22): number {
  if (workDaysPerMonth <= 0) return 0;
  return salary / workDaysPerMonth;
}
