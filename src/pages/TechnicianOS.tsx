import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { 
  ClipboardList, 
  Camera, 
  MapPin, 
  Clock, 
  CheckCircle2, 
  User, 
  Wrench,
  Phone,
  Save,
  Upload,
  X,
  Play,
  Square,
  FileSignature
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
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
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [serviceOrder, setServiceOrder] = useState<(ServiceOrder & { customer: any; equipment: any }) | null>(null);
  const [photos, setPhotos] = useState<OSPhoto[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  
  // Form state
  const [diagnosis, setDiagnosis] = useState('');
  const [solution, setSolution] = useState('');
  const [notes, setNotes] = useState('');
  const [laborHours, setLaborHours] = useState('');
  const [laborValue, setLaborValue] = useState('');
  const [partsValue, setPartsValue] = useState('');

  // Check-in/out state
  const [checkInTime, setCheckInTime] = useState<string | null>(null);
  const [checkOutTime, setCheckOutTime] = useState<string | null>(null);
  const [checkInLocation, setCheckInLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [checkOutLocation, setCheckOutLocation] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (id) {
      fetchServiceOrder();
      fetchPhotos();
    }
  }, [id]);

  const fetchServiceOrder = async () => {
    try {
      const { data, error } = await supabase
        .from('service_orders')
        .select(`
          *,
          customer:customers(id, name, phone, address, city, state),
          equipment:equipment(id, name, brand, model, serial_number, location)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      
      setServiceOrder(data as any);
      setDiagnosis(data.diagnosis || '');
      setSolution(data.solution || '');
      setNotes(data.notes || '');
      setLaborHours(data.labor_hours?.toString() || '');
      setLaborValue(data.labor_value?.toString() || '');
      setPartsValue(data.parts_value?.toString() || '');
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
        (error) => {
          reject(error);
        },
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
      setServiceOrder((prev) => prev ? { ...prev, status: 'em_andamento' as OsStatus } : null);
      
      toast({ title: 'Check-in realizado com sucesso!' });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Erro no check-in',
        description: error.message,
      });
    }
  };

  const handleCheckOut = async () => {
    try {
      const location = await getCurrentLocation();
      const now = new Date().toISOString();
      
      const { error } = await supabase
        .from('service_orders')
        .update({
          check_out_time: now,
          check_out_location: location,
          status: 'concluida',
        })
        .eq('id', id);

      if (error) throw error;

      setCheckOutTime(now);
      setCheckOutLocation(location);
      setServiceOrder((prev) => prev ? { ...prev, status: 'concluida' as OsStatus } : null);
      
      toast({ title: 'Check-out realizado! OS concluída.' });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Erro no check-out',
        description: error.message,
      });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const laborHoursNum = laborHours ? parseFloat(laborHours) : null;
      const laborValueNum = laborValue ? parseFloat(laborValue) : null;
      const partsValueNum = partsValue ? parseFloat(partsValue) : null;
      const totalValue = (laborValueNum || 0) + (partsValueNum || 0);

      const { error } = await supabase
        .from('service_orders')
        .update({
          diagnosis,
          solution,
          notes,
          labor_hours: laborHoursNum,
          labor_value: laborValueNum,
          parts_value: partsValueNum,
          total_value: totalValue > 0 ? totalValue : null,
        })
        .eq('id', id);

      if (error) throw error;
      toast({ title: 'OS salva com sucesso!' });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar',
        description: error.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>, photoType: string) => {
    const file = event.target.files?.[0];
    if (!file || !id) return;

    setUploadingPhoto(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${id}/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('os-photos')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('os-photos')
        .getPublicUrl(fileName);

      const { error: insertError } = await supabase
        .from('os_photos')
        .insert({
          service_order_id: id,
          photo_url: publicUrl,
          photo_type: photoType,
        });

      if (insertError) throw insertError;

      await fetchPhotos();
      toast({ title: 'Foto enviada com sucesso!' });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Erro ao enviar foto',
        description: error.message,
      });
    } finally {
      setUploadingPhoto(false);
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
            <p className="text-muted-foreground">
              Verifique o link e tente novamente.
            </p>
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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-primary text-primary-foreground p-4 shadow-lg">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold">
                OS #{String(serviceOrder.order_number).padStart(4, '0')}
              </h1>
              <p className="text-sm opacity-90">{osTypeLabels[serviceOrder.os_type]}</p>
            </div>
            <Badge variant="outline" className={`${statusColors[serviceOrder.status]} border`}>
              {osStatusLabels[serviceOrder.status]}
            </Badge>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-4 pb-24">
        {/* Client Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="h-4 w-4" />
              Cliente
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="font-medium">{serviceOrder.customer?.name}</p>
            {serviceOrder.customer?.phone && (
              <a 
                href={`tel:${serviceOrder.customer.phone}`}
                className="flex items-center gap-2 text-sm text-primary"
              >
                <Phone className="h-3 w-3" />
                {serviceOrder.customer.phone}
              </a>
            )}
            {serviceOrder.customer?.address && (
              <p className="text-sm text-muted-foreground flex items-start gap-2">
                <MapPin className="h-3 w-3 mt-1 shrink-0" />
                {serviceOrder.customer.address}
                {serviceOrder.customer.city && `, ${serviceOrder.customer.city}`}
                {serviceOrder.customer.state && ` - ${serviceOrder.customer.state}`}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Equipment Info */}
        {serviceOrder.equipment && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Wrench className="h-4 w-4" />
                Equipamento
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <p className="font-medium">{serviceOrder.equipment.name}</p>
              <p className="text-sm text-muted-foreground">
                {serviceOrder.equipment.brand} {serviceOrder.equipment.model}
              </p>
              {serviceOrder.equipment.serial_number && (
                <p className="text-sm text-muted-foreground">
                  S/N: {serviceOrder.equipment.serial_number}
                </p>
              )}
              {serviceOrder.equipment.location && (
                <p className="text-sm text-muted-foreground">
                  Local: {serviceOrder.equipment.location}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Description */}
        {serviceOrder.description && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Descrição do Chamado</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{serviceOrder.description}</p>
            </CardContent>
          </Card>
        )}

        {/* Check-in/out */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4" />
              Check-in / Check-out
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-3">
              <Button
                className="flex-1"
                variant={checkInTime ? 'secondary' : 'default'}
                disabled={!!checkInTime}
                onClick={handleCheckIn}
              >
                <Play className="h-4 w-4 mr-2" />
                {checkInTime ? 'Check-in feito' : 'Fazer Check-in'}
              </Button>
              <Button
                className="flex-1"
                variant={checkOutTime ? 'secondary' : 'default'}
                disabled={!checkInTime || !!checkOutTime}
                onClick={handleCheckOut}
              >
                <Square className="h-4 w-4 mr-2" />
                {checkOutTime ? 'Check-out feito' : 'Fazer Check-out'}
              </Button>
            </div>
            {checkInTime && (
              <div className="text-sm text-muted-foreground space-y-1">
                <p>
                  <strong>Check-in:</strong>{' '}
                  {format(new Date(checkInTime), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </p>
                {checkOutTime && (
                  <p>
                    <strong>Check-out:</strong>{' '}
                    {format(new Date(checkOutTime), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Photos */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Camera className="h-4 w-4" />
              Fotos do Serviço
            </CardTitle>
            <CardDescription>
              Registre fotos antes, durante e depois do serviço
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {['antes', 'durante', 'depois'].map((type) => (
              <div key={type} className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="capitalize font-medium">{type}</Label>
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => handlePhotoUpload(e, type)}
                      disabled={uploadingPhoto}
                    />
                    <Button variant="outline" size="sm" asChild disabled={uploadingPhoto}>
                      <span>
                        <Upload className="h-3 w-3 mr-1" />
                        Adicionar
                      </span>
                    </Button>
                  </label>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {photos
                    .filter((p) => p.photo_type === type)
                    .map((photo) => (
                      <div key={photo.id} className="relative aspect-square rounded-md overflow-hidden bg-muted">
                        <img
                          src={photo.photo_url}
                          alt={`Foto ${type}`}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ))}
                  {photos.filter((p) => p.photo_type === type).length === 0 && (
                    <div className="aspect-square rounded-md border-2 border-dashed border-muted-foreground/30 flex items-center justify-center">
                      <Camera className="h-6 w-6 text-muted-foreground/50" />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Service Details Form */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileSignature className="h-4 w-4" />
              Detalhes do Serviço
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Diagnóstico</Label>
              <Textarea
                placeholder="Descreva o problema encontrado..."
                value={diagnosis}
                onChange={(e) => setDiagnosis(e.target.value)}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Solução Aplicada</Label>
              <Textarea
                placeholder="Descreva a solução aplicada..."
                value={solution}
                onChange={(e) => setSolution(e.target.value)}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea
                placeholder="Observações adicionais..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>
            
            <Separator />
            
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Horas</Label>
                <Input
                  type="number"
                  step="0.5"
                  placeholder="0"
                  value={laborHours}
                  onChange={(e) => setLaborHours(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Mão de Obra</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="R$ 0,00"
                  value={laborValue}
                  onChange={(e) => setLaborValue(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Peças</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="R$ 0,00"
                  value={partsValue}
                  onChange={(e) => setPartsValue(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Fixed Save Button */}
      <div className="fixed bottom-0 left-0 right-0 bg-background border-t p-4">
        <div className="max-w-2xl mx-auto">
          <Button 
            className="w-full" 
            size="lg"
            onClick={handleSave}
            disabled={saving}
          >
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Salvando...' : 'Salvar Alterações'}
          </Button>
        </div>
      </div>
    </div>
  );
}
