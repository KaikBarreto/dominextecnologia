import { useState, useMemo, useCallback } from 'react';
import { fuzzyIncludes, cn } from '@/lib/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatMoney } from '@/lib/format';
import {
  Users, BarChart3, Plus, Search, Clock, UsersRound,
  FileText, Banknote, Gift, AlertCircle, CreditCard, Pencil, Trash2,
} from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { SignedAvatarImage } from '@/components/ui/SignedAvatarImage';
import { SettingsSidebarLayout, SettingsTab } from '@/components/SettingsSidebarLayout';
import { EmployeeCard } from '@/components/employees/EmployeeCard';
import { EmployeesListView } from '@/components/employees/EmployeesListView';
import { ViewModeToggle } from '@/components/ui/ViewModeToggle';
import { useViewMode } from '@/hooks/useViewMode';
import { getErrorMessage } from '@/utils/errorMessages';
import { EmployeeFormDialog } from '@/components/employees/EmployeeFormDialog';
import { EmployeeMovementModal } from '@/components/employees/EmployeeMovementModal';
import { EmployeePaymentModal, PaymentPayload } from '@/components/employees/EmployeePaymentModal';
import { EmployeeExtract } from '@/components/employees/EmployeeExtract';
import { EmployeesDashboard } from '@/components/employees/EmployeesDashboard';
import { AdminTimePanel } from '@/components/time-tracking/AdminTimePanel';
import { TeamsPanel } from '@/components/teams/TeamsPanel';
import { useEmployees, Employee } from '@/hooks/useEmployees';
import { useEmployeeMovements } from '@/hooks/useEmployeeMovements';
import { useFinancialAccounts } from '@/hooks/useFinancialAccounts';
import { calculateEmployeeBalance, EmployeeMovement } from '@/utils/employeeCalculations';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { useWhiteLabel } from '@/hooks/useWhiteLabel';
import { useIsMobile } from '@/hooks/use-mobile';
import { generateReceiptHTML } from '@/utils/receiptGenerator';
import { supabase } from '@/integrations/supabase/client';
import { MobilePageHeader } from '@/components/mobile/MobilePageHeader';
import { FABButton } from '@/components/mobile/FABButton';
import { MobileListItem, type ItemAction } from '@/components/mobile/MobileListItem';
import { EmptyState } from '@/components/mobile/EmptyState';

export default function Employees() {
  const [activeTab, setActiveTab] = useState('list');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('az');
  // Modo de exibição da tab de funcionários: 'list' (default) ou 'grid' (cards).
  const [viewMode, setViewMode] = useViewMode('employees-view-mode');
  const [formOpen, setFormOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [movementType, setMovementType] = useState<'vale' | 'bonus' | 'falta'>('vale');
  const [movementEmployee, setMovementEmployee] = useState<Employee | null>(null);
  const [paymentEmployee, setPaymentEmployee] = useState<Employee | null>(null);
  const [extractEmployee, setExtractEmployee] = useState<Employee | null>(null);
  const [receiptConfirmData, setReceiptConfirmData] = useState<{ employee: Employee; movement: any } | null>(null);
  const [employeeToDelete, setEmployeeToDelete] = useState<Employee | null>(null);

  const { locale, currency } = useAppLocaleContext();
  const t = MESSAGES[locale].app.employees;

  const isMobile = useIsMobile();
  const { employees, isLoading, createEmployee, updateEmployee, deleteEmployee } = useEmployees();
  const { accounts: allAccounts } = useFinancialAccounts();
  // Contas válidas pra vale: caixa/banco ativos. Cartão NÃO pode bancar vale —
  // vale sai de dinheiro real, não vira lançamento na fatura.
  const cashBankAccounts = useMemo(
    () => allAccounts.filter((a) => a.type !== 'cartao' && a.is_active),
    [allAccounts]
  );
  const { toast } = useToast();
  const { user, profile, isAdminOrGestor, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const { settings: companySettings } = useCompanySettings();
  const { enabled: wlEnabled } = useWhiteLabel();

  const canManageTime = isAdminOrGestor() || hasPermission('fn:manage_timeclock') || hasPermission('fn:manage_employees');

  const tabs: SettingsTab[] = useMemo(() => {
    const base: SettingsTab[] = [
      { value: 'list', label: t.tabs.list, icon: Users },
      { value: 'teams', label: t.tabs.teams, icon: UsersRound },
      { value: 'dashboard', label: t.tabs.dashboard, icon: BarChart3 },
    ];
    if (canManageTime) {
      base.push({ value: 'timeclock', label: t.tabs.timeclock, icon: Clock });
    }
    return base;
  }, [canManageTime, t]);

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
      fuzzyIncludes(e.name, search) ||
      fuzzyIncludes(e.position, search)
    );
    switch (sort) {
      case 'az': result.sort((a, b) => a.name.localeCompare(b.name)); break;
      case 'newest': result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()); break;
      case 'oldest': result.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()); break;
    }
    return result;
  }, [employees, search, sort]);

  // Gera (idempotente) o slug do ponto público e copia o link no ato.
  // `wasEnabled` = estado anterior; só notifica/copia quando o ponto ACABOU de
  // ser ativado (evita toast em toda edição de funcionário que já tinha link).
  const ensurePontoLink = useCallback(async (employeeId: string, wasEnabled: boolean) => {
    try {
      const { data: slug, error } = await supabase.rpc('generate_ponto_slug', { p_employee_id: employeeId });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      if (!wasEnabled && typeof slug === 'string' && slug) {
        const link = `${window.location.origin}/ponto/${slug}`;
        try {
          await navigator.clipboard.writeText(link);
          toast({ title: t.toasts.linkCopied, description: link, duration: 10000 });
        } catch {
          toast({ title: t.toasts.pontoLinkGenerated, description: link, duration: 10000 });
        }
      }
    } catch (err: any) {
      toast({ variant: 'destructive', title: t.toasts.pontoLinkError, description: getErrorMessage(err) });
    }
  }, [queryClient, toast, t]);

  const handleCreateOrUpdate = async (data: Partial<Employee> & { _createAccess?: boolean; _password?: string }) => {
    const { _createAccess, _password, ...employeeData } = data as any;
    
    if (editingEmployee) {
      const editingId = editingEmployee.id;
      const editingName = editingEmployee.name;
      const editingPhone = editingEmployee.phone;
      const editingPhotoUrl = editingEmployee.photo_url;
      const previousLinkedUserId = editingEmployee.user_id;
      const pontoWasEnabled = editingEmployee.ponto_enabled;

      updateEmployee.mutate({ id: editingId, ...employeeData }, {
        onSuccess: () => {
          setFormOpen(false);
          setEditingEmployee(null);

          // Side-effects rodam em paralelo, sem bloquear o estado da mutation
          (async () => {
            if (employeeData.ponto_enabled) {
              await ensurePontoLink(editingId, pontoWasEnabled);
            }
            const linkedUserId = employeeData.user_id || previousLinkedUserId;
            if (linkedUserId && employeeData.photo_url) {
              try {
                await supabase.from('profiles').update({ avatar_url: employeeData.photo_url }).eq('user_id', linkedUserId);
              } catch {
                // Falha silenciosa: avatar pode dessincronizar, mas o salvamento principal foi
              }
            }

            if (_createAccess && employeeData.email && _password) {
              try {
                const response = await supabase.functions.invoke('create-user', {
                  body: {
                    email: employeeData.email,
                    password: _password,
                    full_name: employeeData.name || editingName,
                    phone: employeeData.phone || editingPhone || undefined,
                    avatar_url: employeeData.photo_url || editingPhotoUrl || undefined,
                    role: 'tecnico',
                    employee_id: editingId,
                  },
                });

                if (response.error) throw new Error(response.error.message || 'Erro na chamada da função');
                const fnData = response.data;
                if (fnData?.error) throw new Error(fnData.error);

                if (fnData?.user?.id) {
                  await supabase.from('employees').update({ user_id: fnData.user.id }).eq('id', editingId);
                }

                toast({
                  title: t.toasts.accessCreated,
                  description: t.toasts.accessCreatedDesc.replace('{email}', employeeData.email).replace('{password}', _password),
                  duration: 15000,
                });
              } catch (err: any) {
                toast({
                  variant: 'destructive',
                  title: t.toasts.employeeUpdatedAccessError,
                  description: getErrorMessage(err),
                });
              }
            }
          })();
        },
      });
    } else {
      createEmployee.mutate(employeeData, {
        onSuccess: async (newEmployee: any) => {
          setFormOpen(false);

          if (employeeData.ponto_enabled && newEmployee?.id) {
            await ensurePontoLink(newEmployee.id, false);
          }

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
                  employee_id: newEmployee?.id || undefined,
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
                title: t.toasts.accessCreated,
                description: t.toasts.accessCreatedDesc.replace('{email}', employeeData.email).replace('{password}', _password),
                duration: 15000,
              });
            } catch (err: any) {
              toast({
                variant: 'destructive',
                title: t.toasts.employeeCreatedAccessError,
                description: getErrorMessage(err),
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
    accountId?: string;
    employeeId?: string;
    payrollKind?: 'salary' | 'vale' | 'bonus' | 'rescission';
  }) => {
    const today = new Date().toISOString().split('T')[0];
    try {
      const { getCurrentUserCompanyId } = await import('@/hooks/useUserCompany');
      const company_id = await getCurrentUserCompanyId();
      const { error } = await supabase.from('financial_transactions').insert({
        transaction_type: input.type,
        amount: input.amount,
        description: input.description,
        category: 'Funcionários',
        transaction_date: today,
        paid_date: today,
        is_paid: true,
        notes: input.notes,
        account_id: input.accountId || null,
        created_by: user?.id,
        company_id,
        employee_id: input.employeeId ?? null,
        payroll_kind: input.payrollKind ?? null,
      } as any);

      if (error) {
        console.error('Erro ao registrar despesa de funcionário:', error);
        toast({
          variant: 'destructive',
          title: t.toasts.errorExpense,
          description: getErrorMessage(error),
        });
        throw error;
      }

      queryClient.invalidateQueries({ queryKey: ['financial-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['financial-summary'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['account-balances'] });
    } catch (err: any) {
      // Toast já foi exibido no branch acima. Re-emite só se for erro inesperado.
      if (!err?.message?.startsWith('Erro ao')) {
        console.error('Falha inesperada ao registrar despesa:', err);
        toast({
          variant: 'destructive',
          title: t.toasts.errorExpense,
          description: getErrorMessage(err, 'Erro desconhecido. Tente novamente.'),
        });
      }
      throw err;
    }
  }, [queryClient, user?.id, toast, t]);

  const handleMovement = (data: { amount: number; description?: string; subType?: string; accountId?: string }) => {
    if (!movementEmployee) return;

    // If falta_banco, just record a non-financial movement
    const isBancoHoras = movementType === 'falta' && data.subType === 'banco';
    const effectiveType = isBancoHoras ? 'falta_banco' : movementType;

    const bal = activeBalance;
    let newBalance = bal.currentBalance;
    if (!isBancoHoras) {
      if (movementType === 'vale' || movementType === 'falta') newBalance -= data.amount;
      else newBalance += data.amount;
    }

    const emp = movementEmployee; // capture pra evitar stale closure no onSuccess

    addMovement.mutate({
      employee_id: emp.id,
      type: effectiveType,
      amount: data.amount,
      balance_after: isBancoHoras ? bal.currentBalance : newBalance,
      description: data.description,
      created_by: user?.id,
    }, {
      onSuccess: async () => {
        // Apenas VALE gera despesa imediata no financeiro (sai da conta indicada
        // e aparece no extrato). BÔNUS e FALTA são saldos internos do funcionário
        // — entram no caixa só quando a folha é paga (handlePayment cuida disso).
        if (movementType === 'vale') {
          try {
            await registerFinancialTransaction({
              type: 'saida',
              amount: data.amount,
              description: `Vale - ${emp.name}`,
              notes: data.description,
              accountId: data.accountId,
              employeeId: emp.id,
              payrollKind: 'vale',
            });
          } catch {
            // Toast já mostrado em registerFinancialTransaction; mantém modal
            // aberto pro usuário decidir (corrigir conta, tentar de novo).
            return;
          }
        }
        setMovementEmployee(null);
      },
    });
  };

  const handlePayment = async (payload: PaymentPayload) => {
    if (!paymentEmployee) return;
    const emp = paymentEmployee; // capture reference to avoid stale closure
    const sal = emp.salary;
    const subtotal = sal + activeBalance.totalBonus - activeBalance.totalFaltas;
    const toPay = subtotal - payload.valeDiscount;
    const remainingVales = activeBalance.totalVales - payload.valeDiscount;

    const paymentDetails = {
      salary: sal,
      bonus: activeBalance.totalBonus,
      faltas: activeBalance.totalFaltas,
      subtotal,
      valeDiscount: payload.valeDiscount,
      remainingVales,
      amountPaid: toPay,
      accountId: payload.accountId,
    };

    // 1. Register payment movement
    addMovement.mutate({
      employee_id: emp.id,
      type: 'pagamento',
      amount: toPay,
      balance_after: 0,
      description: payload.description || 'Pagamento de salário',
      payment_method: payload.accountId,
      created_by: user?.id,
    }, {
      onSuccess: async () => {
        try {
          // 2. Register adjustment to reset balance to salary
          const { error: ajusteError } = await supabase.from('employee_movements').insert({
            employee_id: emp.id,
            type: 'ajuste',
            amount: sal,
            balance_after: sal,
            description: 'Reset para salário base',
            payment_details: paymentDetails,
            created_by: user?.id,
          } as any);
          if (ajusteError) {
            console.error('Erro ao registrar ajuste:', ajusteError);
            toast({ variant: 'destructive', title: t.toasts.errorBalance, description: t.toasts.errorBalanceDesc });
          }

          // 3. Re-register remaining vales if partial discount
          if (remainingVales > 0) {
            const { error: valeError } = await supabase.from('employee_movements').insert({
              employee_id: emp.id,
              type: 'vale',
              amount: remainingVales,
              balance_after: sal - remainingVales,
              description: 'Vales não descontados no pagamento',
              created_by: user?.id,
            } as any);
            if (valeError) {
              console.error('Erro ao relançar vales:', valeError);
              toast({ variant: 'destructive', title: t.toasts.errorRemainingAdvances });
            }
          }

          // 4. Quita uma folha pendente do funcionário (se existir) ou cria nova transação tipada
          const { data: pendingPayroll } = await supabase
            .from('financial_transactions')
            .select('id, amount')
            .eq('employee_id', emp.id)
            .eq('payroll_kind', 'salary')
            .eq('is_paid', false)
            .is('cancelled_at', null)
            .order('due_date', { ascending: true })
            .limit(1)
            .maybeSingle();

          if (pendingPayroll?.id) {
            // Atualiza a folha pendente em vez de criar nova linha (evita duplicar despesa)
            const today = new Date().toISOString().split('T')[0];
            const { error: payErr } = await supabase
              .from('financial_transactions')
              .update({
                is_paid: true,
                paid_date: today,
                account_id: payload.accountId,
                amount: toPay,
                notes: payload.description,
              } as any)
              .eq('id', pendingPayroll.id);
            if (payErr) {
              console.error('Erro ao quitar folha pendente:', payErr);
            }
            queryClient.invalidateQueries({ queryKey: ['financial-transactions'] });
            queryClient.invalidateQueries({ queryKey: ['financial-summary'] });
            queryClient.invalidateQueries({ queryKey: ['account-balances'] });
          } else {
            await registerFinancialTransaction({
              type: 'saida',
              amount: toPay,
              description: `Pagamento de salário - ${emp.name}`,
              notes: payload.description,
              accountId: payload.accountId,
              employeeId: emp.id,
              payrollKind: 'salary',
            });
          }
        } catch (err) {
          console.error('Erro no fluxo de pagamento:', err);
          toast({ variant: 'destructive', title: t.toasts.errorPaymentFlow, description: t.toasts.errorPaymentFlowDesc });
        }

        queryClient.invalidateQueries({ queryKey: ['employee-movements'] });
        queryClient.invalidateQueries({ queryKey: ['all-employee-movements'] });
        setPaymentEmployee(null);

        // Show receipt confirmation dialog
        setReceiptConfirmData({
          employee: emp,
          movement: {
            type: 'pagamento',
            amount: toPay,
            balance_after: 0,
            description: payload.description || 'Pagamento de salário',
            payment_method: payload.accountId,
            payment_details: paymentDetails,
            created_at: new Date().toISOString(),
            id: '',
          },
        });
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
        toast({ variant: 'destructive', title: t.toasts.errorDeleteUser, description: getErrorMessage(err) });
      }
    }
    deleteEmployee.mutate(employee.id);
  }, [deleteEmployee, toast, t]);

  const fmtCurrency = (v: number) => formatMoney(v, currency, locale);

  const getInitials = (name: string) =>
    name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();

  const openNewEmployee = () => { setEditingEmployee(null); setFormOpen(true); };

  return (
    <div className={cn('space-y-6 min-w-0 w-full max-w-full overflow-x-hidden', isMobile && 'pb-24')}>
      <MobilePageHeader
        title={t.page.title}
        subtitle={t.page.subtitle}
        icon={Users}
        actions={
          isMobile ? (
            <Badge variant="secondary" className="text-[10px]">{employees.length}</Badge>
          ) : (
            <div className="flex items-center gap-3">
              <Badge variant="secondary">{employees.length}</Badge>
            </div>
          )
        }
      />

      <SettingsSidebarLayout tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab}>
        {activeTab === 'list' ? (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={isMobile ? t.toolbar.searchPlaceholderMobile : t.toolbar.searchPlaceholder}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={sort} onValueChange={setSort}>
                <SelectTrigger className="w-full sm:w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="az">{t.toolbar.sortAz}</SelectItem>
                  <SelectItem value="newest">{t.toolbar.sortNewest}</SelectItem>
                  <SelectItem value="oldest">{t.toolbar.sortOldest}</SelectItem>
                </SelectContent>
              </Select>
              <ViewModeToggle value={viewMode} onChange={setViewMode} showLabels={!isMobile} />
              {!isMobile && (
                <Button onClick={openNewEmployee} className="gap-1.5">
                  <Plus className="h-4 w-4" /> {t.toolbar.newEmployee}
                </Button>
              )}
            </div>

            {/* Loading / vazio compartilhados entre os modos */}
            {isLoading ? (
              viewMode === 'grid' ? (
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3">
                  {[1, 2, 3].map(i => <div key={i} className="h-48 rounded-lg bg-muted animate-pulse" />)}
                </div>
              ) : (
                <div className="space-y-2">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="h-[72px] rounded-lg bg-muted animate-pulse" />
                  ))}
                </div>
              )
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={<Users className="h-12 w-12" />}
                title={search ? t.empty.noResults : t.empty.noEmployees}
                description={search ? t.empty.noResultsDescription : isMobile ? t.empty.noEmployeesDescriptionMobile : t.empty.noEmployeesDescriptionDesktop}
              />
            ) : viewMode === 'grid' ? (
              // ---------------------------------------------------------------
              // Visão CARDS: grid responsivo (1 col mobile / 2 col desktop /
              // 3 col em telas largas). Reusa o EmployeeCard com todas as ações.
              // ---------------------------------------------------------------
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
            ) : isMobile ? (
              // -------------------------------------------------------------
              // Visão LISTA (mobile): lista nativa via MobileListItem, ações
              // no overflow ⋮ (ações secundárias vivem no menu, não inline).
              // -------------------------------------------------------------
              <div className="rounded-xl border bg-card overflow-hidden">
                {filtered.map((emp) => {
                    const balance = balanceMap.get(emp.id) || calculateEmployeeBalance([], emp.salary);
                    const balancePositive = balance.currentBalance >= 0;

                    const itemActions: ItemAction[] = [
                      {
                        key: 'extract',
                        label: t.actions.view,
                        icon: <FileText className="h-4 w-4" />,
                        onClick: () => setExtractEmployee(emp),
                      },
                      {
                        key: 'vale',
                        label: t.actions.advance,
                        icon: <Banknote className="h-4 w-4" />,
                        onClick: () => { setMovementType('vale'); setMovementEmployee(emp); },
                      },
                      {
                        key: 'bonus',
                        label: t.actions.bonus,
                        icon: <Gift className="h-4 w-4" />,
                        onClick: () => { setMovementType('bonus'); setMovementEmployee(emp); },
                      },
                      {
                        key: 'falta',
                        label: t.actions.absence,
                        icon: <AlertCircle className="h-4 w-4" />,
                        onClick: () => { setMovementType('falta'); setMovementEmployee(emp); },
                      },
                      {
                        key: 'payment',
                        label: t.actions.payment,
                        icon: <CreditCard className="h-4 w-4" />,
                        onClick: () => setPaymentEmployee(emp),
                      },
                      {
                        key: 'edit',
                        label: t.actions.edit,
                        icon: <Pencil className="h-4 w-4" />,
                        variant: 'edit' as const,
                        onClick: () => { setEditingEmployee(emp); setFormOpen(true); },
                      },
                      {
                        key: 'delete',
                        label: t.actions.delete,
                        icon: <Trash2 className="h-4 w-4" />,
                        variant: 'destructive' as const,
                        onClick: () => setEmployeeToDelete(emp),
                      },
                    ];

                    if (emp.ponto_enabled && emp.ponto_slug) {
                      itemActions.splice(itemActions.length - 2, 0, {
                        key: 'ponto-link',
                        label: t.actions.timeclockLink,
                        icon: <Clock className="h-4 w-4" />,
                        onClick: async () => {
                          const link = `${window.location.origin}/ponto/${emp.ponto_slug}`;
                          try {
                            await navigator.clipboard.writeText(link);
                            toast({ title: 'Link gerado e copiado!', description: link });
                          } catch {
                            toast({ variant: 'destructive', title: 'Não foi possível copiar', description: link });
                          }
                        },
                      });
                    }

                    const subtitleParts = [
                      emp.position,
                      fmtCurrency(emp.salary || 0),
                    ].filter(Boolean);

                    return (
                      <MobileListItem
                        key={emp.id}
                        onClick={() => setExtractEmployee(emp)}
                        actions={itemActions}
                        leading={
                          <Avatar className="h-10 w-10">
                            <SignedAvatarImage src={emp.photo_url} alt={emp.name} />
                            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                              {getInitials(emp.name)}
                            </AvatarFallback>
                          </Avatar>
                        }
                        title={emp.name}
                        subtitle={subtitleParts.join(' • ')}
                        trailing={
                          <Badge
                            variant={balancePositive ? 'default' : 'destructive'}
                            className="text-[10px] px-2 py-0.5 whitespace-nowrap"
                          >
                            {fmtCurrency(balance.currentBalance)}
                          </Badge>
                        }
                      />
                    );
                  })}
              </div>
            ) : (
              // -------------------------------------------------------------
              // Visão LISTA (desktop): tabela limpa (1 borda externa + linhas
              // por divisor), saldo como selo de status saturado, ações no
              // RowActionsMenu (editar = warning, excluir = destructive).
              // -------------------------------------------------------------
              <EmployeesListView
                employees={filtered}
                balanceMap={balanceMap}
                onEdit={(emp) => { setEditingEmployee(emp); setFormOpen(true); }}
                onDelete={(emp) => setEmployeeToDelete(emp)}
                onMovement={(emp, type) => { setMovementType(type); setMovementEmployee(emp); }}
                onPayment={(emp) => setPaymentEmployee(emp)}
                onExtract={(emp) => setExtractEmployee(emp)}
              />
            )}
          </div>
        ) : activeTab === 'teams' ? (
          <TeamsPanel />
        ) : activeTab === 'timeclock' ? (
          <AdminTimePanel />
        ) : (
          <EmployeesDashboard employees={employees} balances={balanceMap} />
        )}
      </SettingsSidebarLayout>

      {/* FAB mobile-only — só na tab de lista. Desktop usa botão inline na toolbar. */}
      {isMobile && activeTab === 'list' && (
        <FABButton
          icon={<Plus className="h-5 w-5" />}
          label={t.toolbar.fabLabel}
          onClick={openNewEmployee}
        />
      )}

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
          employeeId={movementEmployee.id}
          salary={movementEmployee.salary}
          cashBankAccounts={cashBankAccounts}
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
          employeeSalary={extractEmployee.salary || 0}
          movements={movements}
          balance={activeBalance}
          onDeleteMovement={id => deleteMovement.mutate(id)}
        />
      )}

      {/* Confirmação de exclusão (mobile usa esta — centralizada na page) */}
      <AlertDialog open={!!employeeToDelete} onOpenChange={o => { if (!o) setEmployeeToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.deleteConfirm.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {employeeToDelete?.user_id
                ? t.deleteConfirm.descriptionWithUser
                : t.deleteConfirm.descriptionSimple}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel>{t.deleteConfirm.cancelLabel}</AlertDialogCancel>
            {employeeToDelete?.user_id && (
              <AlertDialogAction
                onClick={() => {
                  if (employeeToDelete) {
                    handleDeleteWithUser(employeeToDelete);
                    setEmployeeToDelete(null);
                  }
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {t.deleteConfirm.deleteWithUser}
              </AlertDialogAction>
            )}
            <AlertDialogAction
              onClick={() => {
                if (employeeToDelete) {
                  deleteEmployee.mutate(employeeToDelete.id);
                  setEmployeeToDelete(null);
                }
              }}
            >
              {employeeToDelete?.user_id ? t.deleteConfirm.deleteEmployee : t.deleteConfirm.deleteLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!receiptConfirmData} onOpenChange={o => { if (!o) setReceiptConfirmData(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.receiptConfirm.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.receiptConfirm.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.receiptConfirm.cancelLabel}</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (receiptConfirmData) {
                const html = generateReceiptHTML({
                  employeeName: receiptConfirmData.employee.name,
                  salary: receiptConfirmData.employee.salary || 0,
                  movement: receiptConfirmData.movement,
                  companySettings,
                  whiteLabel: wlEnabled,
                  generatedByName: profile?.full_name || undefined,
                });
                const blob = new Blob([html], { type: 'text/html' });
                const url = URL.createObjectURL(blob);
                const win = window.open(url, '_blank');
                if (win) win.onload = () => URL.revokeObjectURL(url);
              }
              setReceiptConfirmData(null);
            }}>{t.receiptConfirm.confirmLabel}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
