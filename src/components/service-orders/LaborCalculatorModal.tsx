import { useState, useMemo, useCallback, useEffect } from 'react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Calculator, Plus, Trash2, Users, Check, ChevronsUpDown } from 'lucide-react';
import { formatBRL } from '@/utils/currency';
import { useEmployees } from '@/hooks/useEmployees';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { MonthlyCostCalculatorModal, MonthlyCostBreakdown } from './MonthlyCostCalculatorModal';
import { supabase } from '@/integrations/supabase/client';
import { useEmployeeWorkHours } from '@/hooks/useEmployeeWorkHours';

interface Worker {
  id: string;
  name: string;
  salary: number;
  hours: number;
  hoursEdited: boolean;
  isFixedCost: boolean;
  fixedCost: number;
  employeeId: string | null;
  monthlyCostBreakdown: MonthlyCostBreakdown | null;
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
  isFixedCost: false,
  fixedCost: 0,
  employeeId: null,
  monthlyCostBreakdown: null,
});

function EmployeeCombobox({
  value,
  employeeId,
  onChange,
}: {
  value: string;
  employeeId: string | null;
  onChange: (name: string, employeeId: string | null, monthlyCost: number, breakdown: MonthlyCostBreakdown | null) => void;
}) {
  const { employees } = useEmployees();
  const [open, setOpen] = useState(false);
  const activeEmployees = useMemo(
    () => (employees ?? []).filter(e => e.is_active),
    [employees]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="relative">
          <Input
            value={value}
            onChange={e => onChange(e.target.value, null, 0, null)}
            placeholder="Nome ou selecione..."
            className="h-8 text-sm font-medium pr-8"
          />
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-0 top-0 h-8 w-8"
            onClick={(e) => { e.preventDefault(); setOpen(!open); }}
          >
            <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar funcionário..." />
          <CommandList>
            <CommandEmpty>Nenhum encontrado</CommandEmpty>
            <CommandGroup>
              {activeEmployees.map(emp => {
                const displayCost = emp.monthly_cost ?? emp.salary ?? 0;
                return (
                  <CommandItem
                    key={emp.id}
                    value={emp.name}
                    onSelect={() => {
                      const cost = emp.monthly_cost ?? emp.salary ?? 0;
                      const breakdown = (emp.monthly_cost_breakdown as MonthlyCostBreakdown | null) ?? null;
                      onChange(emp.name, emp.id, cost, breakdown);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn('mr-2 h-4 w-4', employeeId === emp.id ? 'opacity-100' : 'opacity-0')} />
                    <div className="flex flex-col">
                      <span className="text-sm">{emp.name}</span>
                      {emp.position && <span className="text-xs text-muted-foreground">{emp.position}</span>}
                    </div>
                    {displayCost > 0 && (
                      <span className="ml-auto text-xs text-muted-foreground">
                        R$ {formatBRL(displayCost)}
                      </span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function LaborCalculatorModal({ open, onOpenChange, onApply }: LaborCalculatorModalProps) {
  const { monthlyHours: companyMonthlyHours } = useEmployeeWorkHours(null);
  const [monthlyHours, setMonthlyHours] = useState(176);
  const [defaultServiceHours, setDefaultServiceHours] = useState(2);
  const [workers, setWorkers] = useState<Worker[]>(() => [makeWorker(2)]);
  const [costCalcWorkerId, setCostCalcWorkerId] = useState<string | null>(null);

  // Sync company hours when available
  useEffect(() => { setMonthlyHours(companyMonthlyHours); }, [companyMonthlyHours]);

  const costCalcWorker = costCalcWorkerId ? workers.find(w => w.id === costCalcWorkerId) : null;

  const updateWorker = useCallback((id: string, patch: Partial<Worker>) => {
    setWorkers(prev => prev.map(w => w.id === id ? { ...w, ...patch } : w));
  }, []);

  const removeWorker = useCallback((id: string) => {
    setWorkers(prev => prev.filter(w => w.id !== id));
  }, []);

  const addWorker = useCallback(() => {
    setWorkers(prev => [...prev, makeWorker(defaultServiceHours)]);
  }, [defaultServiceHours]);

  const handleDefaultHoursChange = useCallback((val: number) => {
    setDefaultServiceHours(val);
    setWorkers(prev => prev.map(w => w.hoursEdited ? w : { ...w, hours: val }));
  }, []);

  const calculations = useMemo(() => {
    let totalCostHourly = 0;
    let totalCostFixed = 0;
    let maxHours = 0;

    const details = workers.map(w => {
      if (w.isFixedCost) {
        totalCostFixed += w.fixedCost;
        return { ...w, rate: 0, cost: w.fixedCost };
      }
      const rate = monthlyHours > 0 ? w.salary / monthlyHours : 0;
      const cost = rate * w.hours;
      totalCostHourly += cost;
      if (w.hours > maxHours) maxHours = w.hours;
      return { ...w, rate, cost };
    });

    const totalCost = totalCostHourly + totalCostFixed;
    const totalHours = maxHours || Math.max(...workers.filter(w => !w.isFixedCost).map(w => w.hours), 0);
    const avgRate = totalHours > 0 ? totalCost / totalHours : 0;

    return { details, totalCost, totalCostHourly, totalCostFixed, totalHours, avgRate };
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
    <>
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
                    <div className="flex-1">
                      <EmployeeCombobox
                        value={w.name}
                        employeeId={w.employeeId}
                        onChange={(name, empId, monthlyCost, breakdown) => {
                          const patch: Partial<Worker> = { name, employeeId: empId };
                          if (empId && monthlyCost > 0) {
                            patch.salary = monthlyCost;
                            patch.monthlyCostBreakdown = breakdown;
                          }
                          if (!empId) {
                            patch.monthlyCostBreakdown = null;
                          }
                          updateWorker(w.id, patch);
                        }}
                      />
                    </div>
                    {workers.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 flex-shrink-0 text-destructive hover:text-destructive"
                        onClick={() => removeWorker(w.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>

                  {/* Fixed cost toggle */}
                  <div className="flex items-center gap-2">
                    <Switch
                      id={`fixed-${w.id}`}
                      checked={w.isFixedCost}
                      onCheckedChange={checked => updateWorker(w.id, { isFixedCost: checked })}
                    />
                    <Label htmlFor={`fixed-${w.id}`} className="text-[11px] cursor-pointer text-muted-foreground">
                      Valor fixo por serviço (não é mensalista)
                    </Label>
                  </div>

                  {w.isFixedCost ? (
                    <div className="space-y-1">
                      <Label className="text-[11px]">Valor fixo para este serviço (R$)</Label>
                      <Input
                        type="number" min={0} step="0.01"
                        value={w.fixedCost || ''}
                        onChange={e => updateWorker(w.id, { fixedCost: Number(e.target.value) || 0 })}
                        placeholder="Ex: 150"
                        className="h-8 text-sm"
                      />
                      <p className="text-[11px] text-muted-foreground">Este valor será somado diretamente ao custo total</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[11px]">Custo mensal (R$)</Label>
                        <div className="flex gap-1">
                          <Input
                            type="number" min={0} step="0.01"
                            value={w.salary || ''}
                            onChange={e => updateWorker(w.id, { salary: Number(e.target.value) || 0 })}
                            placeholder="Ex: 3500"
                            className="h-8 text-sm"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 px-2 shrink-0"
                            onClick={() => setCostCalcWorkerId(w.id)}
                            title="Calcular custo mensal detalhado"
                          >
                            <Calculator className="h-3.5 w-3.5" />
                          </Button>
                        </div>
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
                  )}

                  {detail && detail.cost > 0 && (
                    <p className="text-[11px] text-muted-foreground">
                      {w.isFixedCost ? (
                        <>Custo fixo: <span className="font-medium text-foreground">R$ {formatBRL(detail.cost)}</span></>
                      ) : (
                        <>R$ {formatBRL(detail.rate)}/h × {w.hours}h = <span className="font-medium text-foreground">R$ {formatBRL(detail.cost)}</span></>
                      )}
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
                <span className="text-muted-foreground">
                  {d.name || 'Funcionário'}
                  {d.isFixedCost && <span className="ml-1 text-primary">(fixo)</span>}
                </span>
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
            {calculations.totalCostFixed > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Custos fixos incluídos</span>
                <span className="font-medium">R$ {formatBRL(calculations.totalCostFixed)}</span>
              </div>
            )}
            <div className="flex justify-between items-center pt-2 border-t">
              <span className="text-sm font-semibold">Custo HH total</span>
              <span className="text-sm font-bold text-primary">R$ {formatBRL(calculations.totalCost)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold">Custo/hora médio</span>
              <span className="text-sm font-bold text-primary">R$ {formatBRL(calculations.avgRate)}/h</span>
            </div>
            {calculations.totalCostFixed > 0 && (
              <p className="text-[10px] text-muted-foreground">
                * Custos fixos são diluídos no custo/hora médio para compor o preço final
              </p>
            )}
          </div>
        </div>
      </ResponsiveModal>

      {/* Sub-modal for monthly cost calculation */}
      <MonthlyCostCalculatorModal
        open={!!costCalcWorkerId}
        onOpenChange={open => { if (!open) setCostCalcWorkerId(null); }}
        initialSalary={costCalcWorker?.salary ?? 0}
        initialBreakdown={costCalcWorker?.monthlyCostBreakdown ?? null}
        onApply={(totalCost, breakdown) => {
          if (costCalcWorkerId) {
            updateWorker(costCalcWorkerId, { salary: totalCost, monthlyCostBreakdown: breakdown });
            // Persist to employee record if linked
            const worker = workers.find(w => w.id === costCalcWorkerId);
            if (worker?.employeeId) {
              supabase.from('employees').update({
                monthly_cost: totalCost,
                monthly_cost_breakdown: breakdown as any,
              }).eq('id', worker.employeeId).then(({ error }) => {
                if (error) console.error('Erro ao salvar custo mensal do funcionário:', error);
              });
            }
          }
        }}
      />
    </>
  );
}
