import { useState, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Users, BarChart3, Plus, Search, Clock } from 'lucide-react';
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
import { AdminTimePanel } from '@/components/time-tracking/AdminTimePanel';
import { TechnicianTimeClock } from '@/components/time-tracking/TechnicianTimeClock';
import { useEmployees, Employee } from '@/hooks/useEmployees';
import { useEmployeeMovements } from '@/hooks/useEmployeeMovements';
import { calculateEmployeeBalance, EmployeeMovement } from '@/utils/employeeCalculations';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

const tabs: SettingsTab[] = [
  { value: 'list', label: 'Funcionários', icon: Users },
  { value: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { value: 'timeclock', label: 'Controle de Ponto', icon: Clock },
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
  const { toast } = useToast();
  const { user } = useAuth();
  const { currentUserRole } = useUsers();
  const queryClient = useQueryClient();
  const isTecnico = currentUserRole === 'tecnico';

  // Load movements for selected employee
  const activeEmployeeId = movementEmployee?.id || paymentEmployee?.id || extractEmployee?.id;
  const { movements, addMovement, deleteMovement } = useEmployeeMovements(activeEmployeeId);

  // Fetch ALL movements for balance calculation on cards
  const { data: allMovements = [] } = useQuery({
    queryKey: ['all-employee-movements'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_movements')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as EmployeeMovement[];
    },
  });

  // Calculate balances for all employees using real movements
  const balanceMap = useMemo(() => {
    const map = new Map();
    const grouped = new Map<string, EmployeeMovement[]>();
    
    for (const m of allMovements) {
      if (!grouped.has(m.employee_id)) grouped.set(m.employee_id, []);
      grouped.get(m.employee_id)!.push(m);
    }
    
    employees.forEach(e => {
      const empMovements = grouped.get(e.id) || [];
      map.set(e.id, calculateEmployeeBalance(empMovements, e.salary));
    });
    return map;
  }, [employees, allMovements]);

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

  const handleCreateOrUpdate = async (data: Partial<Employee> & { _createAccess?: boolean; _password?: string }) => {
    const { _createAccess, _password, ...employeeData } = data as any;
    
    if (editingEmployee) {
      updateEmployee.mutate({ id: editingEmployee.id, ...employeeData }, {
        onSuccess: async (updatedEmp: any) => {
          // Sync photo to linked user profile if employee has a user_id
          const linkedUserId = employeeData.user_id || editingEmployee.user_id;
          if (linkedUserId && employeeData.photo_url) {
            await supabase.from('profiles').update({ avatar_url: employeeData.photo_url }).eq('user_id', linkedUserId);
          }
          
          // Create access for existing employee if requested
          if (_createAccess && employeeData.email && _password) {
            try {
              const response = await supabase.functions.invoke('create-user', {
                body: {
                  email: employeeData.email,
                  password: _password,
                  full_name: employeeData.name || editingEmployee.name,
                  phone: employeeData.phone || editingEmployee.phone || undefined,
                  avatar_url: employeeData.photo_url || editingEmployee.photo_url || undefined,
                  role: 'tecnico',
                },
              });
              
              if (response.error) throw new Error(response.error.message || 'Erro na chamada da função');
              const fnData = response.data;
              if (fnData?.error) throw new Error(fnData.error);
              
              // Link user_id to employee
              if (fnData?.user?.id) {
                await supabase.from('employees').update({ user_id: fnData.user.id }).eq('id', editingEmployee.id);
              }
              
              toast({
                title: 'Acesso ao sistema criado!',
                description: `Email: ${employeeData.email} — Senha: ${_password}`,
                duration: 15000,
              });
            } catch (err: any) {
              toast({
                variant: 'destructive',
                title: 'Funcionário atualizado, mas erro ao criar acesso',
                description: err.message,
              });
            }
          }
          
          setFormOpen(false);
          setEditingEmployee(null);
        },
      });
    } else {
      createEmployee.mutate(employeeData, {
        onSuccess: async (newEmployee: any) => {
          setFormOpen(false);
          
          if (_createAccess && employeeData.email && _password) {
            try {
              const response = await supabase.functions.invoke('create-user', {
                body: {
                  email: employeeData.email,
                  password: _password,
                  full_name: employeeData.name,
                  phone: employeeData.phone || undefined,
                  avatar_url: employeeData.photo_url || undefined,
                  role: 'tecnico',
                },
              });
              
              if (response.error) throw new Error(response.error.message || 'Erro na chamada da função');
              const fnData = response.data;
              if (fnData?.error) throw new Error(fnData.error);
              
              // Link user_id to employee
              if (fnData?.user?.id && newEmployee?.id) {
                await supabase.from('employees').update({ user_id: fnData.user.id }).eq('id', newEmployee.id);
              }
              
              toast({
                title: 'Acesso ao sistema criado!',
                description: `Email: ${employeeData.email} — Senha: ${_password}`,
                duration: 15000,
              });
            } catch (err: any) {
              toast({
                variant: 'destructive',
                title: 'Funcionário criado, mas erro ao criar acesso',
                description: err.message,
              });
            }
          }
        },
      });
    }
  };

  const registerFinancialTransaction = useCallback(async (input: {
    type: 'entrada' | 'saida';
    amount: number;
    description: string;
    notes?: string;
  }) => {
    const today = new Date().toISOString().split('T')[0];
    await supabase.from('financial_transactions').insert({
      transaction_type: input.type,
      amount: input.amount,
      description: input.description,
      category: 'Funcionários',
      transaction_date: today,
      paid_date: today,
      is_paid: true,
      notes: input.notes,
      created_by: user?.id,
    });

    queryClient.invalidateQueries({ queryKey: ['financial-transactions'] });
    queryClient.invalidateQueries({ queryKey: ['financial-summary'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
  }, [queryClient, user?.id]);

  const handleMovement = (data: { amount: number; description?: string }) => {
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
      created_by: user?.id,
    }, {
      onSuccess: async () => {
        const isRevenue = movementType === 'falta';
        await registerFinancialTransaction({
          type: isRevenue ? 'entrada' : 'saida',
          amount: data.amount,
          description: `${movementType === 'vale' ? 'Vale' : movementType === 'bonus' ? 'Bônus' : 'Falta'} - ${movementEmployee.name}`,
          notes: data.description,
        });
        setMovementEmployee(null);
      },
    });
  };

  const handlePayment = () => {
    if (!paymentEmployee) return;
    const paymentAmount = activeBalance.currentBalance;

    addMovement.mutate({
      employee_id: paymentEmployee.id,
      type: 'pagamento',
      amount: paymentAmount,
      balance_after: 0,
      description: 'Pagamento de salário',
      created_by: user?.id,
    }, {
      onSuccess: async () => {
        await registerFinancialTransaction({
          type: 'saida',
          amount: paymentAmount,
          description: `Pagamento de salário - ${paymentEmployee.name}`,
        });
        setPaymentEmployee(null);
      },
    });
  };

  const handleUpdatePhoto = useCallback((empId: string, url: string) => {
    updateEmployee.mutate({ id: empId, photo_url: url });
  }, [updateEmployee]);

  const handleDeleteWithUser = useCallback(async (employee: Employee) => {
    if (employee.user_id) {
      try {
        const response = await supabase.functions.invoke('manage-user', {
          body: { action: 'delete_user', user_id: employee.user_id },
        });
        if (response.error) throw new Error(response.error.message);
        const fnData = response.data;
        if (fnData?.error) throw new Error(fnData.error);
      } catch (err: any) {
        toast({ variant: 'destructive', title: 'Erro ao excluir usuário', description: err.message });
      }
    }
    deleteEmployee.mutate(employee.id);
  }, [deleteEmployee, toast]);

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
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3">
                {[1, 2, 3].map(i => <div key={i} className="h-48 rounded-lg bg-muted animate-pulse" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                {search ? 'Nenhum funcionário encontrado' : 'Nenhum funcionário cadastrado'}
              </div>
            ) : (
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3">
                {filtered.map(emp => (
                  <EmployeeCard
                    key={emp.id}
                    employee={emp}
                    balance={balanceMap.get(emp.id) || calculateEmployeeBalance([], emp.salary)}
                    onEdit={() => { setEditingEmployee(emp); setFormOpen(true); }}
                    onDelete={() => deleteEmployee.mutate(emp.id)}
                    onDeleteWithUser={emp.user_id ? () => handleDeleteWithUser(emp) : undefined}
                    onMovement={(type) => { setMovementType(type); setMovementEmployee(emp); }}
                    onPayment={() => setPaymentEmployee(emp)}
                    onExtract={() => setExtractEmployee(emp)}
                    
                  />
                ))}
              </div>
            )}
          </div>
        ) : activeTab === 'timeclock' ? (
          isTecnico ? <TechnicianTimeClock /> : <AdminTimePanel />
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
