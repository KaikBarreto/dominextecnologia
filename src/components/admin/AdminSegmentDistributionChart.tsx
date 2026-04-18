import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Briefcase } from 'lucide-react';
import { COMPANY_SEGMENTS, getSegment } from '@/utils/companySegments';

interface Props {
  companies: any[];
}

export function AdminSegmentDistributionChart({ companies }: Props) {
  const data = useMemo(() => {
    const active = companies.filter(c => c.subscription_status === 'active' || c.subscription_status === 'testing');
    const counts: Record<string, number> = {};
    active.forEach((c) => {
      const key = c.segment || 'outro';
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([value, count]) => {
        const seg = getSegment(value) || COMPANY_SEGMENTS[COMPANY_SEGMENTS.length - 1];
        return { name: seg.label, value: count, color: seg.color, key: value };
      })
      .sort((a, b) => b.value - a.value);
  }, [companies]);

  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <Card className="border-0 shadow-lg overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-violet-500 to-fuchsia-500 pb-3 px-4 sm:px-6">
        <CardTitle className="text-sm sm:text-base font-semibold text-white flex items-center gap-2">
          <Briefcase className="h-4 w-4" />Clientes por Segmento
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 sm:p-4">
        {data.length === 0 ? (
          <div className="flex items-center justify-center h-[220px] text-muted-foreground text-sm">
            Nenhum cliente cadastrado com segmento
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4 items-center">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={data} cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={2} dataKey="value">
                  {data.map((it) => <Cell key={it.key} fill={it.color} />)}
                </Pie>
                <Tooltip
                  formatter={(v: number, n: string) => [`${total ? ((v / total) * 100).toFixed(1) : 0}% (${v})`, n]}
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1.5 max-h-[260px] overflow-y-auto pr-1">
              {data.map((it) => {
                const pct = total ? ((it.value / total) * 100).toFixed(0) : '0';
                return (
                  <div key={it.key} className="flex items-center gap-2 text-xs">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: it.color }} />
                    <span className="truncate flex-1 text-foreground/80">{it.name}</span>
                    <span className="font-semibold shrink-0">{it.value} ({pct}%)</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
