import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { 
  ClipboardList, 
  MapPin, 
  Clock, 
  User, 
  Phone,
  Play,
  ClipboardCheck,
  PenTool,
  CheckCircle2,
  ArrowLeft,
  Calendar,
  Building2,
  Eye,
  Loader2,
  Navigation,
  Camera,
  Link2,
  Check,
  MapPinned,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { DynamicFormQuestions, type FormValidationResult } from '@/components/technician/DynamicFormQuestions';
import { SignaturePad } from '@/components/SignaturePad';
import { useGeoTracking, recordLocationEvent } from '@/hooks/useTechnicianLocations';
import { OSReport } from '@/components/technician/OSReport';
import type { ServiceOrder, OsStatus } from '@/types/database';
import { PublicTrackingMap } from '@/components/schedule/PublicTrackingMap';
import { osStatusLabels, osTypeLabels } from '@/types/database';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { buildServiceOrderShareLink } from '@/utils/shareLinks';
import { ImagePreviewModal } from '@/components/ui/ImagePreviewModal';

interface OSPhoto {
  id: string;
  photo_url: string;
  photo_type: string;
  description: string | null;
  created_at: string;
}

interface EquipmentItem {
  equipment_id: string;
  form_template_id: string | null;
  equipment: { id: string; name: string; brand: string | null; model: string | null; location: string | null; photo_url: string | null } | null;
  form_template: { id: string; name: string } | null;
}

export default function TechnicianOS() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const forceReadOnly = searchParams.get('modo') === 'cliente';
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [serviceOrder, setServiceOrder] = useState<(ServiceOrder & { customer: any; equipment: any; form_template?: any }) | null>(null);
  const [photos, setPhotos] = useState<OSPhoto[]>([]);
  const [company, setCompany] = useState<any>(null);
  const [equipmentItems, setEquipmentItems] = useState<EquipmentItem[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [publicFormResponses, setPublicFormResponses] = useState<any[]>([]);

  const [checkInTime, setCheckInTime] = useState<string | null>(null);
  const [checkOutTime, setCheckOutTime] = useState<string | null>(null);
  const [checkInLocation, setCheckInLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [checkOutLocation, setCheckOutLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [trackingLinkCopied, setTrackingLinkCopied] = useState(false);
  
  const [formValidations, setFormValidations] = useState<Record<string, FormValidationResult>>({});
  
  const allFormsValid = Object.values(formValidations).every(v => v.isValid);
  const allMissingQuestions = Object.values(formValidations).flatMap(v => v.missingQuestions);
  
  const [techSignature, setTechSignature] = useState<string | null>(null);
  const [clientSignature, setClientSignature] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);

  // Check if user is authenticated
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setIsAuthenticated(forceReadOnly ? false : !!data.user);
    });
  }, [forceReadOnly]);

  useEffect(() => {
    if (id) {
      fetchServiceOrder();
      fetchPhotos();
      fetchCompany();
      fetchEquipmentItems();
      fetchFormResponses();
    }
    return () => {
      // Restore original primary color on unmount
      document.documentElement.style.removeProperty('--primary');
      document.documentElement.style.removeProperty('--ring');
    };
  }, [id]);

  const fetchFormResponses = async () => {
    if (!id) return;
    const { data } = await supabase
      .from('form_responses')
      .select('id, question_id, response_value, response_photo_url, question:form_questions(id, question, question_type, options, description, position, template_id)')
      .eq('service_order_id', id);
    if (data) setPublicFormResponses(data as any[]);
  };

  // Realtime subscription for public (non-authenticated) viewers
  useEffect(() => {
    if (!id || isAuthenticated !== false) return;

    const channel = supabase
      .channel(`os-realtime-${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'service_orders', filter: `id=eq.${id}` },
        () => { fetchServiceOrder(); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'form_responses', filter: `service_order_id=eq.${id}` },
        () => { fetchFormResponses(); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'os_photos', filter: `service_order_id=eq.${id}` },
        () => { fetchPhotos(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [id, isAuthenticated]);

  const fetchEquipmentItems = async () => {
    try {
      const { data, error } = await supabase
        .from('service_order_equipment')
        .select(`
          equipment_id,
          form_template_id,
          equipment:equipment(id, name, brand, model, location, photo_url),
          form_template:form_templates(id, name)
        `)
        .eq('service_order_id', id);
      
      if (error) throw error;
      setEquipmentItems((data || []) as unknown as EquipmentItem[]);
    } catch (error) {
      console.error('Error fetching equipment items:', error);
    }
  };

  const fetchCompany = async () => {
    const { data } = await supabase.from('company_settings').select('*').limit(1).single();
    if (data) {
      setCompany(data);

      // Apply white label primary color to CSS custom property for this page
      if (data.white_label_enabled && data.white_label_primary_color) {
        const hex = data.white_label_primary_color;
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        if (result) {
          let r = parseInt(result[1], 16) / 255;
          let g = parseInt(result[2], 16) / 255;
          let b = parseInt(result[3], 16) / 255;
          const max = Math.max(r, g, b), min = Math.min(r, g, b);
          let h = 0, s = 0, l = (max + min) / 2;
          if (max !== min) {
            const d2 = max - min;
            s = l > 0.5 ? d2 / (2 - max - min) : d2 / (max + min);
            switch (max) {
              case r: h = ((g - b) / d2 + (g < b ? 6 : 0)) / 6; break;
              case g: h = ((b - r) / d2 + 2) / 6; break;
              case b: h = ((r - g) / d2 + 4) / 6; break;
            }
          }
          const hsl = `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
          document.documentElement.style.setProperty('--primary', hsl);
          document.documentElement.style.setProperty('--ring', hsl);
        }
      }
    }
  };

  const fetchServiceOrder = async () => {
    try {
      const { data, error } = await supabase
        .from('service_orders')
        .select(`
          *,
          customer:customers(id, name, phone, address, city, state, document, photo_url),
          equipment:equipment(id, name, brand, model, serial_number, location, capacity),
          form_template:form_templates(id, name),
          service_type:service_types(id, name, color)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      
      setServiceOrder(data as any);
      setCheckInTime(data.check_in_time);
      setCheckOutTime(data.check_out_time);
      setCheckInLocation(data.check_in_location as any);
      setCheckOutLocation(data.check_out_location as any);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar OS',
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchPhotos = async () => {
    try {
      const { data, error } = await supabase
        .from('os_photos')
        .select('*')
        .eq('service_order_id', id)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setPhotos(data || []);
    } catch (error: any) {
      console.error('Error fetching photos:', error);
    }
  };

  const getCurrentLocation = (): Promise<{ lat: number; lng: number }> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocalização não suportada'));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        (error) => reject(error),
        { enableHighAccuracy: true }
      );
    });
  };

  // Periodic geo tracking while OS is em_andamento or a_caminho
  const isTracking = (serviceOrder?.status === 'em_andamento' || serviceOrder?.status === 'a_caminho') && isAuthenticated === true;
  useGeoTracking(id, isTracking);

  const handleCheckIn = async () => {
    try {
      const location = await getCurrentLocation();
      const now = new Date().toISOString();
      
      const { error } = await supabase
        .from('service_orders')
        .update({
          check_in_time: now,
          check_in_location: location,
          status: 'em_andamento',
        })
        .eq('id', id);

      if (error) throw error;

      if (id) {
        recordLocationEvent(id, location.lat, location.lng, 'check_in');
      }

      setCheckInTime(now);
      setCheckInLocation(location);
      setServiceOrder((prev) => prev ? { ...prev, status: 'em_andamento' as OsStatus, check_in_time: now } : null);
      
      toast({ title: 'Check-in realizado com sucesso!' });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Erro no check-in',
        description: error.message,
      });
    }
  };

  const handleFinishOS = async () => {
    if (!allFormsValid) {
      toast({
        variant: 'destructive',
        title: 'Campos obrigatórios pendentes',
        description: `Preencha os campos: ${allMissingQuestions.slice(0, 3).join(', ')}${allMissingQuestions.length > 3 ? '...' : ''}`,
      });
      return;
    }

    if ((serviceOrder as any)?.require_tech_signature && !techSignature) {
      toast({ variant: 'destructive', title: 'Assinatura do técnico obrigatória' });
      return;
    }
    if ((serviceOrder as any)?.require_client_signature && !clientSignature) {
      toast({ variant: 'destructive', title: 'Assinatura do cliente obrigatória' });
      return;
    }

    setFinishing(true);
    try {
      const location = await getCurrentLocation();
      const now = new Date().toISOString();
      
      const updateData: any = {
        check_out_time: now,
        check_out_location: location,
        status: 'concluida',
      };
      if (techSignature) updateData.tech_signature = techSignature;
      if (clientSignature) updateData.client_signature = clientSignature;

      const { error } = await supabase
        .from('service_orders')
        .update(updateData)
        .eq('id', id);

      if (error) throw error;

      if (id) {
        recordLocationEvent(id, location.lat, location.lng, 'check_out');
      }

      setCheckOutTime(now);
      setCheckOutLocation(location);
      setServiceOrder((prev) => prev ? { ...prev, status: 'concluida' as OsStatus, check_out_time: now } : null);
      
      toast({ title: 'OS finalizada com sucesso!' });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Erro ao finalizar OS',
        description: error.message,
      });
    } finally {
      setFinishing(false);
    }
  };

  if (loading || isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-background p-4 space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!serviceOrder) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <ClipboardList className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">OS não encontrada</h2>
            <p className="text-muted-foreground">Verifique o link e tente novamente.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const statusBadgeVariant: Record<OsStatus, 'warning' | 'info' | 'success' | 'destructive'> = {
    agendada: 'info',
    pendente: 'warning',
    a_caminho: 'info',
    em_andamento: 'info',
    concluida: 'success',
    cancelada: 'destructive',
  };

  // Show report mode for completed OS
  if (serviceOrder.status === 'concluida') {
    return (
      <div className="min-h-screen bg-background">
        <div className="z-10 bg-primary text-primary-foreground p-3 sm:p-4 shadow-lg print:hidden">
          <div className="max-w-2xl mx-auto flex items-center gap-3">
            <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-primary-foreground/10" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1 min-w-0">
              <h1 className="text-base sm:text-lg font-bold truncate">OS #{String(serviceOrder.order_number).padStart(6, '0')}</h1>
              <p className="text-xs sm:text-sm opacity-90">Relatório de Serviço</p>
            </div>
            <Badge variant={statusBadgeVariant[serviceOrder.status]}>
              {osStatusLabels[serviceOrder.status]}
            </Badge>
          </div>
        </div>
        <div className="max-w-2xl mx-auto p-3 sm:p-4">
          <OSReport serviceOrder={serviceOrder} photos={photos} />
        </div>
      </div>
    );
  }

  // PUBLIC READ-ONLY MODE for non-authenticated users
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background">
        <div className="bg-primary text-primary-foreground">
          <div className="max-w-2xl mx-auto p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3 mb-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {company?.logo_url ? (
                    <img src={company.logo_url} alt="Logo" className="h-10 w-10 sm:h-12 sm:w-12 rounded object-contain bg-white p-1 shrink-0" />
                  ) : (
                    <Building2 className="h-5 w-5 opacity-70 shrink-0" />
                  )}
                  <span className="text-sm opacity-80 truncate">{company?.name || ''}</span>
                </div>
              </div>
              <Badge variant={statusBadgeVariant[serviceOrder.status]} className="shrink-0">
                {osStatusLabels[serviceOrder.status]}
              </Badge>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-1">
              <div>
                <h1 className="text-lg sm:text-xl font-bold">OS #{String(serviceOrder.order_number).padStart(6, '0')}</h1>
                <p className="text-xs sm:text-sm opacity-80">{osTypeLabels[serviceOrder.os_type]}</p>
              </div>
              {serviceOrder.scheduled_date && (
                <div className="flex items-center gap-1.5 text-xs sm:text-sm opacity-80">
                  <Calendar className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    {format(new Date(serviceOrder.scheduled_date + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR })}
                    {serviceOrder.scheduled_time && ` ${String(serviceOrder.scheduled_time).slice(0, 5)}`}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="max-w-2xl mx-auto p-3 sm:p-4 space-y-3 sm:space-y-4">
          {/* Realtime indicator */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
            <Eye className="h-4 w-4 text-primary shrink-0" />
            <span>Acompanhamento em tempo real</span>
            <span className="relative flex h-2 w-2 ml-auto">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
          </div>

          {/* Check-in timestamp */}
          {checkInTime && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="text-xs sm:text-sm">
                  Check-in: {format(new Date(checkInTime), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </span>
              </div>
            </div>
          )}

          {/* Client Info */}
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2 mb-2">
                <User className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Cliente</span>
              </div>
              <p className="font-semibold break-words">{serviceOrder.customer?.name}</p>
              {serviceOrder.customer?.phone && (
                <p className="text-sm text-muted-foreground mt-0.5">{serviceOrder.customer.phone}</p>
              )}
            </CardContent>
          </Card>

          {/* Description */}
          {serviceOrder.description && (
            <Card>
              <CardContent className="p-3 sm:p-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Descrição do Serviço</p>
                <p className="text-sm break-words">{serviceOrder.description}</p>
              </CardContent>
            </Card>
          )}

          {/* Equipment list - read only */}
          {equipmentItems.length > 0 && (
            <Card>
              <CardContent className="p-3 sm:p-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Equipamentos</p>
                <div className="space-y-2">
                  {equipmentItems.map(item => item.equipment && (
                    <div key={item.equipment_id} className="text-sm">
                      <p className="font-medium">{item.equipment.name}</p>
                      {item.equipment.brand && <p className="text-muted-foreground text-xs">{item.equipment.brand} {item.equipment.model}</p>}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Status info */}
          <Card>
            <CardContent className="p-3 sm:p-4 text-center">
              <Badge variant={statusBadgeVariant[serviceOrder.status]} className="text-base px-4 py-1">
                {osStatusLabels[serviceOrder.status]}
              </Badge>
              <p className="text-sm text-muted-foreground mt-2">
                {serviceOrder.status === 'pendente' && 'Aguardando início do atendimento'}
                {serviceOrder.status === 'a_caminho' && 'Técnico a caminho...'}
                {serviceOrder.status === 'em_andamento' && 'Técnico em atendimento...'}
                {serviceOrder.status === 'cancelada' && 'Esta OS foi cancelada'}
              </p>
            </CardContent>
          </Card>

          {/* Live tracking map for public viewers when a_caminho */}
          {serviceOrder.status === 'a_caminho' && (
            <PublicTrackingMap serviceOrderId={serviceOrder.id} />
          )}

          {/* Real-time questionnaire responses grouped by equipment */}
          {publicFormResponses.length > 0 && (() => {
            // Group responses by equipment using template_id mapping
            const templateToEquipment = new Map<string, EquipmentItem>();
            equipmentItems.forEach(item => {
              if (item.form_template_id) {
                templateToEquipment.set(item.form_template_id, item);
              }
            });

            // Group responses by template_id
            const groupedByTemplate = new Map<string, { equipment: EquipmentItem | null; responses: typeof publicFormResponses; totalQuestions: number }>();
            
            publicFormResponses.forEach(r => {
              const templateId = r.question?.template_id || 'unknown';
              if (!groupedByTemplate.has(templateId)) {
                groupedByTemplate.set(templateId, {
                  equipment: templateToEquipment.get(templateId) || null,
                  responses: [],
                  totalQuestions: 0,
                });
              }
              groupedByTemplate.get(templateId)!.responses.push(r);
            });

            // Count total questions per template and answered
            groupedByTemplate.forEach((group) => {
              group.totalQuestions = group.responses.length;
            });

            const groups = Array.from(groupedByTemplate.entries());
            const hasMultipleGroups = groups.length > 1 && groups.some(([, g]) => g.equipment);

            if (hasMultipleGroups) {
              return (
                <Card>
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <ClipboardCheck className="h-4 w-4 text-primary" />
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Questionários</span>
                    </div>
                    <Accordion type="multiple" className="w-full">
                      {groups.map(([templateId, group]) => {
                        const answered = group.responses.filter(r => r.response_value || r.response_photo_url).length;
                        const total = group.totalQuestions;
                        const isComplete = answered === total && total > 0;
                        const pending = total - answered;
                        return (
                          <AccordionItem key={templateId} value={templateId} className="border-b last:border-0">
                            <AccordionTrigger className="hover:no-underline py-3 gap-2">
                              <div className="flex items-center gap-3 flex-1 min-w-0 text-left">
                                <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center shrink-0">
                                  <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-sm truncate">
                                    {group.equipment?.equipment?.name || 'Questionário'}
                                  </p>
                                  {group.equipment?.equipment?.brand && (
                                    <p className="text-xs text-muted-foreground truncate">
                                      {group.equipment.equipment.brand} {group.equipment.equipment.model}
                                    </p>
                                  )}
                                </div>
                                {isComplete ? (
                                  <Badge variant="success" className="gap-1 shrink-0 text-xs">
                                    <Check className="h-3 w-3" /> {answered}/{total}
                                  </Badge>
                                ) : (
                                  <Badge variant={pending === total ? 'secondary' : 'warning'} className="text-xs shrink-0">
                                    {answered}/{total}
                                  </Badge>
                                )}
                              </div>
                            </AccordionTrigger>
                            <AccordionContent>
                              <div className="space-y-3 pt-1">
                                {group.responses
                                  .sort((a, b) => (a.question?.position || 0) - (b.question?.position || 0))
                                  .map(r => (
                                    <div key={r.id} className="border-b border-border/50 pb-2 last:border-0 last:pb-0">
                                      <p className="text-xs font-medium text-muted-foreground">{r.question?.question || 'Pergunta'}</p>
                                      {r.response_value ? (
                                        <p className="text-sm mt-0.5">
                                          {r.response_value === 'true' ? '✅ Sim' : r.response_value === 'false' ? '❌ Não' : r.response_value.includes('|||') ? (
                                            r.response_value.split('|||').map((v: string, i: number) => (
                                              <Badge key={i} variant="secondary" className="mr-1 mt-1 text-xs">{v}</Badge>
                                            ))
                                          ) : r.response_value}
                                        </p>
                                      ) : (
                                        <p className="text-xs text-muted-foreground/60 mt-0.5 italic">Aguardando resposta...</p>
                                      )}
                                      {r.response_photo_url && (
                                        <img src={r.response_photo_url} alt="" className="mt-1 rounded max-h-32 object-cover" />
                                      )}
                                    </div>
                                  ))}
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        );
                      })}
                    </Accordion>
                  </CardContent>
                </Card>
              );
            }

            // Single template / no equipment grouping - flat view
            return (
              <Card>
                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <ClipboardCheck className="h-4 w-4 text-primary" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Respostas do Questionário</span>
                    {(() => {
                      const answered = publicFormResponses.filter(r => r.response_value || r.response_photo_url).length;
                      const total = publicFormResponses.length;
                      return (
                        <Badge variant={answered === total ? 'success' : 'secondary'} className="text-xs ml-auto">
                          {answered}/{total}
                        </Badge>
                      );
                    })()}
                  </div>
                  <div className="space-y-3">
                    {publicFormResponses
                      .sort((a, b) => (a.question?.position || 0) - (b.question?.position || 0))
                      .map(r => (
                        <div key={r.id} className="border-b border-border/50 pb-2 last:border-0 last:pb-0">
                          <p className="text-xs font-medium text-muted-foreground">{r.question?.question || 'Pergunta'}</p>
                          {r.response_value ? (
                            <p className="text-sm mt-0.5">
                              {r.response_value === 'true' ? '✅ Sim' : r.response_value === 'false' ? '❌ Não' : r.response_value.includes('|||') ? (
                                r.response_value.split('|||').map((v: string, i: number) => (
                                  <Badge key={i} variant="secondary" className="mr-1 mt-1 text-xs">{v}</Badge>
                                ))
                              ) : r.response_value}
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground/60 mt-0.5 italic">Aguardando resposta...</p>
                          )}
                          {r.response_photo_url && (
                            <img src={r.response_photo_url} alt="" className="mt-1 rounded max-h-32 object-cover" />
                          )}
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          {/* Photos */}
          {photos.length > 0 && (
            <Card>
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Camera className="h-4 w-4 text-primary" />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fotos</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {photos.map(photo => (
                    <img key={photo.id} src={photo.photo_url} alt={photo.description || ''} className="rounded-lg object-cover aspect-square w-full" />
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    );
  }

  // AUTHENTICATED MODE - full interactive
  const isCheckedIn = !!checkInTime;
  const isPending = serviceOrder.status === 'pendente' || serviceOrder.status === 'agendada';
  const isACaminho = serviceOrder.status === 'a_caminho';

  const handleEnRoute = async () => {
    try {
      const location = await getCurrentLocation();
      
      // Record location FIRST so the tracking map can find it
      if (id) {
        await recordLocationEvent(id, location.lat, location.lng, 'en_route');
      }

      const { error } = await supabase
        .from('service_orders')
        .update({ status: 'a_caminho' })
        .eq('id', id);

      if (error) throw error;

      setServiceOrder((prev) => prev ? { ...prev, status: 'a_caminho' as OsStatus } : null);
      toast({ title: 'Status atualizado: A Caminho!' });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Erro ao atualizar status',
        description: error.message,
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-primary text-primary-foreground">
        <div className="max-w-2xl mx-auto p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3 mb-3">
            <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-primary-foreground/10 shrink-0" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {company?.logo_url ? (
                  <img src={company.logo_url} alt="Logo" className="h-10 w-10 sm:h-12 sm:w-12 rounded object-contain bg-white p-1 shrink-0" />
                ) : (
                  <Building2 className="h-5 w-5 opacity-70 shrink-0" />
                )}
                <span className="text-sm opacity-80 truncate">{company?.name || ''}</span>
              </div>
            </div>
            <Badge variant={statusBadgeVariant[serviceOrder.status]} className="shrink-0">
              {osStatusLabels[serviceOrder.status]}
            </Badge>
          </div>
          
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-1">
            <div>
              <h1 className="text-lg sm:text-xl font-bold">OS #{String(serviceOrder.order_number).padStart(6, '0')}</h1>
              <p className="text-xs sm:text-sm opacity-80">{osTypeLabels[serviceOrder.os_type]}</p>
            </div>
            {serviceOrder.scheduled_date && (
              <div className="flex items-center gap-1.5 text-xs sm:text-sm opacity-80">
                <Calendar className="h-3.5 w-3.5 shrink-0" />
                <span>
                  {format(new Date(serviceOrder.scheduled_date + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR })}
                  {serviceOrder.scheduled_time && ` ${String(serviceOrder.scheduled_time).slice(0, 5)}`}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-3 sm:p-4 space-y-3 sm:space-y-4">
        {/* Step 1: En Route or Check-in */}
        {(isPending || isACaminho) && (
          <Card className="border-primary/30">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                {isPending ? <Navigation className="h-4 w-4 text-primary" /> : <Play className="h-4 w-4 text-primary" />}
                {isPending ? 'Ir para o Atendimento' : 'Iniciar Atendimento'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {isPending && (
                <>
                  <p className="text-sm text-muted-foreground">
                    Informe ao cliente que você está a caminho ou faça o check-in ao chegar.
                  </p>
                  <Button className="w-full bg-indigo-500 hover:bg-indigo-600 text-white" size="lg" onClick={handleEnRoute}>
                    <Navigation className="h-4 w-4 mr-2" />
                    A Caminho
                  </Button>
                </>
              )}
              {isACaminho && (
                <p className="text-sm text-muted-foreground">
                  Chegou no local? Faça o check-in para iniciar.
                </p>
              )}
              <Button className="w-full" size="lg" onClick={handleCheckIn} variant={isPending ? 'outline' : 'default'}>
                <Play className="h-4 w-4 mr-2" />
                Fazer Check-in
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Check-in timestamp */}
        {isCheckedIn && (
          <div className="space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="text-xs sm:text-sm">
                  Check-in: {format(new Date(checkInTime!), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </span>
              </div>
              {checkInLocation && (
                <span className="text-xs opacity-70 sm:ml-auto flex items-center gap-0.5">
                  <MapPin className="h-3 w-3 shrink-0" />
                  {checkInLocation.lat.toFixed(4)}, {checkInLocation.lng.toFixed(4)}
                </span>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={async () => {
                const link = buildServiceOrderShareLink(id!);
                await navigator.clipboard.writeText(link);
                setTrackingLinkCopied(true);
                toast({ title: 'Link copiado!' });
                setTimeout(() => setTrackingLinkCopied(false), 2000);
              }}
            >
              {trackingLinkCopied ? <Check className="h-3.5 w-3.5 mr-1.5" /> : <Link2 className="h-3.5 w-3.5 mr-1.5" />}
              {trackingLinkCopied ? 'Link copiado!' : 'Copiar link de acompanhamento do cliente'}
            </Button>
          </div>
        )}

        {/* Client Info */}
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center gap-2 mb-2">
              <User className="h-4 w-4 text-primary" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Cliente</span>
            </div>
            <p className="font-semibold break-words">{serviceOrder.customer?.name}</p>
            {serviceOrder.customer?.document && (
              <p className="text-xs text-muted-foreground mt-0.5">{serviceOrder.customer.document}</p>
            )}
            {serviceOrder.customer?.phone && (
              <a href={`tel:${serviceOrder.customer.phone}`} className="flex items-center gap-1.5 text-sm text-primary mt-1">
                <Phone className="h-3 w-3 shrink-0" />
                {serviceOrder.customer.phone}
              </a>
            )}
            {serviceOrder.customer?.address && (
              <p className="text-sm text-muted-foreground flex items-start gap-1.5 mt-1">
                <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                <span className="break-words">
                  {serviceOrder.customer.address}
                  {serviceOrder.customer.city && `, ${serviceOrder.customer.city}`}
                  {serviceOrder.customer.state && ` - ${serviceOrder.customer.state}`}
                </span>
              </p>
            )}
          </CardContent>
        </Card>

        {/* Description & Notes */}
        {serviceOrder.description && (
          <Card>
            <CardContent className="p-3 sm:p-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Descrição do Serviço</p>
              <p className="text-sm break-words">{serviceOrder.description}</p>
            </CardContent>
          </Card>
        )}
        {serviceOrder.notes && (
          <Card>
            <CardContent className="p-3 sm:p-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Observações</p>
              <p className="text-sm break-words">{serviceOrder.notes}</p>
            </CardContent>
          </Card>
        )}

        {/* Questionnaires - Multi equipment from junction table (accordion) */}
        {isCheckedIn && equipmentItems.length > 0 && (
          <Card>
            <CardHeader className="pb-2 px-3 sm:px-6">
              <CardTitle className="flex items-center gap-2 text-base">
                <ClipboardCheck className="h-4 w-4 text-primary shrink-0" />
                Questionários
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 sm:px-6 pb-3">
              <Accordion type="multiple" className="w-full">
                {equipmentItems.map((item) => {
                  if (!item.form_template_id) return null;
                  const validation = formValidations[item.equipment_id];
                  const isComplete = validation && validation.isValid;
                  const pendingCount = validation ? validation.missingQuestions.length : 0;
                  return (
                    <AccordionItem key={item.equipment_id} value={item.equipment_id} className="border-b last:border-0">
                      <AccordionTrigger className="hover:no-underline py-3 gap-2">
                        <div className="flex items-center gap-3 flex-1 min-w-0 text-left">
                          {/* Equipment photo or fallback icon */}
                          {item.equipment?.photo_url ? (
                            <img
                              src={item.equipment.photo_url}
                              alt={item.equipment.name}
                              className="h-10 w-10 rounded-md object-cover shrink-0 cursor-pointer border"
                              onClick={(e) => { e.stopPropagation(); setPreviewPhoto(item.equipment!.photo_url); }}
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-md bg-muted flex items-center justify-center shrink-0">
                              <ClipboardCheck className="h-5 w-5 text-muted-foreground" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">
                              {item.equipment?.name || 'Equipamento'}
                            </p>
                            {item.equipment?.location && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                <MapPinned className="h-3 w-3 shrink-0" />
                                <span className="truncate">{item.equipment.location}</span>
                              </p>
                            )}
                          </div>
                          {/* Completion indicator */}
                          {isComplete ? (
                            <Badge variant="success" className="gap-1 shrink-0">
                              <Check className="h-3 w-3" /> Concluído
                            </Badge>
                          ) : pendingCount > 0 ? (
                            <Badge variant="destructive" className="text-xs shrink-0">
                              {pendingCount} pendente{pendingCount > 1 ? 's' : ''}
                            </Badge>
                          ) : null}
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <DynamicFormQuestions
                          serviceOrderId={id!}
                          templateId={item.form_template_id!}
                          onValidationChange={(result) => setFormValidations(prev => ({ ...prev, [item.equipment_id]: result }))}
                        />
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            </CardContent>
          </Card>
        )}

        {/* Fallback: single questionnaire from OS (legacy / no junction data) */}
        {isCheckedIn && equipmentItems.length === 0 && serviceOrder.form_template_id && (
          <Card>
            <CardHeader className="pb-3 px-3 sm:px-6">
              <CardTitle className="flex items-center gap-2 text-sm sm:text-base flex-wrap">
                <ClipboardCheck className="h-4 w-4 text-primary shrink-0" />
                <span className="break-words">
                  {serviceOrder.equipment ? (
                    <>
                      {serviceOrder.equipment.name}
                      {serviceOrder.equipment.brand && ` — ${serviceOrder.equipment.brand} ${serviceOrder.equipment.model || ''}`}
                    </>
                  ) : (
                    serviceOrder.form_template?.name || 'Checklist'
                  )}
                </span>
                {formValidations['legacy'] && !formValidations['legacy'].isValid && (
                  <Badge variant="destructive" className="text-xs">
                    {formValidations['legacy'].missingQuestions.length} pendente{formValidations['legacy'].missingQuestions.length > 1 ? 's' : ''}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 sm:px-6">
              <DynamicFormQuestions 
                serviceOrderId={id!}
                templateId={serviceOrder.form_template_id}
                onValidationChange={(result) => setFormValidations(prev => ({ ...prev, legacy: result }))}
              />
            </CardContent>
          </Card>
        )}

        {/* Signatures */}
        {isCheckedIn && ((serviceOrder as any)?.require_tech_signature || (serviceOrder as any)?.require_client_signature) && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <PenTool className="h-4 w-4 text-primary" />
                Assinaturas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {(serviceOrder as any)?.require_tech_signature && (
                <SignaturePad
                  value={techSignature}
                  onChange={setTechSignature}
                  label="Assinatura do Técnico"
                />
              )}
              {(serviceOrder as any)?.require_client_signature && (
                <SignaturePad
                  value={clientSignature}
                  onChange={setClientSignature}
                  label="Assinatura do Cliente"
                />
              )}
            </CardContent>
          </Card>
        )}

        {/* Finish OS button - inline after signatures */}
        {isCheckedIn && (
          <div className="pb-6">
            <Button 
              className="w-full bg-success hover:bg-success/90 text-success-foreground" 
              size="lg"
              onClick={handleFinishOS}
              disabled={finishing}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              {finishing ? 'Finalizando...' : 'Finalizar OS'}
            </Button>
          </div>
        )}
      </div>

      {/* Equipment photo preview */}
      <ImagePreviewModal
        src={previewPhoto || ''}
        alt="Equipamento"
        open={!!previewPhoto}
        onClose={() => setPreviewPhoto(null)}
      />
    </div>
  );
}
