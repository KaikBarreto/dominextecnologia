import { useEffect } from 'react';
import { LayoutDashboard, FileBarChart, Tags, RefreshCw } from 'lucide-react';
import { SettingsSidebarLayout, type SettingsTab } from '@/components/SettingsSidebarLayout';
import { FinanceOverview } from './FinanceOverview';
import { FinanceDRE } from './FinanceDRE';
import { FinanceCategorias } from './FinanceCategorias';
import { FinanceAssinaturas } from './FinanceAssinaturas';
import { useCompanyModules } from '@/hooks/useCompanyModules';
import { useTenantPaymentAccount } from '@/hooks/useTenantPaymentAccount';
import type { FinancialTransaction } from '@/types/database';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

interface FinanceRelatorioProps {
  /** Transações filtradas pelo período selecionado no parent. */
  transactions: (FinancialTransaction & { customer?: any })[];
  summary: {
    totalEntradas: number;
    totalSaidas: number;
    saldo: number;
    aPagar: number;
    aReceber: number;
  };
  /** Aba ativa controlada pelo parent (deep-link `?tab=dre`). */
  activeTab: string;
  onTabChange: (tab: string) => void;
  /** Navegação pros atalhos da Visão Geral (Movimentações / Contas a Pagar). */
  onNavigateShortcut: (target: 'historico' | 'contas') => void;
  onNewReceita: () => void;
  onNewDespesa: () => void;
}

/**
 * Tela "Relatório Financeiro" — Visão Geral + DRE/Resultado em abas.
 * A aba DRE só aparece pra quem tem `finance_advanced` (mesmo gate de antes,
 * quando DRE era uma aba interna da página Financeiro). No mobile vira um
 * único carrossel de pills (1 nível só).
 */
export function FinanceRelatorio({
  transactions,
  summary,
  activeTab,
  onTabChange,
  onNavigateShortcut,
  onNewReceita,
  onNewDespesa,
}: FinanceRelatorioProps) {
  const { locale } = useAppLocaleContext();
  const fin = MESSAGES[locale].app.finance;
  const sub = MESSAGES[locale].app.charges.subscriptions;
  const { hasModule } = useCompanyModules();
  const hasAdvanced = hasModule('finance_advanced');
  const hasChargeModule = hasModule('cobrancas');
  const { isActive: isPaymentAccountActive } = useTenantPaymentAccount();
  // A aba Assinaturas só aparece com o módulo cobrancas contratado E conta ativa.
  const showSubscriptionsTab = hasChargeModule && isPaymentAccountActive;

  const tabs: SettingsTab[] = [
    { value: 'visao-geral', label: fin.report.tabs.overview, icon: LayoutDashboard },
    ...(hasAdvanced
      ? [{ value: 'dre', label: fin.report.tabs.incomeStatement, icon: FileBarChart } as SettingsTab]
      : []),
    { value: 'categorias', label: fin.report.tabs.categories, icon: Tags },
    ...(showSubscriptionsTab
      ? [{ value: 'assinaturas', label: sub.tabLabel, icon: RefreshCw } as SettingsTab]
      : []),
  ];

  // Deep-link `?tab=dre` num tenant sem finance_advanced (downgrade/link antigo)
  // cai pra Visão Geral sem aviso ruidoso.
  useEffect(() => {
    if (activeTab === 'dre' && !hasAdvanced) onTabChange('visao-geral');
  }, [activeTab, hasAdvanced, onTabChange]);

  // Deep-link `?tab=assinaturas` sem o módulo → cai na Visão Geral.
  useEffect(() => {
    if (activeTab === 'assinaturas' && !showSubscriptionsTab) onTabChange('visao-geral');
  }, [activeTab, showSubscriptionsTab, onTabChange]);

  const safeTab = tabs.some((t) => t.value === activeTab) ? activeTab : 'visao-geral';

  return (
    <SettingsSidebarLayout tabs={tabs} activeTab={safeTab} onTabChange={onTabChange}>
      {safeTab === 'dre' ? (
        <FinanceDRE transactions={transactions} />
      ) : safeTab === 'categorias' ? (
        <FinanceCategorias />
      ) : safeTab === 'assinaturas' ? (
        <FinanceAssinaturas />
      ) : (
        <FinanceOverview
          transactions={transactions}
          summary={summary}
          onNavigate={(target) => onNavigateShortcut(target as 'historico' | 'contas')}
          onNewReceita={onNewReceita}
          onNewDespesa={onNewDespesa}
        />
      )}
    </SettingsSidebarLayout>
  );
}
