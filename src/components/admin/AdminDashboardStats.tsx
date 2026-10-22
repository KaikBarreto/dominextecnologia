import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Building2, DollarSign, ShoppingCart, RefreshCw } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import type {
  AdminDashboardCompany,
  AdminDashboardTransaction,
} from '@/hooks/useAdminDashboardData';
import { calculateAdminDashboardPeriodMetrics } from '@/lib/adminDashboardMetrics';

interface AdminDashboardStatsProps {
  companies: AdminDashboardCompany[];
  transactions: AdminDashboardTransaction[];
  startDate: Date;
  endDate: Date;
}

export function AdminDashboardStats({
  companies,
  transactions,
  startDate,
  endDate,
}: AdminDashboardStatsProps) {
  const isMobile = useIsMobile();
  const activeCompanies = companies.filter((company) => company.subscription_status === 'active').length;
  const testingCompanies = companies.filter((company) => company.subscription_status === 'testing').length;
  const { income, salesCount, renewalCount } = useMemo(
    () => calculateAdminDashboardPeriodMetrics(transactions, startDate, endDate),
    [transactions, startDate, endDate],
  );

  const formatCurrency = (value: number) =>
    value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const stats = [
    {
      title: 'Receita',
      value: formatCurrency(income),
      icon: DollarSign,
      bgColor: 'bg-emerald-500',
      iconBg: 'bg-emerald-600',
      darkBorder: 'dark:border-emerald-500/30 dark:shadow-[0_0_15px_-3px_rgba(16,185,129,0.15)]',
      darkIconBg: 'dark:bg-emerald-500/15',
      darkIconColor: 'dark:text-emerald-400',
      darkValueColor: 'dark:text-emerald-400',
    },
    {
      title: 'Empresas Ativas',
      value: activeCompanies,
      subtitle: testingCompanies > 0 ? `+${testingCompanies} testando` : undefined,
      icon: Building2,
      bgColor: 'bg-blue-500',
      iconBg: 'bg-blue-600',
      darkBorder: 'dark:border-blue-500/30 dark:shadow-[0_0_15px_-3px_rgba(59,130,246,0.15)]',
      darkIconBg: 'dark:bg-blue-500/15',
      darkIconColor: 'dark:text-blue-400',
      darkValueColor: 'dark:text-blue-400',
    },
    {
      title: 'Vendas',
      value: salesCount,
      icon: ShoppingCart,
      bgColor: 'bg-violet-500',
      iconBg: 'bg-violet-600',
      darkBorder: 'dark:border-violet-500/30 dark:shadow-[0_0_15px_-3px_rgba(139,92,246,0.15)]',
      darkIconBg: 'dark:bg-violet-500/15',
      darkIconColor: 'dark:text-violet-400',
      darkValueColor: 'dark:text-violet-400',
    },
    {
      title: 'Renovações',
      value: renewalCount,
      icon: RefreshCw,
      bgColor: 'bg-amber-500',
      iconBg: 'bg-amber-600',
      darkBorder: 'dark:border-amber-500/30 dark:shadow-[0_0_15px_-3px_rgba(245,158,11,0.15)]',
      darkIconBg: 'dark:bg-amber-500/15',
      darkIconColor: 'dark:text-amber-400',
      darkValueColor: 'dark:text-amber-400',
    },
  ];

  const renderCard = (stat: (typeof stats)[number]) => (
    <Card
      key={stat.title}
      className={`relative h-full overflow-hidden border-0 shadow-lg ${stat.bgColor} text-white dark:border dark:bg-card dark:text-card-foreground ${stat.darkBorder}`}
    >
      <CardContent className="p-4 lg:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1 lg:space-y-2">
            <p className="text-xs font-medium text-white/80 dark:text-muted-foreground lg:text-sm">
              {stat.title}
            </p>
            <p className={`truncate text-lg font-bold tracking-tight tabular-nums lg:text-2xl ${stat.darkValueColor}`}>
              {stat.value}
            </p>
            {stat.subtitle && (
              <p className="text-xs text-white/70 dark:text-muted-foreground">{stat.subtitle}</p>
            )}
          </div>
          <div className={`shrink-0 rounded-xl p-2 ${stat.iconBg} ${stat.darkIconBg}`}>
            <stat.icon className={`h-4 w-4 text-white ${stat.darkIconColor}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (isMobile) {
    return (
      <div className="-mx-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-3 no-scrollbar touch-pan-x overscroll-x-contain">
        {stats.map((stat) => (
          <div key={stat.title} className="w-[75vw] shrink-0 snap-start">
            {renderCard(stat)}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => renderCard(stat))}
    </div>
  );
}
