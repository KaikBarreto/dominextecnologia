import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { Switch } from '@/components/ui/switch';
import { usePmocContracts, type PmocContract, type PmocContractInsert } from '@/hooks/usePmocContracts';
import { useCustomers } from '@/hooks/useCustomers';
import { useFormDraft } from '@/hooks/useFormDraft';
import { DraftResumeDialog } from '@/components/ui/DraftResumeDialog';
import { format } from 'date-fns';

interface PmocContractFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contract?: PmocContract | null;
}

const FREQUENCIES = [
  { value: 'mensal', label: 'Mensal' },
  { value: 'bimestral', label: 'Bimestral' },
  { value: 'trimestral', label: 'Trimestral' },
  { value: 'semestral', label: 'Semestral' },
  { value: 'anual', label: 'Anual' },
];

export function PmocContractFormDialog({ open, onOpenChange, contract }: PmocContractFormDialogProps) {
  const { createContract, updateContract } = usePmocContracts();
  const { customers } = useCustomers();
  const isEditing = !!contract;

  const [formData, setFormData] = useState<Partial<PmocContractInsert>>({
    customer_id: '',
    contract_number: '',
    start_date: format(new Date(), 'yyyy-MM-dd'),
    end_date: format(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
    monthly_value: 0,
    maintenance_frequency: 'mensal',
    is_active: true,
    notes: '',
  });

  useEffect(() => {
    if (contract) {
      setFormData({
        customer_id: contract.customer_id,
        contract_number: contract.contract_number || '',
        start_date: contract.start_date,
        end_date: contract.end_date,
        monthly_value: contract.monthly_value || 0,
        maintenance_frequency: contract.maintenance_frequency || 'mensal',
        is_active: contract.is_active ?? true,
        notes: contract.notes || '',
      });
    } else {
      setFormData({
        customer_id: '',
        contract_number: '',
        start_date: format(new Date(), 'yyyy-MM-dd'),
        end_date: format(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'),
        monthly_value: 0,
        maintenance_frequency: 'mensal',
        is_active: true,
        notes: '',
      });
    }
  }, [contract, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isEditing && contract) {
      await updateContract.mutateAsync({ id: contract.id, ...formData });
    } else {
      await createContract.mutateAsync(formData as PmocContractInsert);
    }
    
    onOpenChange(false);
  };

  const handleChange = (field: keyof PmocContractInsert, value: string | number | boolean | null) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            {isEditing ? 'Editar Contrato PMOC' : 'Novo Contrato PMOC'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="customer_id">Cliente *</Label>
              <SearchableSelect
                options={customers.map(c => ({ value: c.id, label: c.name, sublabel: c.document || c.email || undefined }))}
                value={formData.customer_id}
                onValueChange={(value) => handleChange('customer_id', value)}
                placeholder="Selecione o cliente"
                searchPlaceholder="Buscar cliente..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contract_number">Número do Contrato</Label>
              <Input
                id="contract_number"
                value={formData.contract_number || ''}
                onChange={(e) => handleChange('contract_number', e.target.value)}
                placeholder="Ex: PMOC-2025-001"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="start_date">Data de Início *</Label>
              <Input
                id="start_date"
                type="date"
                value={formData.start_date}
                onChange={(e) => handleChange('start_date', e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="end_date">Data de Término *</Label>
              <Input
                id="end_date"
                type="date"
                value={formData.end_date}
                onChange={(e) => handleChange('end_date', e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="monthly_value">Valor Mensal (R$)</Label>
              <Input
                id="monthly_value"
                type="number"
                min="0"
                step="0.01"
                value={formData.monthly_value || 0}
                onChange={(e) => handleChange('monthly_value', parseFloat(e.target.value) || 0)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="maintenance_frequency">Frequência de Manutenção</Label>
              <Select
                value={formData.maintenance_frequency || 'mensal'}
                onValueChange={(value) => handleChange('maintenance_frequency', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCIES.map(freq => (
                    <SelectItem key={freq.value} value={freq.value}>{freq.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch
              id="is_active"
              checked={formData.is_active ?? true}
              onCheckedChange={(checked) => handleChange('is_active', checked)}
            />
            <Label htmlFor="is_active">Contrato Ativo</Label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Observações</Label>
            <Textarea
              id="notes"
              value={formData.notes || ''}
              onChange={(e) => handleChange('notes', e.target.value)}
              placeholder="Observações sobre o contrato..."
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button 
              type="submit" 
              disabled={createContract.isPending || updateContract.isPending}
            >
              {createContract.isPending || updateContract.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
