import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useRef, useCallback } from 'react';
import { escapeHtml, safeImageUrl } from '@/utils/escapeHtml';
import { useQuery } from '@tanstack/react-query';
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
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { useTableSort } from '@/hooks/useTableSort';
import { SortableTableHead } from '@/components/ui/SortableTableHead';
import { ArrowLeft, Paperclip, Plus, Trash2, CheckCircle2, Circle, Upload, FileText, Calendar, Tag, Download, QrCode, ClipboardList, ExternalLink, Copy, Edit, LayoutGrid, List, Image, ChevronRight, ChevronDown, X } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { motion, AnimatePresence } from 'framer-motion';
import { useIsMobile } from '@/hooks/use-mobile';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MobilePillTabs } from '@/components/mobile/MobilePillTabs';
import { useEquipmentAttachments } from '@/hooks/useEquipmentAttachments';
import { useEquipmentTasks } from '@/hooks/useEquipmentTasks';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { useEquipment } from '@/hooks/useEquipment';
import { useServiceOrders } from '@/hooks/useServiceOrders';
import { useCustomers } from '@/hooks/useCustomers';
import { useEquipmentCategories } from '@/hooks/useEquipmentCategories';
import { useEquipmentFieldConfig } from '@/hooks/useEquipmentFieldConfig';
import { EquipmentFormDialog } from '@/components/customers/EquipmentFormDialog';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { ImagePreviewModal } from '@/components/ui/ImagePreviewModal';
import { RowActionsMenu } from '@/components/ui/RowActionsMenu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { useDataPagination } from '@/hooks/useDataPagination';
import { DataTablePagination } from '@/components/ui/DataTablePagination';
import { osStatusLabels } from '@/types/database';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { isUuid, extractShortCode, buildSlugSegment } from '@/utils/prettyLinks';
import { useEffect } from 'react';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

type TabKey = 'geral' | 'anexos' | 'tarefas';

const LABEL_SIZES = [
  { key: '5x8', label: '5×8cm', width: 189, height: 302, desc: 'QR Code + Info completa' },
  { key: '5x5', label: '5×5cm', width: 189, height: 189, desc: 'QR Code + Info básica' },
  { key: '6x6', label: '6×6cm', width: 227, height: 227, desc: 'Para impressora de etiquetas' },
] as const;

export default function EquipmentDetail() {
  // O param da rota pode ser UUID antigo OU `slug-do-nome-<codigo>` (link
  // amigável). Resolvemos o equipamento pela lista (já carregada com RLS),
  // casando por id (UUID) ou por `public_short_code`. `id` é sempre o id real.
  const { id: routeParam } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const navState = location.state as { from?: string; customerId?: string } | null;
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<TabKey>('geral');
  const isMobile = useIsMobile();
  const { settings: companySettings } = useCompanySettings();
  const { equipment: allEquipment, isLoading: eqLoading } = useEquipment();

  // Resolve o equipamento a partir do param (UUID antigo OU código curto).
  const paramShortCode = isUuid(routeParam) ? null : extractShortCode(routeParam);
  const equipment = allEquipment.find((eq) =>
    isUuid(routeParam)
      ? eq.id === routeParam
      : paramShortCode
        ? (eq as any).public_short_code === paramShortCode
        : eq.id === routeParam,
  );
  // id real do equipamento (alimenta os hooks abaixo).
  const id = equipment?.id ?? (isUuid(routeParam) ? routeParam : undefined);

  const { locale } = useAppLocaleContext();
  const te = MESSAGES[locale].app.equipment.detail;
  const { attachments, isLoading: attachLoading, uploadAttachment, deleteAttachment } = useEquipmentAttachments(id);
  const { tasks, isLoading: tasksLoading, createTask, toggleTask, deleteTask } = useEquipmentTasks(id);
  const { serviceOrders } = useServiceOrders();
  const { customers } = useCustomers();
  const { categories } = useEquipmentCategories();
  const { fields: fieldConfigs } = useEquipmentFieldConfig();
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [attachViewMode, setAttachViewMode] = useState<'gallery' | 'list'>('gallery');
  const [editEquipOpen, setEditEquipOpen] = useState(false);
  const [deleteEquipOpen, setDeleteEquipOpen] = useState(false);
  const [deleteAttachmentId, setDeleteAttachmentId] = useState<string | null>(null);
  const [labelDialogOpen, setLabelDialogOpen] = useState(false);
  const [selectedLabelSize, setSelectedLabelSize] = useState<string>('5x8');
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [qrExpanded, setQrExpanded] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);

  // Auto-canonical: depois que o equipamento carrega, normaliza a URL pro
  // formato bonito (`slug-<codigo>`) sem recarregar. Links antigos (UUID)
  // continuam abrindo — só reescrevemos a barra de endereço.
  useEffect(() => {
    const shortCode = (equipment as any)?.public_short_code as string | undefined;
    if (!equipment || !shortCode) return;
    const pretty = buildSlugSegment([equipment.name], shortCode, 'equipamento');
    if (routeParam !== pretty) {
      navigate(`/equipamentos/${pretty}`, { replace: true });
    }
  }, [equipment, routeParam, navigate]);

  const equipmentOrders = serviceOrders.filter(os => os.equipment_id === id);
  const { sortedItems: sortedEqOrders, sortConfig: eqOsSortConfig, handleSort: handleEqOsSort } = useTableSort(equipmentOrders);
  const ordersPagination = useDataPagination(sortedEqOrders);
  // Fetch portal token for this customer to generate proper QR URL
  const { data: portalToken } = useQuery({
    queryKey: ['portalToken', equipment?.customer_id],
    queryFn: async () => {
      if (!equipment?.customer_id) return null;
      const { data } = await supabase
        .from('customer_portals')
        .select('token')
        .eq('customer_id', equipment.customer_id)
        .eq('is_active', true)
        .maybeSingle();
      return data?.token || null;
    },
    enabled: !!equipment?.customer_id,
  });

  const qrValue = equipment
    ? portalToken
      ? `${window.location.origin}/portal/${portalToken}?eq=${equipment.id}`
      : `EQ-${equipment.identifier || equipment.id}`
    : '';
  const hasPortalLink = !!portalToken;

  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !id) return;
    setUploadingFiles(true);
    const total = files.length;
    setUploadProgress({ current: 0, total });
    try {
      let successCount = 0;
      for (let i = 0; i < total; i++) {
        try {
          await uploadAttachment.mutateAsync({ equipmentId: id, file: files[i] });
          successCount++;
        } catch {}
        setUploadProgress({ current: i + 1, total });
      }
      if (successCount > 0) {
        toast({ title: `${successCount} anexo${successCount > 1 ? 's' : ''} enviado${successCount > 1 ? 's' : ''}!` });
      }
    } finally {
      setUploadingFiles(false);
      setUploadProgress(null);
      e.target.value = '';
    }
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
      <!DOCTYPE html><html><head><title>Etiqueta - ${escapeHtml(equipment.name)}</title>
      <style>@page{size:${labelSize.width}px ${labelSize.height}px;margin:0}body{margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;font-family:Arial,sans-serif}.label{width:${labelSize.width}px;height:${labelSize.height}px;border:1px solid #ccc;border-radius:8px;padding:12px;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;text-align:center}.company-name{font-size:11px;font-weight:bold}.company-info{font-size:8px;color:#666}.eq-label{font-size:8px;color:#888}.eq-name{font-size:12px;font-weight:bold}.eq-id{font-size:10px;font-weight:bold}@media print{body{margin:0}.label{border:none}}</style></head><body>
      <div class="label">
        ${selectedLabelSize === '5x8' && companySettings ? `<div class="company-name">${escapeHtml(companySettings.name) || 'Empresa'}</div>${companySettings.phone ? `<div class="company-info">${escapeHtml(companySettings.phone)}</div>` : ''}${companySettings.email ? `<div class="company-info">${escapeHtml(companySettings.email)}</div>` : ''}` : ''}
        ${svgData}
        <div class="eq-label">Nome do equipamento</div>
        <div class="eq-name">${escapeHtml(equipment.name)}</div>
        <div class="eq-label">Identificador</div>
        <div class="eq-id">${escapeHtml(equipment.identifier) || '-'}</div>
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
        <Button variant="ghost" onClick={() => navState?.from === 'customer' && navState?.customerId ? navigate(`/clientes/${navState.customerId}`, { state: { tab: 'equipamentos' } }) : navigate('/equipamentos')}><ArrowLeft className="mr-2 h-4 w-4" /> {te.back}</Button>
        <p className="text-muted-foreground">{te.notFound}</p>
      </div>
    );
  }

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'geral', label: te.tabGeneral },
    { key: 'anexos', label: te.tabAttachments },
    { key: 'tarefas', label: te.tabHistory },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Seta de voltar própria: só no desktop (Sidebar não tem voltar global; mobile/tablet usam a do shell) */}
        <Button variant="ghost" size="icon" className="shrink-0 hidden lg:flex" aria-label={te.back} onClick={() => navState?.from === 'customer' && navState?.customerId ? navigate(`/clientes/${navState.customerId}`, { state: { tab: 'equipamentos' } }) : navigate('/equipamentos')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1">
          {/* Nome vira gatilho de troca de equipamento (busca ancorada no nome) — mobile e desktop. */}
          <Popover open={switcherOpen} onOpenChange={setSwitcherOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="group flex items-center gap-1.5 max-w-full text-left rounded-md -mx-1 px-1 hover:bg-accent/50 transition-colors"
                  aria-label="Trocar equipamento"
                >
                  <h1 className="text-xl sm:text-2xl font-bold truncate">{equipment.name}</h1>
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-[calc(100vw-2rem)] sm:w-72 p-0" align="start">
                <Command>
                  <CommandInput placeholder={te.switcherSearch} />
                  <CommandList className="max-h-[40vh] overflow-y-auto overscroll-contain">
                    <CommandEmpty>{te.switcherEmpty}</CommandEmpty>
                    <CommandGroup>
                      {allEquipment.map((eq) => {
                        const sublabel = [eq.identifier, (eq as any).customer?.name].filter(Boolean).join(' · ') || undefined;
                        return (
                          <CommandItem
                            key={eq.id}
                            value={`${eq.name} ${sublabel ?? ''}`}
                            onSelect={() => {
                              setSwitcherOpen(false);
                              if (eq.id !== equipment.id) navigate(`/equipamentos/${eq.id}`);
                            }}
                          >
                            <div className="min-w-0">
                              <span className="block truncate">{eq.name}</span>
                              {sublabel && (
                                <span className="block text-xs text-muted-foreground truncate">{sublabel}</span>
                              )}
                            </div>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          <p className="text-muted-foreground text-sm flex items-center gap-2 flex-wrap">
            {equipment.identifier && <span className="font-mono">ID: {equipment.identifier}</span>}
            <Badge variant={equipment.status === 'active' ? 'default' : 'secondary'}>
              {equipment.status === 'active' ? 'Ativo' : 'Inativo'}
            </Badge>
          </p>
        </div>
        <div className="shrink-0 ml-auto">
          <RowActionsMenu
            ariaLabel={te.actions}
            label={te.actions}
            triggerClassName="border border-border px-3"
            actions={[
              { label: MESSAGES[locale].app.equipment.edit, icon: Edit, variant: 'edit', onClick: () => setEditEquipOpen(true) },
              { label: MESSAGES[locale].app.equipment.delete, icon: Trash2, variant: 'delete', onClick: () => setDeleteEquipOpen(true) },
            ]}
          />
        </div>
      </div>

      {isMobile ? (
        <MobilePillTabs
          tabs={tabs.map((t) => ({ value: t.key, label: t.label }))}
          activeTab={activeTab}
          onTabChange={(v) => setActiveTab(v as TabKey)}
        />
      ) : (
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
      )}

      {/* Geral tab */}
      {activeTab === 'geral' && (
        <div className="space-y-6">
          {/* Photo + QR row — lado a lado (mobile e desktop), grupo centralizado no card */}
          <Card>
            <CardContent className="p-6">
              <div className="flex flex-col items-center gap-6 lg:flex-row lg:items-center lg:justify-between">
                {/* Foto */}
                {equipment.photo_url && (
                  <div className="flex flex-col items-center gap-1.5 shrink-0">
                    <img
                      src={equipment.photo_url}
                      alt={equipment.name}
                      className="h-32 w-32 sm:h-48 sm:w-48 lg:h-56 lg:w-56 rounded-lg object-cover cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => setPreviewImage(equipment.photo_url!)}
                    />
                    <p className="text-xs text-muted-foreground">{te.fieldPhotoCaption}</p>
                  </div>
                )}
                {/* QR + ações */}
                <div className="flex flex-col items-center gap-3 lg:items-start">
                  <button
                    type="button"
                    onClick={() => setQrExpanded(true)}
                    className="shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                    aria-label="Ampliar QR Code"
                  >
                    <QRCodeSVG value={qrValue} size={100} />
                  </button>
                  <div className="w-full space-y-2 text-center lg:text-left">
                    {equipment.identifier && <p className="text-lg font-mono font-medium">{equipment.identifier}</p>}
                    <p className="text-sm text-muted-foreground">{te.qrCaption}</p>
                    <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:justify-center lg:justify-start">
                      <Button size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => setLabelDialogOpen(true)}>
                        <Tag className="mr-2 h-3.5 w-3.5" />{te.generateLabel}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full sm:w-auto"
                        disabled={!hasPortalLink}
                        onClick={() => window.open(qrValue, '_blank', 'noopener,noreferrer')}
                      >
                        <ExternalLink className="mr-2 h-3.5 w-3.5" />{te.openLink}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full sm:w-auto"
                        disabled={!hasPortalLink}
                        onClick={() => { navigator.clipboard.writeText(qrValue); toast({ title: te.linkCopied }); }}
                      >
                        <Copy className="mr-2 h-3.5 w-3.5" />{te.copyLink}
                      </Button>
                    </div>
                    {!hasPortalLink && <p className="text-xs text-muted-foreground">{te.noPortalActive}</p>}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card único "Informações" — rótulo → valor */}
          {(() => {
            const category = categories.find(c => c.id === equipment.category_id);
            const customFields = (equipment as any).custom_fields as Record<string, any> | null;
            const visibleCustomFields = (customFields
              ? fieldConfigs.filter(f => f.is_visible && customFields[f.field_key] != null && customFields[f.field_key] !== '')
              : []);

            type InfoRow = { label: string; node: React.ReactNode };
            const rows: InfoRow[] = [];

            if (category) {
              rows.push({
                label: te.fieldCategory,
                node: (
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: category.color }} />
                    <span className="text-sm font-medium">{category.name}</span>
                  </div>
                ),
              });
            }
            if ((equipment as any).customer?.name && equipment.customer_id) {
              rows.push({
                label: te.fieldCustomer,
                node: (
                  <button
                    type="button"
                    onClick={() => navigate(`/clientes/${equipment.customer_id}`)}
                    className="group flex items-center gap-1 text-left text-sm font-medium text-primary hover:underline cursor-pointer"
                  >
                    <span className="truncate">{(equipment as any).customer.name}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity" />
                  </button>
                ),
              });
            } else if ((equipment as any).customer?.name) {
              rows.push({ label: te.fieldCustomer, node: <span className="text-sm font-medium">{(equipment as any).customer.name}</span> });
            }
            if (equipment.brand) rows.push({ label: te.fieldBrand, node: <span className="text-sm font-medium">{equipment.brand}</span> });
            if (equipment.model) rows.push({ label: te.fieldModel, node: <span className="text-sm font-medium">{equipment.model}</span> });
            if (equipment.serial_number) rows.push({ label: te.fieldSerialNumber, node: <span className="text-sm font-medium">{equipment.serial_number}</span> });
            if (equipment.capacity) rows.push({ label: te.fieldDescription, node: <span className="text-sm font-medium">{equipment.capacity}</span> });
            if (equipment.location) rows.push({ label: te.fieldLocation, node: <span className="text-sm font-medium">{equipment.location}</span> });
            if ((equipment as any).install_date) rows.push({ label: te.fieldInstallDate, node: <span className="text-sm font-medium">{format(new Date((equipment as any).install_date), 'dd/MM/yyyy', { locale: ptBR })}</span> });
            if ((equipment as any).warranty_until) rows.push({ label: te.fieldWarrantyUntil, node: <span className="text-sm font-medium">{format(new Date((equipment as any).warranty_until), 'dd/MM/yyyy', { locale: ptBR })}</span> });

            visibleCustomFields.forEach(field => {
              let displayValue = String(customFields![field.field_key]);
              if (field.field_type === 'boolean') displayValue = customFields![field.field_key] ? 'Sim' : 'Não';
              if (field.field_type === 'date' && customFields![field.field_key]) {
                try { displayValue = format(new Date(customFields![field.field_key]), 'dd/MM/yyyy', { locale: ptBR }); } catch { /* keep raw */ }
              }
              rows.push({ label: field.label, node: <span className="text-sm font-medium">{displayValue}</span> });
            });

            if (rows.length === 0) return null;
            return (
              <Card>
                <CardContent className="p-4 sm:p-6">
                  <h2 className="text-sm font-bold uppercase tracking-widest text-foreground/70 mb-4">{te.sectionInfo}</h2>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {rows.map((row, i) => (
                      <div key={i} className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-xs text-muted-foreground">{row.label}</span>
                        {row.node}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })()}
          {/* Observações em card próprio */}
          {equipment.notes && (
            <Card><CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">{te.fieldNotes}</p>
              <p className="text-sm mt-1 whitespace-pre-wrap">{equipment.notes}</p>
            </CardContent></Card>
          )}
        </div>
      )}

      {/* Anexos tab */}
      {activeTab === 'anexos' && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-sm font-bold uppercase tracking-widest text-foreground/70">{te.sectionAttachments}</h2>
            <div className="flex items-center gap-2">
              <div className="flex border rounded-lg overflow-hidden">
                <button
                  onClick={() => setAttachViewMode('gallery')}
                  className={cn('p-1.5 transition-colors', attachViewMode === 'gallery' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
                  title="Galeria"
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setAttachViewMode('list')}
                  className={cn('p-1.5 transition-colors', attachViewMode === 'list' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
                  title="Lista"
                >
                  <List className="h-4 w-4" />
                </button>
              </div>
              <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploadingFiles}>
                <Upload className="mr-2 h-4 w-4" />{uploadingFiles ? te.uploading : te.upload}
              </Button>
            </div>
            <input ref={fileInputRef} type="file" className="hidden" multiple onChange={handleFileUpload} />
          </div>
          {/* Upload progress bar */}
          {uploadProgress && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{te.uploadingProgress.replace('{current}', String(uploadProgress.current)).replace('{total}', String(uploadProgress.total))}</span>
                <span>{Math.round((uploadProgress.current / uploadProgress.total) * 100)}%</span>
              </div>
              <Progress value={(uploadProgress.current / uploadProgress.total) * 100} className="h-2" />
            </div>
          )}
          {attachLoading ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : attachments.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <Paperclip className="mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">{te.emptyAttachments}</p>
            </div>
          ) : (() => {
            const imageAttachments = attachments.filter(att => /\.(webp|jpe?g|png|gif|heic|svg)$/i.test(att.file_name));
            const pdfAttachments = attachments.filter(att => /\.pdf$/i.test(att.file_name));
            const otherFileAttachments = attachments.filter(att => !/\.(webp|jpe?g|png|gif|heic|svg|pdf)$/i.test(att.file_name));

            const isPdf = (name: string) => /\.pdf$/i.test(name);

            const renderGalleryItem = (att: typeof attachments[0], isImage: boolean) => (
              <motion.div
                key={att.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
                className="relative group rounded-lg border overflow-hidden bg-muted/30"
              >
                {isImage ? (
                  <img
                    src={att.file_url}
                    alt={att.file_name}
                    className="w-full aspect-square object-cover cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => setPreviewImage(att.file_url)}
                  />
                ) : isPdf(att.file_name) ? (
                  <div className="w-full aspect-square relative bg-white overflow-hidden cursor-pointer" onClick={() => window.open(att.file_url, '_blank')}>
                    <iframe
                      src={`${att.file_url}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
                      className="w-full h-full pointer-events-none border-0"
                      title={att.file_name}
                    />
                    <div className="absolute inset-0 bg-transparent" />
                  </div>
                ) : (
                  <div className="w-full aspect-square flex flex-col items-center justify-center gap-2 p-3">
                    <FileText className="h-8 w-8 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground text-center truncate w-full px-2">{att.file_name}</p>
                  </div>
                )}
                <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                  <a href={att.file_url} target="_blank" rel="noopener noreferrer" className="rounded-full bg-background/80 p-1 hover:bg-background shadow-sm">
                    <Download className="h-3.5 w-3.5" />
                  </a>
                  <button onClick={() => setDeleteAttachmentId(att.id)} className="rounded-full bg-background/80 p-1 hover:bg-destructive hover:text-white shadow-sm">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="text-xs text-muted-foreground truncate px-2 py-1.5 bg-background/80 backdrop-blur-sm">{att.file_name}</p>
              </motion.div>
            );

            const renderListItem = (att: typeof attachments[0], isImage: boolean) => (
              <Card key={att.id}>
                <CardContent className="flex items-center gap-3 p-3 min-w-0">
                  {isImage ? (
                    <img
                      src={att.file_url}
                      alt={att.file_name}
                      className="h-14 w-14 sm:h-20 sm:w-20 rounded-lg object-cover shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => setPreviewImage(att.file_url)}
                    />
                  ) : (
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                  <a href={att.file_url} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 text-sm hover:underline truncate">
                    {att.file_name}
                  </a>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0" onClick={() => setDeleteAttachmentId(att.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </CardContent>
              </Card>
            );

            return (
              <div className="space-y-6">
                {imageAttachments.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground/70">
                      <Image className="h-4 w-4" />
                      <span>{te.attachImages} ({imageAttachments.length})</span>
                    </div>
                    {attachViewMode === 'gallery' ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {imageAttachments.map(att => renderGalleryItem(att, true))}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {imageAttachments.map(att => renderListItem(att, true))}
                      </div>
                    )}
                  </div>
                )}
                {pdfAttachments.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground/70">
                      <FileText className="h-4 w-4" />
                      <span>{te.attachPdfs} ({pdfAttachments.length})</span>
                    </div>
                    {attachViewMode === 'gallery' ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {pdfAttachments.map(att => renderGalleryItem(att, false))}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {pdfAttachments.map(att => renderListItem(att, false))}
                      </div>
                    )}
                  </div>
                )}
                {otherFileAttachments.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground/70">
                      <FileText className="h-4 w-4" />
                      <span>{te.attachOther} ({otherFileAttachments.length})</span>
                    </div>
                    {attachViewMode === 'gallery' ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {otherFileAttachments.map(att => renderGalleryItem(att, false))}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {otherFileAttachments.map(att => renderListItem(att, false))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* Tarefas / Histórico tab */}
      {activeTab === 'tarefas' && (
        <div className="space-y-6">
          {/* OS History */}
          <div className="space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-widest text-foreground/70">
              {te.sectionOrders}
            </h2>
            {equipmentOrders.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-center">
                <ClipboardList className="mb-2 h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{te.emptyOrders}</p>
              </div>
            ) : (
              <Card><CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableTableHead sortKey="order_number" sortConfig={eqOsSortConfig} onSort={handleEqOsSort}>{te.colOs}</SortableTableHead>
                        <SortableTableHead sortKey="status" sortConfig={eqOsSortConfig} onSort={handleEqOsSort}>{te.colStatus}</SortableTableHead>
                        <SortableTableHead sortKey="scheduled_date" sortConfig={eqOsSortConfig} onSort={handleEqOsSort} className="hidden sm:table-cell">{te.colDate}</SortableTableHead>
                        <SortableTableHead sortKey="" sortConfig={eqOsSortConfig} onSort={() => {}}>{te.colActions}</SortableTableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ordersPagination.paginatedItems.map((os) => (
                        <TableRow key={os.id}>
                          <TableCell>
                            <span className="font-mono font-medium">#{String(os.order_number).padStart(6, '0')}</span>
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
                <DataTablePagination page={ordersPagination.page} totalPages={ordersPagination.totalPages} totalItems={ordersPagination.totalItems} from={ordersPagination.from} to={ordersPagination.to} pageSize={ordersPagination.pageSize} onPageChange={ordersPagination.setPage} onPageSizeChange={ordersPagination.setPageSize} />
              </CardContent></Card>
            )}
          </div>

          {/* Tasks */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-widest text-foreground/70">{te.sectionTasks}</h2>
            </div>
            <div className="flex gap-2">
              <Input
                placeholder={te.taskPlaceholder}
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
                <p className="text-sm text-muted-foreground">{te.emptyTasks}</p>
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
            <AlertDialogTitle>{te.deleteAttachmentTitle}</AlertDialogTitle>
            <AlertDialogDescription>{te.deleteAttachmentDesc}</AlertDialogDescription>
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
      <ResponsiveModal open={labelDialogOpen} onOpenChange={setLabelDialogOpen} title={te.labelDialogTitle}>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{te.labelDialogDesc}</p>
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
              <p className="text-[10px] text-muted-foreground">{te.labelEqName}</p>
              <p className="text-xs font-bold">{equipment.name}</p>
              <p className="text-[10px] text-muted-foreground">{te.labelEqId}</p>
              <p className="text-xs font-bold">{equipment.identifier || '-'}</p>
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={handleDownloadLabel}>
              <Download className="mr-2 h-4 w-4" />{te.labelPrint}
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

      {/* QR expandido — overlay centralizado via portal */}
      {qrExpanded && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setQrExpanded(false)}
        >
          <button
            className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 transition-colors"
            onClick={() => setQrExpanded(false)}
            aria-label="Fechar"
          >
            <X className="h-6 w-6" />
          </button>
          <div
            className="flex flex-col items-center gap-4 rounded-2xl bg-white p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <QRCodeSVG value={qrValue} size={280} />
            {equipment.identifier && <p className="text-lg font-mono font-medium text-black">{equipment.identifier}</p>}
          </div>
        </div>,
        document.body,
      )}

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
            <AlertDialogTitle>{MESSAGES[locale].app.equipment.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>{MESSAGES[locale].app.equipment.deleteConfirm.replace('{name}', equipment.name)}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                await supabase.from('equipment').delete().eq('id', equipment.id);
                if (navState?.from === 'customer' && navState?.customerId) {
                  navigate(`/clientes/${navState.customerId}`, { state: { tab: 'equipamentos' } });
                } else {
                  navigate('/equipamentos');
                }
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
