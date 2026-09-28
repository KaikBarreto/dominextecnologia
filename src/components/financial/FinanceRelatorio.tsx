import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, BriefcaseBusiness, FileBarChart, LayoutDashboard, Layers, RefreshCw, Tags, Wallet } from 'lucide-react';
import { FinanceOverview } from './FinanceOverview';
import { FinanceReportsOverview } from './FinanceReportsOverview';
import { FinanceDRE } from './FinanceDRE';
import { FinanceDFC } from './FinanceDFC';
import { FinanceAccountingPackage } from './FinanceAccountingPackage';
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
import { SettingsSidebarLayout, type SettingsTab } from '@/components/SettingsSidebarLayout';

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
  onNewMovement: () => void;
}

type SectionTab = SettingsTab;

/**
 * Conteúdo das áreas secundárias do Financeiro.
 *
 * A navegação principal vive no menu global. Aqui existem somente alternâncias
 * irmãs dentro da mesma tarefa (DRE/DFC, Cobranças/Assinaturas e os dois
 * cadastros financeiros). No desktop elas seguem o padrão de sidebar local;
 * no celular, o mesmo componente converte a navegação em pills roláveis.
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
  onNewMovement,
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
        { value: 'visao-geral', label: fin.report.tabs.overview, icon: LayoutDashboard },
        { value: 'dre', label: fin.report.tabs.incomeStatement, icon: FileBarChart },
        { value: 'dfc', label: fin.report.tabs.cashFlowStatement, icon: BarChart3 },
        { value: 'contabilidade', label: fin.report.tabs.accounting, icon: BriefcaseBusiness },
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
        isLoading={isLoading}
        onNavigate={(target) => onNavigateShortcut(target as 'historico' | 'contas')}
        onNewMovement={onNewMovement}
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
    <SettingsSidebarLayout tabs={tabs} activeTab={safeTab} onTabChange={onTabChange}>
      {safeTab === 'visao-geral' ? (
        <FinanceReportsOverview transactions={allTransactions} range={dateRange} isLoading={isLoading} />
      ) : safeTab === 'dfc' ? (
        <FinanceDFC transactions={allTransactions} range={dateRange} isLoading={isLoading} />
      ) : safeTab === 'dre' ? (
        <FinanceDRE
          transactions={allTransactions}
          range={dateRange}
          canIncludeSubscriptionProjections={hasChargeModule}
        />
      ) : safeTab === 'contabilidade' ? (
        <FinanceAccountingPackage
          transactions={allTransactions}
          range={dateRange}
          isLoading={isLoading}
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
    </SettingsSidebarLayout>
  );
}
