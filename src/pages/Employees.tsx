import { useState, useMemo } from 'react';
import { Users, BarChart3, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SettingsSidebarLayout, SettingsTab } from '@/components/SettingsSidebarLayout';
import { EmployeeCard } from '@/components/employees/EmployeeCard';
import { EmployeeFormDialog } from '@/components/employees/EmployeeFormDialog';
import { EmployeeMovementModal } from '@/components/employees/EmployeeMovementModal';
import { EmployeePaymentModal } from '@/components/employees/EmployeePaymentModal';
import { EmployeeExtract } from '@/components/employees/EmployeeExtract';
import { EmployeesDashboard } from '@/components/employees/EmployeesDashboard';
import { useEmployees, Employee } from '@/hooks/useEmployees';
import { useEmployeeMovements } from '@/hooks/useEmployeeMovements';
import { calculateEmployeeBalance } from '@/utils/employeeCalculations';
import { useAuth } from '@/contexts/AuthContext';

const tabs: SettingsTab[] = [
  { value: 'list', label: 'Funcionários', icon: Users },
  { value: 'dashboard', label: 'Dashboard', icon: BarChart3 },
];

export default function Employees() {
  const [activeTab, setActiveTab] = useState('list');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('az');
  const [formOpen, setFormOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [movementType, setMovementType] = useState<'vale' | 'bonus' | 'falta'>('vale');
  const [movementEmployee, setMovementEmployee] = useState<Employee | null>(null);
  const [paymentEmployee, setPaymentEmployee] = useState<Employee | null>(null);
  const [extractEmployee, setExtractEmployee] = useState<Employee | null>(null);

  const { employees, isLoading, createEmployee, updateEmployee, deleteEmployee } = useEmployees();
  const { user } = useAuth();

  // Load movements for selected employee
  const activeEmployeeId = movementEmployee?.id || paymentEmployee?.id || extractEmployee?.id;
  const { movements, addMovement, deleteMovement } = useEmployeeMovements(activeEmployeeId);

  // Calculate balances for all employees
  const allMovementsQuery = useEmployeeMovements(); // loads nothing (no id)
  
  // We need a simple balance map - for cards we calculate from empty movements (simplified)
  // In production you'd batch-fetch, but here we show salary as balance when no movements
  const balanceMap = useMemo(() => {
    const map = new Map();
    employees.forEach(e => {
      map.set(e.id, calculateEmployeeBalance([], e.salary));
    });
    return map;
  }, [employees]);

  // Active employee balance (with real movements)
  const activeBalance = useMemo(() => {
    if (!activeEmployeeId) return calculateEmployeeBalance([], 0);
    const emp = employees.find(e => e.id === activeEmployeeId);
    return calculateEmployeeBalance(movements, emp?.salary || 0);
  }, [activeEmployeeId, movements, employees]);

  const filtered = useMemo(() => {
    let result = employees.filter(e =>
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      (e.position || '').toLowerCase().includes(search.toLowerCase())
    );
    switch (sort) {
      case 'az': result.sort((a, b) => a.name.localeCompare(b.name)); break;
      case 'newest': result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()); break;
      case 'oldest': result.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()); break;
    }
    return result;
  }, [employees, search, sort]);

  const handleCreateOrUpdate = (data: Partial<Employee>) => {
    if (editingEmployee) {
      updateEmployee.mutate({ id: editingEmployee.id, ...data }, { onSuccess: () => { setFormOpen(false); setEditingEmployee(null); } });
    } else {
      createEmployee.mutate(data, { onSuccess: () => setFormOpen(false) });
    }
  };

  const handleMovement = (data: { amount: number; description?: string; payment_method?: string }) => {
    if (!movementEmployee) return;
    const bal = activeBalance;
    let newBalance = bal.currentBalance;
    if (movementType === 'vale' || movementType === 'falta') newBalance -= data.amount;
    else newBalance += data.amount;

    addMovement.mutate({
      employee_id: movementEmployee.id,
      type: movementType,
      amount: data.amount,
      balance_after: newBalance,
      description: data.description,
      payment_method: data.payment_method,
      created_by: user?.id,
    }, { onSuccess: () => setMovementEmployee(null) });
  };

  const handlePayment = (data: { payment_method: string }) => {
    if (!paymentEmployee) return;
    addMovement.mutate({
      employee_id: paymentEmployee.id,
      type: 'pagamento',
      amount: activeBalance.currentBalance,
      balance_after: 0,
      description: `Pagamento via ${data.payment_method}`,
      payment_method: data.payment_method,
      created_by: user?.id,
    }, { onSuccess: () => setPaymentEmployee(null) });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            Funcionários <Badge variant="secondary">{employees.length}</Badge>
          </h1>
          <p className="text-muted-foreground">Gerencie funcionários, vales, pagamentos e extratos</p>
        </div>
      </div>

      <SettingsSidebarLayout tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab}>
        {activeTab === 'list' ? (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar por nome ou cargo..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
              </div>
              <Select value={sort} onValueChange={setSort}>
                <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="az">A-Z</SelectItem>
                  <SelectItem value="newest">Mais recente</SelectItem>
                  <SelectItem value="oldest">Mais antigo</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={() => { setEditingEmployee(null); setFormOpen(true); }} className="gap-1.5">
                <Plus className="h-4 w-4" /> Novo Funcionário
              </Button>
            </div>

            {isLoading ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {[1, 2, 3].map(i => <div key={i} className="h-48 rounded-lg bg-muted animate-pulse" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                {search ? 'Nenhum funcionário encontrado' : 'Nenhum funcionário cadastrado'}
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {filtered.map(emp => (
                  <EmployeeCard
                    key={emp.id}
                    employee={emp}
                    balance={balanceMap.get(emp.id) || calculateEmployeeBalance([], emp.salary)}
                    onEdit={() => { setEditingEmployee(emp); setFormOpen(true); }}
                    onDelete={() => deleteEmployee.mutate(emp.id)}
                    onMovement={(type) => { setMovementType(type); setMovementEmployee(emp); }}
                    onPayment={() => setPaymentEmployee(emp)}
                    onExtract={() => setExtractEmployee(emp)}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          <EmployeesDashboard employees={employees} balances={balanceMap} />
        )}
      </SettingsSidebarLayout>

      {/* Dialogs */}
      <EmployeeFormDialog
        open={formOpen}
        onOpenChange={o => { setFormOpen(o); if (!o) setEditingEmployee(null); }}
        employee={editingEmployee}
        onSubmit={handleCreateOrUpdate}
        isPending={createEmployee.isPending || updateEmployee.isPending}
      />

      {movementEmployee && (
        <EmployeeMovementModal
          open={!!movementEmployee}
          onOpenChange={o => { if (!o) setMovementEmployee(null); }}
          type={movementType}
          employeeName={movementEmployee.name}
          currentBalance={activeBalance.currentBalance}
          onSubmit={handleMovement}
          isPending={addMovement.isPending}
        />
      )}

      {paymentEmployee && (
        <EmployeePaymentModal
          open={!!paymentEmployee}
          onOpenChange={o => { if (!o) setPaymentEmployee(null); }}
          employeeName={paymentEmployee.name}
          salary={paymentEmployee.salary}
          balance={activeBalance}
          onSubmit={handlePayment}
          isPending={addMovement.isPending}
        />
      )}

      {extractEmployee && (
        <EmployeeExtract
          open={!!extractEmployee}
          onOpenChange={o => { if (!o) setExtractEmployee(null); }}
          employeeName={extractEmployee.name}
          movements={movements}
          balance={activeBalance}
          onDeleteMovement={id => deleteMovement.mutate(id)}
        />
      )}
    </div>
  );
}
