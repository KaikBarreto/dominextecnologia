import { useState } from 'react';
import { Plus, Pencil, Trash2, Clock, GripVertical } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useOsStatuses } from '@/hooks/useOsStatuses';
import { useServiceTypes } from '@/hooks/useServiceTypes';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// OS Config hook
function useOsConfig() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const configQuery = useQuery({
    queryKey: ['os_config'],
    queryFn: async () => {
      const { data, error } = await supabase.from('os_config').select('*').limit(1).single();
      if (error) throw error;
      return data as { id: string; number_prefix: string; number_format: string };
    },
  });

  const updateConfig = useMutation({
    mutationFn: async (input: { number_prefix?: string; number_format?: string }) => {
      const { error } = await supabase.from('os_config').update(input).eq('id', configQuery.data!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['os_config'] });
      toast({ title: 'Configuração salva!' });
    },
  });

  return { config: configQuery.data, isLoading: configQuery.isLoading, updateConfig };
}

// SLA hook
function useOsSla() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const slaQuery = useQuery({
    queryKey: ['os_sla_config'],
    queryFn: async () => {
      const { data, error } = await supabase.from('os_sla_config').select('*, service_type:service_types(id, name)');
      if (error) throw error;
      return data as { id: string; service_type_id: string; deadline_hours: number; service_type: { id: string; name: string } }[];
    },
  });

  const upsertSla = useMutation({
    mutationFn: async (input: { service_type_id: string; deadline_hours: number }) => {
      const { error } = await supabase.from('os_sla_config').upsert(input, { onConflict: 'service_type_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['os_sla_config'] });
      toast({ title: 'SLA salvo!' });
    },
  });

  const deleteSla = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('os_sla_config').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['os_sla_config'] });
      toast({ title: 'SLA removido!' });
    },
  });

  return { slaList: slaQuery.data ?? [], isLoading: slaQuery.isLoading, upsertSla, deleteSla };
}

// Required fields hook
function useOsRequiredFields() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['os_required_fields'],
    queryFn: async () => {
      const { data, error } = await supabase.from('os_required_fields').select('*');
      if (error) throw error;
      return data as { id: string; status_key: string; field_name: string }[];
    },
  });

  const addField = useMutation({
    mutationFn: async (input: { status_key: string; field_name: string }) => {
      const { error } = await supabase.from('os_required_fields').insert(input);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['os_required_fields'] });
      toast({ title: 'Campo obrigatório adicionado!' });
    },
  });

  const removeField = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('os_required_fields').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['os_required_fields'] });
    },
  });

  return { fields: query.data ?? [], isLoading: query.isLoading, addField, removeField };
}

const OS_FIELD_OPTIONS = [
  { key: 'description', label: 'Descrição' },
  { key: 'diagnosis', label: 'Diagnóstico' },
  { key: 'solution', label: 'Solução' },
  { key: 'notes', label: 'Observações' },
  { key: 'client_signature', label: 'Assinatura do cliente' },
];

export function OsStatusManagerDialog({ open, onOpenChange }: Props) {
  const { statuses, isLoading: statusLoading, createStatus, updateStatus, deleteStatus, reorderStatuses } = useOsStatuses();
  const { config, isLoading: configLoading, updateConfig } = useOsConfig();
  const { serviceTypes } = useServiceTypes();
  const { slaList, upsertSla, deleteSla } = useOsSla();
  const { fields: requiredFields, addField, removeField } = useOsRequiredFields();

  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState('#3b82f6');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editColor, setEditColor] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [draggedStatusId, setDraggedStatusId] = useState<string | null>(null);
  const [dragOverStatusId, setDragOverStatusId] = useState<string | null>(null);

  // Config state
  const [prefix, setPrefix] = useState('');

  // SLA state
  const [slaServiceType, setSlaServiceType] = useState('');
  const [slaHours, setSlaHours] = useState('24');

  const generateKey = (label: string) =>
    label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

  const handleCreate = () => {
    if (!newLabel.trim()) return;
    createStatus.mutate({ key: generateKey(newLabel), label: newLabel, color: newColor });
    setNewLabel('');
    setNewColor('#3b82f6');
  };

  const handleUpdate = () => {
    if (!editingId || !editLabel.trim()) return;
    updateStatus.mutate({ id: editingId, label: editLabel, color: editColor });
    setEditingId(null);
  };

  const handleDelete = () => {
    if (!deleteId) return;
    deleteStatus.mutate(deleteId);
    setDeleteId(null);
  };

  const handleDragStart = (statusId: string) => {
    setDraggedStatusId(statusId);
  };

  const handleDropStatus = (targetStatusId: string) => {
    if (!draggedStatusId || draggedStatusId === targetStatusId) {
      setDraggedStatusId(null);
      setDragOverStatusId(null);
      return;
    }

    const current = [...statuses];
    const draggedIndex = current.findIndex((s) => s.id === draggedStatusId);
    const targetIndex = current.findIndex((s) => s.id === targetStatusId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    const [dragged] = current.splice(draggedIndex, 1);
    current.splice(targetIndex, 0, dragged);

    reorderStatuses.mutate(current.map((s) => s.id));
    setDraggedStatusId(null);
    setDragOverStatusId(null);
  };

  const handleSavePrefix = () => {
    if (prefix.trim() && config) {
      updateConfig.mutate({ number_prefix: prefix });
    }
  };

  const handleAddSla = () => {
    if (!slaServiceType || !slaHours) return;
    upsertSla.mutate({ service_type_id: slaServiceType, deadline_hours: parseInt(slaHours) });
    setSlaServiceType('');
    setSlaHours('24');
  };

  const isFieldRequired = (statusKey: string, fieldName: string) =>
    requiredFields.some(f => f.status_key === statusKey && f.field_name === fieldName);

  const toggleRequiredField = (statusKey: string, fieldName: string) => {
    const existing = requiredFields.find(f => f.status_key === statusKey && f.field_name === fieldName);
    if (existing) {
      removeField.mutate(existing.id);
    } else {
      addField.mutate({ status_key: statusKey, field_name: fieldName });
    }
  };

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title="Configurações de OS">
      <div className="space-y-4">
          <div className="rounded-lg border p-3 space-y-2">
            <p className="text-sm font-medium">Novo status</p>
            <div className="flex gap-2">
              <Input placeholder="Nome do status" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} className="flex-1" onKeyDown={(e) => e.key === 'Enter' && handleCreate()} />
              <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} className="h-9 w-9 rounded border cursor-pointer" />
              <Button size="sm" onClick={handleCreate} disabled={!newLabel.trim()}><Plus className="mr-2 h-4 w-4" />Criar</Button>
            </div>
          </div>

          {statusLoading ? (
            <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : (
            <div className="space-y-2">
              {statuses.map((status) => (
                <div
                  key={status.id}
                  draggable
                  onDragStart={() => handleDragStart(status.id)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragOverStatusId !== status.id) setDragOverStatusId(status.id);
                  }}
                  onDragLeave={() => setDragOverStatusId(null)}
                  onDrop={() => handleDropStatus(status.id)}
                  onDragEnd={() => {
                    setDraggedStatusId(null);
                    setDragOverStatusId(null);
                  }}
                  className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${dragOverStatusId === status.id ? 'border-primary bg-primary/5' : ''}`}
                >
                  {editingId === status.id ? (
                    <>
                      <GripVertical className="h-4 w-4 text-muted-foreground/60 cursor-grab" />
                      <input type="color" value={editColor} onChange={(e) => setEditColor(e.target.value)} className="h-8 w-8 rounded border cursor-pointer shrink-0" />
                      <Input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} className="flex-1 h-8" onKeyDown={(e) => e.key === 'Enter' && handleUpdate()} />
                      <Button size="sm" variant="outline" onClick={handleUpdate}>Salvar</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancelar</Button>
                    </>
                  ) : (
                    <>
                      <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab shrink-0" />
                      <div className="h-4 w-4 rounded-full shrink-0" style={{ backgroundColor: status.color }} />
                      <span className="flex-1 text-sm font-medium">{status.label}</span>
                      <span className="text-xs text-muted-foreground font-mono">{status.key}</span>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingId(status.id); setEditLabel(status.label); setEditColor(status.color); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(status.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir status</AlertDialogTitle>
            <AlertDialogDescription>Tem certeza? OS com este status podem ser afetadas.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ResponsiveModal>
  );
}
