import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Trophy, Medal, Award } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

interface Props {
  companies: any[];
}

export function AdminTopClientsLTV({ companies }: Props) {
  // LTV calculado pela soma dos pagamentos por empresa
  const { data: paymentsByCompany = {} } = useQuery({
    queryKey: ['admin-payments-ltv'],
    queryFn: async () => {
      const { data } = await supabase
        .from('company_payments')
        .select('company_id, amount');
      const map: Record<string, number> = {};
      (data || []).forEach((p: any) => {
        if (p.company_id) map[p.company_id] = (map[p.company_id] || 0) + Number(p.amount || 0);
      });
      return map;
    },
  });

  const activeCompanies = companies.filter((c) => c.subscription_status === 'active');
  const enriched = activeCompanies.map((c) => ({
    id: c.id,
    name: c.name,
    ltv: paymentsByCompany[c.id] || 0,
    ticket: Number(c.subscription_value || 0),
  }));
  const topClients = [...enriched].filter((c) => c.ltv > 0).sort((a, b) => b.ltv - a.ltv).slice(0, 3);

  const withLtv = enriched.filter((c) => c.ltv > 0);
  const averageLtv = withLtv.length > 0 ? withLtv.reduce((s, c) => s + c.ltv, 0) / withLtv.length : 0;
  const withTicket = enriched.filter((c) => c.ticket > 0);
  const averageTicket = withTicket.length > 0 ? withTicket.reduce((s, c) => s + c.ticket, 0) / withTicket.length : 0;

  return (
    <Card className="border-0 shadow-lg overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-yellow-500 to-amber-500 pb-3 sm:pb-4 px-4 sm:px-6">
        <CardTitle className="text-sm sm:text-base lg:text-lg font-semibold text-white flex items-center gap-2">
          <Trophy className="h-4 w-4 sm:h-5 sm:w-5" />
          Top 3 Clientes por LTV
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 sm:p-5 lg:p-8">
        {/* Mobile */}
        <div className="flex flex-col gap-3 lg:hidden">
          {topClients.map((c, i) => (
            <div key={c.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <div className={cn(
                'flex items-center justify-center w-8 h-8 rounded-full font-bold text-xs',
                i === 0 && 'bg-yellow-400 text-yellow-900',
                i === 1 && 'bg-gray-300 text-gray-700',
                i === 2 && 'bg-amber-600 text-white'
              )}>
                {i + 1}º
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{c.name}</p>
                <p className={cn(
                  'text-sm font-bold',
                  i === 0 && 'text-yellow-600',
                  i === 1 && 'text-gray-600',
                  i === 2 && 'text-amber-600'
                )}>{fmt(c.ltv)}</p>
              </div>
            </div>
          ))}
          <div className="grid grid-cols-3 gap-2 mt-2 pt-3 border-t">
            <div className="text-center"><p className="text-[10px] text-muted-foreground">ARPU</p><p className="text-xs font-bold">{fmt(averageLtv)}</p></div>
            <div className="text-center border-x"><p className="text-[10px] text-muted-foreground">Ticket Médio</p><p className="text-xs font-bold">{fmt(averageTicket)}</p></div>
            <div className="text-center"><p className="text-[10px] text-muted-foreground">Clientes</p><p className="text-xs font-bold">{activeCompanies.length}</p></div>
          </div>
        </div>

        {/* Desktop podium */}
        <div className="hidden lg:flex lg:items-end lg:justify-center lg:gap-5 py-4">
          {topClients[1] && (
            <div className="flex flex-col items-center flex-shrink min-w-0">
              <Medal className="h-5 w-5 text-gray-400 mb-1" />
              <div className="bg-gray-100 dark:bg-gray-800 rounded-t-lg p-2.5 w-[125px] h-[76px] flex flex-col items-center justify-end">
                <span className="text-[11px] text-muted-foreground text-center leading-tight line-clamp-2" title={topClients[1].name}>{topClients[1].name}</span>
                <span className="text-sm font-bold text-gray-600 dark:text-gray-300 mt-1">{fmt(topClients[1].ltv)}</span>
              </div>
              <div className="bg-gray-300 dark:bg-gray-700 w-[125px] h-5 flex items-center justify-center text-xs font-bold text-gray-600 dark:text-gray-300">2º</div>
            </div>
          )}
          {topClients[0] && (
            <div className="flex flex-col items-center flex-shrink min-w-0">
              <Trophy className="h-7 w-7 text-yellow-500 mb-1" />
              <div className="bg-yellow-100 dark:bg-yellow-900/30 rounded-t-lg p-2.5 w-[140px] h-[100px] flex flex-col items-center justify-end border-2 border-yellow-400">
                <span className="text-xs text-muted-foreground text-center leading-tight line-clamp-2" title={topClients[0].name}>{topClients[0].name}</span>
                <span className="text-base font-bold text-yellow-600 dark:text-yellow-400 mt-1">{fmt(topClients[0].ltv)}</span>
              </div>
              <div className="bg-yellow-400 w-[140px] h-5 flex items-center justify-center text-xs font-bold text-yellow-900">1º</div>
            </div>
          )}
          {topClients[2] && (
            <div className="flex flex-col items-center flex-shrink min-w-0">
              <Award className="h-5 w-5 text-amber-600 mb-1" />
              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-t-lg p-2.5 w-[110px] h-[60px] flex flex-col items-center justify-end">
                <span className="text-[11px] text-muted-foreground text-center leading-tight line-clamp-2" title={topClients[2].name}>{topClients[2].name}</span>
                <span className="text-sm font-bold text-amber-600 mt-1">{fmt(topClients[2].ltv)}</span>
              </div>
              <div className="bg-amber-600 w-[110px] h-5 flex items-center justify-center text-xs font-bold text-white">3º</div>
            </div>
          )}
          <div className="h-24 w-px bg-border mx-2" />
          <div className="flex flex-col gap-2">
            <div className="p-2 rounded-lg bg-muted/50 text-center min-w-[90px]"><p className="text-[10px] text-muted-foreground">ARPU</p><p className="text-sm font-bold">{fmt(averageLtv)}</p></div>
            <div className="p-2 rounded-lg bg-muted/50 text-center"><p className="text-[10px] text-muted-foreground">Ticket Médio</p><p className="text-sm font-bold">{fmt(averageTicket)}</p></div>
            <div className="p-2 rounded-lg bg-muted/50 text-center"><p className="text-[10px] text-muted-foreground">Clientes Ativos</p><p className="text-sm font-bold">{activeCompanies.length}</p></div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
