import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import type { AffiliateWithMetrics } from '@/hooks/useAffiliateData';

interface AffiliateChartsProps {
  affiliates: AffiliateWithMetrics[];
}

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

const brl = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

/**
 * Gráficos do dashboard de afiliados.
 *
 * Dois gotchas conhecidos do projeto (`recharts_pie_label_overflow_mobile` e o
 * de alinhamento de legenda lado a lado):
 *  - a pizza NÃO tem `label` flutuante na fatia (vaza da fatia no mobile) —
 *    usa `Legend` embaixo em vez disso.
 *  - os DOIS gráficos levam `Legend` com a mesma altura, pra ficar alinhado
 *    quando lado a lado no desktop (senão a pizza fica mais baixa que a barra).
 */
export function AffiliateCharts({ affiliates }: AffiliateChartsProps) {
  const clientsByAffiliate = useMemo(
    () =>
      affiliates
        .map((a) => ({ name: a.name.split(' ')[0], value: a.client_count || 0 }))
        .filter((item) => item.value > 0),
    [affiliates],
  );

  const pendingByAffiliate = useMemo(
    () =>
      affiliates
        .map((a) => ({ name: a.name.split(' ')[0], saldo: a.pending_balance || 0 }))
        .filter((item) => item.saldo > 0),
    [affiliates],
  );

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Clientes por Afiliado</CardTitle>
        </CardHeader>
        <CardContent>
          {clientsByAffiliate.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <defs>
                  {clientsByAffiliate.map((_, index) => (
                    <linearGradient
                      key={`affGrad${index}`}
                      id={`affGrad${index}`}
                      x1="0"
                      y1="0"
                      x2="1"
                      y2="1"
                    >
                      <stop offset="0%" stopColor={COLORS[index % COLORS.length]} stopOpacity={1} />
                      <stop offset="100%" stopColor={COLORS[index % COLORS.length]} stopOpacity={0.6} />
                    </linearGradient>
                  ))}
                </defs>
                <Pie
                  data={clientsByAffiliate}
                  cx="50%"
                  cy="45%"
                  labelLine={false}
                  outerRadius={75}
                  dataKey="value"
                  stroke="none"
                >
                  {clientsByAffiliate.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={`url(#affGrad${index})`} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => [`${value} clientes`, 'Clientes']} />
                <Legend verticalAlign="bottom" height={36} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[260px] items-center justify-center text-muted-foreground text-sm">
              Sem clientes indicados
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Saldo Pendente por Afiliado</CardTitle>
        </CardHeader>
        <CardContent>
          {pendingByAffiliate.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={pendingByAffiliate}>
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value: number) => [brl(value), 'Saldo pendente']} />
                <Legend verticalAlign="bottom" height={36} />
                <Bar dataKey="saldo" fill="#10b981" name="Saldo pendente" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[260px] items-center justify-center text-muted-foreground text-sm">
              Sem saldo pendente
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
