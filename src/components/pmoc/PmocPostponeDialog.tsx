import { useState, useMemo } from 'react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { format, addDays, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ArrowRight, CalendarClock, AlertTriangle } from 'lucide-react';
import type { PmocPlan, PmocGeneratedOs } from '@/hooks/usePmocPlans';

interface PmocPostponeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: PmocPlan;
  generatedOs: PmocGeneratedOs;
}

export function PmocPostponeDialog({ open, onOpenChange, plan, generatedOs }: PmocPostponeDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newDate, setNewDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const currentDate = generatedOs.scheduled_for;
  const frequencyType = (plan as any).frequency_type || 'months';
  const frequencyValue = plan.frequency_months;

  const allFutureOs = useMemo(() => {
    return (plan.pmoc_generated_os || [])
      .filter(g => g.service_orders?.status === 'pendente')
      .sort((a, b) => new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime());
  }, [plan.pmoc_generated_os]);

  const currentIndex = allFutureOs.findIndex(g => g.id === generatedOs.id);

  const cascadePreview = useMemo(() => {
    if (!newDate || currentIndex < 0) return [];
    const affected = allFutureOs.slice(currentIndex);
    const results: { id: string; serviceOrderId: string; oldDate: string; newDate: string; orderNumber?: number }[] = [];
    let runningDate = new Date(newDate + 'T00:00:00');
    for (let i = 0; i < affected.length; i++) {
      const os = affected[i];
      results.push({
        id: os.id,
        serviceOrderId: os.service_order_id,
        oldDate: os.scheduled_for,
        newDate: format(runningDate, 'yyyy-MM-dd'),
        orderNumber: os.service_orders?.order_number,
      });
      if (frequencyType === 'days') {
        runningDate = addDays(runningDate, frequencyValue);
      } else {
        runningDate = addMonths(runningDate, frequencyValue);
      }
    }
    return results;
  }, [newDate, currentIndex, allFutureOs, frequencyType, frequencyValue]);

  const changedCount = cascadePreview.filter(r => r.oldDate !== r.newDate).length;

  const handlePostpone = async () => {
    if (cascadePreview.length === 0) return;
    setSubmitting(true);
    try {
      for (const entry of cascadePreview) {
        await supabase.from('service_orders').update({ scheduled_date: entry.newDate }).eq('id', entry.serviceOrderId);
        await supabase.from('pmoc_generated_os').update({ scheduled_for: entry.newDate } as any).eq('id', entry.id);
      }
      queryClient.invalidateQueries({ queryKey: ['pmoc-plans'] });
      queryClient.invalidateQueries({ queryKey: ['service-orders'] });
      toast({ title: `${changedCount} OS(s) reagendada(s) com sucesso!` });
      onOpenChange(false);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao adiar', description: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Adiar OS do Plano PMOC"
      footer={
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">Cancelar</Button>
          <Button onClick={handlePostpone} disabled={submitting || !newDate || changedCount === 0} className="flex-1">
            {submitting ? 'Reagendando...' : `Adiar e reagendar ${changedCount} OS(s)`}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg border p-3 space-y-1">
          <p className="text-sm font-medium">{plan.name}</p>
          <p className="text-xs text-muted-foreground">
            OS #{generatedOs.service_orders?.order_number || '?'} • Agendada para{' '}
            <span className="font-medium text-foreground">
              {format(new Date(currentDate + 'T00:00:00'), 'dd/MM/yyyy (EEEE)', { locale: ptBR })}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            Frequência: {frequencyType === 'days' ? `a cada ${frequencyValue} dias` : `a cada ${frequencyValue} mês(es)`}
          </p>
        </div>

        <div className="space-y-2">
          <Label>Nova data para esta OS</Label>
          <Input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} min={format(new Date(), 'yyyy-MM-dd')} />
        </div>

        {cascadePreview.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <Label className="text-sm">
                Impacto no cronograma ({changedCount} OS{changedCount !== 1 ? 's' : ''} afetada{changedCount !== 1 ? 's' : ''})
              </Label>
            </div>
            <div className="max-h-[200px] overflow-y-auto rounded-lg border divide-y">
              {cascadePreview.map((entry, i) => {
                const changed = entry.oldDate !== entry.newDate;
                return (
                  <div key={entry.id} className={`flex items-center gap-3 px-3 py-2 text-xs ${changed ? 'bg-warning/5' : 'bg-muted/30'}`}>
                    <span className="font-mono bg-muted px-1.5 py-0.5 rounded shrink-0">{currentIndex + i + 1}</span>
                    <Badge variant="secondary" className="shrink-0 text-xs">OS #{entry.orderNumber || '?'}</Badge>
                    <span className={changed ? 'line-through text-muted-foreground' : 'text-muted-foreground'}>
                      {format(new Date(entry.oldDate + 'T00:00:00'), 'dd/MM/yy', { locale: ptBR })}
                    </span>
                    {changed && (
                      <>
                        <ArrowRight className="h-3 w-3 text-primary shrink-0" />
                        <span className="font-medium text-primary">
                          {format(new Date(entry.newDate + 'T00:00:00'), 'dd/MM/yy (EEE)', { locale: ptBR })}
                        </span>
                      </>
                    )}
                    {!changed && <span className="text-muted-foreground italic">sem alteração</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </ResponsiveModal>
  );
}
