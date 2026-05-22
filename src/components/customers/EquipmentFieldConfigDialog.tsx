import { useState, type ReactNode } from 'react';
import { Plus, Trash2, GripVertical, Eye, EyeOff, Type, Hash, Calendar, ToggleLeft } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useEquipmentFieldConfig, type EquipmentFieldConfig } from '@/hooks/useEquipmentFieldConfig';
import { Skeleton } from '@/components/ui/skeleton';
import { useIsMobile } from '@/hooks/use-mobile';
import { MobileListItem, type ItemAction } from '@/components/mobile/MobileListItem';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Mapeia tipo de campo → ícone + label PT-BR.
const FIELD_TYPE_META: Record<string, { icon: ReactNode; label: string }> = {
  text: { icon: <Type className="h-4 w-4" />, label: 'Texto' },
  number: { icon: <Hash className="h-4 w-4" />, label: 'Número' },
  date: { icon: <Calendar className="h-4 w-4" />, label: 'Data' },
  boolean: { icon: <ToggleLeft className="h-4 w-4" />, label: 'Sim/Não' },
};

function getFieldTypeMeta(type: string) {
  return FIELD_TYPE_META[type] ?? { icon: <Type className="h-4 w-4" />, label: type };
}

export function EquipmentFieldConfigDialog({ open, onOpenChange }: Props) {
  const isMobile = useIsMobile();
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

  // Bloco "adicionar novo campo" — usado em ambos viewports.
  const addBlock = (
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
  );

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
          ) : isMobile ? (
            // Mobile: cada campo em MobileListItem. Rename inline preservado no leading-content.
            // Ações secundárias (toggle visível, toggle obrigatório, excluir) vão no overflow menu.
            <div className="rounded-xl border bg-card overflow-hidden">
              {fields.map((field) => {
                const meta = getFieldTypeMeta(field.field_type);

                const actions: ItemAction[] = [
                  {
                    key: 'toggle-visible',
                    label: field.is_visible ? 'Ocultar' : 'Mostrar',
                    icon: field.is_visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />,
                    onClick: () => handleToggleVisible(field),
                  },
                  {
                    key: 'toggle-required',
                    label: field.is_required ? 'Tornar opcional' : 'Tornar obrigatório',
                    icon: <ToggleLeft className="h-4 w-4" />,
                    onClick: () => handleToggleRequired(field),
                  },
                  {
                    key: 'delete',
                    label: 'Excluir',
                    icon: <Trash2 className="h-4 w-4" />,
                    variant: 'destructive',
                    onClick: () => setDeleteId(field.id),
                  },
                ];

                return (
                  <MobileListItem
                    key={field.id}
                    leading={
                      <div
                        className="h-10 w-10 rounded-lg flex items-center justify-center bg-muted text-muted-foreground"
                        aria-hidden
                      >
                        {meta.icon}
                      </div>
                    }
                    title={
                      // Rename inline — central no UX. onClick não navega; só edita.
                      <Input
                        className="h-8 text-[15px] font-medium border-0 shadow-none px-0 focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent"
                        defaultValue={field.label}
                        onClick={(e) => e.stopPropagation()}
                        onBlur={(e) => {
                          if (e.target.value !== field.label) handleLabelChange(field, e.target.value);
                        }}
                      />
                    }
                    subtitle={
                      <span className="inline-flex items-center gap-1.5 flex-wrap">
                        <span>{meta.label}</span>
                        {!field.is_visible && (
                          <>
                            <span className="text-muted-foreground/50">•</span>
                            <span className="inline-flex items-center gap-1">
                              <EyeOff className="h-3 w-3" /> Oculto
                            </span>
                          </>
                        )}
                        {field.is_required && (
                          <>
                            <span className="text-muted-foreground/50">•</span>
                            <span className="text-warning">Obrigatório</span>
                          </>
                        )}
                      </span>
                    }
                    actions={actions}
                  />
                );
              })}
              {fields.length === 0 && (
                <p className="text-sm text-center text-muted-foreground py-6">Nenhum campo configurado</p>
              )}
            </div>
          ) : (
            // Desktop: layout original preservado.
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

          {addBlock}
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
