import { useState, useEffect } from 'react';
import { Eye, User, Wrench, Calendar, Clock, MapPin, Camera, ClipboardCheck, FileSignature, Check, X, Navigation, Star, Copy } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { ServiceOrder, OsStatus, FormQuestion } from '@/types/database';
import { osStatusLabels, osTypeLabels } from '@/types/database';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { TechnicianDistanceBadge } from './TechnicianDistanceBadge';
import { useServiceRatings } from '@/hooks/useServiceRatings';

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
  question: FormQuestion;
}

interface ServiceOrderViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serviceOrderId: string | null;
}

const statusColors: Record<OsStatus, string> = {
  pendente: 'bg-warning/10 text-warning border-warning',
  em_andamento: 'bg-info/10 text-info border-info',
  concluida: 'bg-success/10 text-success border-success',
  cancelada: 'bg-destructive/10 text-destructive border-destructive',
};

export function ServiceOrderViewDialog({ open, onOpenChange, serviceOrderId }: ServiceOrderViewDialogProps) {
  const [loading, setLoading] = useState(true);
  const [serviceOrder, setServiceOrder] = useState<ServiceOrder & { customer: any; equipment: any; form_template: any } | null>(null);
  const [photos, setPhotos] = useState<OSPhoto[]>([]);
  const [formResponses, setFormResponses] = useState<FormResponseData[]>([]);
  const { toast } = useToast();
  const { createRatingToken } = useServiceRatings();

  useEffect(() => {
    if (open && serviceOrderId) {
      fetchData();
    }
  }, [open, serviceOrderId]);

  const fetchData = async () => {
    if (!serviceOrderId) return;
    setLoading(true);

    try {
      // Fetch service order
      const { data: osData, error: osError } = await supabase
        .from('service_orders')
        .select(`
          *,
          customer:customers(id, name, phone, address, city, state),
          equipment:equipment(id, name, brand, model, serial_number),
          form_template:form_templates(id, name)
        `)
        .eq('id', serviceOrderId)
        .single();

      if (osError) throw osError;
      setServiceOrder(osData as any);

      // Fetch photos
      const { data: photosData } = await supabase
        .from('os_photos')
        .select('*')
        .eq('service_order_id', serviceOrderId)
        .order('created_at', { ascending: true });

      setPhotos(photosData || []);

      // Fetch form responses with questions
      if (osData.form_template_id) {
        const { data: responsesData } = await supabase
          .from('form_responses')
          .select(`
            id,
            question_id,
            response_value,
            response_photo_url,
            question:form_questions(*)
          `)
          .eq('service_order_id', serviceOrderId);

        setFormResponses((responsesData as any) || []);
      }
    } catch (error) {
      console.error('Error fetching OS data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number | null) => {
    if (!value) return '-';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] p-0">
        {loading ? (
          <div className="p-6 space-y-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : serviceOrder ? (
          <>
            <DialogHeader className="p-6 pb-0">
              <DialogTitle className="flex items-center gap-3">
                <Eye className="h-5 w-5" />
                OS #{String(serviceOrder.order_number).padStart(4, '0')}
                <Badge variant="outline" className={`${statusColors[serviceOrder.status]} border ml-auto`}>
                  {osStatusLabels[serviceOrder.status]}
                </Badge>
              </DialogTitle>
            </DialogHeader>

            <ScrollArea className="max-h-[calc(90vh-80px)]">
              <div className="p-6 pt-4 space-y-4">
                {/* Type and Schedule */}
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

                {/* Customer */}
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <User className="h-4 w-4" /> Cliente
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 text-sm">
                    <p className="font-medium">{serviceOrder.customer?.name}</p>
                    {serviceOrder.customer?.phone && <p className="text-muted-foreground">{serviceOrder.customer.phone}</p>}
                    {serviceOrder.customer?.address && (
                      <p className="text-muted-foreground">
                        {serviceOrder.customer.address}
                        {serviceOrder.customer.city && `, ${serviceOrder.customer.city}`}
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Equipment */}
                {serviceOrder.equipment && (
                  <Card>
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Wrench className="h-4 w-4" /> Equipamento
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 text-sm">
                      <p className="font-medium">{serviceOrder.equipment.name}</p>
                      <p className="text-muted-foreground">
                        {serviceOrder.equipment.brand} {serviceOrder.equipment.model}
                      </p>
                      {serviceOrder.equipment.serial_number && (
                        <p className="text-muted-foreground text-xs">S/N: {serviceOrder.equipment.serial_number}</p>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Technician Location & Routing */}
                {serviceOrder.technician_id && serviceOrder.status !== 'concluida' && serviceOrder.status !== 'cancelada' && (
                  <TechnicianDistanceBadge
                    technicianId={serviceOrder.technician_id}
                    customer={serviceOrder.customer}
                  />
                )}

                {/* Check-in/out */}
                {(serviceOrder.check_in_time || serviceOrder.check_out_time) && (
                  <Card>
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Clock className="h-4 w-4" /> Check-in / Check-out
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 text-sm space-y-1">
                      {serviceOrder.check_in_time && (
                        <p>
                          <strong>Check-in:</strong>{' '}
                          {format(new Date(serviceOrder.check_in_time), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </p>
                      )}
                      {serviceOrder.check_out_time && (
                        <p>
                          <strong>Check-out:</strong>{' '}
                          {format(new Date(serviceOrder.check_out_time), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Photos */}
                {photos.length > 0 && (
                  <Card>
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Camera className="h-4 w-4" /> Fotos ({photos.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="grid grid-cols-3 gap-2">
                        {photos.map((photo) => (
                          <a
                            key={photo.id}
                            href={photo.photo_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="relative aspect-square rounded-lg overflow-hidden bg-muted hover:opacity-80 transition-opacity"
                          >
                            <img
                              src={photo.photo_url}
                              alt={photo.photo_type}
                              className="w-full h-full object-cover"
                            />
                            <Badge variant="secondary" className="absolute bottom-1 left-1 text-[10px] capitalize">
                              {photo.photo_type}
                            </Badge>
                          </a>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Form Responses */}
                {formResponses.length > 0 && (
                  <Card>
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <ClipboardCheck className="h-4 w-4" /> 
                        Questionário: {serviceOrder.form_template?.name}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-3">
                      {formResponses.map((response) => (
                        <div key={response.id} className="text-sm border-b last:border-0 pb-2 last:pb-0">
                          <p className="font-medium text-muted-foreground">{response.question?.question}</p>
                          {response.question?.question_type === 'boolean' ? (
                            <Badge variant={response.response_value === 'true' ? 'success' : 'destructive'} className="mt-1 gap-1">
                              {response.response_value === 'true' ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                              {response.response_value === 'true' ? 'Sim' : 'Não'}
                            </Badge>
                          ) : response.question?.question_type === 'photo' && response.response_photo_url ? (
                            <a href={response.response_photo_url} target="_blank" rel="noopener noreferrer">
                              <img
                                src={response.response_photo_url}
                                alt="Resposta"
                                className="w-24 h-24 object-cover rounded-lg mt-1"
                              />
                            </a>
                          ) : (
                            <p className="mt-1">{response.response_value || '-'}</p>
                          )}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* Service Details */}
                {(serviceOrder.diagnosis || serviceOrder.solution || serviceOrder.notes) && (
                  <Card>
                    <CardHeader className="py-3">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <FileSignature className="h-4 w-4" /> Detalhes do Serviço
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-3 text-sm">
                      {serviceOrder.diagnosis && (
                        <div>
                          <p className="font-medium text-muted-foreground">Diagnóstico</p>
                          <p>{serviceOrder.diagnosis}</p>
                        </div>
                      )}
                      {serviceOrder.solution && (
                        <div>
                          <p className="font-medium text-muted-foreground">Solução Aplicada</p>
                          <p>{serviceOrder.solution}</p>
                        </div>
                      )}
                      {serviceOrder.notes && (
                        <div>
                          <p className="font-medium text-muted-foreground">Observações</p>
                          <p>{serviceOrder.notes}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Values */}
                {(serviceOrder.labor_value || serviceOrder.parts_value || serviceOrder.total_value) && (
                  <Card>
                    <CardContent className="py-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Mão de Obra</span>
                        <span>{formatCurrency(serviceOrder.labor_value)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Peças</span>
                        <span>{formatCurrency(serviceOrder.parts_value)}</span>
                      </div>
                      <Separator className="my-2" />
                      <div className="flex justify-between font-medium">
                        <span>Total</span>
                        <span>{formatCurrency(serviceOrder.total_value)}</span>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Rating Button */}
                {serviceOrder.status === 'concluida' && (
                  <div className="pt-2">
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={async () => {
                        const result = await createRatingToken.mutateAsync(serviceOrder.id);
                        if (result?.token) {
                          const url = `${window.location.origin}/avaliacao/${result.token}`;
                          await navigator.clipboard.writeText(url);
                          toast({ title: 'Link de avaliação copiado!' });
                        }
                      }}
                      disabled={createRatingToken.isPending}
                    >
                      <Star className="h-4 w-4 mr-2" />
                      Copiar Link de Avaliação
                    </Button>
                  </div>
                )}
              </div>
            </ScrollArea>
          </>
        ) : (
          <div className="p-6 text-center text-muted-foreground">
            OS não encontrada
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}