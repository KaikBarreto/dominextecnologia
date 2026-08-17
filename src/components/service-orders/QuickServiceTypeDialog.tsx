import { useState } from 'react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2 } from 'lucide-react';
import { useServiceTypes, type ServiceType } from '@/hooks/useServiceTypes';
import { useToast } from '@/hooks/use-toast';

interface QuickServiceTypeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chamado após criar com sucesso, recebendo a linha criada. */
  onCreated: (serviceType: ServiceType) => void;
}

const DEFAULT_COLOR = '#22c55e';

/**
 * Quick-create MÍNIMO de Tipo de Serviço (create-only, poucos campos).
 * Para o CRUD completo, ver ServiceTypeManagerDialog / ServiceTypesPanel.
 * Campos: Nome (obrigatório) + Cor + "Exige equipamento".
 */
export function QuickServiceTypeDialog({ open, onOpenChange, onCreated }: QuickServiceTypeDialogProps) {
  const { createServiceType } = useServiceTypes();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [requiresEquipment, setRequiresEquipment] = useState(true);

  const reset = () => {
    setName('');
    setColor(DEFAULT_COLOR);
    setRequiresEquipment(true);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast({ variant: 'destructive', title: 'Informe o nome do tipo de serviço' });
      return;
    }
    const created = await createServiceType.mutateAsync({
      name: trimmed,
      color,
      requires_equipment: requiresEquipment,
      is_active: true,
    });
    // A mutation já invalida ['service-types'] no onSuccess.
    onCreated(created as ServiceType);
    reset();
    onOpenChange(false);
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={handleOpenChange}
      title="Novo tipo de serviço"
      footer={
        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            className="hover:bg-red-600 hover:text-white hover:border-red-600 dark:hover:bg-red-600 dark:hover:text-white dark:hover:border-red-600"
          >
            Cancelar
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={createServiceType.isPending}>
            {createServiceType.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Criar
          </Button>
        </div>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!createServiceType.isPending) handleSubmit();
        }}
        className="space-y-4 py-2"
      >
        <div className="space-y-2">
          <Label htmlFor="quick-service-type-name">Nome *</Label>
          <Input
            id="quick-service-type-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Manutenção de ar-condicionado"
            autoFocus
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="quick-service-type-color">Cor</Label>
          <div className="flex items-center gap-3">
            <input
              id="quick-service-type-color"
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-10 w-10 rounded cursor-pointer border-0"
            />
            <Input value={color} onChange={(e) => setColor(e.target.value)} className="flex-1" />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Switch checked={requiresEquipment} onCheckedChange={setRequiresEquipment} />
          <Label>Exige equipamento</Label>
        </div>

        {/* submit escondido para permitir Enter no formulário */}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </ResponsiveModal>
  );
}
