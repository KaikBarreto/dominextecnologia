import { useState, useRef, useCallback, useEffect } from 'react';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { escapeHtml } from '@/utils/escapeHtml';
import { useQuery } from '@tanstack/react-query';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Paperclip, Plus, Trash2, CheckCircle2, Circle, Upload, FileText, Calendar, QrCode, Download, Tag, ExternalLink, Copy, Loader2, Package } from 'lucide-react';
import { useEquipmentAttachments } from '@/hooks/useEquipmentAttachments';
import { useEquipmentTasks } from '@/hooks/useEquipmentTasks';
import { useEquipmentFieldConfig } from '@/hooks/useEquipmentFieldConfig';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { useToast } from '@/hooks/use-toast';
import { useEquipment } from '@/hooks/useEquipment';
import { supabase } from '@/integrations/supabase/client';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import type { Equipment } from '@/types/database';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  equipment: (Equipment & { customer?: any; category?: any }) | null;
}

type TabKey = 'geral' | 'anexos' | 'tarefas';

// cm → px a 96 DPI
const cmToPx = (cm: number) => Math.round(cm * 37.795);

// Clamp sensato para dimensões da etiqueta
const clampCm = (val: number) => Math.min(30, Math.max(2, val));

interface LabelConfig {
  items: Record<string, boolean>;
  widthCm: string;
  heightCm: string;
}

const LABEL_STORAGE_KEY = 'equipment-label-config';

const DEFAULT_LABEL_CONFIG: LabelConfig = {
  items: {
    companyName: true,
    companyPhone: true,
    companyEmail: true,
    qr: true,
    eqName: true,
    identifier: true,
    brand: false,
    model: false,
    serial: false,
    location: false,
    customer: false,
  },
  widthCm: '5',
  heightCm: '8',
};

function loadLabelConfig(): LabelConfig {
  try {
    const raw = localStorage.getItem(LABEL_STORAGE_KEY);
    if (!raw) return DEFAULT_LABEL_CONFIG;
    const parsed = JSON.parse(raw) as Partial<LabelConfig>;
    return {
      items: { ...DEFAULT_LABEL_CONFIG.items, ...(parsed.items ?? {}) },
      widthCm: parsed.widthCm ?? DEFAULT_LABEL_CONFIG.widthCm,
      heightCm: parsed.heightCm ?? DEFAULT_LABEL_CONFIG.heightCm,
    };
  } catch {
    return DEFAULT_LABEL_CONFIG;
  }
}

function saveLabelConfig(cfg: LabelConfig) {
  try {
    localStorage.setItem(LABEL_STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    // silencioso
  }
}

export function EquipmentDetailDialog({ open, onOpenChange, equipment }: Props) {
  const { locale } = useAppLocaleContext();
  const tfc = MESSAGES[locale].app.equipment.fieldConfig;
  const [activeTab, setActiveTab] = useState<TabKey>('geral');
  const { attachments, isLoading: attachLoading, uploadAttachment, deleteAttachment } = useEquipmentAttachments(equipment?.id);
  const { tasks, isLoading: tasksLoading, createTask, toggleTask, deleteTask } = useEquipmentTasks(equipment?.id);
  const { settings: companySettings } = useCompanySettings();
  const { fields: fieldConfigs } = useEquipmentFieldConfig();
  const { toast } = useToast();
  const { updateEquipment } = useEquipment();
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [deleteAttachmentId, setDeleteAttachmentId] = useState<string | null>(null);

  // Estado local do toggle "Mostrar anexos no portal" — espelha equipment.attachments_public
  // (default true quando coluna ausente, pois o contrato de dados define `default true`)
  const [attachmentsPublic, setAttachmentsPublic] = useState<boolean>(
    (equipment as any)?.attachments_public !== false,
  );

  // Sincroniza quando o equipamento muda (ex: abre outro equipamento)
  useEffect(() => {
    setAttachmentsPublic((equipment as any)?.attachments_public !== false);
  }, [equipment?.id]);

  const handleToggleAttachmentsPublic = (checked: boolean) => {
    if (!equipment) return;
    setAttachmentsPublic(checked);
    updateEquipment.mutate({ id: equipment.id, data: { attachments_public: checked } }, {
      onError: () => {
        // Reverte o toggle visual em caso de erro
        setAttachmentsPublic(!checked);
        toast({ variant: 'destructive', title: tfc.detailDialogAttachmentsPortalToggle });
      },
    });
  };
  const [labelDialogOpen, setLabelDialogOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

  // Configuração de etiqueta
  const [labelConfig, setLabelConfig] = useState<LabelConfig>(loadLabelConfig);

  // Persistir configuração quando mudar
  useEffect(() => {
    saveLabelConfig(labelConfig);
  }, [labelConfig]);

  const updateItem = (key: string, checked: boolean) => {
    setLabelConfig(prev => ({
      ...prev,
      items: { ...prev.items, [key]: checked },
    }));
  };

  const updateSize = (field: 'widthCm' | 'heightCm', value: string) => {
    // Aceitar string crua, incluindo vazio e decimal em andamento
    setLabelConfig(prev => ({ ...prev, [field]: value }));
  };

  const applyPreset = (w: string, h: string) => {
    setLabelConfig(prev => ({ ...prev, widthCm: w, heightCm: h }));
  };

  // px calculados para o print (com clamp)
  const labelWidthPx = cmToPx(clampCm(parseFloat(labelConfig.widthCm) || 5));
  const labelHeightPx = cmToPx(clampCm(parseFloat(labelConfig.heightCm) || 8));

  const { data: portalToken, isLoading: portalTokenLoading } = useQuery({
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

  // Todo cliente tem portal automático: o QR sempre aponta para o portal + deep-link do equipamento.
  const qrValue = equipment && portalToken
    ? `${window.location.origin}/portal/${portalToken}?eq=${equipment.id}`
    : '';
  // Aguardando o token: query habilitada (tem customer_id) e ainda carregando, ou sem token resolvido.
  const portalTokenPending = !!equipment?.customer_id && portalTokenLoading;
  const hasPortalLink = !!qrValue;

  const [uploadingFiles, setUploadingFiles] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !equipment) return;
    setUploadingFiles(true);
    try {
      for (const file of Array.from(files)) {
        await uploadAttachment.mutateAsync({ equipmentId: equipment.id, file });
      }
    } finally {
      setUploadingFiles(false);
      e.target.value = '';
    }
  };

  const handleAddTask = () => {
    if (!newTaskTitle.trim() || !equipment) return;
    createTask.mutate({ equipment_id: equipment.id, title: newTaskTitle });
    setNewTaskTitle('');
  };

  // Etiqueta: determina quais itens realmente têm valor no equipamento atual
  const availableItems = equipment ? {
    companyName: !!(companySettings?.name),
    companyPhone: !!(companySettings?.phone),
    companyEmail: !!(companySettings?.email),
    qr: hasPortalLink,
    eqName: !!(equipment.name),
    identifier: !!(equipment.identifier),
    brand: !!(equipment.brand),
    model: !!(equipment.model),
    serial: !!(equipment.serial_number),
    location: !!(equipment.location),
    customer: !!(equipment.customer?.name),
  } : {} as Record<string, boolean>;

  const isItemEnabled = (key: string) => !!(labelConfig.items[key] && availableItems[key]);

  // handleDownloadLabel monta HTML a partir da configuração atual
  const handleDownloadLabel = useCallback(() => {
    if (!labelRef.current || !equipment) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const svgEl = labelRef.current.querySelector('svg');
    const svgData = svgEl ? new XMLSerializer().serializeToString(svgEl) : '';

    const showCompanyName = isItemEnabled('companyName');
    const showCompanyPhone = isItemEnabled('companyPhone');
    const showCompanyEmail = isItemEnabled('companyEmail');
    const showQr = isItemEnabled('qr');
    const showEqName = isItemEnabled('eqName');
    const showIdentifier = isItemEnabled('identifier');
    const showBrand = isItemEnabled('brand');
    const showModel = isItemEnabled('model');
    const showSerial = isItemEnabled('serial');
    const showLocation = isItemEnabled('location');
    const showCustomer = isItemEnabled('customer');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Etiqueta - ${escapeHtml(equipment.name)}</title>
        <style>
          @page { size: ${labelWidthPx}px ${labelHeightPx}px; margin: 0; }
          body { margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; font-family: Arial, sans-serif; }
          .label { width: ${labelWidthPx}px; height: ${labelHeightPx}px; border: 1px solid #ccc; border-radius: 8px; padding: 12px; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; text-align: center; overflow: hidden; }
          .company-name { font-size: 11px; font-weight: bold; }
          .company-info { font-size: 8px; color: #666; }
          .eq-label { font-size: 8px; color: #888; margin-top: 2px; }
          .eq-name { font-size: 12px; font-weight: bold; }
          .eq-id { font-size: 10px; font-weight: bold; }
          .eq-detail { font-size: 9px; color: #555; }
          @media print { body { margin: 0; } .label { border: none; } }
        </style>
      </head>
      <body>
        <div class="label">
          ${showCompanyName && companySettings ? `<div class="company-name">${escapeHtml(companySettings.name)}</div>` : ''}
          ${showCompanyPhone && companySettings?.phone ? `<div class="company-info">${escapeHtml(companySettings.phone)}</div>` : ''}
          ${showCompanyEmail && companySettings?.email ? `<div class="company-info">${escapeHtml(companySettings.email)}</div>` : ''}
          ${showQr ? svgData : ''}
          ${showEqName ? `<div class="eq-label">${escapeHtml(tfc.detailDialogLabelItemEqName)}</div><div class="eq-name">${escapeHtml(equipment.name)}</div>` : ''}
          ${showIdentifier && equipment.identifier ? `<div class="eq-label">${escapeHtml(tfc.detailDialogLabelItemIdentifier)}</div><div class="eq-id">${escapeHtml(equipment.identifier)}</div>` : ''}
          ${showBrand && equipment.brand ? `<div class="eq-label">${escapeHtml(tfc.detailDialogLabelItemBrand)}</div><div class="eq-detail">${escapeHtml(equipment.brand)}</div>` : ''}
          ${showModel && equipment.model ? `<div class="eq-label">${escapeHtml(tfc.detailDialogLabelItemModel)}</div><div class="eq-detail">${escapeHtml(equipment.model)}</div>` : ''}
          ${showSerial && equipment.serial_number ? `<div class="eq-label">${escapeHtml(tfc.detailDialogLabelItemSerial)}</div><div class="eq-detail">${escapeHtml(equipment.serial_number)}</div>` : ''}
          ${showLocation && equipment.location ? `<div class="eq-label">${escapeHtml(tfc.detailDialogLabelItemLocation)}</div><div class="eq-detail">${escapeHtml(equipment.location)}</div>` : ''}
          ${showCustomer && equipment.customer?.name ? `<div class="eq-label">${escapeHtml(tfc.detailDialogLabelItemCustomer)}</div><div class="eq-detail">${escapeHtml(equipment.customer.name)}</div>` : ''}
        </div>
        <script>setTimeout(() => window.print(), 300);</script>
      </body>
      </html>
    `);
    printWindow.document.close();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equipment, labelConfig, companySettings, hasPortalLink, labelWidthPx, labelHeightPx]);

  // Feature 2: Download QR como PNG
  const handleDownloadQrPng = useCallback(() => {
    if (!qrCanvasRef.current || !equipment) return;
    const canvas = qrCanvasRef.current;
    const dataUrl = canvas.toDataURL('image/png');
    const slug = (equipment.identifier || equipment.name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `qr-${slug}.png`;
    a.click();
    toast({ title: tfc.detailDialogQrDownloaded });
  }, [equipment, tfc.detailDialogQrDownloaded]);

  if (!equipment) return null;

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'geral', label: tfc.detailDialogTabGeneral },
    { key: 'anexos', label: tfc.detailDialogTabAttachments },
    { key: 'tarefas', label: tfc.detailDialogTabTasks },
  ];

  // Itens do checklist (ordem canônica)
  const checklistItems: { key: string; label: string }[] = [
    { key: 'companyName', label: tfc.detailDialogLabelItemCompanyName },
    { key: 'companyPhone', label: tfc.detailDialogLabelItemCompanyPhone },
    { key: 'companyEmail', label: tfc.detailDialogLabelItemCompanyEmail },
    { key: 'qr', label: tfc.detailDialogLabelItemQr },
    { key: 'eqName', label: tfc.detailDialogLabelItemEqName },
    { key: 'identifier', label: tfc.detailDialogLabelItemIdentifier },
    { key: 'brand', label: tfc.detailDialogLabelItemBrand },
    { key: 'model', label: tfc.detailDialogLabelItemModel },
    { key: 'serial', label: tfc.detailDialogLabelItemSerial },
    { key: 'location', label: tfc.detailDialogLabelItemLocation },
    { key: 'customer', label: tfc.detailDialogLabelItemCustomer },
  ].filter(item => availableItems[item.key]); // só exibe se o campo tem valor

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
            {/* Hero card: foto + QR/ID + ações */}
            <div className="rounded-2xl border bg-card overflow-hidden">
              <div className="grid gap-0 sm:grid-cols-2">
                {/* Foto */}
                <div className="bg-muted/40 p-4 flex items-center justify-center">
                  {equipment.photo_url ? (
                    <img
                      src={equipment.photo_url}
                      alt={equipment.name}
                      className="aspect-[4/3] w-full max-w-[280px] rounded-xl object-cover shadow-sm"
                    />
                  ) : (
                    <div
                      className="aspect-[4/3] w-full max-w-[280px] rounded-xl flex flex-col items-center justify-center gap-2 text-white"
                      style={{ backgroundColor: equipment.category?.color || 'hsl(var(--muted))' }}
                    >
                      <Package className={cn('h-10 w-10', !equipment.category?.color && 'text-muted-foreground')} />
                      <span className={cn('text-xs font-medium', !equipment.category?.color && 'text-muted-foreground')}>
                        {tfc.detailDialogNoPhoto}
                      </span>
                    </div>
                  )}
                </div>

                {/* QR + ID + ações */}
                <div className="p-4 flex flex-col items-center gap-4 sm:border-l">
                  {/* Mini-preview de etiqueta */}
                  <div className="flex flex-col items-center gap-2 rounded-xl border bg-muted/30 px-6 py-4 w-full">
                    {portalTokenPending ? (
                      <div className="flex h-[120px] w-[120px] items-center justify-center rounded-lg bg-muted">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : qrValue ? (
                      <div className="rounded-lg bg-white p-2 shadow-sm">
                        <QRCodeSVG value={qrValue} size={116} />
                      </div>
                    ) : (
                      <div className="flex h-[120px] w-[120px] items-center justify-center rounded-lg bg-muted">
                        <QrCode className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                    {equipment.identifier && (
                      <p className="text-lg font-mono font-bold tracking-wide text-foreground">
                        {equipment.identifier}
                      </p>
                    )}
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {tfc.detailDialogQrCaption}
                    </p>
                    {!portalTokenPending && !hasPortalLink && (
                      <p className="text-xs text-center text-muted-foreground">
                        {tfc.detailDialogNoClient}
                      </p>
                    )}
                  </div>

                  {/* Canvas oculto para download PNG (só montado quando tem link) */}
                  {hasPortalLink && (
                    <div className="hidden" aria-hidden="true">
                      <QRCodeCanvas
                        ref={qrCanvasRef}
                        value={qrValue}
                        size={1024}
                        level="M"
                        marginSize={2}
                      />
                    </div>
                  )}

                  {/* Ações — 2 colunas no mobile, 2 colunas no desktop */}
                  <div className="grid w-full grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      className="h-11 w-full justify-center sm:h-9"
                      onClick={() => setLabelDialogOpen(true)}
                    >
                      <Tag className="mr-2 h-4 w-4" />
                      {tfc.detailDialogGenerateLabel}
                    </Button>
                    <Button
                      variant="outline"
                      className="h-11 w-full justify-center sm:h-9"
                      disabled={!hasPortalLink}
                      onClick={handleDownloadQrPng}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      {tfc.detailDialogDownloadQrPng}
                    </Button>
                    <Button
                      variant="outline"
                      className="h-11 w-full justify-center sm:h-9"
                      disabled={!hasPortalLink}
                      onClick={() => window.open(qrValue, '_blank', 'noopener,noreferrer')}
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      {tfc.detailDialogOpenLink}
                    </Button>
                    <Button
                      variant="outline"
                      className="h-11 w-full justify-center sm:h-9"
                      disabled={!hasPortalLink}
                      onClick={() => { navigator.clipboard.writeText(qrValue); toast({ title: tfc.detailDialogLinkCopied }); }}
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      {tfc.detailDialogCopyLink}
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {equipment.customer?.name && (
              <div>
                <p className="text-xs text-muted-foreground">{tfc.detailDialogClient}</p>
                <p className="text-sm font-medium">{equipment.customer.name}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              {equipment.brand && (
                <div>
                  <p className="text-xs text-muted-foreground">{tfc.detailDialogBrand}</p>
                  <p className="text-sm">{equipment.brand}</p>
                </div>
              )}
              {equipment.model && (
                <div>
                  <p className="text-xs text-muted-foreground">{tfc.detailDialogModel}</p>
                  <p className="text-sm">{equipment.model}</p>
                </div>
              )}
              {equipment.serial_number && (
                <div>
                  <p className="text-xs text-muted-foreground">{tfc.detailDialogSerial}</p>
                  <p className="text-sm">{equipment.serial_number}</p>
                </div>
              )}
              {equipment.capacity && (
                <div>
                  <p className="text-xs text-muted-foreground">{tfc.detailDialogCapacity}</p>
                  <p className="text-sm">{equipment.capacity}</p>
                </div>
              )}
              {equipment.location && (
                <div>
                  <p className="text-xs text-muted-foreground">{tfc.detailDialogLocation}</p>
                  <p className="text-sm">{equipment.location}</p>
                </div>
              )}
              {equipment.install_date && (
                <div>
                  <p className="text-xs text-muted-foreground">{tfc.detailDialogInstallDate}</p>
                  <p className="text-sm">{equipment.install_date}</p>
                </div>
              )}
              {(equipment as any).warranty_until && (
                <div>
                  <p className="text-xs text-muted-foreground">{tfc.detailDialogWarranty}</p>
                  <p className="text-sm">{(equipment as any).warranty_until}</p>
                </div>
              )}
            </div>
            {equipment.notes && (
              <div>
                <p className="text-xs text-muted-foreground">{tfc.detailDialogNotes}</p>
                <p className="text-sm">{equipment.notes}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-muted-foreground">{tfc.detailDialogStatus}</p>
              <Badge variant={equipment.status === 'active' ? 'default' : 'secondary'}>
                {equipment.status === 'active' ? tfc.detailDialogStatusActive : tfc.detailDialogStatusInactive}
              </Badge>
            </div>
            {/* Custom fields */}
            {(() => {
              const customFields = (equipment as any).custom_fields as Record<string, any> | null;
              if (!customFields || Object.keys(customFields).length === 0) return null;
              const visibleFields = fieldConfigs.filter(f => f.is_visible && customFields[f.field_key] != null && customFields[f.field_key] !== '');
              if (visibleFields.length === 0) return null;
              return (
                <div className="grid grid-cols-2 gap-3 col-span-2">
                  {visibleFields.map(field => {
                    let displayValue = String(customFields[field.field_key]);
                    if (field.field_type === 'boolean') displayValue = customFields[field.field_key] ? tfc.detailDialogBooleanYes : tfc.detailDialogBooleanNo;
                    return (
                      <div key={field.id}>
                        <p className="text-xs text-muted-foreground">{field.label}</p>
                        <p className="text-sm">{displayValue}</p>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}

        {/* Anexos tab */}
        {activeTab === 'anexos' && (
          <div className="space-y-4">
            {/* Toggle: mostrar anexos no portal do cliente */}
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2.5">
              <div className="flex-1 min-w-0 mr-3">
                <p className="text-sm font-medium leading-tight">{tfc.detailDialogAttachmentsPortalToggle}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {attachmentsPublic ? tfc.detailDialogAttachmentsPortalOn : tfc.detailDialogAttachmentsPortalOff}
                </p>
              </div>
              <Switch
                checked={attachmentsPublic}
                onCheckedChange={handleToggleAttachmentsPublic}
                disabled={updateEquipment.isPending}
                aria-label={tfc.detailDialogAttachmentsPortalToggle}
              />
            </div>

            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{tfc.detailDialogAttachments}</p>
              <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploadingFiles}>
                <Upload className="mr-2 h-4 w-4" />
                {uploadingFiles ? tfc.detailDialogUploading : tfc.detailDialogUpload}
              </Button>
              <input ref={fileInputRef} type="file" className="hidden" multiple onChange={handleFileUpload} />
            </div>

            {attachLoading ? (
              <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : attachments.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-center">
                <Paperclip className="mb-2 h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{tfc.detailDialogNoAttachments}</p>
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
                placeholder={tfc.detailDialogTasks}
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
                <p className="text-sm text-muted-foreground">{tfc.detailDialogNoTasks}</p>
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
              <AlertDialogTitle>{tfc.detailDialogDeleteAttachTitle}</AlertDialogTitle>
              <AlertDialogDescription>{tfc.detailDialogDeleteAttachDesc}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{tfc.detailDialogDeleteAttachCancel}</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => { if (deleteAttachmentId) { deleteAttachment.mutate(deleteAttachmentId); setDeleteAttachmentId(null); } }}
              >
                {tfc.detailDialogDeleteAttachConfirm}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </ResponsiveModal>

      {/* Modal de configuração de etiqueta */}
      <ResponsiveModal open={labelDialogOpen} onOpenChange={setLabelDialogOpen} title={tfc.detailDialogLabelTitle}>
        <div className="space-y-5">
          {/* Hint de impressão */}
          <div className="bg-accent/50 rounded-lg p-3 text-sm text-muted-foreground flex items-start gap-2">
            <span className="text-primary shrink-0">ℹ</span>
            {tfc.detailDialogLabelPrintHint}
          </div>

          {/* Checklist de itens */}
          <div>
            <p className="text-sm font-medium mb-3">{tfc.detailDialogLabelItemsHeading}</p>
            <div className="divide-y border rounded-lg overflow-hidden">
              {checklistItems.map(item => (
                <div key={item.key} className="flex items-center gap-3 px-3 py-2.5 bg-background hover:bg-muted/30 transition-colors">
                  <Checkbox
                    id={`label-item-${item.key}`}
                    checked={!!labelConfig.items[item.key]}
                    onCheckedChange={(checked) => updateItem(item.key, !!checked)}
                  />
                  <label
                    htmlFor={`label-item-${item.key}`}
                    className="text-sm cursor-pointer flex-1 select-none"
                  >
                    {item.label}
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Tamanho */}
          <div>
            <p className="text-sm font-medium mb-3">{tfc.detailDialogLabelSizeHeading}</p>
            {/* Presets */}
            <div className="flex gap-2 mb-3">
              {[
                { label: '5×5', w: '5', h: '5' },
                { label: '5×8', w: '5', h: '8' },
                { label: '6×6', w: '6', h: '6' },
              ].map(preset => {
                const active = labelConfig.widthCm === preset.w && labelConfig.heightCm === preset.h;
                return (
                  <Button
                    key={preset.label}
                    size="sm"
                    variant={active ? 'default' : 'outline'}
                    className="flex-1 h-8 text-xs"
                    onClick={() => applyPreset(preset.w, preset.h)}
                  >
                    {preset.label} cm
                  </Button>
                );
              })}
            </div>
            {/* Campos livres */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">{tfc.detailDialogLabelWidthCm}</label>
                <Input
                  inputMode="decimal"
                  value={labelConfig.widthCm}
                  onChange={(e) => updateSize('widthCm', e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">{tfc.detailDialogLabelHeightCm}</label>
                <Input
                  inputMode="decimal"
                  value={labelConfig.heightCm}
                  onChange={(e) => updateSize('heightCm', e.target.value)}
                  className="h-9"
                />
              </div>
            </div>
          </div>

          {/* Preview ao vivo */}
          <div>
            <p className="text-sm font-medium mb-3">{tfc.detailDialogLabelPreview}</p>
            <div className="flex justify-center">
              {/* O preview usa proporção relativa para caber na tela */}
              {(() => {
                const wCm = clampCm(parseFloat(labelConfig.widthCm) || 5);
                const hCm = clampCm(parseFloat(labelConfig.heightCm) || 8);
                const MAX_PREVIEW_W = 180;
                const MAX_PREVIEW_H = 260;
                const scaleW = MAX_PREVIEW_W / (wCm * 37.795);
                const scaleH = MAX_PREVIEW_H / (hCm * 37.795);
                const scale = Math.min(scaleW, scaleH, 1);
                const previewW = Math.round(wCm * 37.795 * scale);
                const previewH = Math.round(hCm * 37.795 * scale);

                return (
                  <div
                    ref={labelRef}
                    className="border rounded-lg flex flex-col items-center justify-center gap-1.5 text-center bg-white dark:bg-white shadow-sm overflow-hidden"
                    style={{ width: previewW, height: previewH, padding: Math.max(6, 12 * scale) }}
                  >
                    {isItemEnabled('companyName') && companySettings && (
                      <p className="font-bold text-black leading-tight" style={{ fontSize: Math.max(7, 11 * scale) }}>
                        {companySettings.name}
                      </p>
                    )}
                    {isItemEnabled('companyPhone') && companySettings?.phone && (
                      <p className="text-gray-600 leading-tight" style={{ fontSize: Math.max(6, 8 * scale) }}>
                        {companySettings.phone}
                      </p>
                    )}
                    {isItemEnabled('companyEmail') && companySettings?.email && (
                      <p className="text-gray-600 leading-tight" style={{ fontSize: Math.max(6, 8 * scale) }}>
                        {companySettings.email}
                      </p>
                    )}
                    {isItemEnabled('qr') ? (
                      portalTokenPending ? (
                        <div className="flex items-center justify-center rounded bg-gray-100" style={{ width: Math.round(80 * scale), height: Math.round(80 * scale) }}>
                          <Loader2 className="animate-spin text-gray-400" style={{ width: Math.round(16 * scale), height: Math.round(16 * scale) }} />
                        </div>
                      ) : (
                        <QRCodeSVG value={qrValue} size={Math.round(80 * scale)} />
                      )
                    ) : null}
                    {isItemEnabled('eqName') && (
                      <>
                        <p className="text-gray-500 leading-tight" style={{ fontSize: Math.max(5, 8 * scale) }}>{tfc.detailDialogLabelItemEqName}</p>
                        <p className="font-bold text-black leading-tight" style={{ fontSize: Math.max(7, 12 * scale) }}>{equipment.name}</p>
                      </>
                    )}
                    {isItemEnabled('identifier') && equipment.identifier && (
                      <>
                        <p className="text-gray-500 leading-tight" style={{ fontSize: Math.max(5, 8 * scale) }}>{tfc.detailDialogLabelItemIdentifier}</p>
                        <p className="font-bold text-black leading-tight" style={{ fontSize: Math.max(6, 10 * scale) }}>{equipment.identifier}</p>
                      </>
                    )}
                    {isItemEnabled('brand') && equipment.brand && (
                      <p className="text-gray-600 leading-tight" style={{ fontSize: Math.max(5, 8 * scale) }}>{equipment.brand}</p>
                    )}
                    {isItemEnabled('model') && equipment.model && (
                      <p className="text-gray-600 leading-tight" style={{ fontSize: Math.max(5, 8 * scale) }}>{equipment.model}</p>
                    )}
                    {isItemEnabled('serial') && equipment.serial_number && (
                      <p className="text-gray-600 leading-tight" style={{ fontSize: Math.max(5, 8 * scale) }}>{equipment.serial_number}</p>
                    )}
                    {isItemEnabled('location') && equipment.location && (
                      <p className="text-gray-600 leading-tight" style={{ fontSize: Math.max(5, 8 * scale) }}>{equipment.location}</p>
                    )}
                    {isItemEnabled('customer') && equipment.customer?.name && (
                      <p className="text-gray-600 leading-tight" style={{ fontSize: Math.max(5, 8 * scale) }}>{equipment.customer.name}</p>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Ação */}
          <div className="flex justify-end">
            <Button onClick={handleDownloadLabel}>
              <Download className="mr-2 h-4 w-4" />
              {tfc.detailDialogLabelDownload}
            </Button>
          </div>
        </div>
      </ResponsiveModal>
    </>
  );
}
