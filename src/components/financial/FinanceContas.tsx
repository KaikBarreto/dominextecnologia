import { useState, useMemo, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHeader, TableRow,
} from '@/components/ui/table';
import { SortableTableHead } from '@/components/ui/SortableTableHead';
import { useTableSort } from '@/hooks/useTableSort';
import { RowActionsMenu, type RowAction } from '@/components/ui/RowActionsMenu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Check, AlertTriangle, Clock, DollarSign, Plus, Pencil, Trash2, ArrowUpCircle, ArrowDownCircle, CheckCircle2, Receipt, Eye, Search, Info, Layers } from 'lucide-react';
import { cn, fuzzyIncludes } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { MobileListItem, type ItemAction } from '@/components/mobile/MobileListItem';
import { EmptyState } from '@/components/mobile/EmptyState';
import { getErrorMessage } from '@/utils/errorMessages';
import { FABButton } from '@/components/mobile/FABButton';
import { MobilePillTabs } from '@/components/mobile/MobilePillTabs';
import { FilterCheckboxDropdown } from './FilterCheckboxDropdown';
import type { FinancialTransaction } from '@/types/database';
import { format, isBefore, addDays, startOfDay, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { useFinancialAccounts } from '@/hooks/useFinancialAccounts';
import { useCanManageFinanceSettings } from '@/hooks/useCanManageFinanceSettings';
import { useAuth } from '@/contexts/AuthContext';
import { useAllCreditCardBills, type CreditCardBillWithTransactions } from '@/hooks/useCreditCardBills';
import { isTransactionInDateRange } from '@/lib/finance-date';
import { useCostCenters } from '@/hooks/useCostCenters';
import { filterByCostCenters, NO_COST_CENTER } from '@/lib/cost-center-breakdown';
import { CreditCardInvoiceRow } from './CreditCardInvoiceRow';

/** Parse a YYYY-MM-DD string as a local date (avoids UTC-offset shift) */
function parseLocalDate(dateStr: string): Date {
  return parseISO(dateStr + 'T12:00:00');
}
import { ContaFormDialog } from './ContaFormDialog';
import { AccountFormDialog } from './AccountFormDialog';
import { ReceivePaymentModal } from './ReceivePaymentModal';
import { ReceivableDetailModal } from './ReceivableDetailModal';
import type { TransactionType } from '@/types/database';
import { useFinancial } from '@/hooks/useFinancial';
import { useDataPagination } from '@/hooks/useDataPagination';
import { DataTablePagination } from '@/components/ui/DataTablePagination';
import { EmployeePaymentModal, PaymentPayload } from '@/components/employees/EmployeePaymentModal';
import { useEmployeeMovements } from '@/hooks/useEmployeeMovements';
import { calculateEmployeeBalance } from '@/utils/employeeCalculations';
import { Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatMoney } from '@/lib/format';
import { todayInTz } from '@/lib/timezone';
import { isPaidDateAllowedInTz } from '@/lib/dre-regime';
import { buildAccountOptions } from '@/components/financial/accountSelectOptions';
import { buildReceiptBreakdowns } from '@/lib/financial-transaction-display';
import { PARTIAL_RECEIPT_CATEGORY } from '@/lib/finance-constants';
import {
  getBatchPayIneligibility,
  summarizeBatchSelection,
  batchSideOf,
  type BatchPayIneligibleReason,
  type BatchSide,
} from '@/lib/finance-batch-payment';
import { BatchPayModal, type BatchPayConfirmPayload } from './BatchPayModal';

type SubTab = 'pagar' | 'receber';
type FilterStatus = 'pendentes' | 'vencidas' | 'pagas' | 'todas';

type PayrollTxn = FinancialTransaction & { customer?: any; supplier?: any; employee?: { id: string; name: string; salary: number; photo_url: string | null } };

interface FinanceContasProps {
  /** Transações já filtradas pelo período selecionado no parent. */
  transactions: PayrollTxn[];
  /**
   * Dataset COMPLETO (sem filtro de período), usado só pela busca textual
   * universal — pra achar a conta mesmo em outro mês. Opcional: se ausente,
   * a busca cai pra `transactions` (comportamento period-bound).
   */
  allTransactions?: PayrollTxn[];
  /**
   * Raizes + filhas ja limitadas pela RLS da empresa. Usado somente para
   * rastrear as tarifas que compoem o liquido das contas recebidas; nunca vira
   * linha da listagem nem entra nos totais novamente.
   */
  transactionAuditTrail?: FinancialTransaction[];
  isLoading: boolean;
  onMarkAsPaid: (params: any) => Promise<any>;
  dateRange?: { from?: Date; to?: Date };
}

export function FinanceContas({
  transactions,
  allTransactions,
  transactionAuditTrail,
  isLoading,
  onMarkAsPaid,
  dateRange,
}: FinanceContasProps) {
  const [subTab, setSubTab] = useState<SubTab>('pagar');
  const [filter, setFilter] = useState<FilterStatus>('pendentes');
  // Filtro multi-select: vazio = todas as categorias. Pattern FilterCheckboxGroup.
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  // Filtro multi-select de centro de custo, espelhando o de categoria. Vazio =
  // todos; o balde `NO_COST_CENTER` mostra as contas SEM centro (sem ele, elas
  // sumiriam sem explicação ao filtrar).
  const [costCenterFilter, setCostCenterFilter] = useState<string[]>([]);
  // Busca textual UNIVERSAL: quando há texto, procura no dataset inteiro do subTab
  // (pagar OU receber) IGNORANDO status/categoria/período. Pattern tela de OS (v1.9.40).
  const [search, setSearch] = useState('');
  const [contaFormOpen, setContaFormOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<FinancialTransaction | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [receivingTxn, setReceivingTxn] = useState<PayrollTxn | null>(null);
  const [payingDespesaTxn, setPayingDespesaTxn] = useState<FinancialTransaction | null>(null);
  const [payrollTxn, setPayrollTxn] = useState<PayrollTxn | null>(null);
  const [viewingTxn, setViewingTxn] = useState<FinancialTransaction | null>(null);
  const [payDespAccountId, setPayDespAccountId] = useState('');
  const [payDespDate, setPayDespDate] = useState('');
  const [payDespMethod, setPayDespMethod] = useState('pix');
  const [payDespNotes, setPayDespNotes] = useState('');
  const [payDespAccountFormOpen, setPayDespAccountFormOpen] = useState(false);
  const [payDespAccountInitialName, setPayDespAccountInitialName] = useState('');
  const [payDespAccountQuery, setPayDespAccountQuery] = useState('');
  // ── Quitação em LOTE ("A Pagar" e "A Receber") ────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  /**
   * Lado do lote, travado no PRIMEIRO item marcado (`null` = nada selecionado).
   * Um lote nunca mistura contas a pagar com contas a receber: o total do grupo
   * seria a soma de dinheiro que saiu com dinheiro que entrou, um número que
   * não corresponde a nenhuma linha de extrato. O servidor recusa a mistura.
   */
  const [selectionSide, setSelectionSide] = useState<BatchSide | null>(null);
  /**
   * Id do lote gerado NO CLIENT e reaproveitado enquanto a MESMA seleção não
   * for quitada. É o que torna o botão seguro contra duplo clique e contra
   * reenvio depois de a rede cair: a RPC reconhece o id, devolve
   * `already_applied` e não quita nada duas vezes.
   */
  const batchGroupIdRef = useRef<string | null>(null);
  const isMobile = useIsMobile();
  // `timezone`: fuso da empresa. É ele que define o "hoje" de `paid_date`, que
  // por sua vez decide o MÊS da despesa no regime de Caixa da DRE.
  const { locale, currency, timezone } = useAppLocaleContext();
  const fin = MESSAGES[locale].app.finance;
  const fmt = (v: number) => formatMoney(v, currency, locale);
  const { deleteTransaction, payTransactionsBatch } = useFinancial();
  const { hasPermission, isAdminOrGestor, hasPermissionRecord } = useAuth();
  // Quem não gerencia configuração não vê o "+" de criar conta/categoria na
  // hora: o banco recusa (RLS pede `can_manage_system`) e o erro chegava sem
  // explicação. Mesmo critério do CostCenterSelect.
  const canManageFinanceSettings = useCanManageFinanceSettings();
  // Espelha `public.can_delete_finance` (RLS de DELETE em financial_transactions):
  // admin/gestor sempre; para os demais, SÓ com registro em user_permissions
  // contendo a permissão (ou o curinga '*'). O fallback legado do
  // `hasPermission` (sem registro => libera por ter qualquer role) NÃO vale
  // aqui: mostraria o botão pra quem o banco recusa. UX; a trava é a RLS.
  const canDeleteFinance = isAdminOrGestor() || (hasPermissionRecord && hasPermission('fn:delete_finance'));
  const { accounts: allAccounts } = useFinancialAccounts();
  const { costCenters } = useCostCenters();
  const cashBankAccounts = allAccounts.filter(a => a.type !== 'cartao' && a.is_active);
  // Opções do SearchableSelect — só contas não-cartão e ativas.
  const cashBankAccountOptions = useMemo(
    () => buildAccountOptions(cashBankAccounts as any, { includeCard: true }),
    [cashBankAccounts],
  );
  // Faturas de cartão — usadas em subTab='pagar' pra agrupar despesas em
  // linhas-de-fatura (uma linha por fatura) em vez de listar cada despesa solta.
  // v1.9.15 — refactor cartão/faturas.
  const { bills: allBills } = useAllCreditCardBills();
  const { movements: payrollEmpMovements } = useEmployeeMovements(payrollTxn?.employee?.id);
  const payrollBalance = useMemo(() => {
    if (!payrollTxn?.employee) return calculateEmployeeBalance([], 0);
    return calculateEmployeeBalance(payrollEmpMovements ?? [], payrollTxn.employee.salary);
  }, [payrollEmpMovements, payrollTxn?.employee]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isPayrollSalaryRow = (t: PayrollTxn) =>
    t.payroll_kind === 'salary' && !!t.employee_id && !t.is_paid;

  const handleMarkAsPaidClick = (t: PayrollTxn) => {
    if (isPayrollSalaryRow(t)) {
      setPayrollTxn(t);
      return;
    }
    if (t.transaction_type === 'entrada') {
      setReceivingTxn(t);
    } else {
      setPayingDespesaTxn(t);
      // Fuso DA EMPRESA: `toISOString()` grava a data de AMANHÃ a partir das
      // 21h locais (UTC-3) e joga a despesa pro mês seguinte. São Paulo
      // chumbado tinha o mesmo efeito pra empresa em Cuiabá (UTC-4) às 23h15
      // do dia 30, que gravava dia 31.
      setPayDespDate(todayInTz(timezone));
      setPayDespAccountId(cashBankAccounts[0]?.id ?? '');
      setPayDespMethod('pix');
      setPayDespNotes('');
    }
  };

  const handleConfirmPayrollPayment = async (payload: PaymentPayload) => {
    if (!payrollTxn) return;
    const subtotal = (payrollTxn.employee?.salary ?? Number(payrollTxn.amount))
      + payrollBalance.totalBonus
      - payrollBalance.totalFaltas;
    const netAmount = subtotal - payload.valeDiscount;

    const { error } = await supabase.rpc('pay_payroll_transaction', {
      p_transaction_id: payrollTxn.id,
      p_account_id: payload.accountId,
      // Idem: `paid_date` da folha define o mês da despesa no regime de Caixa,
      // e o dia é o do fuso DA EMPRESA.
      p_paid_date: todayInTz(timezone),
      p_vale_discount: payload.valeDiscount,
      p_net_amount: netAmount,
      p_notes: payload.description ?? null,
      p_payment_method: 'pix',
    });

    if (error) {
      toast({ variant: 'destructive', title: fin.accounts.payroll.toastError, description: getErrorMessage(error) });
      return;
    }

    queryClient.invalidateQueries({ queryKey: ['financial-transactions'] });
    queryClient.invalidateQueries({ queryKey: ['financial-summary'] });
    queryClient.invalidateQueries({ queryKey: ['account-balances'] });
    queryClient.invalidateQueries({ queryKey: ['employee-movements'] });
    queryClient.invalidateQueries({ queryKey: ['all-employee-movements'] });
    setPayrollTxn(null);
    toast({ title: fin.accounts.payroll.toastSuccess });
  };

  const today = startOfDay(new Date());
  const next7Days = addDays(today, 7);

  const contaDefaultType: TransactionType = subTab === 'pagar' ? 'saida' : 'entrada';

  // baseFiltered = txns "visíveis" sem as despesas de cartão (que viram linhas-de-fatura).
  // Em subTab='pagar', as despesas com credit_card_bill_date saem daqui; quem
  // representa elas é o agregado em `cardInvoices`. Em subTab='receber' não tem cartão.
  const baseFiltered = useMemo(() => {
    return transactions.filter((t) => {
      const correctType = subTab === 'pagar' ? t.transaction_type === 'saida' : t.transaction_type === 'entrada';
      if (!correctType) return false;
      // Em 'pagar', remove despesas que pertencem a fatura de cartão (vão pro bloco de invoices).
      if (subTab === 'pagar' && t.credit_card_bill_date) return false;
      return true;
    });
  }, [transactions, subTab]);

  // Mapa account_id → FinancialAccount pra resolver o cartão de cada bill rapidinho.
  const cardAccountMap = useMemo(() => {
    const map: Record<string, typeof allAccounts[number]> = {};
    for (const a of allAccounts) {
      if (a.type === 'cartao') map[a.id] = a;
    }
    return map;
  }, [allAccounts]);

  // Faturas filtradas pra subTab='pagar'. Status semântico:
  // - pendentes = aberta + parcial + fechada (qualquer não-paga)
  // - vencidas = não-paga com due_date < hoje
  // - pagas = status='paid'
  // - todas = tudo
  // Só inclui faturas com pelo menos 1 transação ou amount_paid > 0
  // (filtra bills "vazias" que ficaram órfãs).
  const cardInvoices = useMemo<CreditCardBillWithTransactions[]>(() => {
    if (subTab !== 'pagar') return [];
    const eligible = allBills.filter((b) => {
      const account = cardAccountMap[b.account_id];
      if (!account) return false;
      const hasContent = (b.total_amount ?? 0) > 0 || Number(b.amount_paid ?? 0) > 0;
      return hasContent;
    });
    // Filtra faturas pelo periodo selecionado (comparando due_date da fatura
    // contra o range do DateRangeFilter do parent). Sem isso, todas as faturas
    // de todos os meses apareciam — CEO reportou como bug.
    const inRange = eligible.filter((b) => {
      if (!dateRange?.from && !dateRange?.to) return true;
      const dueDate = parseLocalDate(b.due_date);
      if (dateRange.from && dueDate < dateRange.from) return false;
      if (dateRange.to && dueDate > dateRange.to) return false;
      return true;
    });
    return inRange.filter((b) => {
      if (filter === 'todas') return true;
      if (filter === 'pagas') return b.status === 'paid';
      if (filter === 'pendentes') return b.status !== 'paid';
      if (filter === 'vencidas') {
        return b.status !== 'paid' && isBefore(parseLocalDate(b.due_date), today);
      }
      return true;
    });
  }, [allBills, cardAccountMap, subTab, filter, today, dateRange]);

  const searchActive = search.trim().length > 0;

  // Casa o termo de busca contra os campos relevantes da conta: descrição,
  // contraparte (cliente/funcionário), categoria e o valor como texto.
  const matchesSearch = (t: PayrollTxn): boolean => {
    if (!searchActive) return true;
    return (
      fuzzyIncludes(t.description, search)
      || fuzzyIncludes(t.category, search)
      || fuzzyIncludes(t.customer?.name, search)
      || fuzzyIncludes(t.supplier?.name, search)
      || fuzzyIncludes(t.employee?.name, search)
      || fuzzyIncludes(String(Number(t.amount)), search)
      || fuzzyIncludes(fmt(Number(t.amount)), search)
    );
  };

  // Base da busca universal: usa o dataset COMPLETO (allTransactions, sem filtro
  // de período) aplicando só a regra de tipo do subTab (+ exclui despesas de
  // cartão em 'pagar', que viram linhas-de-fatura). Cai pra `transactions` se o
  // parent não passar o dataset completo.
  const searchBase = useMemo(() => {
    const pool = allTransactions ?? transactions;
    return pool.filter((t) => {
      const correctType = subTab === 'pagar' ? t.transaction_type === 'saida' : t.transaction_type === 'entrada';
      if (!correctType) return false;
      if (subTab === 'pagar' && t.credit_card_bill_date) return false;
      return true;
    });
  }, [allTransactions, transactions, subTab]);

  // Decomposicao somente de LEITURA para a aba de recebiveis pagos. O bruto
  // continua sendo `amount` da conta; a taxa vem das linhas financeiras ja
  // persistidas (filhas/netas ou mesma cobranca Asaas), e o liquido e apenas a
  // diferenca exibida em centavos. Nao altera summaries, DRE ou saldo.
  const receiptBreakdowns = useMemo(
    () => buildReceiptBreakdowns(
      (allTransactions ?? transactions).filter((t) => t.transaction_type === 'entrada'),
      transactionAuditTrail ?? allTransactions ?? transactions,
    ),
    [allTransactions, transactions, transactionAuditTrail],
  );

  /**
   * Quantos resultados a MESMA busca teria na OUTRA sub-aba.
   *
   * A tela abre em "A Pagar" e a busca é escopada à sub-aba ativa. Quem procura
   * um cliente que tem conta A RECEBER vê "nada encontrado" e conclui que o
   * lançamento não foi criado — foi exatamente o que gerou o chamado de
   * 19/09/2026 (duas cobranças existiam, corretas, na aba ao lado). Em vez de
   * mudar o escopo da busca (que misturaria receita e despesa na mesma lista),
   * a tela passa a DIZER que há resultado do outro lado.
   */
  const otherTabMatches = useMemo(() => {
    if (!searchActive) return 0;
    const pool = allTransactions ?? transactions;
    return pool.filter((t) => {
      const otherType = subTab === 'pagar' ? 'entrada' : 'saida';
      if (t.transaction_type !== otherType) return false;
      // Espelha a exclusão de despesa de cartão que a aba "A Pagar" faz.
      if (subTab === 'receber' && t.credit_card_bill_date) return false;
      return matchesSearch(t);
    }).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTransactions, transactions, subTab, searchActive, search]);

  const filtered = useMemo(() => {
    // Busca UNIVERSAL: com texto digitado, varre o dataset inteiro do subTab
    // (searchBase, todos os meses) IGNORANDO status/categoria/período — só texto.
    if (searchActive) {
      return searchBase.filter(matchesSearch);
    }
    const byStatusAndCategory = baseFiltered.filter((t) => {
      if (filter === 'todas') { /* pass */ }
      else if (filter === 'pagas') { if (!t.is_paid) return false; }
      else if (filter === 'pendentes') { if (t.is_paid) return false; }
      else if (filter === 'vencidas') {
        if (t.is_paid || !t.due_date || !isBefore(parseLocalDate(t.due_date), today)) return false;
      }
      // Filtro de categoria (multi-select: vazio = todas)
      if (categoryFilter.length > 0) {
        if (!categoryFilter.includes(t.category ?? '')) return false;
      }
      return true;
    });
    // Centro de custo pelo motor puro compartilhado (mesma semântica de balde
    // "sem centro" usada em Movimentações e na DRE).
    return filterByCostCenters(byStatusAndCategory, costCenterFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseFiltered, searchBase, filter, today, categoryFilter, costCenterFilter, searchActive, search]);

  // Summary: somar TODAS as fontes (txns + faturas) pra refletir "movimento total"
  // — pendente/vencido/7dias/pago. Caso contrário o card "Pago" zeraria pra clientes
  // que pagam tudo via cartão.
  const summary = useMemo(() => {
    // Universo completo p/ summary: txns não-cartão + total das faturas.
    // (Em subTab='receber' não tem cartão, então só txns.)
    const txnUniverse = transactions.filter((t) =>
      (subTab === 'pagar' ? t.transaction_type === 'saida' : t.transaction_type === 'entrada')
      && !(subTab === 'pagar' && t.credit_card_bill_date)
    );

    // Bills elegíveis (com conteúdo + dentro do período) — independente do filtro de status.
    // Com filtro de categoria ativo, a fatura NÃO entra: ela junta despesas de várias
    // categorias, não cabe em "uma" categoria — por isso também some da lista (ver
    // bloco "Faturas de Cartão" abaixo). Sem isso os totais do topo continuavam
    // somando a fatura escondida e o dono achava que ela tinha sido paga.
    // Com filtro de categoria OU de centro de custo ativo, a fatura NÃO entra:
    // ela junta despesas de várias categorias e de vários centros, não cabe em
    // "um" deles (mesmo motivo pelo qual some da lista abaixo).
    const billUniverse = subTab === 'pagar' && categoryFilter.length === 0 && costCenterFilter.length === 0
      ? allBills.filter((b) => {
          if (!cardAccountMap[b.account_id]) return false;
          const hasContent = (b.total_amount ?? 0) > 0 || Number(b.amount_paid ?? 0) > 0;
          if (!hasContent) return false;
          // Respeita o filtro de período (mesma lógica de cardInvoices)
          if (dateRange?.from || dateRange?.to) {
            const dueDate = parseLocalDate(b.due_date);
            if (dateRange.from && dueDate < dateRange.from) return false;
            if (dateRange.to && dueDate > dateRange.to) return false;
          }
          return true;
        })
      : [];

    const pendenteTxn = txnUniverse.filter((t) => !t.is_paid).reduce((s, t) => s + Number(t.amount), 0);
    const pendenteBill = billUniverse
      .filter((b) => b.status !== 'paid')
      .reduce((s, b) => s + Math.max(0, (b.total_amount ?? 0) - Number(b.amount_paid ?? 0)), 0);

    const vencidoTxn = txnUniverse
      .filter((t) => !t.is_paid && t.due_date && isBefore(parseLocalDate(t.due_date), today))
      .reduce((s, t) => s + Number(t.amount), 0);
    const vencidoBill = billUniverse
      .filter((b) => b.status !== 'paid' && isBefore(parseLocalDate(b.due_date), today))
      .reduce((s, b) => s + Math.max(0, (b.total_amount ?? 0) - Number(b.amount_paid ?? 0)), 0);

    const prox7Txn = txnUniverse
      .filter((t) => !t.is_paid && t.due_date && !isBefore(parseLocalDate(t.due_date), today) && isBefore(parseLocalDate(t.due_date), next7Days))
      .reduce((s, t) => s + Number(t.amount), 0);
    const prox7Bill = billUniverse
      .filter((b) => b.status !== 'paid' && !isBefore(parseLocalDate(b.due_date), today) && isBefore(parseLocalDate(b.due_date), next7Days))
      .reduce((s, b) => s + Math.max(0, (b.total_amount ?? 0) - Number(b.amount_paid ?? 0)), 0);

    // Card "Pago/Recebido": padronizado na DATA DO RECEBIMENTO (decisão CEO 2026-06-13).
    // Os demais cards (pendente/vencido/7dias) seguem por VENCIMENTO via txnUniverse;
    // só este card mede realização de caixa. Por isso o pool é separado:
    //   - parte do dataset COMPLETO (allTransactions, sem filtro de período do parent),
    //     já que `transactions` chega pré-filtrado por vencimento (scope 'pagar') —
    //     usá-lo aqui contaminaria o "pago" com a régua de vencimento.
    //   - mesma regra de tipo do subTab + exclui despesa de cartão em 'pagar'.
    //   - só is_paid, filtrado pelo período pela DATA DO MOVIMENTO (scope 'caixa':
    //     transaction_date pra itens comuns, fatura pra cartão). Como o pool já é
    //     100% pago, 'caixa' e 'caixa-misto' dariam o mesmo resultado — 'caixa' é o
    //     mais semântico ("caixa realizado, sempre pela data do movimento").
    //   - dateRange vazio (sem período) inclui todos os pagos.
    const pagoPool = (allTransactions ?? transactions).filter((t) => {
      const correctType = subTab === 'pagar' ? t.transaction_type === 'saida' : t.transaction_type === 'entrada';
      if (!correctType) return false;
      if (subTab === 'pagar' && t.credit_card_bill_date) return false;
      if (!t.is_paid) return false;
      if (!dateRange?.from && !dateRange?.to) return true;
      return isTransactionInDateRange(t, dateRange, 'caixa');
    });
    const pagoTxn = pagoPool.reduce((s, t) => s + Number(t.amount), 0);
    const pagoBill = billUniverse.reduce((s, b) => s + Number(b.amount_paid ?? 0), 0);

    return {
      pendente: pendenteTxn + pendenteBill,
      vencido: vencidoTxn + vencidoBill,
      prox7: prox7Txn + prox7Bill,
      pago: pagoTxn + pagoBill,
    };
  }, [transactions, allTransactions, allBills, cardAccountMap, subTab, today, next7Days, dateRange, categoryFilter, costCenterFilter]);

  // Lista de categorias presentes nas transações atuais (baseFiltered, antes do
  // filtro de categoria) pra popular o <Select> de filtro. Ordena alfabeticamente.
  const availableCategories = useMemo(() => {
    const set = new Set<string>();
    // Usa baseFiltered (sem filtro de status nem categoria) pra que a lista
    // de opcões não encolha ao filtrar. Filtra pelo status corrente pra
    // mostrar só categorias relevantes ao status ativo.
    const pool = baseFiltered.filter((t) => {
      if (filter === 'todas') return true;
      if (filter === 'pagas') return t.is_paid;
      if (filter === 'pendentes') return !t.is_paid;
      if (filter === 'vencidas') return !t.is_paid && t.due_date && isBefore(parseLocalDate(t.due_date), today);
      return true;
    });
    for (const t of pool) {
      if (t.category) set.add(t.category);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [baseFiltered, filter, today]);

  // Resumo da categoria ativa: total + quantidade de lancamentos.
  const categorySummary = useMemo(() => {
    if (categoryFilter.length === 0) return null;
    const total = filtered.reduce((s, t) => s + Number(t.amount), 0);
    return { total, count: filtered.length };
  }, [filtered, categoryFilter]);

  // Centros ofertados: ativos + qualquer um já usado nas contas da tela (mesmo
  // desativado depois) — senão a conta antiga ficaria sem como ser filtrada.
  const availableCostCenters = useMemo(() => {
    const map = new Map<string, { name: string; color: string }>();
    costCenters.filter((c) => c.is_active).forEach((c) => map.set(c.id, { name: c.name, color: c.color }));
    for (const t of baseFiltered) {
      const id = t.cost_center_id;
      if (!id || map.has(id)) continue;
      const known = costCenters.find((c) => c.id === id);
      if (!known) continue;
      map.set(id, { name: `${known.name} (${fin.costCenters.inactiveSuffix})`, color: known.color });
    }
    return Array.from(map.entries()).map(([value, c]) => ({ value, label: c.name, color: c.color }));
  }, [costCenters, baseFiltered, fin.costCenters.inactiveSuffix]);

  // Resumo do centro de custo ativo: total + quantidade (espelha o de categoria).
  const costCenterSummary = useMemo(() => {
    if (costCenterFilter.length === 0) return null;
    const total = filtered.reduce((s, t) => s + Number(t.amount), 0);
    return { total, count: filtered.length };
  }, [filtered, costCenterFilter]);

  // Pré-calcula campos derivados pra ordenação na table desktop. O hook
  // useTableSort entende números (amount, due_date_ts) e strings (status).
  const filteredForSort = useMemo(() => {
    return filtered.map(t => ({
      ...t,
      _due_ts: t.due_date ? parseLocalDate(t.due_date).getTime() : 0,
      _amount_num: Number(t.amount),
      _status_order: t.is_paid ? 2 : (t.due_date && isBefore(parseLocalDate(t.due_date), today) ? 0 : 1),
    }));
  }, [filtered, today]);

  const { sortedItems, sortConfig, handleSort } = useTableSort(filteredForSort, '_due_ts', 'asc');

  const pagination = useDataPagination(isMobile ? filtered : sortedItems);

  // ══════════════════════════════════════════════════════════════════════════
  // QUITAÇÃO EM LOTE (as duas sub-abas: "A Pagar" e "A Receber")
  // ══════════════════════════════════════════════════════════════════════════
  //
  // A guarda de verdade é a RPC `pay_transactions_batch`: tudo ou nada, com a
  // mensagem já em PT-BR. O que existe aqui é ANTECIPAÇÃO dessas mesmas regras
  // pra desabilitar o checkbox e dizer o motivo ANTES do clique — o usuário não
  // pode selecionar 40 contas e descobrir o problema só no erro.
  //
  // A copy muda por lado (quem recebe não "quita", recebe), a mecânica não: é a
  // mesma RPC, o mesmo carimbo e a mesma regra de "nenhuma linha nova nasce".
  const isReceiveTab = subTab === 'receber';
  const batchMsg = isReceiveTab ? fin.accounts.batchReceive : fin.accounts.batchPay;
  const batchActionLabel = isReceiveTab
    ? fin.accounts.batchReceive.receiveButton
    : fin.accounts.batchPay.payButton;
  // Mesma régua do gate de `fn:manage_finance` já usada no Financeiro
  // (`useCanLaunchLeadRevenue`), que é a condição que a RPC checa no servidor:
  // quem não pode gerenciar o Financeiro não vê checkbox nenhum, em vez de
  // marcar 40 contas e levar um 42501 no clique.
  const batchEnabled = isAdminOrGestor() || (hasPermissionRecord && hasPermission('fn:manage_finance'));

  /** Contas que JÁ têm filha de baixa parcial (mesmo teste estrutural da RPC). */
  const partialParentIds = useMemo(() => {
    const set = new Set<string>();
    for (const t of transactionAuditTrail ?? []) {
      if (t.parent_transaction_id && t.category === PARTIAL_RECEIPT_CATEGORY) {
        set.add(t.parent_transaction_id);
      }
    }
    return set;
  }, [transactionAuditTrail]);

  /** Lançamentos que SÃO o pagamento de uma fatura de cartão. */
  const cardBillPaymentIds = useMemo(() => {
    const set = new Set<string>();
    for (const b of allBills) {
      const id = (b as any).payment_transaction_id;
      if (id) set.add(id as string);
    }
    return set;
  }, [allBills]);

  const eligibilityCtx = useMemo(
    () => ({ partialParentIds, cardBillPaymentIds }),
    [partialParentIds, cardBillPaymentIds],
  );

  /** `null` = a conta pode entrar no lote. */
  const batchReasonFor = (t: FinancialTransaction): BatchPayIneligibleReason | null =>
    getBatchPayIneligibility(t as any, eligibilityCtx);

  // "Marcar todas" respeita o filtro ativo: marca o que está na lista filtrada
  // (todas as páginas dela), nunca o banco inteiro.
  //
  // O LADO do lote entra aqui: com uma seleção já aberta, só continua
  // selecionável quem é do mesmo lado. Um lote que misturasse entrada com saída
  // teria um total que não corresponde a linha nenhuma de extrato (e
  // `undo_payment_group` devolveria esse mesmo número sem sentido) — o servidor
  // recusa, e a tela não deixa chegar lá.
  const selectableRows = useMemo(
    () => (batchEnabled
      ? filtered.filter((t) => (
        batchReasonFor(t) === null
        && (selectionSide === null || batchSideOf(t as any) === selectionSide)
      ))
      : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [batchEnabled, filtered, eligibilityCtx, selectionSide],
  );
  // A seleção é sempre lida DE VOLTA da lista visível: conta que saiu do filtro
  // não entra no total nem no lote, mesmo que o id continue guardado.
  const selectedRows = useMemo(
    () => selectableRows.filter((t) => selectedIds.has(t.id)),
    [selectableRows, selectedIds],
  );
  const batchSelection = useMemo(() => summarizeBatchSelection(selectedRows as any), [selectedRows]);
  const allSelectableSelected = selectableRows.length > 0 && selectedRows.length === selectableRows.length;

  // Trocar de sub-aba zera a seleção (e o lado travado): uma seleção invisível
  // voltando depois é pedir pra quitar o que não se viu.
  useEffect(() => {
    setSelectedIds(new Set());
    setSelectionSide(null);
    batchGroupIdRef.current = null;
  }, [subTab]);

  /** Qualquer mudança de seleção invalida o id do lote: outro conjunto, outro lote. */
  const resetBatchGroupId = () => { batchGroupIdRef.current = null; };

  const toggleSelectRow = (t: FinancialTransaction) => {
    const side = batchSideOf(t as any);
    if (!side) return;
    // Marcar item de outro lado é ignorado (o checkbox nem aparece habilitado).
    if (!selectedIds.has(t.id) && selectionSide !== null && side !== selectionSide) return;
    resetBatchGroupId();
    const next = new Set(selectedIds);
    if (next.has(t.id)) next.delete(t.id); else next.add(t.id);
    setSelectedIds(next);
    // Primeiro item marcado TRAVA o lado; seleção vazia destrava.
    setSelectionSide(next.size === 0 ? null : side);
  };

  const toggleSelectAll = () => {
    resetBatchGroupId();
    if (allSelectableSelected) {
      const next = new Set(selectedIds);
      selectableRows.forEach((t) => next.delete(t.id));
      setSelectedIds(next);
      if (next.size === 0) setSelectionSide(null);
      return;
    }
    const next = new Set(selectedIds);
    selectableRows.forEach((t) => next.add(t.id));
    setSelectedIds(next);
    const side = selectableRows.length > 0 ? batchSideOf(selectableRows[0] as any) : null;
    if (next.size > 0 && side) setSelectionSide(side);
  };

  const clearSelection = () => {
    resetBatchGroupId();
    setSelectedIds(new Set());
    setSelectionSide(null);
  };

  const handleConfirmBatchPay = async (payload: BatchPayConfirmPayload) => {
    const ids = selectedRows.map((t) => t.id);
    if (ids.length === 0) return;
    // Cinto e suspensório: a seleção já é travada por lado, mas um lote
    // misturado seria recusado pelo servidor com o lote inteiro perdido.
    if (new Set(selectedRows.map((t) => t.transaction_type)).size > 1) {
      clearSelection();
      return;
    }
    // Id gerado no CLIENT e reaproveitado: duplo clique ou reenvio depois de a
    // rede cair devolve `already_applied` em vez de quitar duas vezes.
    if (!batchGroupIdRef.current) batchGroupIdRef.current = crypto.randomUUID();
    try {
      const result = await payTransactionsBatch.mutateAsync({
        ids,
        accountId: payload.accountId,
        paymentMethod: payload.paymentMethod,
        paidDate: payload.paidDate,
        groupId: batchGroupIdRef.current,
      });
      if (result.already_applied) {
        // Replay do MESMO lote: nada foi reaplicado. Não é erro, então nada de
        // toast vermelho.
        toast({ title: batchMsg.toast.alreadyApplied });
      } else {
        toast({
          title: batchMsg.toast.success,
          description: batchMsg.toast.successDescription
            .replace('{count}', String(result.transaction_count))
            .replace('{total}', fmt(Number(result.total_amount))),
        });
      }
      setSelectedIds(new Set());
      setSelectionSide(null);
      batchGroupIdRef.current = null;
      setBatchModalOpen(false);
    } catch {
      // O toast de erro (mensagem PT-BR da própria RPC) já sai no hook. O modal
      // fica aberto e o id do lote é MANTIDO de propósito: se o usuário tentar
      // de novo, o retry é idempotente.
    }
  };

  const isOverdue = (t: FinancialTransaction) =>
    !t.is_paid && t.due_date && isBefore(parseLocalDate(t.due_date), today);

  /** Conta a receber que tem pelo menos 1 recebimento parcial registrado, mas ainda não foi quitada. */
  const isPartial = (t: FinancialTransaction) =>
    t.transaction_type === 'entrada' && !t.is_paid && Number(t.amount_received ?? 0) > 0;

  /** Status mutuamente exclusivo: paga > vencida > parcial > pendente. */
  type RowStatus = 'paga' | 'vencida' | 'parcial' | 'pendente';
  const getStatus = (t: FinancialTransaction): RowStatus => {
    if (t.is_paid) return 'paga';
    if (isOverdue(t)) return 'vencida';
    if (isPartial(t)) return 'parcial';
    return 'pendente';
  };

  const filters: { key: FilterStatus; label: string }[] = [
    { key: 'pendentes', label: fin.accounts.filters.pending },
    { key: 'vencidas', label: fin.accounts.filters.overdue },
    { key: 'pagas', label: fin.accounts.filters.paid },
    { key: 'todas', label: fin.accounts.filters.all },
  ];

  const handleEdit = (t: FinancialTransaction) => {
    setEditingTransaction(t);
    setContaFormOpen(true);
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    await deleteTransaction.mutateAsync(deletingId);
    setDeletingId(null);
  };

  const handleCloseForm = () => {
    setContaFormOpen(false);
    setEditingTransaction(null);
  };

  return (
    <div className="space-y-5">
      {/* Header inline — desktop. Mobile usa o MobilePageHeader do parent + FAB. */}
      {!isMobile && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold">{fin.accounts.header.title}</h2>
            <p className="text-sm text-muted-foreground">{fin.accounts.header.subtitle}</p>
          </div>
          <Button onClick={() => { setEditingTransaction(null); setContaFormOpen(true); }} className="gap-2 min-h-11 rounded-xl">
            <Plus className="h-4 w-4" /> {fin.accounts.header.newButton}
          </Button>
        </div>
      )}

      {/* Sub-tab toggle — mobile usa pillTabs scrolláveis; desktop botões */}
      {isMobile ? (
        <MobilePillTabs
          tabs={[
            { value: 'pagar', label: fin.accounts.subTabs.payable, icon: <ArrowDownCircle className="h-3.5 w-3.5" /> },
            { value: 'receber', label: fin.accounts.subTabs.receivable, icon: <ArrowUpCircle className="h-3.5 w-3.5" /> },
          ]}
          activeTab={subTab}
          onTabChange={(v) => { setSubTab(v as SubTab); setFilter('pendentes'); setCategoryFilter([]); setSearch(''); }}
        />
      ) : (
        <div className="flex gap-2">
          <Button
            variant={subTab === 'pagar' ? 'default' : 'outline'}
            onClick={() => { setSubTab('pagar'); setFilter('pendentes'); setCategoryFilter([]); setSearch(''); }}
            className={cn('min-h-11 rounded-xl', subTab === 'pagar' && 'bg-destructive hover:bg-destructive/90 text-white')}
          >
            {fin.accounts.subTabs.payable}
          </Button>
          <Button
            variant={subTab === 'receber' ? 'default' : 'outline'}
            onClick={() => { setSubTab('receber'); setFilter('pendentes'); setCategoryFilter([]); setSearch(''); }}
            className={cn('min-h-11 rounded-xl', subTab === 'receber' && 'bg-success hover:bg-success/90 text-white')}
          >
            {fin.accounts.subTabs.receivable}
          </Button>
        </div>
      )}

      {/* Summary cards — mobile vira carrossel snap-x compacto */}
      {isMobile ? (
        <div className="relative -mx-3">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-4 bg-gradient-to-r from-background to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-6 bg-gradient-to-l from-background to-transparent" />
          <div className="flex gap-2 overflow-x-auto px-3 pb-1 snap-x scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="snap-start shrink-0 flex items-center gap-2 min-w-[160px] p-3 rounded-2xl border bg-card shadow-sm">
              <div className="rounded-full bg-warning p-2 shrink-0">
                <Clock className="h-4 w-4 text-warning-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider leading-tight">{fin.accounts.summaryCards.pending}</p>
                <p className="text-sm font-bold truncate leading-tight tabular-nums">{fmt(summary.pendente)}</p>
              </div>
            </div>
            <div className="snap-start shrink-0 flex items-center gap-2 min-w-[160px] p-3 rounded-2xl border bg-card shadow-sm">
              <div className="rounded-full bg-destructive p-2 shrink-0">
                <AlertTriangle className="h-4 w-4 text-destructive-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider leading-tight">{fin.accounts.summaryCards.overdue}</p>
                <p className="text-sm font-bold text-destructive truncate leading-tight tabular-nums">{fmt(summary.vencido)}</p>
              </div>
            </div>
            <div className="snap-start shrink-0 flex items-center gap-2 min-w-[160px] p-3 rounded-2xl border bg-card shadow-sm">
              <div className="rounded-full bg-primary p-2 shrink-0">
                <DollarSign className="h-4 w-4 text-primary-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider leading-tight">{fin.accounts.summaryCards.next7}</p>
                <p className="text-sm font-bold truncate leading-tight tabular-nums">{fmt(summary.prox7)}</p>
              </div>
            </div>
            <div className="snap-start shrink-0 flex items-center gap-2 min-w-[160px] p-3 rounded-2xl border bg-card shadow-sm">
              <div className="rounded-full bg-success p-2 shrink-0">
                <CheckCircle2 className="h-4 w-4 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider leading-tight">
                  {subTab === 'receber' ? fin.accounts.summaryCards.received : fin.accounts.summaryCards.paid}
                </p>
                <p className="text-sm font-bold text-success truncate leading-tight tabular-nums">{fmt(summary.pago)}</p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="rounded-2xl shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="rounded-full bg-warning p-2.5 shrink-0">
                <Clock className="h-4 w-4 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">{fin.accounts.summaryCards.totalPending}</p>
                <p className="text-lg font-bold truncate tabular-nums">{fmt(summary.pendente)}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="rounded-full bg-destructive p-2.5 shrink-0">
                <AlertTriangle className="h-4 w-4 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">{fin.accounts.summaryCards.totalOverdue}</p>
                <p className="text-lg font-bold text-destructive truncate tabular-nums">{fmt(summary.vencido)}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="rounded-full bg-primary p-2.5 shrink-0">
                <DollarSign className="h-4 w-4 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">{fin.accounts.summaryCards.next7Full}</p>
                <p className="text-lg font-bold truncate tabular-nums">{fmt(summary.prox7)}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="rounded-full bg-success p-2.5 shrink-0">
                <CheckCircle2 className="h-4 w-4 text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">
                  {subTab === 'receber' ? fin.accounts.summaryCards.totalReceived : fin.accounts.summaryCards.totalPaid}
                </p>
                <p className="text-lg font-bold text-success truncate tabular-nums">{fmt(summary.pago)}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Busca textual UNIVERSAL — quando preenchida, ignora status/categoria/período
          e procura no dataset inteiro do subTab. Mesmo visual da busca de Movimentações. */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={fin.accounts.search}
          className="pl-10"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Filters status — pillTabs em mobile, botões em desktop.
          Escondidos durante a busca textual (busca é universal, ignora status). */}
      {searchActive ? null : isMobile ? (
        <MobilePillTabs
          tabs={filters.map(f => ({ value: f.key, label: f.label }))}
          activeTab={filter}
          onTabChange={(v) => setFilter(v as FilterStatus)}
        />
      ) : (
        <div className="flex gap-2 flex-wrap">
          {filters.map((f) => (
            <Button
              key={f.key}
              variant={filter === f.key ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      )}

      {/* Filtros de categoria e de centro de custo — dropdowns (Popover) com
          checkboxes. Vazio = todos; marcar 1+ filtra. Escondidos durante a busca
          textual (busca é universal). Cada um tem seu cartão de resumo (total +
          contagem) logo abaixo. */}
      {!searchActive && (availableCategories.length > 0 || availableCostCenters.length > 0) && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            {availableCategories.length > 0 && (
              <FilterCheckboxDropdown
                label={fin.accounts.categoryFilter.label}
                selected={categoryFilter}
                onChange={setCategoryFilter}
                emptyLabel={fin.accounts.categoryFilter.emptyLabel}
                options={availableCategories.map((cat) => ({ value: cat, label: cat }))}
              />
            )}
            {availableCostCenters.length > 0 && (
              <FilterCheckboxDropdown
                label={fin.costCenters.filterLabel}
                selected={costCenterFilter}
                onChange={setCostCenterFilter}
                emptyLabel={fin.costCenters.filterEmptyLabel}
                options={[
                  ...availableCostCenters,
                  { value: NO_COST_CENTER, label: fin.costCenters.dreNoCenter },
                ]}
              />
            )}
          </div>

          {/* Resumo das categorias ativas */}
          {categorySummary && (
            <div className="flex items-center gap-3 rounded-lg bg-muted p-3 text-sm flex-wrap">
              <Badge variant="outline" className="shrink-0">
                {categoryFilter.length === 1 ? categoryFilter[0] : `${categoryFilter.length} ${fin.accounts.categoryFilter.categoriesSuffix}`}
              </Badge>
              <span className="text-muted-foreground">
                {fin.accounts.categoryFilter.totalLabel}: <span className="font-semibold text-foreground tabular-nums">{fmt(categorySummary.total)}</span>
              </span>
              <span className="text-muted-foreground">
                {categorySummary.count} {categorySummary.count === 1 ? fin.accounts.categoryFilter.entry : fin.accounts.categoryFilter.entries}
              </span>
            </div>
          )}

          {/* Resumo dos centros de custo ativos — mesmo formato do de categoria. */}
          {costCenterSummary && (
            <div className="flex items-center gap-3 rounded-lg bg-muted p-3 text-sm flex-wrap">
              <Badge variant="outline" className="shrink-0">
                {costCenterFilter.length === 1
                  ? (costCenterFilter[0] === NO_COST_CENTER
                      ? fin.costCenters.dreNoCenter
                      : availableCostCenters.find((c) => c.value === costCenterFilter[0])?.label ?? fin.costCenters.filterLabel)
                  : `${costCenterFilter.length} ${fin.costCenters.filterCountSuffix}`}
              </Badge>
              <span className="text-muted-foreground">
                {fin.accounts.categoryFilter.totalLabel}: <span className="font-semibold text-foreground tabular-nums">{fmt(costCenterSummary.total)}</span>
              </span>
              <span className="text-muted-foreground">
                {costCenterSummary.count} {costCenterSummary.count === 1 ? fin.accounts.categoryFilter.entry : fin.accounts.categoryFilter.entries}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Bloco "Faturas de Cartão" — só aparece em subTab='pagar' quando há faturas
          elegíveis. Cada linha é destacada (border colorido + ícone cartão + badge
          de quantidade de despesas). Click abre detalhe, "Pagar Fatura" abre modal
          (bloqueado até o fechamento). v1.9.15.
          Com filtro de categoria ativo, a fatura não cabe (junta várias categorias):
          em vez de sumir em silêncio (e os totais do topo continuarem contando ela),
          uma linha explica o motivo. `summary` já exclui o valor da fatura dos totais
          nesse caso (ver useMemo acima). */}
      {!isLoading && subTab === 'pagar' && cardInvoices.length > 0 && !searchActive && (
        categoryFilter.length === 0 && costCenterFilter.length === 0 ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold uppercase tracking-widest text-foreground/70">
                {fin.accounts.cardInvoices.sectionTitle}
              </h3>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                {cardInvoices.length} {cardInvoices.length === 1 ? fin.accounts.cardInvoices.invoice : fin.accounts.cardInvoices.invoices}
              </Badge>
            </div>
            <div className="rounded-2xl border bg-card overflow-hidden shadow-sm">
              {cardInvoices.map((bill) => {
                const account = cardAccountMap[bill.account_id];
                if (!account) return null;
                return (
                  <CreditCardInvoiceRow
                    key={bill.id}
                    invoice={bill}
                    account={account}
                    cashBankAccounts={cashBankAccounts}
                    isMobile={isMobile}
                  />
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2 rounded-xl border border-dashed border-muted-foreground/30 bg-muted/40 p-3 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>{categoryFilter.length > 0
              ? fin.accounts.cardInvoices.hiddenByCategoryFilter
              : fin.accounts.cardInvoices.hiddenByCostCenterFilter}</span>
          </div>
        )
      )}

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-[72px] w-full rounded-2xl" />)}
        </div>
      ) : filtered.length === 0 && (searchActive || cardInvoices.length === 0 || categoryFilter.length > 0 || costCenterFilter.length > 0) ? (
        (searchActive || categoryFilter.length > 0 || costCenterFilter.length > 0 || filter !== 'pendentes') ? (
          /* Nada nesta sub-aba: se a MESMA busca acha do outro lado, o vazio
             deixa de ser beco sem saída e vira atalho ("Ver 2 resultados em A
             Receber"). Ver `otherTabMatches`. */
          <EmptyState
            size="compact"
            icon={<DollarSign className="h-10 w-10" />}
            title={fin.accounts.empty.notFoundTitle}
            description={searchActive
              ? `${fin.accounts.empty.nothingInSearch} "${search.trim()}"`
              : categoryFilter.length === 1
                ? `${fin.accounts.empty.nothingInCategory} "${categoryFilter[0]}"`
                : categoryFilter.length > 1
                  ? fin.accounts.empty.nothingInCategories
                  : fin.accounts.empty.nothingInFilter}
            action={otherTabMatches > 0
              ? {
                  label: (otherTabMatches === 1
                    ? fin.accounts.empty.foundInOtherTabOne
                    : fin.accounts.empty.foundInOtherTabMany
                  )
                    .replace('{count}', String(otherTabMatches))
                    .replace(
                      '{tab}',
                      subTab === 'pagar' ? fin.accounts.subTabs.receivable : fin.accounts.subTabs.payable,
                    ),
                  onClick: () => setSubTab(subTab === 'pagar' ? 'receber' : 'pagar'),
                }
              : undefined}
          />
        ) : (
          <EmptyState
            size="compact"
            icon={subTab === 'receber' ? <ArrowUpCircle className="h-10 w-10" /> : <ArrowDownCircle className="h-10 w-10" />}
            title={subTab === 'receber' ? fin.accounts.empty.noReceivableTitle : fin.accounts.empty.noPayableTitle}
            description={subTab === 'receber' ? fin.accounts.empty.noReceivableDescription : fin.accounts.empty.noPayableDescription}
            action={{ label: fin.accounts.actions.newAccount, onClick: () => { setEditingTransaction(null); setContaFormOpen(true); } }}
          />
        )
      ) : filtered.length === 0 ? (
        // Só faturas (visíveis) — não mostra empty state nem a tabela vazia abaixo.
        null
      ) : isMobile ? (
        <div className="space-y-3">
          {/* Marcar/desmarcar todas — só o que está visível no filtro atual. */}
          {batchEnabled && selectableRows.length > 0 && (
            <div className="flex items-center gap-2 px-1">
              <Checkbox
                checked={allSelectableSelected}
                onCheckedChange={toggleSelectAll}
                aria-label={batchMsg.selectAll}
              />
              <span className="text-xs text-muted-foreground">{batchMsg.selectAll}</span>
            </div>
          )}
          <div className="rounded-2xl border bg-card overflow-hidden shadow-sm">
            {pagination.paginatedItems.map((t) => {
              const status = getStatus(t);
              const overdue = status === 'vencida';
              const partial = status === 'parcial';
              // `null` = entra no lote. Com motivo, o checkbox fica desabilitado
              // e um toque no (i) explica o porquê (tooltip não funciona no toque).
              const batchReason = batchEnabled ? batchReasonFor(t) : null;
              const received = Number(t.amount_received ?? 0);
              const receiptBreakdown = subTab === 'receber' && status === 'paga'
                ? receiptBreakdowns.get(t.id)
                : undefined;
              const itemActions: ItemAction[] = [
                ...(!t.is_paid ? [{
                  key: 'mark-paid',
                  label: subTab === 'receber' ? fin.accounts.actions.markReceived : fin.accounts.actions.markPaid,
                  icon: <Check className="h-4 w-4" />,
                  onClick: () => handleMarkAsPaidClick(t),
                }] : []),
                ...(partial ? [{
                  key: 'view-details',
                  label: fin.accounts.actions.viewHistory,
                  icon: <Receipt className="h-4 w-4" />,
                  onClick: () => setViewingTxn(t),
                }] : []),
                {
                  key: 'edit',
                  label: fin.accounts.actions.edit,
                  icon: <Pencil className="h-4 w-4" />,
                  variant: 'edit' as const,
                  onClick: () => handleEdit(t),
                },
                ...(canDeleteFinance ? [{
                  key: 'delete',
                  label: fin.accounts.actions.delete,
                  icon: <Trash2 className="h-4 w-4" />,
                  variant: 'destructive' as const,
                  onClick: () => setDeletingId(t.id),
                }] : []),
              ];
              const statusColor =
                status === 'paga' ? 'bg-success'
                : status === 'vencida' ? 'bg-destructive'
                : status === 'parcial' ? 'bg-warning'
                : subTab === 'receber' ? 'bg-success/70'
                : 'bg-warning';
              return (
                <MobileListItem
                  key={t.id}
                  actions={itemActions}
                  className={cn(
                    'transition-transform active:scale-[0.98]',
                    overdue && 'bg-destructive/5',
                    partial && 'bg-warning/5',
                  )}
                  onClick={partial ? () => setViewingTxn(t) : undefined}
                  leading={
                    <div className="flex items-center gap-2 shrink-0">
                      {batchEnabled && (
                        // `stopPropagation`: o toque no checkbox não pode virar
                        // clique da linha (que abre o histórico em conta parcial).
                        <span
                          className="flex items-center"
                          onClick={(e) => { e.stopPropagation(); }}
                        >
                          {batchReason === 'alreadyPaid' ? (
                            // Conta paga não precisa de explicação: o (i) em
                            // toda linha da aba "Pagas" seria só ruído. Espaço
                            // reservado pra lista não dançar.
                            <span className="block h-5 w-5" />
                          ) : batchReason ? (
                            <button
                              type="button"
                              aria-label={batchMsg.reasons[batchReason]}
                              onClick={() => toast({
                                title: batchMsg.blockedTitle,
                                description: batchMsg.reasons[batchReason],
                              })}
                              className="flex h-5 w-5 items-center justify-center text-muted-foreground"
                            >
                              <Info className="h-4 w-4" />
                            </button>
                          ) : (
                            <Checkbox
                              checked={selectedIds.has(t.id)}
                              onCheckedChange={() => toggleSelectRow(t)}
                              aria-label={t.description}
                            />
                          )}
                        </span>
                      )}
                      <div className={cn('flex h-10 w-10 items-center justify-center rounded-full text-white shrink-0', statusColor)}>
                        {t.payroll_kind === 'salary'
                          ? <Users className="h-5 w-5" />
                          : status === 'paga'
                            ? <Check className="h-5 w-5" />
                            : status === 'vencida'
                              ? <AlertTriangle className="h-5 w-5" />
                              : status === 'parcial'
                                ? <Receipt className="h-5 w-5" />
                                : <Clock className="h-5 w-5" />}
                      </div>
                    </div>
                  }
                  title={
                    <div className="flex items-center gap-1.5">
                      <span className="truncate">{t.description}</span>
                    </div>
                  }
                  subtitle={
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span>
                          {t.due_date ? format(parseLocalDate(t.due_date), 'dd/MM/yyyy', { locale: ptBR }) : fin.accounts.table.noDueDate}
                        </span>
                        {t.employee && <span className="truncate">{t.employee.name}</span>}
                        {!t.employee && t.customer && <span className="truncate">{t.customer.name}</span>}
                        {!t.employee && t.supplier && <span className="truncate">{t.supplier.name}</span>}
                      </div>
                      {partial && (
                        <span className="text-warning text-[11px]">
                          {fin.accounts.table.received}: {fmt(received)} {fin.accounts.table.of} {fmt(Number(t.amount))}
                        </span>
                      )}
                    </div>
                  }
                  trailing={
                    <div className="flex flex-col items-end gap-1">
                      {receiptBreakdown ? (
                        <div className="flex flex-col items-end text-[10px] leading-4 whitespace-nowrap tabular-nums">
                          <span className="text-muted-foreground">
                            {fin.accounts.table.gross}: <strong className="font-medium text-foreground">{fmt(receiptBreakdown.gross)}</strong>
                          </span>
                          <span className="text-muted-foreground">
                            {fin.accounts.table.fee}: <strong className="font-medium text-destructive">− {fmt(receiptBreakdown.fee)}</strong>
                          </span>
                          <span className="font-semibold text-success">
                            {fin.accounts.table.net}: {fmt(receiptBreakdown.net)}
                          </span>
                        </div>
                      ) : (
                        <span className={cn('font-semibold text-sm whitespace-nowrap tabular-nums', subTab === 'receber' ? 'text-success' : 'text-destructive')}>
                          {fmt(t.amount)}
                        </span>
                      )}
                      {status === 'paga' ? (
                        <Badge className="bg-success text-white text-[10px] px-1.5 py-0">{fin.accounts.status.paid}</Badge>
                      ) : status === 'vencida' ? (
                        <Badge className="bg-destructive text-white text-[10px] px-1.5 py-0">{fin.accounts.status.overdue}</Badge>
                      ) : status === 'parcial' ? (
                        <Badge className="bg-warning text-white text-[10px] px-1.5 py-0">{fin.accounts.status.partial}</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{fin.accounts.status.pending}</Badge>
                      )}
                    </div>
                  }
                />
              );
            })}
          </div>
          <DataTablePagination page={pagination.page} totalPages={pagination.totalPages} totalItems={pagination.totalItems} from={pagination.from} to={pagination.to} pageSize={pagination.pageSize} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} />
        </div>
      ) : (
        <Card className="rounded-2xl shadow-sm overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {/* Coluna de seleção do lote — só em "A Pagar". */}
                    {batchEnabled && (
                      <SortableTableHead sortKey="" sortConfig={sortConfig} onSort={() => {}} className="w-[40px]">
                        <Checkbox
                          checked={allSelectableSelected}
                          onCheckedChange={toggleSelectAll}
                          disabled={selectableRows.length === 0}
                          aria-label={batchMsg.selectAll}
                        />
                      </SortableTableHead>
                    )}
                    <SortableTableHead sortKey="description" sortConfig={sortConfig} onSort={handleSort}>{fin.accounts.table.description}</SortableTableHead>
                    <SortableTableHead sortKey="category" sortConfig={sortConfig} onSort={handleSort} className="hidden sm:table-cell">{fin.accounts.table.category}</SortableTableHead>
                    <SortableTableHead sortKey="_due_ts" sortConfig={sortConfig} onSort={handleSort}>{fin.accounts.table.dueDate}</SortableTableHead>
                    <SortableTableHead sortKey="_amount_num" sortConfig={sortConfig} onSort={handleSort}>{fin.accounts.table.amount}</SortableTableHead>
                    <SortableTableHead sortKey="_status_order" sortConfig={sortConfig} onSort={handleSort}>{fin.accounts.table.status}</SortableTableHead>
                    <SortableTableHead sortKey="" sortConfig={sortConfig} onSort={() => {}} className="w-[100px]">{fin.accounts.table.actions}</SortableTableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.paginatedItems.map((t) => {
                    const status = getStatus(t);
                    const partial = status === 'parcial';
                    const received = Number(t.amount_received ?? 0);
                    const receiptBreakdown = subTab === 'receber' && status === 'paga'
                      ? receiptBreakdowns.get(t.id)
                      : undefined;
                    // `null` = entra no lote. Com motivo, o checkbox fica
                    // desabilitado e o `title` explica no hover.
                    const batchReason = batchEnabled ? batchReasonFor(t) : null;
                    return (
                    <TableRow
                      key={t.id}
                      className={cn(
                        status === 'vencida' && 'bg-destructive/5',
                        partial && 'bg-warning/5',
                        selectedIds.has(t.id) && 'bg-primary/5',
                      )}
                    >
                      {batchEnabled && (
                        <TableCell>
                          <span
                            className="inline-flex"
                            title={batchReason ? batchMsg.reasons[batchReason] : undefined}
                          >
                            <Checkbox
                              checked={selectedIds.has(t.id)}
                              disabled={!!batchReason}
                              onCheckedChange={() => toggleSelectRow(t)}
                              aria-label={t.description}
                            />
                          </span>
                        </TableCell>
                      )}
                      <TableCell>
                        <div>
                          <p className="font-medium flex items-center gap-1.5">
                            {t.payroll_kind === 'salary' && <Users className="h-3.5 w-3.5 text-amber-600 shrink-0" />}
                            <span>{t.description}</span>
                          </p>
                          {t.employee && <p className="text-xs text-muted-foreground">{t.employee.name}</p>}
                          {!t.employee && t.customer && <p className="text-xs text-muted-foreground">{t.customer.name}</p>}
                          {!t.employee && t.supplier && <p className="text-xs text-muted-foreground">{t.supplier.name}</p>}
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {t.category && <Badge variant="outline">{t.category}</Badge>}
                      </TableCell>
                      <TableCell className="text-sm">
                        {t.due_date ? (
                          <span className={cn(status === 'vencida' && 'text-destructive font-semibold')}>
                            {format(parseLocalDate(t.due_date), 'dd/MM/yyyy', { locale: ptBR })}
                            {status === 'vencida' && <AlertTriangle className="inline ml-1 h-3.5 w-3.5" />}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">{fin.accounts.table.noDueDate}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          {receiptBreakdown ? (
                            <>
                              <span className="text-xs text-muted-foreground whitespace-nowrap tabular-nums">
                                {fin.accounts.table.gross}: <strong className="font-medium text-foreground">{fmt(receiptBreakdown.gross)}</strong>
                              </span>
                              <span className="text-xs text-muted-foreground whitespace-nowrap tabular-nums">
                                {fin.accounts.table.fee}: <strong className="font-medium text-destructive">− {fmt(receiptBreakdown.fee)}</strong>
                              </span>
                              <span className="font-semibold text-success whitespace-nowrap tabular-nums">
                                {fin.accounts.table.net}: {fmt(receiptBreakdown.net)}
                              </span>
                            </>
                          ) : (
                            <span className={`font-medium tabular-nums ${subTab === 'receber' ? 'text-success' : 'text-destructive'}`}>
                              {fmt(t.amount)}
                            </span>
                          )}
                          {partial && (
                            <span className="text-[11px] text-warning tabular-nums">
                              {fin.accounts.table.received}: {fmt(received)} {fin.accounts.table.of} {fmt(Number(t.amount))}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {status === 'paga' ? (
                          <Badge className="bg-success text-white">{fin.accounts.status.paid}</Badge>
                        ) : status === 'vencida' ? (
                          <Badge className="bg-destructive text-white">{fin.accounts.status.overdue}</Badge>
                        ) : status === 'parcial' ? (
                          <Badge className="bg-warning text-white">{fin.accounts.status.partial}</Badge>
                        ) : (
                          <Badge variant="secondary">{fin.accounts.status.pending}</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <RowActionsMenu
                          actions={[
                            {
                              label: subTab === 'receber' ? fin.accounts.actions.markAsReceived : fin.accounts.actions.markAsPaid,
                              icon: Check,
                              onClick: () => handleMarkAsPaidClick(t),
                              hidden: t.is_paid,
                            },
                            {
                              label: fin.accounts.actions.viewHistory,
                              icon: Eye,
                              onClick: () => setViewingTxn(t),
                              hidden: !partial,
                            },
                            {
                              label: fin.accounts.actions.edit,
                              icon: Pencil,
                              variant: 'edit',
                              onClick: () => handleEdit(t),
                            },
                            {
                              label: fin.accounts.actions.delete,
                              icon: Trash2,
                              variant: 'delete',
                              onClick: () => setDeletingId(t.id),
                              hidden: !canDeleteFinance,
                            },
                          ] satisfies RowAction[]}
                        />
                      </TableCell>
                    </TableRow>
                  );})}
                </TableBody>
              </Table>
            </div>
            <DataTablePagination page={pagination.page} totalPages={pagination.totalPages} totalItems={pagination.totalItems} from={pagination.from} to={pagination.to} pageSize={pagination.pageSize} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} />
          </CardContent>
        </Card>
      )}

      {/* ── Barra de seleção do lote ────────────────────────────────────────
          `sticky` (não `fixed`) e ancorada DEPOIS da lista: assim ela acompanha
          o fim do conteúdo e nunca cobre a última linha. No mobile o offset é o
          mesmo do FAB (96px + safe area), pra ficar acima da barra inferior de
          navegação; no desktop cola no rodapé da viewport. Mesmo tratamento das
          barras de salvar da configuração fiscal. */}
      {batchEnabled && selectedRows.length > 0 && (
        <div className="sticky bottom-[calc(96px+env(safe-area-inset-bottom))] lg:bottom-3 z-30 flex flex-wrap items-center gap-3 rounded-2xl border bg-background/95 px-3 py-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="flex items-center gap-2 min-w-0">
            {/* Fundo saturado com o ícone branco direto nele. Verde do lado do
                recebimento, igual à régua de cor do resto do Financeiro. */}
            <span className={cn(
              'flex h-8 w-8 items-center justify-center rounded-full shrink-0',
              isReceiveTab ? 'bg-success' : 'bg-primary',
            )}>
              <Layers className="h-4 w-4 text-white" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold leading-tight truncate">
                {batchSelection.count === 1
                  ? batchMsg.selectedOne
                  : batchMsg.selectedMany.replace('{count}', String(batchSelection.count))}
              </p>
              <p className="text-sm font-bold tabular-nums leading-tight truncate">
                {batchMsg.total}: {fmt(batchSelection.total)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <Button variant="ghost" size="sm" onClick={clearSelection} className="min-h-11 rounded-xl">
              {batchMsg.clear}
            </Button>
            <Button
              size="sm"
              onClick={() => setBatchModalOpen(true)}
              className={cn(
                'min-h-11 rounded-xl gap-2',
                isReceiveTab && 'bg-success hover:bg-success/90 text-white',
              )}
            >
              <Check className="h-4 w-4" />
              {batchActionLabel}
            </Button>
          </div>
        </div>
      )}

      <BatchPayModal
        open={batchModalOpen}
        onOpenChange={(v) => { if (!payTransactionsBatch.isPending) setBatchModalOpen(v); }}
        mode={isReceiveTab ? 'receive' : 'pay'}
        transactions={selectedRows}
        accounts={allAccounts}
        onConfirm={handleConfirmBatchPay}
        isSubmitting={payTransactionsBatch.isPending}
      />

      <ContaFormDialog
        open={contaFormOpen}
        onOpenChange={handleCloseForm}
        defaultType={contaDefaultType}
        editingTransaction={editingTransaction}
      />

      <AlertDialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{fin.accounts.deleteDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {fin.accounts.deleteDialog.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{fin.accounts.deleteDialog.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              {fin.accounts.deleteDialog.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {payrollTxn?.employee && (
        <EmployeePaymentModal
          open={!!payrollTxn}
          onOpenChange={(v) => { if (!v) setPayrollTxn(null); }}
          employeeName={payrollTxn.employee.name}
          salary={payrollTxn.employee.salary}
          balance={payrollBalance}
          onSubmit={handleConfirmPayrollPayment}
          financialTransactionId={payrollTxn.id}
          payrollPeriodLabel={payrollTxn.payroll_period ?? undefined}
        />
      )}

      <ReceivableDetailModal
        open={!!viewingTxn}
        onOpenChange={(v) => { if (!v) setViewingTxn(null); }}
        transaction={viewingTxn}
      />

      <ReceivePaymentModal
        open={!!receivingTxn}
        onOpenChange={(v) => { if (!v) setReceivingTxn(null); }}
        amount={Number(receivingTxn?.amount ?? 0)}
        amountReceived={Number((receivingTxn as any)?.amount_received ?? 0)}
        allowPartial
        installmentTotal={receivingTxn?.installment_total ?? 1}
        currentDueDate={receivingTxn?.due_date}
        title={fin.accounts.payroll.receiveTitle}
        description={receivingTxn?.description}
        onConfirm={async (payment) => {
          if (!receivingTxn) return;
          await onMarkAsPaid({
            id: receivingTxn.id,
            account_id: payment.account_id,
            payment_method: payment.payment_method,
            paid_date: payment.paid_date,
            fee_amount: payment.fee_amount,
            notes: payment.notes,
            customer_id: (receivingTxn as any).customer_id,
            amountReceived: payment.amount_received,
            newDueDate: payment.new_due_date,
          });
          setReceivingTxn(null);
        }}
      />

      {/* Modal: confirmar pagamento de despesa */}
      <ResponsiveModal
        open={!!payingDespesaTxn}
        onOpenChange={(v) => { if (!v) setPayingDespesaTxn(null); }}
        title={fin.accounts.payExpenseModal.title}
        description={payingDespesaTxn ? `${payingDespesaTxn.description} — ${fmt(Number(payingDespesaTxn.amount))}` : undefined}
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setPayingDespesaTxn(null)} className="min-h-11 rounded-xl">{fin.accounts.actions.cancel}</Button>
            <Button
              disabled={!payDespAccountId || !payDespDate || !isPaidDateAllowedInTz(payDespDate, timezone)}
              className="min-h-11 rounded-xl"
              onClick={async () => {
                if (!payingDespesaTxn || !payDespAccountId) return;
                await onMarkAsPaid({
                  id: payingDespesaTxn.id,
                  account_id: payDespAccountId,
                  payment_method: payDespMethod,
                  paid_date: payDespDate,
                  notes: payDespNotes.trim() || undefined,
                });
                setPayingDespesaTxn(null);
              }}
            >
              {fin.accounts.actions.confirm}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{fin.accounts.payExpenseModal.paidWith}</Label>
            <div className="flex items-center h-10 rounded-md border border-input bg-background ring-offset-background focus-within:border-ring focus-within:ring-1 focus-within:ring-ring focus-within:ring-offset-0">
              <SearchableSelect
                options={cashBankAccountOptions}
                value={payDespAccountId}
                onValueChange={setPayDespAccountId}
                onSearchChange={setPayDespAccountQuery}
                placeholder={fin.accounts.payExpenseModal.selectAccount}
                searchPlaceholder={fin.accounts.payExpenseModal.searchAccount}
                className={cn(
                  'flex-1 min-w-0 justify-between border-0 bg-transparent hover:bg-transparent text-foreground hover:text-foreground shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-3 h-10 font-normal rounded-none',
                  canManageFinanceSettings ? 'rounded-l-md' : 'rounded-md',
                )}
              />
              {canManageFinanceSettings && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setPayDespAccountInitialName(payDespAccountQuery);
                    setPayDespAccountFormOpen(true);
                  }}
                  className="h-10 w-10 shrink-0 rounded-none rounded-r-md border-l border-input bg-muted text-muted-foreground hover:bg-primary hover:text-primary-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
                  aria-label={fin.accounts.payExpenseModal.newAccount}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              )}
            </div>
            {cashBankAccounts.length === 0 && (
              <p className="text-xs text-destructive">{fin.accounts.payExpenseModal.noAccountWarning}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{fin.accounts.payExpenseModal.paymentMethod}</Label>
              <Select value={payDespMethod} onValueChange={setPayDespMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dinheiro">{fin.accounts.payExpenseModal.paymentMethods.cash}</SelectItem>
                  <SelectItem value="pix">{fin.accounts.payExpenseModal.paymentMethods.pix}</SelectItem>
                  <SelectItem value="cartao_debito">{fin.accounts.payExpenseModal.paymentMethods.debit}</SelectItem>
                  <SelectItem value="cartao_credito">{fin.accounts.payExpenseModal.paymentMethods.credit}</SelectItem>
                  <SelectItem value="boleto">{fin.accounts.payExpenseModal.paymentMethods.boleto}</SelectItem>
                  <SelectItem value="transferencia">{fin.accounts.payExpenseModal.paymentMethods.transfer}</SelectItem>
                  <SelectItem value="cheque">{fin.accounts.payExpenseModal.paymentMethods.check}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{fin.accounts.payExpenseModal.paymentDate}</Label>
              {/* "Já foi pago" é sempre passado: não existe pagamento no
                  futuro. `max` barra o calendário nativo; o disabled do botão
                  Confirmar (acima) é quem garante de verdade, porque dá pra
                  digitar a data manualmente. */}
              <Input type="date" max={todayInTz(timezone)} value={payDespDate} onChange={e => setPayDespDate(e.target.value)} />
              {payDespDate && !isPaidDateAllowedInTz(payDespDate, timezone) && (
                <p className="text-xs text-destructive">{fin.accounts.payExpenseModal.paymentDateFuture}</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{fin.accounts.payExpenseModal.notes}</Label>
            <Textarea
              value={payDespNotes}
              onChange={e => setPayDespNotes(e.target.value)}
              placeholder={fin.accounts.payExpenseModal.optional}
              rows={2}
              className="resize-none"
            />
          </div>
        </div>
      </ResponsiveModal>

      {/* Quick-create de conta a partir do modal de pagar despesa. */}
      <AccountFormDialog
        open={payDespAccountFormOpen}
        onOpenChange={setPayDespAccountFormOpen}
        initialName={payDespAccountInitialName}
        onCreated={(account) => setPayDespAccountId(account.id)}
      />

      {/* FAB mobile — "Nova Conta". Desktop usa o botão inline do header.
          Some enquanto há seleção: o FAB e a barra do lote dividem o mesmo
          canto inferior, e sobrepostos um cobre o outro. */}
      {isMobile && selectedRows.length === 0 && (
        <FABButton
          icon={<Plus className="h-5 w-5" />}
          label={fin.accounts.header.title}
          onClick={() => { setEditingTransaction(null); setContaFormOpen(true); }}
        />
      )}
    </div>
  );
}
