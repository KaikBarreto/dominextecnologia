import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, FileBarChart, Layers, RefreshCw, Tags, Wallet } from 'lucide-react';
import { FinanceOverview } from './FinanceOverview';
import { FinanceDRE } from './FinanceDRE';
import { FinanceDFC } from './FinanceDFC';
import { FinanceCategorias } from './FinanceCategorias';
import { FinanceCostCenters } from './FinanceCostCenters';
import { FinanceAssinaturas } from './FinanceAssinaturas';
import { FinanceCobrancas } from './FinanceCobrancas';
import { useCompanyModules } from '@/hooks/useCompanyModules';
import { useTenantPaymentAccount } from '@/hooks/useTenantPaymentAccount';
import type { FinancialTransaction } from '@/types/database';
import type { DateRange } from '@/components/ui/DateRangeFilter';
import { Button } from '@/components/ui/button';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { localizeAppPath } from '@/lib/i18n/appRouteSlugs';
import { cn } from '@/lib/utils';

type FinanceSection = 'relatorio' | 'cobrancas' | 'relatorios' | 'configuracoes';

interface FinanceRelatorioProps {
  section: FinanceSection;
  transactions: (FinancialTransaction & { customer?: any })[];
  allTransactions: (FinancialTransaction & { customer?: any })[];
  isLoading?: boolean;
  dateRange: DateRange;
  summary: {
    totalEntradas: number;
    totalSaidas: number;
    saldo: number;
    aPagar: number;
    aReceber: number;
  };
  activeTab: string;
  onTabChange: (tab: string) => void;
  onNavigateShortcut: (target: 'historico' | 'contas') => void;
  onNewReceita: () => void;
  onNewDespesa: () => void;
}

type SectionTab = { value: string; label: string; icon: typeof FileBarChart };

/**
 * Conteúdo das áreas secundárias do Financeiro.
 *
 * A navegação principal vive no menu global. Aqui existem somente alternâncias
 * irmãs dentro da mesma tarefa (DRE/DFC, Cobranças/Assinaturas e os dois
 * cadastros financeiros), numa faixa horizontal que não cria uma segunda
 * coluna permanente ao lado do conteúdo.
 */
export function FinanceRelatorio({
  section,
  transactions,
  allTransactions,
  isLoading = false,
  dateRange,
  summary,
  activeTab,
  onTabChange,
  onNavigateShortcut,
  onNewReceita,
  onNewDespesa,
}: FinanceRelatorioProps) {
  const navigate = useNavigate();
  const { locale } = useAppLocaleContext();
  const fin = MESSAGES[locale].app.finance;
  const sub = MESSAGES[locale].app.charges.subscriptions;
  const centralT = MESSAGES[locale].app.charges.central;
  const paymentsSetupT = MESSAGES[locale].app.charges.cobrar.notActivated;
  const { hasModule } = useCompanyModules();
  const hasAdvanced = hasModule('finance_advanced');
  const hasChargeModule = hasModule('cobrancas');
  const { isActive: isPaymentAccountActive } = useTenantPaymentAccount();

  const tabs = useMemo<SectionTab[]>(() => {
    if (section === 'relatorios') {
      return [
        { value: 'dre', label: fin.report.tabs.incomeStatement, icon: FileBarChart },
        { value: 'dfc', label: fin.report.tabs.cashFlowStatement, icon: BarChart3 },
      ];
    }
    if (section === 'cobrancas') {
      return [
        { value: 'cobrancas', label: centralT.tabLabel, icon: Wallet },
        { value: 'assinaturas', label: sub.tabLabel, icon: RefreshCw },
      ];
    }
    if (section === 'configuracoes') {
      return [
        { value: 'categorias', label: fin.report.tabs.categories, icon: Tags },
        { value: 'centro-de-custo', label: fin.report.tabs.costCenters, icon: Layers },
      ];
    }
    return [];
  }, [section, fin, centralT.tabLabel, sub.tabLabel]);

  const safeTab = tabs.some((tab) => tab.value === activeTab)
    ? activeTab
    : tabs[0]?.value ?? 'visao-geral';

  useEffect(() => {
    if (safeTab !== activeTab) onTabChange(safeTab);
  }, [activeTab, safeTab, onTabChange]);

  if (section === 'relatorio') {
    return (
      <FinanceOverview
        transactions={transactions}
        summary={summary}
        onNavigate={(target) => onNavigateShortcut(target as 'historico' | 'contas')}
        onNewReceita={onNewReceita}
        onNewDespesa={onNewDespesa}
      />
    );
  }

  if (section === 'relatorios' && !hasAdvanced) return null;
  if (section === 'cobrancas' && !hasChargeModule) return null;

  if (section === 'cobrancas' && !isPaymentAccountActive) {
    return (
      <div className="rounded-2xl bg-muted/40 px-5 py-8 text-center sm:px-8">
        <Wallet className="mx-auto h-10 w-10 text-muted-foreground" />
        <h2 className="mt-3 text-lg font-semibold">{paymentsSetupT.title}</h2>
        <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">
          {paymentsSetupT.description}
        </p>
        <Button
          className="mt-5"
          onClick={() => navigate(localizeAppPath('/configuracoes/integracoes', locale))}
        >
          {paymentsSetupT.cta}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-muted/60 p-1 sm:w-fit">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const selected = safeTab === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => onTabChange(tab.value)}
              aria-pressed={selected}
              className={cn(
                'inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3.5 text-sm font-medium transition-colors',
                selected
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {safeTab === 'dfc' ? (
        <FinanceDFC transactions={allTransactions} range={dateRange} isLoading={isLoading} />
      ) : safeTab === 'dre' ? (
        <FinanceDRE
          transactions={allTransactions}
          range={dateRange}
          canIncludeSubscriptionProjections={hasChargeModule}
        />
      ) : safeTab === 'categorias' ? (
        <FinanceCategorias />
      ) : safeTab === 'centro-de-custo' ? (
        <FinanceCostCenters />
      ) : safeTab === 'assinaturas' ? (
        <FinanceAssinaturas />
      ) : (
        <FinanceCobrancas />
      )}
    </div>
  );
}
