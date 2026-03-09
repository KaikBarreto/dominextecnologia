import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Car, Wrench, HardHat, Fuel, ShieldCheck, MoreHorizontal, Plus } from 'lucide-react';

const EXTRA_COST_TYPES = [
  { value: 'Veículo', icon: Car },
  { value: 'Ferramentas', icon: Wrench },
  { value: 'EPI', icon: ShieldCheck },
  { value: 'Combustível', icon: Fuel },
  { value: 'Equipamentos', icon: HardHat },
  { value: 'Outro', icon: MoreHorizontal },
] as const;

interface ExtraCostModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (label: string, amount: number) => void;
}

export function ExtraCostModal({ open, onOpenChange, onAdd }: ExtraCostModalProps) {
  const [type, setType] = useState('Veículo');
  const [customLabel, setCustomLabel] = useState('');
  const [amount, setAmount] = useState(0);

  const label = type === 'Outro' ? (customLabel || 'Custo extra') : type;

  const handleAdd = () => {
    if (amount <= 0) return;
    onAdd(label, amount);
    setAmount(0);
    setCustomLabel('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" />
            Adicionar Custo Extra
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Tipo</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXTRA_COST_TYPES.map(t => {
                  const Icon = t.icon;
                  return (
                    <SelectItem key={t.value} value={t.value}>
                      <div className="flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5" />
                        {t.value}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {type === 'Outro' && (
            <div className="space-y-1.5">
              <Label className="text-xs">Descrição</Label>
              <Input
                value={customLabel}
                onChange={e => setCustomLabel(e.target.value)}
                placeholder="Descreva o custo"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Valor (R$)</Label>
            <Input
              type="number" min={0} step="0.01"
              value={amount || ''}
              onChange={e => setAmount(Number(e.target.value) || 0)}
              placeholder="0,00"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleAdd} disabled={amount <= 0}>
            <Plus className="h-3.5 w-3.5 mr-1" />Adicionar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
