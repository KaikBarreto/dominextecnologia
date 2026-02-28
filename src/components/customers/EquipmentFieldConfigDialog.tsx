import { useState } from 'react';
import { Plus, Trash2, GripVertical, Eye, EyeOff } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useEquipmentFieldConfig, type EquipmentFieldConfig } from '@/hooks/useEquipmentFieldConfig';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EquipmentFieldConfigDialog({ open, onOpenChange }: Props) {
  const { fields, isLoading, updateField, createField, deleteField } = useEquipmentFieldConfig();
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldType, setNewFieldType] = useState<string>('text');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleToggleVisible = (field: EquipmentFieldConfig) => {
    updateField.mutate({ id: field.id, is_visible: !field.is_visible });
  };

  const handleToggleRequired = (field: EquipmentFieldConfig) => {
    updateField.mutate({ id: field.id, is_required: !field.is_required });
  };

  const handleLabelChange = (field: EquipmentFieldConfig, label: string) => {
    updateField.mutate({ id: field.id, label });
  };

  const handleAddField = () => {
    if (!newFieldLabel.trim()) return;
    const fieldKey = `custom_${Date.now()}`;
    createField.mutate({
      field_key: fieldKey,
      label: newFieldLabel,
      field_type: newFieldType as any,
      is_visible: true,
      is_required: false,
      position: fields.length,
    });
    setNewFieldLabel('');
    setNewFieldType('text');
  };

  const handleDelete = () => {
    if (!deleteId) return;
    deleteField.mutate(deleteId);
    setDeleteId(null);
  };

  return (
    <>
      <ResponsiveModal open={open} onOpenChange={onOpenChange} title="Configurar Campos do Equipamento">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Configure quais campos aparecem no cadastro de equipamentos. Você pode excluir, ocultar, renomear e definir como obrigatório.
          </p>

          {isLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <div className="space-y-2">
              {fields.map((field) => (
                <div key={field.id} className="flex items-center gap-2 rounded-lg border p-3">
                  <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                  <Input
                    className="flex-1 h-8"
                    defaultValue={field.label}
                    onBlur={(e) => {
                      if (e.target.value !== field.label) handleLabelChange(field, e.target.value);
                    }}
                  />
                  <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">{field.field_type}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => handleToggleVisible(field)}
                    title={field.is_visible ? 'Visível' : 'Oculto'}
                  >
                    {field.is_visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
                  </Button>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Switch checked={field.is_required} onCheckedChange={() => handleToggleRequired(field)} />
                    <Label className="text-xs">Obrig.</Label>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive shrink-0"
                    onClick={() => setDeleteId(field.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="border-t pt-4">
            <p className="text-sm font-medium mb-2">Adicionar novo campo</p>
            <div className="flex gap-2">
              <Input
                placeholder="Nome do campo"
                value={newFieldLabel}
                onChange={(e) => setNewFieldLabel(e.target.value)}
                className="flex-1"
                onKeyDown={(e) => e.key === 'Enter' && handleAddField()}
              />
              <Select value={newFieldType} onValueChange={setNewFieldType}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Texto</SelectItem>
                  <SelectItem value="number">Número</SelectItem>
                  <SelectItem value="date">Data</SelectItem>
                  <SelectItem value="boolean">Sim/Não</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" onClick={handleAddField} disabled={!newFieldLabel.trim()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </ResponsiveModal>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir campo</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este campo? Dados já salvos neste campo serão mantidos no banco de dados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
