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
  const { statuses, isLoading: statusLoading, createStatus, updateStatus, deleteStatus } = useOsStatuses();
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
      <Tabs defaultValue="status" className="w-full">
        <TabsList className="w-full grid grid-cols-4">
          <TabsTrigger value="status">Status</TabsTrigger>
          <TabsTrigger value="numeracao">Numeração</TabsTrigger>
          <TabsTrigger value="campos">Campos</TabsTrigger>
          <TabsTrigger value="sla">SLA</TabsTrigger>
        </TabsList>

        {/* Status Tab */}
        <TabsContent value="status" className="space-y-4 mt-4">
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
                <div key={status.id} className="flex items-center gap-3 rounded-lg border p-3">
                  {editingId === status.id ? (
                    <>
                      <input type="color" value={editColor} onChange={(e) => setEditColor(e.target.value)} className="h-8 w-8 rounded border cursor-pointer shrink-0" />
                      <Input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} className="flex-1 h-8" onKeyDown={(e) => e.key === 'Enter' && handleUpdate()} />
                      <Button size="sm" variant="outline" onClick={handleUpdate}>Salvar</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancelar</Button>
                    </>
                  ) : (
                    <>
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
        </TabsContent>

        {/* Numeração Tab */}
        <TabsContent value="numeracao" className="space-y-4 mt-4">
          <p className="text-sm text-muted-foreground">Configure o prefixo de numeração das ordens de serviço.</p>
          {configLoading ? <Skeleton className="h-10 w-full" /> : (
            <div className="space-y-3">
              <div>
                <Label className="text-sm">Prefixo</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    placeholder="OS"
                    defaultValue={config?.number_prefix || 'OS'}
                    onChange={(e) => setPrefix(e.target.value)}
                    className="w-32"
                  />
                  <Button size="sm" onClick={handleSavePrefix}>Salvar</Button>
                </div>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Exemplo de formato:</p>
                <p className="text-sm font-mono font-medium mt-1">{prefix || config?.number_prefix || 'OS'}-2026-0001</p>
              </div>
            </div>
          )}
        </TabsContent>

        {/* Campos obrigatórios Tab */}
        <TabsContent value="campos" className="space-y-4 mt-4">
          <p className="text-sm text-muted-foreground">Defina quais campos são obrigatórios para cada status de OS.</p>
          <div className="space-y-4">
            {statuses.map((status) => (
              <div key={status.id} className="rounded-lg border p-3">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: status.color }} />
                  <span className="text-sm font-medium">{status.label}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {OS_FIELD_OPTIONS.map((field) => (
                    <div key={field.key} className="flex items-center gap-2">
                      <Switch
                        checked={isFieldRequired(status.key, field.key)}
                        onCheckedChange={() => toggleRequiredField(status.key, field.key)}
                      />
                      <Label className="text-xs">{field.label}</Label>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* SLA Tab */}
        <TabsContent value="sla" className="space-y-4 mt-4">
          <p className="text-sm text-muted-foreground">Defina prazos padrão (em horas) por tipo de serviço.</p>
          <div className="rounded-lg border p-3 space-y-2">
            <p className="text-sm font-medium">Novo SLA</p>
            <div className="flex gap-2">
              <Select value={slaServiceType} onValueChange={setSlaServiceType}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="Tipo de serviço" /></SelectTrigger>
                <SelectContent>
                  {serviceTypes.filter(st => st.is_active).map(st => (
                    <SelectItem key={st.id} value={st.id}>{st.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input type="number" value={slaHours} onChange={(e) => setSlaHours(e.target.value)} className="w-24" placeholder="Horas" />
              <Button size="sm" onClick={handleAddSla} disabled={!slaServiceType}><Plus className="h-4 w-4" /></Button>
            </div>
          </div>
          <div className="space-y-2">
            {slaList.map((sla) => (
              <div key={sla.id} className="flex items-center gap-3 rounded-lg border p-3">
                <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="flex-1 text-sm">{sla.service_type?.name || 'Tipo removido'}</span>
                <span className="text-sm font-medium">{sla.deadline_hours}h</span>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteSla.mutate(sla.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            {slaList.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum SLA configurado</p>
            )}
          </div>
        </TabsContent>
      </Tabs>

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
