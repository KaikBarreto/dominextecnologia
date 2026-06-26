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

  // Soma os totais segundo a tabela canônica de sinais. recebimento abate
  // dos vales acumulados; ajuste nunca entra nos totalizadores.
  const accumulate = (list: EmployeeMovement[]) => {
    for (const m of list) {
      switch (m.type) {
        case 'vale': totalVales += Math.abs(m.amount); break;
        case 'recebimento': totalVales = Math.max(0, totalVales - Math.abs(m.amount)); break;
        case 'bonus': totalBonus += Math.abs(m.amount); break;
        case 'falta': case 'falta_banco': totalFaltas += Math.abs(m.amount); break;
        case 'pagamento': totalPagamentos += Math.abs(m.amount); break;
        // 'ajuste' não é contabilizado nos totais
      }
    }
  };

  if (lastAjusteIdx >= 0) {
    // Use the ajuste's balance_after as the base salary for this cycle
    baseSalary = sorted[lastAjusteIdx].balance_after;
    // Only count movements AFTER the ajuste
    accumulate(sorted.slice(lastAjusteIdx + 1));
  } else {
    // No ajuste found — sum all movements (legacy behavior)
    accumulate(sorted);
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
        case 'vale': case 'falta': case 'falta_banco':
          balance -= Math.abs(m.amount);
          break;
        case 'bonus':
        case 'recebimento':
          balance += Math.abs(m.amount);
          break;
        // Pagamento usa amount negativo (ex: -130), então += amount diminui o
        // saldo. Ajuste reseta o saldo para o salário base (amount já é o valor).
        case 'pagamento':
          balance += m.amount;
          break;
        case 'ajuste':
          balance = m.amount;
          break;
      }
      return { ...m, balance_after: balance };
    });
}

export function formatMovementType(type: string): string {
  const map: Record<string, string> = {
    vale: 'Vale', bonus: 'Bônus', falta: 'Falta',
    falta_banco: 'Falta (BH)',
    pagamento: 'Pagamento', ajuste: 'Ajuste',
    recebimento: 'Recebimento',
  };
  return map[type] || type;
}

export function getMovementBadgeVariant(type: string): string {
  const map: Record<string, string> = {
    vale: 'destructive', bonus: 'default', falta: 'secondary',
    falta_banco: 'outline',
    pagamento: 'outline', ajuste: 'secondary',
    recebimento: 'default',
  };
  return map[type] || 'default';
}

// ---------------------------------------------------------------------------
// Helpers por TIPO — fonte única de sinal/cor/ícone do extrato.
// A exibição lê SEMPRE o tipo, nunca o sinal do amount (que pode estar
// armazenado negativo por bug antigo). Tabela canônica (fonte: EcoSistema):
//   bonus       → '+'  verde
//   recebimento → '+'  esmeralda (abate vales)
//   vale        → '-'  vermelho
//   falta(_banco) → '-' laranja
//   pagamento   → ''   cinza (zera o ciclo, amount negativo)
//   ajuste      → ''   cinza (reset salário base, fora dos totais)
// ---------------------------------------------------------------------------

/** Prefixo exibido ao lado do valor: '+', '-' ou '' (sem sinal). */
export function signFor(type: string): '+' | '-' | '' {
  switch (type) {
    case 'bonus':
    case 'recebimento':
      return '+';
    case 'vale':
    case 'falta':
    case 'falta_banco':
      return '-';
    // pagamento e ajuste: sem sinal
    default:
      return '';
  }
}

/** Classe de cor (token semântico) para o valor do movimento. */
export function colorClassFor(type: string): string {
  switch (type) {
    case 'bonus':
      return 'text-green-600';
    case 'recebimento':
      return 'text-emerald-600';
    case 'vale':
      return 'text-destructive';
    case 'falta':
    case 'falta_banco':
      return 'text-orange-600';
    // pagamento e ajuste: neutro
    default:
      return 'text-muted-foreground';
  }
}

/** Nome do ícone lucide associado ao tipo (resolvido na UI). */
export function iconNameFor(type: string): 'Award' | 'HandCoins' | 'TrendingDown' | 'AlertTriangle' | 'Wallet' | 'TrendingUp' {
  switch (type) {
    case 'bonus':
      return 'Award';
    case 'recebimento':
      return 'HandCoins';
    case 'vale':
      return 'TrendingDown';
    case 'falta':
    case 'falta_banco':
      return 'AlertTriangle';
    case 'pagamento':
      return 'Wallet';
    default:
      return 'TrendingUp';
  }
}

/** Classe do badge SATURADO (bg da cor + texto branco) por tipo. */
export function badgeClassFor(type: string): string {
  switch (type) {
    case 'vale':
      return 'bg-red-600 text-white border-red-600 hover:bg-red-600';
    case 'bonus':
      return 'bg-green-600 text-white border-green-600 hover:bg-green-600';
    case 'falta':
    case 'falta_banco':
      return 'bg-orange-500 text-white border-orange-500 hover:bg-orange-500';
    case 'pagamento':
      return 'bg-slate-600 text-white border-slate-600 hover:bg-slate-600';
    case 'recebimento':
      return 'bg-emerald-500 text-white border-emerald-500 hover:bg-emerald-500';
    case 'ajuste':
      return 'bg-slate-500 text-white border-slate-500 hover:bg-slate-500';
    default:
      return 'bg-slate-600 text-white border-slate-600 hover:bg-slate-600';
  }
}

/** Classe do "chip" do ícone (bg saturado + ícone branco) por tipo. */
export function iconChipClassFor(type: string): string {
  return badgeClassFor(type).replace(/ hover:[^ ]+/g, '');
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
