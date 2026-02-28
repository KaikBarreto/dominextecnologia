import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ClipboardList, 
  MapPin, 
  Clock, 
  User, 
  Wrench,
  Phone,
  Play,
  ClipboardCheck,
  PenTool,
  CheckCircle2,
  ArrowLeft,
  Calendar,
  Building2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { DynamicFormQuestions, type FormValidationResult } from '@/components/technician/DynamicFormQuestions';
import { SignaturePad } from '@/components/SignaturePad';
import { OSReport } from '@/components/technician/OSReport';
import type { ServiceOrder, OsStatus } from '@/types/database';
import { osStatusLabels, osTypeLabels } from '@/types/database';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface OSPhoto {
  id: string;
  photo_url: string;
  photo_type: string;
  description: string | null;
  created_at: string;
}

export default function TechnicianOS() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [serviceOrder, setServiceOrder] = useState<(ServiceOrder & { customer: any; equipment: any; form_template?: any }) | null>(null);
  const [photos, setPhotos] = useState<OSPhoto[]>([]);
  const [company, setCompany] = useState<any>(null);

  // Check-in/out state
  const [checkInTime, setCheckInTime] = useState<string | null>(null);
  const [checkOutTime, setCheckOutTime] = useState<string | null>(null);
  const [checkInLocation, setCheckInLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [checkOutLocation, setCheckOutLocation] = useState<{ lat: number; lng: number } | null>(null);
  
  // Form validation state
  const [formValidation, setFormValidation] = useState<FormValidationResult>({ isValid: true, missingQuestions: [] });
  
  // Signature state
  const [techSignature, setTechSignature] = useState<string | null>(null);
  const [clientSignature, setClientSignature] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);

  useEffect(() => {
    if (id) {
      fetchServiceOrder();
      fetchPhotos();
      fetchCompany();
    }
  }, [id]);

  const fetchCompany = async () => {
    const { data } = await supabase.from('company_settings').select('*').limit(1).single();
    if (data) setCompany(data);
  };

  const fetchServiceOrder = async () => {
    try {
      const { data, error } = await supabase
        .from('service_orders')
        .select(`
          *,
          customer:customers(id, name, phone, address, city, state, document),
          equipment:equipment(id, name, brand, model, serial_number, location, capacity),
          form_template:form_templates(id, name)
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
    // Validate required form fields
    if (serviceOrder?.form_template_id && !formValidation.isValid) {
      toast({
        variant: 'destructive',
        title: 'Campos obrigatórios pendentes',
        description: `Preencha os campos: ${formValidation.missingQuestions.slice(0, 3).join(', ')}${formValidation.missingQuestions.length > 3 ? '...' : ''}`,
      });
      return;
    }

    // Validate required signatures
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

  if (loading) {
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

  const statusColors: Record<OsStatus, string> = {
    pendente: 'bg-warning/10 text-warning border-warning',
    em_andamento: 'bg-info/10 text-info border-info',
    concluida: 'bg-success/10 text-success border-success',
    cancelada: 'bg-destructive/10 text-destructive border-destructive',
  };

  // Show report mode for completed OS
  if (serviceOrder.status === 'concluida') {
    return (
      <div className="min-h-screen bg-background">
        <div className="sticky top-0 z-10 bg-primary text-primary-foreground p-4 shadow-lg print:hidden">
          <div className="max-w-2xl mx-auto flex items-center gap-3">
            <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-primary-foreground/10" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-lg font-bold">OS #{String(serviceOrder.order_number).padStart(4, '0')}</h1>
              <p className="text-sm opacity-90">Relatório de Serviço</p>
            </div>
            <Badge variant="outline" className="bg-success/20 text-success-foreground border-success-foreground/30">
              Concluída
            </Badge>
          </div>
        </div>
        <div className="max-w-2xl mx-auto p-4">
          <OSReport serviceOrder={serviceOrder} photos={photos} />
        </div>
      </div>
    );
  }

  const isCheckedIn = !!checkInTime;
  const isPending = serviceOrder.status === 'pendente';

  return (
    <div className="min-h-screen bg-background">
      {/* Header - PDF-inspired with company + OS info */}
      <div className="bg-primary text-primary-foreground">
        <div className="max-w-2xl mx-auto p-4">
          <div className="flex items-center gap-3 mb-3">
            <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-primary-foreground/10 shrink-0" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {company?.logo_url ? (
                  <img src={company.logo_url} alt="Logo" className="h-8 w-8 rounded object-contain bg-primary-foreground/10 p-0.5" />
                ) : (
                  <Building2 className="h-5 w-5 opacity-70" />
                )}
                <span className="text-sm opacity-80 truncate">{company?.name || ''}</span>
              </div>
            </div>
            <Badge className={`${statusColors[serviceOrder.status]} shrink-0`}>
              {osStatusLabels[serviceOrder.status]}
            </Badge>
          </div>
          
          <div className="flex items-end justify-between">
            <div>
              <h1 className="text-xl font-bold">OS #{String(serviceOrder.order_number).padStart(4, '0')}</h1>
              <p className="text-sm opacity-80">{osTypeLabels[serviceOrder.os_type]}</p>
            </div>
            {serviceOrder.scheduled_date && (
              <div className="flex items-center gap-1.5 text-sm opacity-80">
                <Calendar className="h-3.5 w-3.5" />
                {format(new Date(serviceOrder.scheduled_date + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR })}
                {serviceOrder.scheduled_time && ` ${String(serviceOrder.scheduled_time).slice(0, 5)}`}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-4 pb-28">
        {/* Step 1: Check-in (only if pending) */}
        {isPending && (
          <Card className="border-primary/30">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Play className="h-4 w-4 text-primary" />
                Iniciar Atendimento
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Faça o check-in para registrar sua chegada e iniciar o atendimento.
              </p>
              <Button className="w-full" size="lg" onClick={handleCheckIn}>
                <Play className="h-4 w-4 mr-2" />
                Fazer Check-in
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Check-in timestamp (when done) */}
        {isCheckedIn && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
            <Clock className="h-3.5 w-3.5 text-primary" />
            <span>
              Check-in: {format(new Date(checkInTime!), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </span>
            {checkInLocation && (
              <span className="text-xs opacity-70 ml-auto flex items-center gap-0.5">
                <MapPin className="h-3 w-3" />
                {checkInLocation.lat.toFixed(4)}, {checkInLocation.lng.toFixed(4)}
              </span>
            )}
          </div>
        )}

        {/* Client Info */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <User className="h-4 w-4 text-primary" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Cliente</span>
            </div>
            <p className="font-semibold">{serviceOrder.customer?.name}</p>
            {serviceOrder.customer?.document && (
              <p className="text-xs text-muted-foreground mt-0.5">{serviceOrder.customer.document}</p>
            )}
            {serviceOrder.customer?.phone && (
              <a href={`tel:${serviceOrder.customer.phone}`} className="flex items-center gap-1.5 text-sm text-primary mt-1">
                <Phone className="h-3 w-3" />
                {serviceOrder.customer.phone}
              </a>
            )}
            {serviceOrder.customer?.address && (
              <p className="text-sm text-muted-foreground flex items-start gap-1.5 mt-1">
                <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                <span>
                  {serviceOrder.customer.address}
                  {serviceOrder.customer.city && `, ${serviceOrder.customer.city}`}
                  {serviceOrder.customer.state && ` - ${serviceOrder.customer.state}`}
                </span>
              </p>
            )}
          </CardContent>
        </Card>

        {/* Description */}
        {serviceOrder.description && (
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Descrição do Chamado</p>
              <p className="text-sm">{serviceOrder.description}</p>
            </CardContent>
          </Card>
        )}

        {/* Questionnaire - shown as equipment section */}
        {serviceOrder.form_template_id && isCheckedIn && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <ClipboardCheck className="h-4 w-4 text-primary" />
                {serviceOrder.equipment ? (
                  <span>
                    {serviceOrder.equipment.name}
                    {serviceOrder.equipment.brand && ` — ${serviceOrder.equipment.brand} ${serviceOrder.equipment.model || ''}`}
                  </span>
                ) : (
                  <span>{serviceOrder.form_template?.name || 'Checklist'}</span>
                )}
                {!formValidation.isValid && (
                  <Badge variant="destructive" className="ml-auto text-xs">
                    {formValidation.missingQuestions.length} pendente{formValidation.missingQuestions.length > 1 ? 's' : ''}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DynamicFormQuestions 
                serviceOrderId={id!}
                templateId={serviceOrder.form_template_id}
                onValidationChange={setFormValidation}
              />
            </CardContent>
          </Card>
        )}

        {/* Signatures (if required) */}
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
      </div>

      {/* Fixed bottom button */}
      {isCheckedIn && (
        <div className="fixed bottom-0 left-0 right-0 bg-background border-t p-4 z-10">
          <div className="max-w-2xl mx-auto">
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
        </div>
      )}
    </div>
  );
}
