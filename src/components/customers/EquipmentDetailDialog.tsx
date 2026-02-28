import { useState, useRef } from 'react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Paperclip, Plus, Trash2, CheckCircle2, Circle, Upload, FileText, Calendar } from 'lucide-react';
import { useEquipmentAttachments } from '@/hooks/useEquipmentAttachments';
import { useEquipmentTasks } from '@/hooks/useEquipmentTasks';
import { cn } from '@/lib/utils';
import type { Equipment } from '@/types/database';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  equipment: (Equipment & { customer?: any; category?: any }) | null;
}

type TabKey = 'geral' | 'anexos' | 'tarefas';

export function EquipmentDetailDialog({ open, onOpenChange, equipment }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>('geral');
  const { attachments, isLoading: attachLoading, uploadAttachment, deleteAttachment } = useEquipmentAttachments(equipment?.id);
  const { tasks, isLoading: tasksLoading, createTask, toggleTask, deleteTask } = useEquipmentTasks(equipment?.id);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [deleteAttachmentId, setDeleteAttachmentId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!equipment) return null;

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'geral', label: 'Geral' },
    { key: 'anexos', label: 'Anexos' },
    { key: 'tarefas', label: 'Tarefas' },
  ];

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !equipment) return;
    await uploadAttachment.mutateAsync({ equipmentId: equipment.id, file });
    e.target.value = '';
  };

  const handleAddTask = () => {
    if (!newTaskTitle.trim() || !equipment) return;
    createTask.mutate({ equipment_id: equipment.id, title: newTaskTitle });
    setNewTaskTitle('');
  };

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title={equipment.name}>
      {/* Tabs */}
      <div className="flex gap-1 border-b mb-4">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px',
              activeTab === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Geral tab */}
      {activeTab === 'geral' && (
        <div className="space-y-3">
          {equipment.customer?.name && (
            <div>
              <p className="text-xs text-muted-foreground">Cliente</p>
              <p className="text-sm font-medium">{equipment.customer.name}</p>
            </div>
          )}
          {equipment.identifier && (
            <div>
              <p className="text-xs text-muted-foreground">Identificador</p>
              <p className="text-sm">{equipment.identifier}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            {equipment.brand && (
              <div>
                <p className="text-xs text-muted-foreground">Marca</p>
                <p className="text-sm">{equipment.brand}</p>
              </div>
            )}
            {equipment.model && (
              <div>
                <p className="text-xs text-muted-foreground">Modelo</p>
                <p className="text-sm">{equipment.model}</p>
              </div>
            )}
            {equipment.serial_number && (
              <div>
                <p className="text-xs text-muted-foreground">Nº de Série</p>
                <p className="text-sm">{equipment.serial_number}</p>
              </div>
            )}
            {equipment.capacity && (
              <div>
                <p className="text-xs text-muted-foreground">Capacidade/Especificação</p>
                <p className="text-sm">{equipment.capacity}</p>
              </div>
            )}
            {equipment.location && (
              <div>
                <p className="text-xs text-muted-foreground">Local</p>
                <p className="text-sm">{equipment.location}</p>
              </div>
            )}
            {equipment.install_date && (
              <div>
                <p className="text-xs text-muted-foreground">Data de Instalação</p>
                <p className="text-sm">{equipment.install_date}</p>
              </div>
            )}
          </div>
          {equipment.notes && (
            <div>
              <p className="text-xs text-muted-foreground">Observações</p>
              <p className="text-sm">{equipment.notes}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-muted-foreground">Status</p>
            <Badge variant={(equipment as any).status === 'active' ? 'default' : 'secondary'}>
              {(equipment as any).status === 'active' ? 'Ativo' : 'Inativo'}
            </Badge>
          </div>
        </div>
      )}

      {/* Anexos tab */}
      {activeTab === 'anexos' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Arquivos anexados</p>
            <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" />
              Enviar arquivo
            </Button>
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} />
          </div>

          {attachLoading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : attachments.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center">
              <Paperclip className="mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Nenhum anexo</p>
            </div>
          ) : (
            <div className="space-y-2">
              {attachments.map((att) => (
                <div key={att.id} className="flex items-center gap-3 rounded-lg border p-3">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <a href={att.file_url} target="_blank" rel="noopener noreferrer" className="flex-1 text-sm hover:underline truncate">
                    {att.file_name}
                  </a>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteAttachmentId(att.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tarefas tab */}
      {activeTab === 'tarefas' && (
        <div className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Nova tarefa..."
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
              className="flex-1"
            />
            <Button size="sm" onClick={handleAddTask} disabled={!newTaskTitle.trim()}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {tasksLoading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : tasks.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center">
              <CheckCircle2 className="mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Nenhuma tarefa</p>
            </div>
          ) : (
            <div className="space-y-1">
              {tasks.map((task) => (
                <div key={task.id} className="flex items-center gap-3 rounded-lg border p-3">
                  <button onClick={() => toggleTask.mutate({ id: task.id, is_completed: !task.is_completed })}>
                    {task.is_completed
                      ? <CheckCircle2 className="h-5 w-5 text-primary" />
                      : <Circle className="h-5 w-5 text-muted-foreground" />}
                  </button>
                  <span className={cn('flex-1 text-sm', task.is_completed && 'line-through text-muted-foreground')}>
                    {task.title}
                  </span>
                  {task.due_date && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {task.due_date}
                    </span>
                  )}
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteTask.mutate(task.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Delete attachment confirmation */}
      <AlertDialog open={!!deleteAttachmentId} onOpenChange={() => setDeleteAttachmentId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir anexo</AlertDialogTitle>
            <AlertDialogDescription>Tem certeza que deseja excluir este anexo?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteAttachmentId) { deleteAttachment.mutate(deleteAttachmentId); setDeleteAttachmentId(null); } }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ResponsiveModal>
  );
}
