import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, BriefcaseBusiness, FileBarChart, LayoutDashboard, Layers, LineChart, RefreshCw, Settings2, Tags, Wallet } from 'lucide-react';
import { FinanceOverview } from './FinanceOverview';
import { FinanceReportsOverview } from './FinanceReportsOverview';
import { FinanceDRE } from './FinanceDRE';
import { FinanceDFC } from './FinanceDFC';
import { FinanceAnalysis } from './FinanceAnalysis';
import { FinanceAccountingPackage } from './FinanceAccountingPackage';
import { FinanceCategorias } from './FinanceCategorias';
import { FinanceCostCenters } from './FinanceCostCenters';
import { DreGroupsManagerDialog } from './DreGroupsManagerDialog';
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
import type { SettingsTab } from '@/components/SettingsSidebarLayout';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useFinancialCategories } from '@/hooks/useFinancialCategories';

type FinanceSection = 'relatorio' | 'cobrancas' | 'relatorios' | 'configuracoes';

interface FinanceRelatorioProps {
  section: FinanceSection;
  transactions: (FinancialTransaction & { customer?: unknown })[];
  overviewTransactions: (FinancialTransaction & { customer?: unknown })[];
  allTransactions: (FinancialTransaction & { customer?: unknown })[];
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
  onTransfer: () => void;
  canTransfer: boolean;
}

type SectionTab = SettingsTab;

/**
 * Conteúdo das áreas secundárias do Financeiro.
 *
 * A navegação principal vive no menu global. Aqui existem somente alternâncias
 * irmãs dentro da mesma tarefa (DRE/DFC, Cobranças/Assinaturas e os dois
 * cadastros financeiros). Em qualquer largura elas seguem o padrão underline
 * horizontal, preservando toda a largura útil para tabelas e gráficos.
 */
export function FinanceRelatorio({
  section,
  transactions,
  overviewTransactions,
  allTransactions,
  isLoading = false,
  dateRange,
  summary,
  activeTab,
  onTabChange,
  onNavigateShortcut,
  onNewMovement,
  onTransfer,
  canTransfer,
}: FinanceRelatorioProps) {
  const navigate = useNavigate();
  const { locale } = useAppLocaleContext();
  const fin = MESSAGES[locale].app.finance;
  const sub = MESSAGES[locale].app.charges.subscriptions;
  const centralT = MESSAGES[locale].app.charges.central;
  const paymentsSetupT = MESSAGES[locale].app.charges.cobrar.notActivated;
  const { hasModule } = useCompanyModules();
  const hasChargeModule = hasModule('cobrancas');
  const { isActive: isPaymentAccountActive } = useTenantPaymentAccount();
  const { categories } = useFinancialCategories();
  const [dreGroupsOpen, setDreGroupsOpen] = useState(false);

  const tabs = useMemo<SectionTab[]>(() => {
    if (section === 'relatorios') {
      return [
        { value: 'visao-geral', label: fin.report.tabs.overview, icon: LayoutDashboard },
        { value: 'dre', label: fin.report.tabs.incomeStatement, icon: FileBarChart },
        { value: 'dfc', label: fin.report.tabs.cashFlowStatement, icon: BarChart3 },
        { value: 'contabilidade', label: fin.report.tabs.accounting, icon: BriefcaseBusiness },
        { value: 'analise', label: fin.report.tabs.analysis, icon: LineChart },
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
        { value: 'grupos-dre', label: 'Grupos do DRE', icon: FileBarChart },
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
        projectionTransactions={overviewTransactions}
        dateRange={dateRange}
        summary={summary}
        isLoading={isLoading}
        onNavigate={(target) => onNavigateShortcut(target as 'historico' | 'contas')}
        onNewMovement={onNewMovement}
        onTransfer={onTransfer}
        canTransfer={canTransfer}
      />
    );
  }

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
    <Tabs value={safeTab} onValueChange={onTabChange} className="min-w-0 space-y-4">
      <TabsList
        variant="underline"
        aria-label="Seções do financeiro"
        className="w-full justify-start gap-0"
      >
        {tabs.map(({ value, label, icon: Icon }) => (
          <TabsTrigger
            key={value}
            value={value}
            variant="underline"
            className="min-h-11 gap-2 px-3 sm:px-4"
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </TabsTrigger>
        ))}
      </TabsList>

      <div className="min-w-0">
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
        ) : safeTab === 'analise' ? (
          <FinanceAnalysis transactions={allTransactions} isLoading={isLoading} />
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
        ) : safeTab === 'grupos-dre' ? (
          <div className="rounded-xl border bg-card p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="max-w-2xl">
                <h2 className="text-base font-semibold">Estrutura do DRE</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Organize os grupos, confira a prévia hierárquica e veja em qual grupo cada categoria será exibida.
                </p>
              </div>
              <Button onClick={() => setDreGroupsOpen(true)} className="gap-2 sm:self-start">
                <Settings2 className="h-4 w-4" />
                Configurar grupos
              </Button>
            </div>
            <DreGroupsManagerDialog
              open={dreGroupsOpen}
              onOpenChange={setDreGroupsOpen}
              categories={categories}
            />
          </div>
        ) : safeTab === 'assinaturas' ? (
          <FinanceAssinaturas />
        ) : (
          <FinanceCobrancas />
        )}
      </div>
    </Tabs>
  );
}
