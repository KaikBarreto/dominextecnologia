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
  let totalVales = 0;
  let totalBonus = 0;
  let totalFaltas = 0;
  let totalPagamentos = 0;

  for (const m of movements) {
    switch (m.type) {
      case 'vale': totalVales += Math.abs(m.amount); break;
      case 'bonus': totalBonus += Math.abs(m.amount); break;
      case 'falta': totalFaltas += Math.abs(m.amount); break;
      case 'pagamento': totalPagamentos += Math.abs(m.amount); break;
    }
  }

  const currentBalance = salary + totalBonus - totalVales - totalFaltas;
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
    pagamento: 'Pagamento', ajuste: 'Ajuste',
  };
  return map[type] || type;
}

export function getMovementBadgeVariant(type: string): string {
  const map: Record<string, string> = {
    vale: 'destructive', bonus: 'default', falta: 'secondary',
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
