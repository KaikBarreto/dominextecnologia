import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  BadgeCheck,
  BookOpenCheck,
  Building2,
  FileSpreadsheet,
  Landmark,
  Loader2,
  ReceiptText,
} from 'lucide-react';
import type { DateRange } from '@/components/ui/DateRangeFilter';
import { Button } from '@/components/ui/button';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { useCostCenters } from '@/hooks/useCostCenters';
import { useAllCreditCardBills } from '@/hooks/useCreditCardBills';
import { useFinancialAccounts } from '@/hooks/useFinancialAccounts';
import { useFinancialCategories } from '@/hooks/useFinancialCategories';
import { useOperationalPatrimony } from '@/hooks/useOperationalPatrimony';
import { useToast } from '@/hooks/use-toast';
import { calculateDfc, type DfcGroupKey } from '@/lib/dfc';
import { buildFinanceReportOverview } from '@/lib/finance-report-overview';
import { todayInTz } from '@/lib/timezone';
import type { FinancialTransaction } from '@/types/database';
import {
  exportAccountingPackage,
  type AccountingPackageData,
  type AccountingPackageTransactionRow,
} from '@/utils/accountingPackageExport';
import { getErrorMessage } from '@/utils/errorMessages';

type TransactionWithAccountingRelations = FinancialTransaction & {
  customer?: { name?: string | null; document?: string | null } | null;
  supplier?: { name?: string | null; cpf_cnpj?: string | null } | null;
  account?: { name?: string | null } | null;
};

interface FinanceAccountingPackageProps {
  transactions: TransactionWithAccountingRelations[];
  range?: DateRange;
  isLoading?: boolean;
}

const DRE_LABELS: Record<string, string> = {
  impostos: 'Impostos e deduções',
  cmv: 'Custo dos serviços/mercadorias',
  opex: 'Despesa operacional',
  outros: 'Não compõe o DRE',
};

const DFC_LABELS: Record<string, string> = {
  operacional: 'Operacional',
  investimento: 'Investimento',
  financiamento: 'Financiamento',
};

function dateOnly(value?: Date): string | undefined {
  return value ? format(value, 'yyyy-MM-dd') : undefined;
}

function displayDate(value?: string | null): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value ?? '';
}

function inRange(value: string | null | undefined, from?: string, to?: string): boolean {
  const day = value?.slice(0, 10);
  if (!day) return false;
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

function relationName(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const name = (value as { name?: unknown }).name;
  return typeof name === 'string' ? name : '';
}

export function FinanceAccountingPackage({
  transactions,
  range,
  isLoading = false,
}: FinanceAccountingPackageProps) {
  const { settings, isLoading: isLoadingSettings } = useCompanySettings();
  const { categories, isLoading: isLoadingCategories } = useFinancialCategories();
  const { costCenters, isLoading: isLoadingCostCenters } = useCostCenters();
  const {
    accounts,
    balances,
    isLoading: isLoadingAccounts,
    isLoadingBalances,
  } = useFinancialAccounts();
  const { bills, isLoading: isLoadingBills } = useAllCreditCardBills();
  const { patrimony, isLoading: isLoadingPatrimony } = useOperationalPatrimony(transactions);
  const { locale, currency, timezone } = useAppLocaleContext();
  const { toast } = useToast();
  const [isExporting, setIsExporting] = useState(false);

  const from = dateOnly(range?.from);
  const to = dateOnly(range?.to);
  const periodLabel = useMemo(() => {
    if (range?.from && range?.to) return `${format(range.from, 'dd/MM/yyyy')} a ${format(range.to, 'dd/MM/yyyy')}`;
    if (range?.from) return `A partir de ${format(range.from, 'dd/MM/yyyy')}`;
    if (range?.to) return `Até ${format(range.to, 'dd/MM/yyyy')}`;
    return 'Todo o histórico';
  }, [range?.from, range?.to]);

  const categoryByName = useMemo(
    () => new Map(categories.map((category) => [category.name, category])),
    [categories],
  );
  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );
  const costCenterById = useMemo(
    () => new Map(costCenters.map((center) => [center.id, center])),
    [costCenters],
  );
  const accountById = useMemo(
    () => new Map(accounts.map((account) => [account.id, account])),
    [accounts],
  );
  const categoryDreGroups = useMemo(
    () => new Map(categories.map((category) => [category.name, category.dre_group])),
    [categories],
  );

  const buildTransactionRow = (transaction: TransactionWithAccountingRelations, criterion: string): AccountingPackageTransactionRow => {
    const category = categoryByName.get(transaction.category ?? '');
    const parent = category?.parent_id ? categoryById.get(category.parent_id) : undefined;
    const customer = transaction.customer;
    const supplier = transaction.supplier;
    const counterparty = relationName(customer) || relationName(supplier);
    const counterpartyDocument = customer?.document ?? supplier?.cpf_cnpj ?? '';
    const received = Number(transaction.amount_received || 0);
    const status = transaction.cancelled_at
      ? 'Cancelado'
      : transaction.is_paid
        ? transaction.transaction_type === 'entrada' ? 'Recebido' : 'Pago'
        : received > 0
          ? 'Parcial'
          : 'Pendente';
    const installment = transaction.installment_total
      ? `${transaction.installment_number ?? 1}/${transaction.installment_total}`
      : '';
    const createdAt = transaction.created_at
      ? new Date(transaction.created_at).toLocaleString(locale === 'pt-br' ? 'pt-BR' : locale, { timeZone: timezone })
      : '';

    return {
      id: transaction.id,
      periodCriterion: criterion,
      type: transaction.transfer_pair_id
        ? 'Transferência interna'
        : transaction.transaction_type === 'entrada' ? 'Receita' : 'Despesa',
      description: transaction.description ?? '',
      counterparty,
      counterpartyDocument,
      category: transaction.category ?? 'Sem categoria',
      parentCategory: parent?.name ?? '',
      dreGroup: transaction.transaction_type === 'entrada' && category?.dre_group !== 'outros'
        ? 'Receita operacional'
        : DRE_LABELS[category?.dre_group ?? ''] ?? 'Não classificado',
      dfcGroup: DFC_LABELS[category?.dfc_group ?? 'operacional'],
      costCenter: transaction.cost_center_id
        ? costCenterById.get(transaction.cost_center_id)?.name ?? 'Centro não encontrado'
        : 'Sem centro de custo',
      account: transaction.account?.name
        ?? (transaction.account_id ? accountById.get(transaction.account_id)?.name : '')
        ?? '',
      competenceDate: displayDate(transaction.transaction_date),
      dueDate: displayDate(transaction.due_date),
      paidDate: displayDate(transaction.paid_date),
      amount: transaction.transaction_type === 'entrada'
        ? Math.abs(Number(transaction.amount) || 0)
        : -Math.abs(Number(transaction.amount) || 0),
      amountReceived: received,
      paymentMethod: transaction.payment_method ?? '',
      status,
      installment,
      serviceOrderId: transaction.service_order_id ?? '',
      contractId: transaction.contract_id ?? '',
      receiptUrl: transaction.receipt_url ?? '',
      notes: transaction.notes ?? '',
      parentTransactionId: transaction.parent_transaction_id ?? '',
      createdAt,
    };
  };

  const exportTransactions = useMemo(() => transactions.flatMap((transaction) => {
    if (!from && !to) return [buildTransactionRow(transaction, 'Todo o histórico')];
    const criteria: string[] = [];
    if (inRange(transaction.transaction_date, from, to)) criteria.push('Competência');
    if (inRange(transaction.due_date, from, to)) criteria.push('Vencimento');
    if (inRange(transaction.paid_date, from, to)) criteria.push('Baixa');
    return criteria.length ? [buildTransactionRow(transaction, criteria.join(' e '))] : [];
    // Os mapas abaixo são dependências reais da construção da linha.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [transactions, from, to, categoryByName, categoryById, costCenterById, accountById, locale, timezone]);

  const pendingRows = useMemo(() => transactions
    .filter((transaction) => (
      !transaction.is_paid
      && !transaction.cancelled_at
      && !transaction.transfer_pair_id
      && !transaction.credit_card_bill_date
    ))
    .map((transaction) => buildTransactionRow(transaction, 'Posição atual')),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [transactions, categoryByName, categoryById, costCenterById, accountById, locale, timezone]);

  const today = todayInTz(timezone);
  const dreStartDate = (settings as { dre_start_date?: string | null } | null)?.dre_start_date;
  const dreCash = useMemo(() => buildFinanceReportOverview({
    transactions,
    range,
    regime: 'caixa',
    today,
    dreStartDate,
    categoryDreGroups,
    costCenterOrder: costCenters.map((center) => center.id),
  }), [transactions, range, today, dreStartDate, categoryDreGroups, costCenters]);
  const dreAccrual = useMemo(() => buildFinanceReportOverview({
    transactions,
    range,
    regime: 'competencia',
    today,
    dreStartDate,
    categoryDreGroups,
    costCenterOrder: costCenters.map((center) => center.id),
  }), [transactions, range, today, dreStartDate, categoryDreGroups, costCenters]);

  const dfcReport = useMemo(() => {
    const enriched = transactions.map((transaction) => ({
      ...transaction,
      dfc_group: categoryByName.get(transaction.category ?? '')?.dfc_group ?? null,
    }));
    const initialBalance = accounts
      .filter((account) => account.type !== 'cartao')
      .reduce((total, account) => total + Number(account.initial_balance || 0), 0);
    return calculateDfc(enriched, { from, to }, initialBalance);
  }, [accounts, categoryByName, from, to, transactions]);

  const isDataLoading = isLoading || isLoadingSettings || isLoadingCategories || isLoadingCostCenters
    || isLoadingAccounts || isLoadingBalances || isLoadingBills || isLoadingPatrimony;

  const handleExport = async () => {
    if (isExporting || isDataLoading) return;
    setIsExporting(true);
    try {
      const dfcTotal = (group: DfcGroupKey) => dfcReport.groups.find((row) => row.key === group)?.total ?? 0;
      const data: AccountingPackageData = {
        companyName: settings?.name || 'Minha Empresa',
        companyDocument: settings?.document || '',
        periodLabel,
        generatedAt: new Date().toLocaleString(locale === 'pt-br' ? 'pt-BR' : locale, { timeZone: timezone }),
        currency,
        dreCash: dreCash.totals,
        dreAccrual: dreAccrual.totals,
        dfc: {
          openingBalance: dfcReport.openingBalance,
          operational: dfcTotal('operacional'),
          investment: dfcTotal('investimento'),
          financing: dfcTotal('financiamento'),
          netChange: dfcReport.netChange,
          closingBalance: dfcReport.closingBalance,
        },
        patrimony,
        transactions: exportTransactions,
        pending: pendingRows,
        accounts: accounts.map((account) => ({
          name: account.name,
          type: account.type,
          institution: account.institution_name ?? account.bank_name ?? '',
          initialBalance: Number(account.initial_balance || 0),
          currentBalance: account.type === 'cartao' ? null : Number(balances[account.id] || 0),
          creditLimit: account.credit_limit == null ? null : Number(account.credit_limit),
          active: account.is_active ? 'Ativa' : 'Inativa',
        })),
        bills: bills.map((bill) => {
          const total = Number(bill.total_amount || 0);
          const paid = Number(bill.amount_paid || 0);
          return {
            account: accountById.get(bill.account_id)?.name ?? 'Cartão não encontrado',
            referenceMonth: displayDate(bill.reference_month),
            closingDate: displayDate(bill.closing_date),
            dueDate: displayDate(bill.due_date),
            status: bill.status,
            total,
            paid,
            outstanding: Math.max(0, total - paid),
          };
        }),
        categories: categories.map((category) => ({
          name: category.name,
          parent: category.parent_id ? categoryById.get(category.parent_id)?.name ?? '' : '',
          type: category.type,
          dreGroup: category.type === 'entrada' && category.dre_group !== 'outros'
            ? 'Receita operacional'
            : DRE_LABELS[category.dre_group ?? ''] ?? 'Não classificado',
          dfcGroup: DFC_LABELS[category.dfc_group ?? 'operacional'],
          active: category.is_active ? 'Ativa' : 'Inativa',
        })),
        costCenters: costCenters.map((center) => ({
          name: center.name,
          description: center.description ?? '',
          active: center.is_active ? 'Ativo' : 'Inativo',
        })),
      };

      await exportAccountingPackage(data);
      toast({ title: 'Pacote para Contabilidade exportado!' });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Não foi possível gerar o pacote',
        description: getErrorMessage(error),
      });
    } finally {
      setIsExporting(false);
    }
  };

  const inclusions = [
    { icon: ReceiptText, title: 'Lançamentos completos', text: 'Competência, vencimento, baixa, contraparte, classificações, conta e comprovante.' },
    { icon: BookOpenCheck, title: 'DRE e DFC reconciliados', text: 'DRE em Caixa e Competência, além do DFC realizado por atividade.' },
    { icon: Landmark, title: 'Saldos e obrigações', text: 'Contas, faturas de cartão, pendências e patrimônio operacional atual.' },
    { icon: Building2, title: 'Plano gerencial', text: 'Categorias, grupos DRE/DFC, subcategorias e centros de custo.' },
  ];

  return (
    <section className="space-y-5" aria-labelledby="accounting-package-title">
      <div className="overflow-hidden rounded-2xl bg-foreground text-background shadow-sm">
        <div className="flex flex-col gap-5 p-5 sm:p-7 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="accounting-package-title" className="text-xl font-semibold sm:text-2xl">
                Pacote para Contabilidade
              </h2>
              <span className="rounded-full bg-success px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
                Excel multiabas
              </span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-background/75">
              Reúna em um único arquivo os dados financeiros necessários para conferência e fechamento com seu contador.
            </p>
            <p className="mt-2 text-xs text-background/55">Período selecionado: {periodLabel}</p>
          </div>
          <Button
            type="button"
            size="lg"
            variant="secondary"
            disabled={isDataLoading || isExporting}
            onClick={() => void handleExport()}
            className="w-full shrink-0 gap-2 bg-background text-foreground hover:bg-background/90 lg:w-auto"
          >
            {isDataLoading || isExporting
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <FileSpreadsheet className="h-4 w-4 text-success" />}
            {isExporting ? 'Gerando pacote...' : isDataLoading ? 'Carregando dados...' : 'Exportar pacote'}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {inclusions.map(({ icon: Icon, title, text }) => (
          <div key={title} className="flex gap-3 rounded-xl bg-muted/25 p-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success text-white">
              <Icon className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-sm font-semibold">{title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{text}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-3 rounded-xl bg-info/10 p-4 text-sm text-foreground">
        <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-info" />
        <p>
          O arquivo inclui lançamentos relacionados ao período por competência, vencimento ou baixa e uma posição atual separada das pendências. Projeções de assinaturas não entram no pacote contábil.
        </p>
      </div>
    </section>
  );
}
