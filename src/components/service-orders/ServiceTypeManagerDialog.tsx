import { useState } from 'react';
import { Plus, Pencil, Trash2, Palette } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useServiceTypes, type ServiceTypeInput } from '@/hooks/useServiceTypes';

interface ServiceTypeManagerDialogProps {
  children: React.ReactNode;
}

export function ServiceTypeManagerDialog({ children }: ServiceTypeManagerDialogProps) {
  const [open, setOpen] = useState(false);
  const [editingType, setEditingType] = useState<{ id: string } & ServiceTypeInput | null>(null);
  const [formData, setFormData] = useState<ServiceTypeInput>({ name: '', color: '#3b82f6', description: '' });

  const { serviceTypes, createServiceType, updateServiceType, deleteServiceType } = useServiceTypes();

  const handleSave = async () => {
    if (!formData.name.trim()) return;
    if (editingType) {
      await updateServiceType.mutateAsync({ ...formData, id: editingType.id });
    } else {
      await createServiceType.mutateAsync(formData);
    }
    setFormData({ name: '', color: '#3b82f6', description: '' });
    setEditingType(null);
  };

  const handleEdit = (type: any) => {
    setEditingType(type);
    setFormData({ name: type.name, color: type.color, description: type.description || '' });
  };

  const handleCancel = () => {
    setEditingType(null);
    setFormData({ name: '', color: '#3b82f6', description: '' });
  };

  return (
    <>
      <div onClick={() => setOpen(true)}>{children}</div>
      <ResponsiveModal open={open} onOpenChange={setOpen} title="Tipos de Serviço">
        <div className="space-y-4">
          {/* Form */}
          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <Label className="text-xs">Nome</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Manutenção Preventiva"
                />
              </div>
              <div>
                <Label className="text-xs">Cor</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    className="h-10 w-10 cursor-pointer rounded border-0"
                  />
                </div>
              </div>
            </div>
            <div>
              <Label className="text-xs">Descrição</Label>
              <Textarea
                value={formData.description || ''}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Descrição opcional"
                rows={2}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSave} size="sm" disabled={!formData.name.trim()}>
                <Plus className="h-4 w-4 mr-1" />
                {editingType ? 'Salvar' : 'Adicionar'}
              </Button>
              {editingType && (
                <Button onClick={handleCancel} variant="outline" size="sm">
                  Cancelar
                </Button>
              )}
            </div>
          </div>

          {/* List */}
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {serviceTypes.map((type) => (
              <div key={type.id} className="flex items-center gap-3 rounded-lg border p-3">
                <div
                  className="h-5 w-5 rounded-full shrink-0"
                  style={{ backgroundColor: type.color }}
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{type.name}</p>
                  {type.description && (
                    <p className="text-xs text-muted-foreground truncate">{type.description}</p>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(type)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => deleteServiceType.mutateAsync(type.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
            {serviceTypes.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-4">
                Nenhum tipo de serviço cadastrado
              </p>
            )}
          </div>
        </div>
      </ResponsiveModal>
    </>
  );
}
