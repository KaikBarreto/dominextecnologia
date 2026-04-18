import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Trash2, TrendingUp, ShoppingBag, Calendar } from 'lucide-react';
import { type SalespersonSale, useDeleteSale } from '@/hooks/useSalespersonData';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useIsMobile } from '@/hooks/use-mobile';

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

interface Props { sales: SalespersonSale[]; }

export function SalespersonSalesList({ sales }: Props) {
  const deleteSale = useDeleteSale();
  const isMobile = useIsMobile();

  const totalValue = sales.reduce((acc, s) => acc + (s.paid_amount ?? s.amount), 0);
  const totalCommission = sales.reduce((acc, s) => acc + s.commission_amount, 0);

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="pb-4 border-b bg-muted/30">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <div className="p-2 bg-primary/10 rounded-lg">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            Vendas do Período
          </CardTitle>
          <div className="flex items-center gap-4">
            <div className="text-left sm:text-right">
              <p className="text-xs text-muted-foreground">Total Vendas</p>
              <p className="text-sm font-bold text-primary">{fmt(totalValue)}</p>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-xs text-muted-foreground">Comissões</p>
              <p className="text-sm font-bold text-emerald-600">{fmt(totalCommission)}</p>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {sales.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <ShoppingBag className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-sm">Nenhuma venda no período</p>
          </div>
        ) : isMobile ? (
          <div className="p-4 space-y-3">
            {sales.map((s, i) => (
              <div key={s.id} className="p-4 rounded-xl border space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-semibold text-xs">{i + 1}</div>
                    <div className="min-w-0">
                      <span className="font-semibold block truncate">{s.customer_company || s.customer_name || '—'}</span>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                        <Calendar className="h-3 w-3" /> {format(new Date(s.created_at), 'dd/MM/yyyy', { locale: ptBR })}
                      </div>
                    </div>
                  </div>
                  <Badge variant={s.billing_cycle === 'annual' ? 'default' : 'secondary'} className="text-xs shrink-0">
                    {s.billing_cycle === 'annual' ? 'Anual' : 'Mensal'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between pt-2 border-t">
                  <div>
                    <div className="font-bold">{fmt(s.paid_amount ?? s.amount)}</div>
                    <div className="text-xs text-emerald-600 font-medium">+{fmt(s.commission_amount)} comissão</div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => deleteSale.mutate(s.id)} disabled={deleteSale.isPending} className="h-8 w-8 hover:bg-destructive hover:text-white">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="divide-y max-h-[500px] overflow-y-auto">
            {sales.map((s, i) => (
              <div key={s.id} className="flex items-center justify-between p-4 hover:bg-muted/30 group">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10 text-primary font-semibold text-sm">{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold truncate">{s.customer_company || s.customer_name || '—'}</span>
                      <Badge variant={s.billing_cycle === 'annual' ? 'default' : 'secondary'} className="text-xs">
                        {s.billing_cycle === 'annual' ? 'Anual' : 'Mensal'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      <span>{format(new Date(s.created_at), "dd 'de' MMM yyyy", { locale: ptBR })}</span>
                      {s.customer_origin && (<><span>•</span><span>{s.customer_origin}</span></>)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="font-bold">{fmt(s.paid_amount ?? s.amount)}</div>
                    <div className="text-xs text-emerald-600 font-medium">+{fmt(s.commission_amount)} comissão</div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => deleteSale.mutate(s.id)} disabled={deleteSale.isPending} className="opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive hover:text-white">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
