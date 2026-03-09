import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calculator } from 'lucide-react';
import { formatBRL } from '@/utils/currency';

interface LaborCalculatorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (hourlyRate: number) => void;
}

export function LaborCalculatorModal({ open, onOpenChange, onApply }: LaborCalculatorModalProps) {
  const [salary, setSalary] = useState(0);
  const [monthlyHours, setMonthlyHours] = useState(220);

  const totalMonthlyCost = salary;
  const hourlyRate = monthlyHours > 0 ? totalMonthlyCost / monthlyHours : 0;

  const handleApply = () => {
    onApply(Math.round(hourlyRate * 100) / 100);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-4 w-4 text-primary" />
            Calcular Custo/Hora
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Custo total com funcionário/mês (R$)</Label>
            <Input
              type="number" min={0} step="0.01"
              value={salary || ''}
              onChange={e => setSalary(Number(e.target.value) || 0)}
              placeholder="Ex: 3500.00"
            />
            <p className="text-[11px] text-muted-foreground">
              Inclua salário + encargos + benefícios
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Horas trabalhadas no mês</Label>
            <Input
              type="number" min={1} step="1"
              value={monthlyHours}
              onChange={e => setMonthlyHours(Number(e.target.value) || 0)}
              placeholder="220"
            />
            <p className="text-[11px] text-muted-foreground">
              Padrão CLT: 220h/mês (44h/semana)
            </p>
          </div>

          <div className="rounded-lg border p-3 bg-muted/30 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Custo mensal</span>
              <span className="font-medium">R$ {formatBRL(totalMonthlyCost)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Horas/mês</span>
              <span className="font-medium">{monthlyHours}h</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t">
              <span className="text-sm font-semibold">Custo/hora (HH)</span>
              <span className="text-sm font-bold text-primary">R$ {formatBRL(hourlyRate)}</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleApply} disabled={hourlyRate <= 0}>
            Aplicar R$ {formatBRL(hourlyRate)}/h
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
