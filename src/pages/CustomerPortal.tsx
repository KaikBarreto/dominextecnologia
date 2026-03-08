import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Package, ClipboardList, Plus, Clock, CheckCircle, AlertCircle, Loader2, Send, ChevronRight, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useDataPagination } from '@/hooks/useDataPagination';
import { DataTablePagination } from '@/components/ui/DataTablePagination';

interface PortalData {
  id: string;
  customer_id: string;
  token: string;
  is_active: boolean;
}

interface Equipment {
  id: string;
  name: string;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  location: string | null;
  status: string;
  photo_url: string | null;
  identifier: string | null;
}

interface ServiceOrder {
  id: string;
  order_number: number;
  status: string;
  description: string | null;
  scheduled_date: string | null;
  created_at: string;
  os_type: string;
}

interface CompanySettings {
  name: string;
  logo_url: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
}

const OS_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pendente: { label: 'Pendente', color: 'bg-warning/10 text-warning border-warning/30' },
  em_andamento: { label: 'Em andamento', color: 'bg-primary/10 text-primary border-primary/30' },
  a_caminho: { label: 'A caminho', color: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/30' },
  concluida: { label: 'Concluída', color: 'bg-success/10 text-success border-success/30' },
  cancelada: { label: 'Cancelada', color: 'bg-destructive/10 text-destructive border-destructive/30' },
};

const ACTIVE_STATUSES = ['em_andamento', 'a_caminho', 'pendente'];

export default function CustomerPortal() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const eqParam = searchParams.get('eq');
  const { toast } = useToast();

  const [portal, setPortal] = useState<PortalData | null>(null);
  const [customer, setCustomer] = useState<{ id: string; name: string } | null>(null);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [serviceOrders, setServiceOrders] = useState<ServiceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Ticket form
  const [showTicketForm, setShowTicketForm] = useState(false);
  const [ticketDesc, setTicketDesc] = useState('');
  const [ticketEquipmentId, setTicketEquipmentId] = useState('');
  const [ticketSubmitting, setTicketSubmitting] = useState(false);

  // Selected equipment detail
  const [selectedEquipment, setSelectedEquipment] = useState<string | null>(eqParam);
  const [defaultTab, setDefaultTab] = useState(eqParam ? 'equipamentos' : 'os');

  const osPagination = useDataPagination(serviceOrders);
  const eqPagination = useDataPagination(equipment);

  useEffect(() => {
    loadPortalData();
  }, [token]);

  // Realtime for service orders
  useEffect(() => {
    if (!customer?.id) return;
    const channel = supabase
      .channel('portal-os')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_orders', filter: `customer_id=eq.${customer.id}` }, () => {
        loadServiceOrders(customer.id);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [customer?.id]);

  const loadPortalData = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: portalData, error: portalError } = await supabase
        .from('customer_portals')
        .select('*')
        .eq('token', token!)
        .eq('is_active', true)
        .single();

      if (portalError || !portalData) {
        setError('Portal não encontrado ou desativado.');
        setLoading(false);
        return;
      }

      setPortal(portalData as any);

      const { data: customerData } = await supabase
        .from('customers')
        .select('id, name')
        .eq('id', (portalData as any).customer_id)
        .single();

      if (customerData) setCustomer(customerData as any);

      const { data: settings } = await supabase
        .from('company_settings')
        .select('name, logo_url, phone, email, address, city, state')
        .limit(1)
        .single();
      if (settings) setCompanySettings(settings as any);

      await Promise.all([
        loadEquipment((portalData as any).customer_id),
        loadServiceOrders((portalData as any).customer_id),
      ]);
    } catch {
      setError('Erro ao carregar portal.');
    } finally {
      setLoading(false);
    }
  };

  const loadEquipment = async (customerId: string) => {
    const { data } = await supabase
      .from('equipment')
      .select('id, name, brand, model, serial_number, location, status, photo_url, identifier')
      .eq('customer_id', customerId)
      .order('name');
    if (data) setEquipment(data as Equipment[]);
  };

  const loadServiceOrders = async (customerId: string) => {
    const { data } = await supabase
      .from('service_orders')
      .select('id, order_number, status, description, scheduled_date, created_at, os_type')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });
    if (data) setServiceOrders(data as ServiceOrder[]);
  };

  const handleSubmitTicket = async () => {
    if (!ticketDesc.trim() || !customer) return;
    setTicketSubmitting(true);
    try {
      const { error } = await supabase.from('service_orders').insert({
        customer_id: customer.id,
        equipment_id: ticketEquipmentId || null,
        description: ticketDesc,
        os_type: 'corretiva',
        status: 'pendente',
        origin: 'portal',
      } as any);
      if (error) throw error;
      toast({ title: 'Chamado aberto com sucesso!' });
      setShowTicketForm(false);
      setTicketDesc('');
      setTicketEquipmentId('');
      await loadServiceOrders(customer.id);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao abrir chamado', description: err.message });
    } finally {
      setTicketSubmitting(false);
    }
  };

  const selectedEq = equipment.find(e => e.id === selectedEquipment);
  const equipmentOrders = selectedEquipment
    ? serviceOrders.filter(os => (os as any).equipment_id === selectedEquipment)
    : [];

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !portal) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h1 className="text-xl font-bold mb-2">Acesso Indisponível</h1>
        <p className="text-muted-foreground text-center">{error || 'Portal não encontrado.'}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header with company info */}
      <header className="border-b bg-card px-4 py-4">
        <div className="mx-auto max-w-4xl flex items-center gap-3">
          {companySettings?.logo_url ? (
            <img src={companySettings.logo_url} alt="" className="h-10 w-10 rounded object-contain" />
          ) : (
            <div className="h-10 w-10 rounded bg-primary/10 flex items-center justify-center">
              <Package className="h-5 w-5 text-primary" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold truncate">{companySettings?.name || 'Portal do Cliente'}</h1>
            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
              {companySettings?.phone && <span>{companySettings.phone}</span>}
              {companySettings?.email && <span>{companySettings.email}</span>}
              {companySettings?.city && companySettings?.state && (
                <span>{companySettings.city} - {companySettings.state}</span>
              )}
            </div>
          </div>
          <Button size="sm" onClick={() => setShowTicketForm(true)}>
            <Plus className="h-4 w-4 mr-1" /> Abrir Chamado
          </Button>
        </div>
      </header>

      {/* Customer name bar */}
      <div className="border-b bg-muted/30 px-4 py-2">
        <div className="mx-auto max-w-4xl">
          <p className="text-sm text-muted-foreground">
            Olá, <span className="font-medium text-foreground">{customer?.name}</span>
          </p>
        </div>
      </div>

      <main className="mx-auto max-w-4xl p-4 space-y-6">
        {/* Active OS highlight */}
        {serviceOrders.filter(os => ACTIVE_STATUSES.includes(os.status)).length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
              Ordens de Serviço Ativas
            </h2>
            {serviceOrders.filter(os => ACTIVE_STATUSES.includes(os.status)).map(os => {
              const statusCfg = OS_STATUS_LABELS[os.status] || OS_STATUS_LABELS.pendente;
              const isEnRoute = os.status === 'a_caminho' || os.status === 'em_andamento';
              return (
                <Card key={os.id} className="border-primary/30 bg-primary/5">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-sm font-bold">#{String(os.order_number).padStart(4, '0')}</span>
                          <Badge variant="outline" className={cn('text-xs', statusCfg.color)}>
                            {statusCfg.label}
                          </Badge>
                        </div>
                        {os.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2">{os.description}</p>
                        )}
                        {os.scheduled_date && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Agendada: {format(new Date(os.scheduled_date), 'dd/MM/yyyy', { locale: ptBR })}
                          </p>
                        )}
                      </div>
                      {isEnRoute && (
                        <a href={`${window.location.origin}/os-tecnico/${os.id}?modo=cliente`} target="_blank" rel="noopener noreferrer">
                          <Button size="sm" variant="default" className="gap-1 text-xs">
                            📍 Acompanhar
                          </Button>
                        </a>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <Tabs defaultValue={defaultTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="os">
              <ClipboardList className="h-4 w-4 mr-2" /> Minhas OS
            </TabsTrigger>
            <TabsTrigger value="equipamentos">
              <Package className="h-4 w-4 mr-2" /> Equipamentos
            </TabsTrigger>
          </TabsList>

          {/* OS Tab */}
          <TabsContent value="os" className="space-y-4 mt-4">
            {serviceOrders.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center py-12">
                  <ClipboardList className="h-10 w-10 text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">Nenhuma ordem de serviço encontrada</p>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="space-y-3">
                  {osPagination.paginatedItems.map(os => {
                    const statusCfg = OS_STATUS_LABELS[os.status] || OS_STATUS_LABELS.pendente;
                    return (
                      <Card key={os.id}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-mono text-sm font-bold">#{String(os.order_number).padStart(4, '0')}</span>
                                <Badge variant="outline" className={cn('text-xs', statusCfg.color)}>
                                  {statusCfg.label}
                                </Badge>
                              </div>
                              {os.description && (
                                <p className="text-sm text-muted-foreground line-clamp-2">{os.description}</p>
                              )}
                              <p className="text-xs text-muted-foreground mt-1">
                                {os.scheduled_date
                                  ? `Agendada: ${format(new Date(os.scheduled_date), 'dd/MM/yyyy', { locale: ptBR })}`
                                  : `Criada: ${format(new Date(os.created_at), 'dd/MM/yyyy', { locale: ptBR })}`
                                }
                              </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <a
                              href={`${window.location.origin}/os-tecnico/${os.id}?modo=cliente`}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Ver detalhes"
                              >
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <ExternalLink className="h-4 w-4" />
                                </Button>
                              </a>
                              {os.status === 'pendente' && <Clock className="h-5 w-5 text-warning" />}
                              {os.status === 'concluida' && <CheckCircle className="h-5 w-5 text-success" />}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
                <DataTablePagination
                  page={osPagination.page} totalPages={osPagination.totalPages}
                  totalItems={osPagination.totalItems} from={osPagination.from}
                  to={osPagination.to} pageSize={osPagination.pageSize}
                  onPageChange={osPagination.setPage} onPageSizeChange={osPagination.setPageSize}
                />
              </>
            )}
          </TabsContent>

          {/* Equipment Tab */}
          <TabsContent value="equipamentos" className="space-y-4 mt-4">
            {selectedEquipment && selectedEq ? (
              <div className="space-y-4">
                <Button variant="ghost" size="sm" onClick={() => setSelectedEquipment(null)}>
                  ← Voltar para lista
                </Button>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-3">
                      {selectedEq.photo_url && (
                        <img src={selectedEq.photo_url} alt="" className="h-12 w-12 rounded object-cover border" />
                      )}
                      <div>
                        <p>{selectedEq.name}</p>
                        <p className="text-sm font-normal text-muted-foreground">
                          {[selectedEq.brand, selectedEq.model].filter(Boolean).join(' - ')}
                        </p>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {selectedEq.serial_number && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Nº Série</span>
                        <span className="font-mono">{selectedEq.serial_number}</span>
                      </div>
                    )}
                    {selectedEq.identifier && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Identificador</span>
                        <span className="font-mono">{selectedEq.identifier}</span>
                      </div>
                    )}
                    {selectedEq.location && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Local</span>
                        <span>{selectedEq.location}</span>
                      </div>
                    )}
                    <Badge variant={selectedEq.status === 'active' ? 'default' : 'secondary'}>
                      {selectedEq.status === 'active' ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Histórico de OS deste equipamento</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {equipmentOrders.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">Nenhuma OS vinculada</p>
                    ) : (
                      <div className="space-y-2">
                        {equipmentOrders.map(os => {
                          const statusCfg = OS_STATUS_LABELS[os.status] || OS_STATUS_LABELS.pendente;
                          return (
                            <div key={os.id} className="flex items-center justify-between p-3 rounded-md border text-sm">
                              <div>
                                <span className="font-mono font-bold">#{String(os.order_number).padStart(4, '0')}</span>
                                {os.description && <span className="text-muted-foreground ml-2">{os.description}</span>}
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className={cn('text-xs', statusCfg.color)}>{statusCfg.label}</Badge>
                                <a href={`${window.location.origin}/os-tecnico/${os.id}?modo=cliente`} target="_blank" rel="noopener noreferrer">
                                  <Button variant="ghost" size="icon" className="h-7 w-7">
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </Button>
                                </a>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            ) : (
              <>
                {equipment.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center py-12">
                      <Package className="h-10 w-10 text-muted-foreground mb-2" />
                      <p className="text-muted-foreground">Nenhum equipamento encontrado</p>
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {eqPagination.paginatedItems.map(eq => (
                        <Card
                          key={eq.id}
                          className="cursor-pointer hover:shadow-md transition-shadow"
                          onClick={() => setSelectedEquipment(eq.id)}
                        >
                          <CardContent className="p-4 flex items-center gap-3">
                            {eq.photo_url ? (
                              <img src={eq.photo_url} alt="" className="h-12 w-12 rounded object-cover border shrink-0" />
                            ) : (
                              <div className="h-12 w-12 rounded bg-muted flex items-center justify-center shrink-0">
                                <Package className="h-5 w-5 text-muted-foreground" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{eq.name}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {[eq.brand, eq.model].filter(Boolean).join(' - ')}
                              </p>
                              {eq.location && (
                                <p className="text-xs text-muted-foreground">{eq.location}</p>
                              )}
                            </div>
                            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                    <DataTablePagination
                      page={eqPagination.page} totalPages={eqPagination.totalPages}
                      totalItems={eqPagination.totalItems} from={eqPagination.from}
                      to={eqPagination.to} pageSize={eqPagination.pageSize}
                      onPageChange={eqPagination.setPage} onPageSizeChange={eqPagination.setPageSize}
                    />
                  </>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </main>

      {/* Ticket Form */}
      <ResponsiveModal open={showTicketForm} onOpenChange={setShowTicketForm} title="Abrir Chamado">
        <div className="space-y-4 p-1">
          <div>
            <Label>Descreva o problema *</Label>
            <Textarea
              value={ticketDesc}
              onChange={e => setTicketDesc(e.target.value)}
              placeholder="Descreva o problema que você está enfrentando..."
              rows={4}
            />
          </div>
          {equipment.length > 0 && (
            <div>
              <Label>Equipamento (opcional)</Label>
              <Select value={ticketEquipmentId || 'none'} onValueChange={v => setTicketEquipmentId(v === 'none' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {equipment.map(eq => (
                    <SelectItem key={eq.id} value={eq.id}>{eq.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <Button className="w-full" onClick={handleSubmitTicket} disabled={ticketSubmitting || !ticketDesc.trim()}>
            {ticketSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
            Enviar Chamado
          </Button>
        </div>
      </ResponsiveModal>
    </div>
  );
}
