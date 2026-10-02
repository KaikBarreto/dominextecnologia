import { useNavigate } from 'react-router-dom';
import { Target, CalendarClock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { SalespersonAvatar } from '@/components/admin/salesperson/SalespersonAvatar';
import { MobileListItem } from '@/components/mobile/MobileListItem';
import { EmptyState } from '@/components/mobile/EmptyState';
import { cn } from '@/lib/utils';
import type { SalespersonActivityAggregate } from './activityAggregate';

interface Props {
  rows: SalespersonActivityAggregate[];
  isMobile: boolean;
}

/** Cor sóbria por faixa de cobertura — informação, não alarme (régua de UI:
 * dia sem registro não é erro). Âmbar só a partir de cobertura bem baixa. */
// Cobertura baixa é má notícia e tem que gritar — badge cinza aqui escondia
// justamente o vendedor que não está preenchendo. Três cores saturadas.
function coverageBadgeVariant(pct: number): 'success' | 'warning' | 'destructive' {
  if (pct >= 90) return 'success';
  if (pct >= 60) return 'warning';
  return 'destructive';
}

export function SalespeopleActivityTable({ rows, isMobile }: Props) {
  const navigate = useNavigate();

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-2">
          <EmptyState
            icon={<Target className="h-12 w-12" />}
            title="Nenhum vendedor com atividade no período"
            description="Peça para o time registrar o diário comercial na própria ficha (Manhã/Tarde)."
            size="compact"
          />
        </CardContent>
      </Card>
    );
  }

  const goTo = (id: string) => navigate(`/admin/vendedores/${id}`);

  if (isMobile) {
    return (
      <Card className="overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Por vendedor</CardTitle>
        </CardHeader>
        <div className="divide-y">
          {rows.map((r) => (
            <MobileListItem
              key={r.id}
              onClick={() => goTo(r.id)}
              leading={<SalespersonAvatar name={r.name} photoUrl={r.photoUrl} size="md" />}
              title={r.name}
              subtitle={`${r.counters.contacts} contatos • ${r.counters.meetings_scheduled} agendadas • ${r.filledPeriodsLabel} períodos`}
              trailing={
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Badge variant={coverageBadgeVariant(r.coveragePercent)} className="text-[10px] px-2 py-0.5">
                    {r.coveragePercent.toFixed(0)}% cobertura
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {r.missingDaysCount} dia(s) sem registro
                  </span>
                </div>
              }
            />
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Por vendedor</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vendedor</TableHead>
              <TableHead className="text-right">Contatos</TableHead>
              <TableHead className="text-right">Reuniões agend.</TableHead>
              <TableHead className="text-right">Reuniões realiz.</TableHead>
              <TableHead className="text-right">Vendas</TableHead>
              <TableHead className="text-right">Períodos</TableHead>
              <TableHead className="text-right">Sem registro</TableHead>
              <TableHead className="text-right">Parciais</TableHead>
              <TableHead className="text-right">Cobertura</TableHead>
              <TableHead className="text-right">
                <span className="inline-flex items-center gap-1"><Target className="h-3 w-3" /> Meta contatos</span>
              </TableHead>
              <TableHead className="text-right">
                <span className="inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" /> Meta reuniões</span>
              </TableHead>
              <TableHead className="text-right">Aderência</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow
                key={r.id}
                className="cursor-pointer"
                onClick={() => goTo(r.id)}
              >
                <TableCell>
                  <div className="flex min-w-0 items-center gap-2">
                    <SalespersonAvatar name={r.name} photoUrl={r.photoUrl} size="sm" />
                    <span className="truncate font-medium">{r.name}</span>
                    {!r.isActive && (
                      <Badge variant="secondary" className="shrink-0 text-[10px]">Inativo</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">{r.counters.contacts}</TableCell>
                <TableCell className="text-right tabular-nums">{r.counters.meetings_scheduled}</TableCell>
                <TableCell className="text-right tabular-nums">{r.counters.meetings_held}</TableCell>
                <TableCell className="text-right tabular-nums">{r.counters.sales_count}</TableCell>
                <TableCell className="text-right tabular-nums">{r.filledPeriodsLabel}</TableCell>
                <TableCell className="text-right tabular-nums">{r.missingDaysCount}</TableCell>
                <TableCell className="text-right tabular-nums">{r.partialDaysCount}</TableCell>
                <TableCell className="text-right">
                  <Badge variant={coverageBadgeVariant(r.coveragePercent)} className={cn('text-[10px]')}>
                    {r.coveragePercent.toFixed(0)}%
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.goalContactsDaysMet}/{r.businessDaysCount}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.goalMeetingsDaysMet}/{r.businessDaysCount}
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {r.adherencePercent.toFixed(0)}%
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
