import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, User, Wrench, Calendar, Clock, MapPin, Camera, ClipboardCheck, FileSignature, Check, X, Navigation, Star, Copy, ClipboardList, CheckCircle, RotateCcw, Pause, Play, Pencil, Trash2, Link2 } from 'lucide-react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useIsCompact } from '@/hooks/use-mobile';
import { supabase } from '@/integrations/supabase/client';
import type { ServiceOrder, OsStatus, FormQuestion } from '@/types/database';
import { osStatusLabels, osTypeLabels } from '@/types/database';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { TechnicianDistanceBadge } from './TechnicianDistanceBadge';
import { useServiceRatings } from '@/hooks/useServiceRatings';
import { ImagePreviewModal } from '@/components/ui/ImagePreviewModal';
import { SignedImg } from '@/components/ui/SignedImg';
import { PmocComplianceBadge } from '@/components/pmoc/PmocComplianceBadge';
import { useIsPmocOrder } from '@/hooks/useIsPmocOrder';

interface OSPhoto {
  id: string;
  photo_url: string;
  photo_type: string;
  description: string | null;
}

interface FormResponseData {
  id: string;
  question_id: string;
  response_value: string | null;
  response_photo_url: string | null;
  equipment_id: string | null;
  question: FormQuestion & { template_id?: string };
}

interface EquipmentItem {
  equipment_id: string | null;
  form_template_id: string | null;
  equipment: { id: string; name: string; brand: string | null; model: string | null } | null;
  form_template: { id: string; name: string } | null;
}

interface ServiceOrderViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serviceOrderId: string | null;
  onEdit?: () => void;
  onDelete?: () => void;
  onStatusChange?: (newStatus: OsStatus) => Promise<void> | void;
}

const statusColors: Record<OsStatus, string> = {
  agendada: 'bg-violet-500/10 text-violet-600 border-violet-500',
  pendente: 'bg-warning/10 text-warning border-warning',
  a_caminho: 'bg-indigo-500/10 text-indigo-600 border-indigo-500',
  em_andamento: 'bg-info/10 text-info border-info',
  pausada: 'bg-amber-600/10 text-amber-600 border-amber-600',
  concluida: 'bg-success/10 text-success border-success',
  cancelada: 'bg-destructive/10 text-destructive border-destructive',
};

export function ServiceOrderViewDialog({ open, onOpenChange, serviceOrderId, onEdit, onDelete, onStatusChange }: ServiceOrderViewDialogProps) {
  const navigate = useNavigate();
  const [linkCopied, setLinkCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [serviceOrder, setServiceOrder] = useState<ServiceOrder & { customer: any; equipment: any; form_template: any } | null>(null);
  const [photos, setPhotos] = useState<OSPhoto[]>([]);
  const [formResponses, setFormResponses] = useState<FormResponseData[]>([]);
  const [equipmentItems, setEquipmentItems] = useState<EquipmentItem[]>([]);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const { toast } = useToast();
  const { createRatingToken } = useServiceRatings();
  const isCompact = useIsCompact();
  const { isPmoc: isPmocOrder } = useIsPmocOrder(serviceOrderId);

  const openPreview = (urls: string[], index: number) => {
    setGalleryImages(urls);
    setGalleryIndex(index);
    setPreviewPhoto(urls[index] ?? null);
  };

  const closePreview = () => {
    setPreviewPhoto(null);
    setGalleryImages([]);
    setGalleryIndex(0);
  };

  useEffect(() => {
    if (open && serviceOrderId) fetchData();
  }, [open, serviceOrderId]);

  const fetchData = async () => {
    if (!serviceOrderId) return;
    setLoading(true);
    try {
      const { data: osData, error: osError } = await supabase
        .from('service_orders')
        .select(`*, customer:customers(id, name, phone, address, city, state), equipment:equipment(id, name, brand, model, serial_number), form_template:form_templates(id, name)`)
        .eq('id', serviceOrderId).single();
      if (osError) throw osError;
      // Use snapshot as fallback when live joins return null (e.g. deleted customer/equipment)
      const snapshot = (osData as any).snapshot_data;
      const enriched = {
        ...osData,
        customer: osData.customer || snapshot?.customer || null,
        equipment: osData.equipment || snapshot?.equipment || null,
        form_template: osData.form_template || snapshot?.form_template || null,
      };
      setServiceOrder(enriched as any);
      const { data: photosData } = await supabase.from('os_photos').select('*').eq('service_order_id', serviceOrderId).order('created_at', { ascending: true });
      setPhotos(photosData || []);

      // Load equipment_items junction (one row per equipment+template — same equip can repeat)
      const { data: eqItemsData } = await supabase
        .from('service_order_equipment')
        .select(`
          equipment_id,
          form_template_id,
          equipment:equipment(id, name, brand, model),
          form_template:form_templates(id, name)
        `)
        .eq('service_order_id', serviceOrderId);
      const unwrap = (v: any) => Array.isArray(v) ? (v[0] || null) : v;
      const normalizedEqItems = ((eqItemsData || []) as any[]).map(item => ({
        ...item,
        equipment: unwrap(item.equipment),
        form_template: unwrap(item.form_template),
      })) as EquipmentItem[];
      setEquipmentItems(normalizedEqItems);

      // Always load responses (junction or legacy)
      const hasAnyTemplate = normalizedEqItems.some(i => i.form_template_id) || !!osData.form_template_id;
      if (hasAnyTemplate) {
        const { data: responsesData } = await supabase
          .from('form_responses')
          .select(`id, question_id, response_value, response_photo_url, equipment_id, question:form_questions(*)`)
          .eq('service_order_id', serviceOrderId);
        const normalized = ((responsesData || []) as any[]).map(r => ({
          ...r,
          question: unwrap(r.question),
        }));
        const sorted = normalized.sort((a: any, b: any) => (a.question?.position ?? 0) - (b.question?.position ?? 0));
        setFormResponses(sorted as any);
      } else {
        setFormResponses([]);
      }
    } catch (error) { console.error('Error fetching OS data:', error); }
    finally { setLoading(false); }
  };

  const formatCurrency = (value: number | null) => {
    if (!value) return '-';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  if (!open) return null;

  const content = loading ? (
    <div className="p-6 space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  ) : serviceOrder ? (
    <div className="space-y-4">
      {isPmocOrder && (
        <PmocComplianceBadge variant="ribbon" withTooltip />
      )}
      {/* Onda D v1.9.x — Card de Conformidade PMOC.
          Aparece quando OS é PMOC e o técnico já classificou a OS no fechamento. */}
      {isPmocOrder && serviceOrder.pmoc_conformity_status && (() => {
        const status = serviceOrder.pmoc_conformity_status as
          | 'conforme'
          | 'parcial'
          | 'nao_conforme';
        const notes = serviceOrder.pmoc_conformity_notes;
        const CONFORMITY_LABEL = {
          conforme: 'Conforme',
          parcial: 'Parcial',
          nao_conforme: 'Não-conforme',
        } as const;
        const CONFORMITY_VARIANT = {
          conforme: 'success',
          parcial: 'warning',
          nao_conforme: 'destructive',
        } as const;
        const CONFORMITY_BORDER = {
          conforme: 'border-success/40 bg-success/5',
          parcial: 'border-warning/40 bg-warning/5',
          nao_conforme: 'border-destructive/40 bg-destructive/5',
        } as const;
        return (
          <Card className={CONFORMITY_BORDER[status]}>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">Conformidade PMOC</h4>
                <Badge variant={CONFORMITY_VARIANT[status]}>
                  {CONFORMITY_LABEL[status]}
                </Badge>
              </div>
              {notes && (
                <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                  {notes}
                </p>
              )}
            </CardContent>
          </Card>
        );
      })()}
      <div className="flex items-center gap-4 text-sm">
        <Badge variant="secondary">{osTypeLabels[serviceOrder.os_type]}</Badge>
        {serviceOrder.scheduled_date && (
          <span className="flex items-center gap-1 text-muted-foreground">
            <Calendar className="h-3 w-3" />
            {format(new Date(serviceOrder.scheduled_date), 'dd/MM/yyyy', { locale: ptBR })}
            {serviceOrder.scheduled_time && ` às ${serviceOrder.scheduled_time.slice(0, 5)}`}
          </span>
        )}
      </div>

      <Card>
        <CardHeader className="py-3"><CardTitle className="text-sm flex items-center gap-2"><User className="h-4 w-4" /> Cliente</CardTitle></CardHeader>
        <CardContent className="pt-0 text-sm">
          <p className="font-medium">{serviceOrder.customer?.name}</p>
          {serviceOrder.customer?.phone && <p className="text-muted-foreground">{serviceOrder.customer.phone}</p>}
          {serviceOrder.customer?.address && <p className="text-muted-foreground">{serviceOrder.customer.address}{serviceOrder.customer.city && `, ${serviceOrder.customer.city}`}</p>}
        </CardContent>
      </Card>

      {serviceOrder.equipment && (
        <Card>
          <CardHeader className="py-3"><CardTitle className="text-sm flex items-center gap-2"><Wrench className="h-4 w-4" /> Equipamento</CardTitle></CardHeader>
          <CardContent className="pt-0 text-sm">
            <p className="font-medium">{serviceOrder.equipment.name}</p>
            <p className="text-muted-foreground">{serviceOrder.equipment.brand} {serviceOrder.equipment.model}</p>
            {serviceOrder.equipment.serial_number && <p className="text-muted-foreground text-xs">S/N: {serviceOrder.equipment.serial_number}</p>}
          </CardContent>
        </Card>
      )}

      {serviceOrder.technician_id && serviceOrder.status !== 'concluida' && serviceOrder.status !== 'cancelada' && (
        <TechnicianDistanceBadge technicianId={serviceOrder.technician_id} customer={serviceOrder.customer} />
      )}

      {(serviceOrder.check_in_time || serviceOrder.check_out_time) && (
        <Card>
          <CardHeader className="py-3"><CardTitle className="text-sm flex items-center gap-2"><Clock className="h-4 w-4" /> Check-in / Check-out</CardTitle></CardHeader>
          <CardContent className="pt-0 text-sm space-y-1">
            {serviceOrder.check_in_time && <p><strong>Check-in:</strong> {format(new Date(serviceOrder.check_in_time), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>}
            {serviceOrder.check_out_time && <p><strong>Check-out:</strong> {format(new Date(serviceOrder.check_out_time), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>}
          </CardContent>
        </Card>
      )}

      {photos.length > 0 && (
        <Card>
          <CardHeader className="py-3"><CardTitle className="text-sm flex items-center gap-2"><Camera className="h-4 w-4" /> Fotos ({photos.length})</CardTitle></CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-3 gap-2">
              {photos.map((photo, idx) => {
                const urls = photos.map((p) => p.photo_url);
                return (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() => openPreview(urls, idx)}
                    className="relative aspect-square rounded-lg overflow-hidden bg-muted hover:opacity-80 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <SignedImg src={photo.photo_url} alt={photo.photo_type} className="w-full h-full object-cover" />
                    <Badge variant="secondary" className="absolute bottom-1 left-1 text-[10px] capitalize">{photo.photo_type}</Badge>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {formResponses.length > 0 && (() => {
        // Render one card per equipment_items row (equip+template).
        // Fallback: when no junction rows, fall back to legacy single template.
        const renderResponse = (response: FormResponseData) => {
          const hasTextValue = response.response_value && response.response_value.trim() !== '' && response.response_value.trim() !== '-';
          const hasPhoto = !!response.response_photo_url;
          return (
            <div key={response.id} className="text-sm border-b last:border-0 pb-2 last:pb-0">
              <p className="font-medium text-muted-foreground">{response.question?.question}</p>
              {response.question?.question_type === 'boolean' ? (
                <Badge variant={response.response_value === 'true' ? 'success' : 'destructive'} className="mt-1 gap-1">
                  {response.response_value === 'true' ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                  {response.response_value === 'true' ? 'Sim' : 'Não'}
                </Badge>
              ) : (
                <div className="space-y-1 mt-1">
                  {hasTextValue && <p>{response.response_value}</p>}
                  {hasPhoto && (() => {
                    const urls = response.response_photo_url!
                      .split(',')
                      .map((u) => u.trim())
                      .filter(Boolean);
                    return (
                      <div className="flex flex-wrap gap-2">
                        {urls.map((url, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => openPreview(urls, i)}
                            className="rounded-lg overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-primary hover:opacity-80 transition-opacity"
                          >
                            <SignedImg src={url} alt="Resposta" className="w-24 h-24 object-cover rounded-lg mt-1" />
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                  {!hasTextValue && !hasPhoto && <p>-</p>}
                </div>
              )}
            </div>
          );
        };

        const itemsWithTemplate = equipmentItems.filter(i => i.form_template_id);

        if (itemsWithTemplate.length > 0) {
          return (
            <div className="space-y-3">
              {itemsWithTemplate.map((item, idx) => {
                // Filter responses by template_id; when also have equipment_id, scope further
                const itemResponses = formResponses.filter(r => {
                  if (r.question?.template_id !== item.form_template_id) return false;
                  if (item.equipment_id) return r.equipment_id === item.equipment_id;
                  return !r.equipment_id;
                });
                if (itemResponses.length === 0) return null;
                const cardKey = `${item.equipment_id || 'standalone'}::${item.form_template_id}::${idx}`;
                const titleParts: string[] = [];
                if (item.equipment?.name) titleParts.push(item.equipment.name);
                if (item.form_template?.name) titleParts.push(item.form_template.name);
                const title = titleParts.join(' — ') || 'Questionário';
                return (
                  <Card key={cardKey}>
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <ClipboardCheck className="h-4 w-4" /> {title}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-3">
                      {itemResponses.map(renderResponse)}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          );
        }

        // Legacy fallback: single template on the OS, no junction rows
        return (
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4" /> Questionário: {serviceOrder.form_template?.name}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              {formResponses.map(renderResponse)}
            </CardContent>
          </Card>
        );
      })()}

      {(serviceOrder.diagnosis || serviceOrder.solution || serviceOrder.notes) && (
        <Card>
          <CardHeader className="py-3"><CardTitle className="text-sm flex items-center gap-2"><FileSignature className="h-4 w-4" /> Detalhes do Serviço</CardTitle></CardHeader>
          <CardContent className="pt-0 space-y-3 text-sm">
            {serviceOrder.diagnosis && <div><p className="font-medium text-muted-foreground">Diagnóstico</p><p>{serviceOrder.diagnosis}</p></div>}
            {serviceOrder.solution && <div><p className="font-medium text-muted-foreground">Solução Aplicada</p><p>{serviceOrder.solution}</p></div>}
            {serviceOrder.notes && <div><p className="font-medium text-muted-foreground">Observações</p><p>{serviceOrder.notes}</p></div>}
          </CardContent>
        </Card>
      )}

      {(serviceOrder.labor_value || serviceOrder.parts_value || serviceOrder.total_value) && (
        <Card>
          <CardContent className="py-3">
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Mão de Obra</span><span>{formatCurrency(serviceOrder.labor_value)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Peças</span><span>{formatCurrency(serviceOrder.parts_value)}</span></div>
            <Separator className="my-2" />
            <div className="flex justify-between font-medium"><span>Total</span><span>{formatCurrency(serviceOrder.total_value)}</span></div>
          </CardContent>
        </Card>
      )}

      {/* Ações da OS — pattern app nativo: grid de ícones compactos + CTA primário */}
      {(() => {
        type ActionTone = 'success' | 'warning' | 'edit' | 'destructive' | 'primary' | 'default';
        const actions: Array<{
          key: string;
          icon: typeof Pause;
          label: string;
          tone?: ActionTone;
          onClick: () => void | Promise<void>;
        }> = [];

        if (onStatusChange && serviceOrder.status === 'pausada') {
          actions.push({ key: 'resume', icon: Play, label: 'Retomar', tone: 'primary', onClick: async () => { await onStatusChange('em_andamento'); onOpenChange(false); } });
        }
        if (onStatusChange && (serviceOrder.status === 'em_andamento' || serviceOrder.status === 'a_caminho')) {
          actions.push({ key: 'pause', icon: Pause, label: 'Pausar', tone: 'warning', onClick: async () => { await onStatusChange('pausada'); onOpenChange(false); } });
        }
        if (onStatusChange && serviceOrder.status !== 'concluida' && serviceOrder.status !== 'cancelada') {
          actions.push({ key: 'finalize', icon: CheckCircle, label: 'Finalizar', tone: 'success', onClick: async () => { await onStatusChange('concluida'); onOpenChange(false); } });
        }
        if (onStatusChange && serviceOrder.status === 'concluida') {
          actions.push({ key: 'reopen', icon: RotateCcw, label: 'Reabrir', tone: 'warning', onClick: async () => { await onStatusChange('em_andamento'); onOpenChange(false); } });
        }
        if (onEdit) {
          actions.push({ key: 'edit', icon: Pencil, label: 'Editar', tone: 'edit', onClick: () => { onOpenChange(false); onEdit(); } });
        }
        if (onDelete) {
          actions.push({ key: 'delete', icon: Trash2, label: 'Excluir', tone: 'destructive', onClick: () => { onOpenChange(false); onDelete(); } });
        }
        if (serviceOrder.customer_id) {
          actions.push({
            key: 'tracking-link',
            icon: linkCopied ? Check : Link2,
            label: linkCopied ? 'Copiado!' : 'Link OS',
            onClick: async () => {
              const url = `${window.location.origin}/acompanhamento/${serviceOrder.id}`;
              await navigator.clipboard.writeText(url);
              setLinkCopied(true);
              toast({ title: 'Link copiado!' });
              setTimeout(() => setLinkCopied(false), 2000);
            }
          });
        }
        if (serviceOrder.status === 'concluida') {
          actions.push({
            key: 'rating-link',
            icon: Star,
            label: 'Avaliação',
            onClick: async () => {
              const result = await createRatingToken.mutateAsync(serviceOrder.id);
              if (result?.token) {
                const url = `${window.location.origin}/avaliacao/${result.token}`;
                await navigator.clipboard.writeText(url);
                toast({ title: 'Link de avaliação copiado!' });
              }
            }
          });
        }

        // Tema claro: fundo branco + ícone saturado + borda sutil colorida.
        // Tema escuro: fundo dessaturado colorido (pattern original).
        const toneClasses: Record<ActionTone, string> = {
          success: 'bg-background border border-success/30 text-success dark:bg-success/10 dark:border-transparent',
          warning: 'bg-background border border-warning/30 text-warning dark:bg-warning/10 dark:border-transparent',
          edit: 'bg-background border border-warning/30 text-warning dark:bg-warning/10 dark:border-transparent',
          destructive: 'bg-background border border-destructive/30 text-destructive dark:bg-destructive/10 dark:border-transparent',
          primary: 'bg-background border border-primary/30 text-primary dark:bg-primary/10 dark:border-transparent',
          default: 'bg-background border border-border text-foreground dark:bg-muted dark:border-transparent',
        };

        const hasPrimaryCta = serviceOrder.status !== 'cancelada';

        if (actions.length === 0 && !hasPrimaryCta) return null;

        return (
          <div className="pt-3 mt-2 border-t space-y-3">
            {actions.length > 0 && (
              <div className="grid grid-cols-4 gap-1.5">
                {actions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <button
                      key={action.key}
                      type="button"
                      onClick={action.onClick}
                      className="flex flex-col items-center gap-1.5 p-2 rounded-xl hover:bg-muted/60 active:bg-muted active:scale-95 transition"
                    >
                      <span className={`flex h-11 w-11 items-center justify-center rounded-full ${toneClasses[action.tone || 'default']}`}>
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="text-[10px] text-muted-foreground leading-none text-center truncate max-w-full">
                        {action.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {hasPrimaryCta && (
              <Button
                className="w-full h-12 text-base"
                onClick={() => { onOpenChange(false); navigate(`/os-tecnico/${serviceOrder.id}`); }}
              >
                <ClipboardList className="h-5 w-5 mr-2" />
                {serviceOrder.status === 'concluida' ? 'Relatório de Serviço' : 'Preencher OS'}
              </Button>
            )}
          </div>
        );
      })()}
    </div>
  ) : (
    <div className="p-6 text-center text-muted-foreground">OS não encontrada</div>
  );

  const title = serviceOrder ? (
    <span className="flex items-center gap-3">
      <Eye className="h-5 w-5" />
      OS #{String(serviceOrder.order_number).padStart(6, '0')}
      <Badge variant="outline" className={`${statusColors[serviceOrder.status]} border ml-auto`}>
        {osStatusLabels[serviceOrder.status]}
      </Badge>
    </span>
  ) : 'Detalhes da OS';

  const previewModal = (
    <ImagePreviewModal
      src={previewPhoto || ''}
      alt="Foto"
      open={!!previewPhoto}
      onClose={closePreview}
      images={galleryImages.length > 1 ? galleryImages : undefined}
      currentIndex={galleryIndex}
      onNavigate={(i) => {
        setGalleryIndex(i);
        setPreviewPhoto(galleryImages[i] ?? null);
      }}
    />
  );

  if (isCompact) {
    return (
      <>
        <Drawer open={open} onOpenChange={onOpenChange}>
          <DrawerContent className="max-h-[90dvh]">
            <DrawerHeader><DrawerTitle>{title}</DrawerTitle></DrawerHeader>
            <div className="px-4 pb-6 overflow-y-auto" style={{ maxHeight: 'calc(90dvh - 80px)' }}>{content}</div>
          </DrawerContent>
        </Drawer>
        {previewModal}
      </>
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] p-0">
          <DialogHeader className="p-6 pb-0"><DialogTitle>{title}</DialogTitle></DialogHeader>
          <ScrollArea className="max-h-[calc(90vh-80px)]">
            <div className="p-6 pt-4">{content}</div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
      {previewModal}
    </>
  );
}
