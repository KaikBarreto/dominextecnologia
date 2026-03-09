import { useState, useMemo, useCallback } from 'react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calculator, Plus, Trash2, Users } from 'lucide-react';
import { formatBRL } from '@/utils/currency';

interface Worker {
  id: string;
  name: string;
  salary: number;
  hours: number;
  hoursEdited: boolean; // whether user manually edited hours for this worker
}

interface LaborCalculatorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (hourlyRate: number, hours: number) => void;
}

let nextId = 1;
const makeWorker = (defaultHours: number): Worker => ({
  id: String(nextId++),
  name: '',
  salary: 0,
  hours: defaultHours,
  hoursEdited: false,
});

export function LaborCalculatorModal({ open, onOpenChange, onApply }: LaborCalculatorModalProps) {
  const [monthlyHours, setMonthlyHours] = useState(176);
  const [defaultServiceHours, setDefaultServiceHours] = useState(2);
  const [workers, setWorkers] = useState<Worker[]>(() => [makeWorker(2)]);

  const updateWorker = useCallback((id: string, patch: Partial<Worker>) => {
    setWorkers(prev => prev.map(w => w.id === id ? { ...w, ...patch } : w));
  }, []);

  const removeWorker = useCallback((id: string) => {
    setWorkers(prev => prev.filter(w => w.id !== id));
  }, []);

  const addWorker = useCallback(() => {
    setWorkers(prev => [...prev, makeWorker(defaultServiceHours)]);
  }, [defaultServiceHours]);

  // When defaultServiceHours changes, update all workers that haven't been manually edited
  const handleDefaultHoursChange = useCallback((val: number) => {
    setDefaultServiceHours(val);
    setWorkers(prev => prev.map(w => w.hoursEdited ? w : { ...w, hours: val }));
  }, []);

  const calculations = useMemo(() => {
    let totalCost = 0;
    const details = workers.map(w => {
      const rate = monthlyHours > 0 ? w.salary / monthlyHours : 0;
      const cost = rate * w.hours;
      totalCost += cost;
      return { ...w, rate, cost };
    });
    const totalHours = Math.max(...workers.map(w => w.hours), 0);
    const avgRate = totalHours > 0 ? totalCost / totalHours : 0;
    return { details, totalCost, totalHours, avgRate };
  }, [workers, monthlyHours]);

  const handleApply = () => {
    onApply(
      Math.round(calculations.avgRate * 100) / 100,
      calculations.totalHours
    );
    onOpenChange(false);
  };

  const footer = (
    <div className="flex gap-2 w-full">
      <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancelar</Button>
      <Button className="flex-1" onClick={handleApply} disabled={calculations.totalCost <= 0}>
        Aplicar R$ {formatBRL(calculations.avgRate)}/h
      </Button>
    </div>
  );

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Calcular Custo de Mão de Obra"
      className="sm:max-w-lg"
      footer={footer}
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-primary mb-2">
          <Calculator className="h-4 w-4" />
          <span className="text-sm font-medium">Calculadora de equipe</span>
        </div>

        {/* Global settings */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Horas mensais base</Label>
            <Input
              type="number" min={1} step="1"
              value={monthlyHours}
              onChange={e => setMonthlyHours(Number(e.target.value) || 0)}
            />
            <p className="text-[11px] text-muted-foreground">Padrão: 176h/mês (22d × 8h)</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Horas padrão neste serviço</Label>
            <Input
              type="number" min={0} step="0.25"
              value={defaultServiceHours}
              onChange={e => handleDefaultHoursChange(Number(e.target.value) || 0)}
            />
            <p className="text-[11px] text-muted-foreground">Aplica a todos não editados</p>
          </div>
        </div>

        {/* Workers list */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <Users className="h-4 w-4" />
              Funcionários ({workers.length})
            </div>
            <Button size="sm" variant="outline" onClick={addWorker}>
              <Plus className="h-3.5 w-3.5 mr-1" />Adicionar
            </Button>
          </div>

          {workers.map((w, idx) => {
            const detail = calculations.details[idx];
            return (
              <div key={w.id} className="rounded-lg border border-border p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Input
                    value={w.name}
                    onChange={e => updateWorker(w.id, { name: e.target.value })}
                    placeholder={`Funcionário ${idx + 1}`}
                    className="h-8 text-sm font-medium"
                  />
                  {workers.length > 1 && (
                    <Button
                      variant="destructive-ghost"
                      size="icon"
                      className="h-8 w-8 flex-shrink-0"
                      onClick={() => removeWorker(w.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[11px]">Custo mensal (R$)</Label>
                    <Input
                      type="number" min={0} step="0.01"
                      value={w.salary || ''}
                      onChange={e => updateWorker(w.id, { salary: Number(e.target.value) || 0 })}
                      placeholder="Ex: 3500"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Horas neste serviço</Label>
                    <Input
                      type="number" min={0} step="0.25"
                      value={w.hours}
                      onChange={e => updateWorker(w.id, { hours: Number(e.target.value) || 0, hoursEdited: true })}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                {detail && detail.rate > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    R$ {formatBRL(detail.rate)}/h × {w.hours}h = <span className="font-medium text-foreground">R$ {formatBRL(detail.cost)}</span>
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Summary */}
        <div className="rounded-lg border p-3 bg-muted/30 space-y-2">
          {calculations.details.filter(d => d.cost > 0).map(d => (
            <div key={d.id} className="flex justify-between text-xs">
              <span className="text-muted-foreground">{d.name || 'Funcionário'}</span>
              <span className="font-medium">R$ {formatBRL(d.cost)}</span>
            </div>
          ))}
          {calculations.details.filter(d => d.cost > 0).length > 1 && (
            <div className="border-t pt-2" />
          )}
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Horas do serviço</span>
            <span className="font-medium">{calculations.totalHours}h</span>
          </div>
          <div className="flex justify-between items-center pt-2 border-t">
            <span className="text-sm font-semibold">Custo HH total</span>
            <span className="text-sm font-bold text-primary">R$ {formatBRL(calculations.totalCost)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm font-semibold">Custo/hora médio</span>
            <span className="text-sm font-bold text-primary">R$ {formatBRL(calculations.avgRate)}/h</span>
          </div>
        </div>
      </div>
    </ResponsiveModal>
  );
}
