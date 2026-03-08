import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, ScrollText, Calendar, CheckCircle, Clock, ExternalLink, SkipForward, Repeat, DollarSign, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { useContractDetail } from '@/hooks/useContractDetail';
import { getFrequencyLabel } from '@/hooks/useContracts';
import { useFinancial } from '@/hooks/useFinancial';
import { format, isBefore, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/utils/currency';

/** Parse a YYYY-MM-DD string as a local date (avoids UTC-offset shift) */
function parseLocalDate(dateStr: string): Date {
  return parseISO(dateStr + 'T12:00:00');
}

const STATUS_LABELS: Record<string, { label: string; variant: 'success' | 'outline' | 'destructive' | 'secondary' }> = {
  active: { label: 'Ativo', variant: 'success' },
  paused: { label: 'Pausado', variant: 'outline' },
  cancelled: { label: 'Cancelado', variant: 'destructive' },
  expired: { label: 'Expirado', variant: 'secondary' },
};

const OCC_STATUS: Record<string, { label: string; variant: 'success' | 'outline' | 'destructive' | 'secondary' }> = {
  scheduled: { label: 'Agendada', variant: 'outline' },
  completed: { label: 'Concluída', variant: 'success' },
  skipped: { label: 'Pulada', variant: 'secondary' },
  rescheduled: { label: 'Reagendada', variant: 'outline' },
};

export default function ContractDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { contract, isLoading, updateOccurrenceStatus, stats } = useContractDetail(id);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-4">
            <Skeleton className="h-48" />
            <Skeleton className="h-64" />
          </div>
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-muted-foreground">Contrato não encontrado</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/contratos')}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
      </div>
    );
  }

  const statusCfg = STATUS_LABELS[contract.status] || STATUS_LABELS.active;
  const occurrences = (contract.contract_occurrences || []).sort((a, b) => a.occurrence_number - b.occurrence_number);
  const items = contract.contract_items || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/contratos')}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{contract.name}</h1>
            <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
          </div>
          <p className="text-muted-foreground">{contract.customers?.name || 'Cliente'}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Info card */}
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><ScrollText className="h-5 w-5" /> Informações</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Cliente</p>
                  <p className="font-medium mt-0.5">{(contract.customers as any)?.name || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Frequência</p>
                  <p className="font-medium mt-0.5">{getFrequencyLabel(contract.frequency_type, contract.frequency_value)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Início</p>
                  <p className="font-medium mt-0.5">{format(new Date(contract.start_date), 'dd/MM/yyyy')}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Horizonte</p>
                  <p className="font-medium mt-0.5">{contract.horizon_months} meses</p>
                </div>
                {contract.notes && (
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Observações</p>
                    <p className="mt-0.5">{contract.notes}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Items */}
          <Card>
            <CardHeader><CardTitle>Itens do Contrato ({items.length})</CardTitle></CardHeader>
            <CardContent>
              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum item vinculado</p>
              ) : (
                <div className="space-y-2">
                  {items.map(item => (
                    <div key={item.id} className="flex items-center gap-3 p-3 rounded-md border">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{item.item_name}</p>
                        {item.item_description && <p className="text-xs text-muted-foreground">{item.item_description}</p>}
                      </div>
                      {item.equipment && (
                        <Badge variant="secondary" className="text-xs">Equipamento</Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Occurrences */}
          <Card>
            <CardHeader><CardTitle>Ocorrências ({occurrences.length})</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Dia</TableHead>
                      <TableHead>OS</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[100px]">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {occurrences.map(occ => {
                      const occDate = new Date(occ.scheduled_date);
                      const isPast = occ.status === 'scheduled' && isBefore(occDate, new Date());
                      const occStatusCfg = OCC_STATUS[occ.status] || OCC_STATUS.scheduled;

                      return (
                        <TableRow key={occ.id} className={cn(isPast && 'bg-warning/5')}>
                          <TableCell className="font-mono text-xs text-muted-foreground">{occ.occurrence_number}</TableCell>
                          <TableCell className={cn(isPast && 'text-warning font-medium')}>
                            {format(occDate, 'dd/MM/yyyy')}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {format(occDate, 'EEE', { locale: ptBR })}
                          </TableCell>
                          <TableCell>
                            {occ.service_orders ? (
                              <Badge variant="secondary">OS #{occ.service_orders.order_number}</Badge>
                            ) : '-'}
                          </TableCell>
                          <TableCell>
                            <Badge variant={occStatusCfg.variant}>{occStatusCfg.label}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {occ.service_order_id && (
                                <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                                  <a href={`/os-tecnico/${occ.service_order_id}`} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </a>
                                </Button>
                              )}
                              {occ.status === 'scheduled' && (
                                <Button
                                  variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-warning"
                                  title="Pular esta ocorrência"
                                  onClick={() => updateOccurrenceStatus.mutate({ id: occ.id, status: 'skipped' })}
                                >
                                  <SkipForward className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Resumo</CardTitle></CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Frequência</span>
                <span className="font-medium">{getFrequencyLabel(contract.frequency_type, contract.frequency_value)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Início</span>
                <span className="font-medium">{format(new Date(contract.start_date), 'dd/MM/yyyy')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Horizonte</span>
                <span className="font-medium">{contract.horizon_months} meses</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total de ocorrências</span>
                <span className="font-medium">{stats.totalOccurrences}</span>
              </div>
              {stats.nextOccurrence && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Próxima OS</span>
                  <span className="font-medium">{format(new Date(stats.nextOccurrence.scheduled_date), 'dd/MM/yyyy')}</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Progresso</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Progress value={stats.progressPercent} className="h-3" />
              <p className="text-sm text-muted-foreground text-center">
                {stats.completedOccurrences} de {stats.totalOccurrences} concluídas ({stats.progressPercent}%)
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
