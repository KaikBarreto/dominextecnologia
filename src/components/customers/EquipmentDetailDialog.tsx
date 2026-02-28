import { useState, useRef, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Paperclip, Plus, Trash2, CheckCircle2, Circle, Upload, FileText, Calendar, QrCode, Download, Tag } from 'lucide-react';
import { useEquipmentAttachments } from '@/hooks/useEquipmentAttachments';
import { useEquipmentTasks } from '@/hooks/useEquipmentTasks';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { cn } from '@/lib/utils';
import type { Equipment } from '@/types/database';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  equipment: (Equipment & { customer?: any; category?: any }) | null;
}

type TabKey = 'geral' | 'anexos' | 'tarefas';

const LABEL_SIZES = [
  { key: '5x8', label: '5×8cm', width: 189, height: 302, desc: 'QR Code + Info do equipamento + Info da empresa' },
  { key: '5x5', label: '5×5cm', width: 189, height: 189, desc: 'QR Code + Info do equipamento' },
  { key: '6x6', label: '6×6cm', width: 227, height: 227, desc: 'QR Code + Info do equipamento (impressora de etiquetas)' },
] as const;

export function EquipmentDetailDialog({ open, onOpenChange, equipment }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>('geral');
  const { attachments, isLoading: attachLoading, uploadAttachment, deleteAttachment } = useEquipmentAttachments(equipment?.id);
  const { tasks, isLoading: tasksLoading, createTask, toggleTask, deleteTask } = useEquipmentTasks(equipment?.id);
  const { settings: companySettings } = useCompanySettings();
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [deleteAttachmentId, setDeleteAttachmentId] = useState<string | null>(null);
  const [labelDialogOpen, setLabelDialogOpen] = useState(false);
  const [selectedLabelSize, setSelectedLabelSize] = useState<string>('5x8');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);

  const qrValue = equipment ? `EQ-${equipment.identifier || equipment.id}` : '';

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

  const handleDownloadLabel = useCallback(() => {
    if (!labelRef.current) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    
    const labelSize = LABEL_SIZES.find(s => s.key === selectedLabelSize) || LABEL_SIZES[0];
    const svgEl = labelRef.current.querySelector('svg');
    const svgData = svgEl ? new XMLSerializer().serializeToString(svgEl) : '';
    
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Etiqueta - ${equipment.name}</title>
        <style>
          @page { size: ${labelSize.width}px ${labelSize.height}px; margin: 0; }
          body { margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; font-family: Arial, sans-serif; }
          .label { width: ${labelSize.width}px; height: ${labelSize.height}px; border: 1px solid #ccc; border-radius: 8px; padding: 12px; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; text-align: center; }
          .company-name { font-size: 11px; font-weight: bold; }
          .company-info { font-size: 8px; color: #666; }
          .eq-label { font-size: 8px; color: #888; }
          .eq-name { font-size: 12px; font-weight: bold; }
          .eq-id { font-size: 10px; font-weight: bold; }
          @media print { body { margin: 0; } .label { border: none; } }
        </style>
      </head>
      <body>
        <div class="label">
          ${selectedLabelSize === '5x8' && companySettings ? `
            <div class="company-name">${companySettings.name || 'Empresa'}</div>
            ${companySettings.phone ? `<div class="company-info">${companySettings.phone}</div>` : ''}
            ${companySettings.email ? `<div class="company-info">${companySettings.email}</div>` : ''}
          ` : ''}
          ${svgData}
          <div class="eq-label">Nome do equipamento</div>
          <div class="eq-name">${equipment.name}</div>
          <div class="eq-label">Identificador</div>
          <div class="eq-id">${equipment.identifier || '-'}</div>
        </div>
        <script>setTimeout(() => window.print(), 300);</script>
      </body>
      </html>
    `);
    printWindow.document.close();
  }, [equipment, selectedLabelSize, companySettings]);

  if (!equipment) return null;

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'geral', label: 'Geral' },
    { key: 'anexos', label: 'Anexos' },
    { key: 'tarefas', label: 'Tarefas' },
  ];

  return (
    <>
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
          <div className="space-y-4">
            {/* QR Code section */}
            <div className="flex items-start gap-4 p-4 rounded-lg border bg-muted/30">
              <div className="shrink-0">
                <QRCodeSVG value={qrValue} size={80} />
              </div>
              <div className="flex-1 space-y-1">
                {equipment.identifier && (
                  <p className="text-sm font-mono font-medium">{equipment.identifier}</p>
                )}
                <p className="text-xs text-muted-foreground">QR Code do equipamento</p>
                <Button size="sm" variant="outline" className="mt-2" onClick={() => setLabelDialogOpen(true)}>
                  <Tag className="mr-2 h-3.5 w-3.5" />
                  Gerar Etiqueta
                </Button>
              </div>
            </div>

            {equipment.customer?.name && (
              <div>
                <p className="text-xs text-muted-foreground">Cliente</p>
                <p className="text-sm font-medium">{equipment.customer.name}</p>
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
              <Badge variant={equipment.status === 'active' ? 'default' : 'secondary'}>
                {equipment.status === 'active' ? 'Ativo' : 'Inativo'}
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

      {/* Label size selection dialog */}
      <ResponsiveModal open={labelDialogOpen} onOpenChange={setLabelDialogOpen} title="Gerar Etiqueta de Identificação">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Escolha o tamanho da etiqueta para impressão.
          </p>
          <div className="grid grid-cols-3 gap-3">
            {LABEL_SIZES.map((size) => (
              <button
                key={size.key}
                onClick={() => setSelectedLabelSize(size.key)}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-all',
                  selectedLabelSize === size.key
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50'
                )}
              >
                <QrCode className="h-8 w-8 text-muted-foreground" />
                <span className="text-sm font-medium">{size.label}</span>
                <span className="text-xs text-muted-foreground text-center leading-tight">{size.desc}</span>
              </button>
            ))}
          </div>

          <div className="bg-accent/50 rounded-lg p-3 text-sm text-muted-foreground flex items-start gap-2">
            <span className="text-primary">ℹ</span>
            Ao imprimir, certifique-se que nas configurações de impressão o dimensionamento está em <strong>tamanho real</strong>.
          </div>

          {/* Label preview */}
          <div className="flex justify-center">
            <div ref={labelRef} className="border rounded-lg p-4 flex flex-col items-center gap-2 text-center max-w-[200px]">
              {selectedLabelSize === '5x8' && companySettings && (
                <>
                  <p className="text-xs font-bold">{companySettings.name || 'Nome da Empresa'}</p>
                  {companySettings.phone && <p className="text-[10px] text-muted-foreground">{companySettings.phone}</p>}
                  {companySettings.email && <p className="text-[10px] text-muted-foreground">{companySettings.email}</p>}
                </>
              )}
              <QRCodeSVG value={qrValue} size={100} />
              <p className="text-[10px] text-muted-foreground">Nome do equipamento</p>
              <p className="text-xs font-bold">{equipment.name}</p>
              <p className="text-[10px] text-muted-foreground">Identificador</p>
              <p className="text-xs font-bold">{equipment.identifier || '-'}</p>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleDownloadLabel}>
              <Download className="mr-2 h-4 w-4" />
              Download
            </Button>
          </div>
        </div>
      </ResponsiveModal>
    </>
  );
}
