import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useRef, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Paperclip, Plus, Trash2, CheckCircle2, Circle, Upload, FileText, Calendar, Tag, Download, QrCode, ClipboardList, ExternalLink, Edit } from 'lucide-react';
import { useEquipmentAttachments } from '@/hooks/useEquipmentAttachments';
import { useEquipmentTasks } from '@/hooks/useEquipmentTasks';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { useEquipment } from '@/hooks/useEquipment';
import { useServiceOrders } from '@/hooks/useServiceOrders';
import { useCustomers } from '@/hooks/useCustomers';
import { useEquipmentCategories } from '@/hooks/useEquipmentCategories';
import { EquipmentFormDialog } from '@/components/customers/EquipmentFormDialog';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { ImagePreviewModal } from '@/components/ui/ImagePreviewModal';
import { cn } from '@/lib/utils';
import { osStatusLabels } from '@/types/database';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';

type TabKey = 'geral' | 'anexos' | 'tarefas';

const LABEL_SIZES = [
  { key: '5x8', label: '5×8cm', width: 189, height: 302, desc: 'QR Code + Info completa' },
  { key: '5x5', label: '5×5cm', width: 189, height: 189, desc: 'QR Code + Info básica' },
  { key: '6x6', label: '6×6cm', width: 227, height: 227, desc: 'Para impressora de etiquetas' },
] as const;

export default function EquipmentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKey>('geral');
  const { attachments, isLoading: attachLoading, uploadAttachment, deleteAttachment } = useEquipmentAttachments(id);
  const { tasks, isLoading: tasksLoading, createTask, toggleTask, deleteTask } = useEquipmentTasks(id);
  const { settings: companySettings } = useCompanySettings();
  const { equipment: allEquipment, isLoading: eqLoading } = useEquipment();
  const { serviceOrders } = useServiceOrders();
  const { customers } = useCustomers();
  const { categories } = useEquipmentCategories();
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [editEquipOpen, setEditEquipOpen] = useState(false);
  const [deleteEquipOpen, setDeleteEquipOpen] = useState(false);
  const [deleteAttachmentId, setDeleteAttachmentId] = useState<string | null>(null);
  const [labelDialogOpen, setLabelDialogOpen] = useState(false);
  const [selectedLabelSize, setSelectedLabelSize] = useState<string>('5x8');
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);

  const equipment = allEquipment.find(eq => eq.id === id);
  const equipmentOrders = serviceOrders.filter(os => os.equipment_id === id);
  const qrValue = equipment ? `EQ-${equipment.identifier || equipment.id}` : '';

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    await uploadAttachment.mutateAsync({ equipmentId: id, file });
    e.target.value = '';
  };

  const handleAddTask = () => {
    if (!newTaskTitle.trim() || !id) return;
    createTask.mutate({ equipment_id: id, title: newTaskTitle });
    setNewTaskTitle('');
  };

  const handleDownloadLabel = useCallback(() => {
    if (!labelRef.current || !equipment) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const labelSize = LABEL_SIZES.find(s => s.key === selectedLabelSize) || LABEL_SIZES[0];
    const svgEl = labelRef.current.querySelector('svg');
    const svgData = svgEl ? new XMLSerializer().serializeToString(svgEl) : '';
    printWindow.document.write(`
      <!DOCTYPE html><html><head><title>Etiqueta - ${equipment.name}</title>
      <style>@page{size:${labelSize.width}px ${labelSize.height}px;margin:0}body{margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;font-family:Arial,sans-serif}.label{width:${labelSize.width}px;height:${labelSize.height}px;border:1px solid #ccc;border-radius:8px;padding:12px;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;text-align:center}.company-name{font-size:11px;font-weight:bold}.company-info{font-size:8px;color:#666}.eq-label{font-size:8px;color:#888}.eq-name{font-size:12px;font-weight:bold}.eq-id{font-size:10px;font-weight:bold}@media print{body{margin:0}.label{border:none}}</style></head><body>
      <div class="label">
        ${selectedLabelSize === '5x8' && companySettings ? `<div class="company-name">${companySettings.name || 'Empresa'}</div>${companySettings.phone ? `<div class="company-info">${companySettings.phone}</div>` : ''}${companySettings.email ? `<div class="company-info">${companySettings.email}</div>` : ''}` : ''}
        ${svgData}
        <div class="eq-label">Nome do equipamento</div>
        <div class="eq-name">${equipment.name}</div>
        <div class="eq-label">Identificador</div>
        <div class="eq-id">${equipment.identifier || '-'}</div>
      </div>
      <script>setTimeout(()=>window.print(),300)</script></body></html>
    `);
    printWindow.document.close();
  }, [equipment, selectedLabelSize, companySettings]);

  if (eqLoading) {
    return <div className="space-y-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>;
  }

  if (!equipment) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => navigate('/equipamentos')}><ArrowLeft className="mr-2 h-4 w-4" /> Voltar</Button>
        <p className="text-muted-foreground">Equipamento não encontrado.</p>
      </div>
    );
  }

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'geral', label: 'Geral' },
    { key: 'anexos', label: 'Anexos' },
    { key: 'tarefas', label: 'Histórico / Tarefas' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/equipamentos')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{equipment.name}</h1>
          <p className="text-muted-foreground text-sm">
            {equipment.identifier && <span className="font-mono mr-3">ID: {equipment.identifier}</span>}
            <Badge variant={equipment.status === 'active' ? 'default' : 'secondary'}>
              {equipment.status === 'active' ? 'Ativo' : 'Inativo'}
            </Badge>
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => setEditEquipOpen(true)}>
            <Edit className="h-4 w-4 mr-1" /> Editar
          </Button>
          <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeleteEquipOpen(true)}>
            <Trash2 className="h-4 w-4 mr-1" /> Excluir
          </Button>
        </div>
      </div>

      <div className="flex gap-1 border-b">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px',
              activeTab === tab.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Geral tab */}
      {activeTab === 'geral' && (
        <div className="space-y-6">
          {/* Photo + QR row */}
          <Card>
            <CardContent className="p-6">
              <div className="flex flex-col sm:flex-row items-start gap-6">
                {equipment.photo_url && (
                  <img
                    src={equipment.photo_url}
                    alt={equipment.name}
                    className="h-40 w-40 rounded-lg object-cover shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => setPreviewImage(equipment.photo_url!)}
                  />
                )}
                <div className="flex items-start gap-4">
                  <div className="shrink-0"><QRCodeSVG value={qrValue} size={100} /></div>
                  <div className="space-y-2">
                    {equipment.identifier && <p className="text-lg font-mono font-medium">{equipment.identifier}</p>}
                    <p className="text-sm text-muted-foreground">QR Code do equipamento</p>
                    <Button size="sm" variant="outline" onClick={() => setLabelDialogOpen(true)}>
                      <Tag className="mr-2 h-3.5 w-3.5" />Gerar Etiqueta
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(equipment as any).customer?.name && (
              <Card><CardContent className="p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Cliente</p>
                <p className="text-sm font-medium mt-1">{(equipment as any).customer.name}</p>
              </CardContent></Card>
            )}
            {equipment.brand && (
              <Card><CardContent className="p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Marca</p>
                <p className="text-sm font-medium mt-1">{equipment.brand}</p>
              </CardContent></Card>
            )}
            {equipment.model && (
              <Card><CardContent className="p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Modelo</p>
                <p className="text-sm font-medium mt-1">{equipment.model}</p>
              </CardContent></Card>
            )}
            {equipment.serial_number && (
              <Card><CardContent className="p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Nº de Série</p>
                <p className="text-sm font-medium mt-1">{equipment.serial_number}</p>
              </CardContent></Card>
            )}
            {equipment.capacity && (
              <Card><CardContent className="p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Descrição</p>
                <p className="text-sm font-medium mt-1">{equipment.capacity}</p>
              </CardContent></Card>
            )}
            {equipment.location && (
              <Card><CardContent className="p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Local</p>
                <p className="text-sm font-medium mt-1">{equipment.location}</p>
              </CardContent></Card>
            )}
            {(equipment as any).install_date && (
              <Card><CardContent className="p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Data de Instalação</p>
                <p className="text-sm font-medium mt-1">{format(new Date((equipment as any).install_date), 'dd/MM/yyyy', { locale: ptBR })}</p>
              </CardContent></Card>
            )}
            {(equipment as any).warranty_until && (
              <Card><CardContent className="p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Garantia até</p>
                <p className="text-sm font-medium mt-1">{format(new Date((equipment as any).warranty_until), 'dd/MM/yyyy', { locale: ptBR })}</p>
              </CardContent></Card>
            )}
          </div>
          {equipment.notes && (
            <Card><CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Observações</p>
              <p className="text-sm mt-1">{equipment.notes}</p>
            </CardContent></Card>
          )}
        </div>
      )}

      {/* Anexos tab */}
      {activeTab === 'anexos' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-widest text-foreground/70">Arquivos anexados</h2>
            <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" />Enviar arquivo
            </Button>
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload} />
          </div>
          {attachLoading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : attachments.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <Paperclip className="mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Nenhum anexo</p>
            </div>
          ) : (
            <div className="space-y-2">
              {attachments.map((att) => {
                const isImage = /\.(webp|jpe?g|png|heic)$/i.test(att.file_name);
                return (
                  <Card key={att.id}>
                    <CardContent className="flex items-center gap-3 p-3">
                      {isImage ? (
                         <img
                          src={att.file_url}
                          alt={att.file_name}
                          className="h-20 w-20 rounded-lg object-cover shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() => setPreviewImage(att.file_url)}
                        />
                      ) : (
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <a href={att.file_url} target="_blank" rel="noopener noreferrer" className="flex-1 text-sm hover:underline truncate">
                        {att.file_name}
                      </a>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteAttachmentId(att.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tarefas / Histórico tab */}
      {activeTab === 'tarefas' && (
        <div className="space-y-6">
          {/* OS History */}
          <div className="space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-widest text-foreground/70">
              Ordens de Serviço Relacionadas
            </h2>
            {equipmentOrders.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-center">
                <ClipboardList className="mb-2 h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Nenhuma OS relacionada a este equipamento</p>
              </div>
            ) : (
              <Card><CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs uppercase tracking-wider">OS</TableHead>
                        <TableHead className="text-xs uppercase tracking-wider">Status</TableHead>
                        <TableHead className="hidden sm:table-cell text-xs uppercase tracking-wider">Data</TableHead>
                        <TableHead className="text-xs uppercase tracking-wider">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {equipmentOrders.map((os) => (
                        <TableRow key={os.id}>
                          <TableCell>
                            <span className="font-mono font-medium">#{String(os.order_number).padStart(4, '0')}</span>
                            {os.description && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{os.description}</p>}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{osStatusLabels[os.status]}</Badge>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            {os.scheduled_date ? format(new Date(os.scheduled_date), 'dd/MM/yyyy', { locale: ptBR }) : '-'}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" onClick={() => window.open(`${window.location.origin}/os-tecnico/${os.id}`, '_blank')}>
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent></Card>
            )}
          </div>

          {/* Tasks */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-widest text-foreground/70">Tarefas</h2>
            </div>
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
                  <Card key={task.id}>
                    <CardContent className="flex items-center gap-3 p-3">
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
                          <Calendar className="h-3 w-3" />{task.due_date}
                        </span>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteTask.mutate(task.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
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

      {/* Label dialog */}
      <ResponsiveModal open={labelDialogOpen} onOpenChange={setLabelDialogOpen} title="Gerar Etiqueta de Identificação">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Escolha o tamanho da etiqueta para impressão.</p>
          <div className="grid grid-cols-3 gap-3">
            {LABEL_SIZES.map((size) => (
              <button
                key={size.key}
                onClick={() => setSelectedLabelSize(size.key)}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-all',
                  selectedLabelSize === size.key ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                )}
              >
                <QrCode className="h-8 w-8 text-muted-foreground" />
                <span className="text-sm font-medium">{size.label}</span>
                <span className="text-xs text-muted-foreground text-center leading-tight">{size.desc}</span>
              </button>
            ))}
          </div>
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
              <Download className="mr-2 h-4 w-4" />Imprimir
            </Button>
          </div>
        </div>
      </ResponsiveModal>

      {/* Image preview */}
      <ImagePreviewModal
        src={previewImage || ''}
        open={!!previewImage}
        onClose={() => setPreviewImage(null)}
      />

      {/* Edit Equipment Dialog */}
      <EquipmentFormDialog
        open={editEquipOpen}
        onOpenChange={setEditEquipOpen}
        equipment={equipment}
        onSubmit={async (data: any) => {
          const { error } = await supabase.from('equipment').update(data).eq('id', equipment.id);
          if (error) throw error;
          window.location.reload();
        }}
        customers={customers}
        categories={categories}
        isLoading={false}
      />

      {/* Delete Equipment Confirmation */}
      <AlertDialog open={deleteEquipOpen} onOpenChange={setDeleteEquipOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir equipamento</AlertDialogTitle>
            <AlertDialogDescription>Tem certeza que deseja excluir "{equipment.name}"? Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                await supabase.from('equipment').delete().eq('id', equipment.id);
                navigate('/equipamentos');
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
