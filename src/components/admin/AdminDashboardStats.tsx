import { Card, CardContent } from '@/components/ui/card';
import { Building2, DollarSign, ShoppingCart, RefreshCw } from 'lucide-react';

interface AdminDashboardStatsProps {
  companies: any[];
  payments: any[];
  income: number;
}

export function AdminDashboardStats({ companies, payments, income }: AdminDashboardStatsProps) {
  const activeCompanies = companies.filter((c: any) => c.subscription_status === 'active').length;
  const testingCompanies = companies.filter((c: any) => c.subscription_status === 'testing').length;

  const salesCount = payments.filter((p: any) => p.type === 'first_sale').length;
  const renewalCount = payments.filter((p: any) => p.type === 'renewal' || p.type === 'renovacao').length;

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

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card
          key={stat.title}
          className={`relative overflow-hidden border-0 shadow-lg ${stat.bgColor} text-white dark:bg-card dark:text-card-foreground dark:border ${stat.darkBorder}`}
        >
          <CardContent className="p-4 lg:p-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1 lg:space-y-2">
                <p className="text-xs lg:text-sm font-medium text-white/80 dark:text-muted-foreground">
                  {stat.title}
                </p>
                <div className="flex items-baseline gap-2">
                  <p className={`text-lg lg:text-2xl font-bold tracking-tight ${stat.darkValueColor}`}>
                    {stat.value}
                  </p>
                </div>
                {stat.subtitle && (
                  <p className="text-xs text-white/70 dark:text-muted-foreground">{stat.subtitle}</p>
                )}
              </div>
              <div className={`p-2 rounded-xl ${stat.iconBg} ${stat.darkIconBg}`}>
                <stat.icon className={`h-4 w-4 text-white ${stat.darkIconColor}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
