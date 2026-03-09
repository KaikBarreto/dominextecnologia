import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Phone, Mail, MapPin, Calendar, ClipboardList, DollarSign, Package, ExternalLink, Plus, Edit, Trash2, UserCircle, Link2, Copy, Loader2, FileText, Megaphone } from 'lucide-react';
import { icons } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { useTableSort } from '@/hooks/useTableSort';
import { SortableTableHead } from '@/components/ui/SortableTableHead';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCustomers } from '@/hooks/useCustomers';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useServiceOrders } from '@/hooks/useServiceOrders';
import { useFinancial } from '@/hooks/useFinancial';
import { useEquipment } from '@/hooks/useEquipment';
import { useEquipmentCategories } from '@/hooks/useEquipmentCategories';
import { useContracts } from '@/hooks/useContracts';
import { EquipmentFormDialog } from '@/components/customers/EquipmentFormDialog';
import { CustomerFormDialog } from '@/components/customers/CustomerFormDialog';
import { ContactFormDialog } from '@/components/customers/ContactFormDialog';
import { ServiceOrderFormDialog } from '@/components/service-orders/ServiceOrderFormDialog';
import { ContractFormDialog } from '@/components/contracts/ContractFormDialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useCustomerContacts } from '@/hooks/useCustomerContacts';
import { osStatusLabels } from '@/types/database';
import { useDataPagination } from '@/hooks/useDataPagination';
import { DataTablePagination } from '@/components/ui/DataTablePagination';
import { cn } from '@/lib/utils';
import { useCustomerOrigins } from '@/hooks/useCustomerOrigins';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { getFrequencyLabel } from '@/hooks/useContracts';

type TabKey = 'geral' | 'equipamentos' | 'historico' | 'financeiro' | 'chamados' | 'contratos';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const locationState = (window.history.state?.usr as { tab?: string } | undefined);
  const [activeTab, setActiveTab] = useState<TabKey>((locationState?.tab as TabKey) || 'geral');
  const { customers, isLoading, updateCustomer, deleteCustomer } = useCustomers();
  const { serviceOrders, createServiceOrder } = useServiceOrders();
  const { transactions } = useFinancial();
  const { equipment: customerEquipment, createEquipment } = useEquipment(id);
  const { categories } = useEquipmentCategories();
  const { contracts } = useContracts();

  const { contacts, createContact, updateContact, deleteContact } = useCustomerContacts(id);
  const { activeOrigins } = useCustomerOrigins();

  const [equipFormOpen, setEquipFormOpen] = useState(false);
  const [osFormOpen, setOsFormOpen] = useState(false);
  const [editCustomerOpen, setEditCustomerOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [contactFormOpen, setContactFormOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<typeof contacts[0] | null>(null);
  const [deleteContactId, setDeleteContactId] = useState<string | null>(null);
  const [portalLink, setPortalLink] = useState<string | null>(null);
  const [generatingPortal, setGeneratingPortal] = useState(false);
  const [contractFormOpen, setContractFormOpen] = useState(false);
  const { toast } = useToast();

  const customer = customers.find(c => c.id === id);
  const customerOrders = serviceOrders.filter(os => os.customer_id === id);
  const customerTransactions = transactions.filter(t => t.customer_id === id);
  const customerContracts = contracts.filter(c => c.customer_id === id);

  // Portal tickets (origin = 'portal')
  const portalTickets = customerOrders.filter(os => (os as any).origin === 'portal');

  const { sortedItems: sortedOrders, sortConfig: osSortConfig, handleSort: handleOsSort } = useTableSort(customerOrders);
  const ordersPagination = useDataPagination(sortedOrders);
  const { sortedItems: sortedTransactions, sortConfig: finSortConfig, handleSort: handleFinSort } = useTableSort(customerTransactions);
  const transactionsPagination = useDataPagination(sortedTransactions);
  const { sortedItems: sortedTickets, sortConfig: ticketSortConfig, handleSort: handleTicketSort } = useTableSort(portalTickets);
  const ticketsPagination = useDataPagination(sortedTickets);
  const { sortedItems: sortedContracts, sortConfig: contractSortConfig, handleSort: handleContractSort } = useTableSort(customerContracts);
  const contractsPagination = useDataPagination(sortedContracts);

  // Load existing portal link
  useEffect(() => {
    if (!id) return;
    supabase
      .from('customer_portals')
      .select('token')
      .eq('customer_id', id)
      .eq('is_active', true)
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data) setPortalLink(`${window.location.origin}/portal/${(data as any).token}`);
      });
  }, [id]);

  const handleGeneratePortal = async () => {
    if (!id) return;
    setGeneratingPortal(true);
    try {
      const { data, error } = await supabase
        .from('customer_portals')
        .insert({ customer_id: id } as any)
        .select('token')
        .single();
      if (error) throw error;
      const link = `${window.location.origin}/portal/${(data as any).token}`;
      setPortalLink(link);
      navigator.clipboard.writeText(link);
      toast({ title: 'Link do portal gerado e copiado!' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro', description: err.message });
    } finally {
      setGeneratingPortal(false);
    }
  };

  if (isLoading) {
    return <div className="space-y-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>;
  }

  if (!customer) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => navigate('/clientes')}><ArrowLeft className="mr-2 h-4 w-4" /> Voltar</Button>
        <p className="text-muted-foreground">Cliente não encontrado.</p>
      </div>
    );
  }

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'geral', label: 'Geral' },
    { key: 'equipamentos', label: 'Equipamentos' },
    { key: 'historico', label: 'Histórico de OS' },
    { key: 'chamados', label: 'Chamados' },
    { key: 'contratos', label: 'Contratos' },
    { key: 'financeiro', label: 'Financeiro' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate('/clientes')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          {customer.photo_url ? (
            <img src={customer.photo_url} alt="" className="h-10 w-10 sm:h-12 sm:w-12 rounded-full object-cover border shrink-0" />
          ) : (
            <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-full bg-muted flex items-center justify-center shrink-0">
              <Package className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl font-bold truncate">{customer.name}</h1>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <Badge variant={customer.customer_type === 'pj' ? 'default' : 'secondary'}>
                {customer.customer_type === 'pj' ? 'PJ' : 'PF'}
              </Badge>
              {customer.company_name && (
                <span className="text-sm text-muted-foreground truncate">{customer.company_name}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2 shrink-0 flex-wrap pl-11 sm:pl-0 justify-center sm:justify-end w-full sm:w-auto">
          {portalLink ? (
            <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(portalLink); toast({ title: 'Link copiado!' }); }}>
              <Copy className="h-4 w-4 mr-1" /> Portal
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={handleGeneratePortal} disabled={generatingPortal}>
              {generatingPortal ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Link2 className="h-4 w-4 mr-1" />}
              Gerar Portal
            </Button>
          )}
          <Button variant="edit-ghost" size="sm" onClick={() => setEditCustomerOpen(true)}>
            <Edit className="h-4 w-4 mr-1" /> Editar
          </Button>
          <Button variant="destructive-ghost" size="sm" onClick={() => setDeleteConfirmOpen(true)}>
            <Trash2 className="h-4 w-4 mr-1" /> Excluir
          </Button>
        </div>
      </div>

      {isMobile ? (
        <Select value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {tabs.map((tab) => (
              <SelectItem key={tab.key} value={tab.key}>{tab.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <div className="flex gap-1 border-b overflow-x-auto no-scrollbar">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap shrink-0',
                activeTab === tab.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {activeTab === 'geral' && (
        <div className="grid gap-4 sm:grid-cols-2">
          {customer.photo_url && (
            <Card className="sm:col-span-2"><CardContent className="p-4 flex justify-center">
              <img src={customer.photo_url} alt={customer.name} className="h-32 w-32 rounded-full object-cover border" />
            </CardContent></Card>
          )}
          {(customer as any).origin && (() => {
            const originData = activeOrigins.find(o => o.name === (customer as any).origin);
            const LucideIcon = originData ? (icons as any)[originData.icon] : null;
            return (
              <Card><CardContent className="p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Origem</p>
                <div className="flex items-center gap-2 mt-1">
                  {LucideIcon && originData && (
                    <div className="h-5 w-5 rounded flex items-center justify-center" style={{ backgroundColor: originData.color }}>
                      <LucideIcon className="h-3 w-3 text-white" />
                    </div>
                  )}
                  <p className="text-sm font-medium">{(customer as any).origin}</p>
                </div>
              </CardContent></Card>
            );
          })()}
          {customer.document && (
            <Card><CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">CPF/CNPJ</p>
              <p className="text-sm font-medium mt-1">{customer.document}</p>
            </CardContent></Card>
          )}
          {customer.email && (
            <Card><CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Email</p>
              <p className="text-sm font-medium mt-1 flex items-center gap-1"><Mail className="h-3 w-3" />{customer.email}</p>
            </CardContent></Card>
          )}
          {customer.phone && (
            <Card><CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Telefone</p>
              <p className="text-sm font-medium mt-1 flex items-center gap-1"><Phone className="h-3 w-3" />{customer.phone}</p>
            </CardContent></Card>
          )}
          {customer.birth_date && (
            <Card><CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Data de Nascimento</p>
              <p className="text-sm font-medium mt-1 flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {format(new Date(customer.birth_date), 'dd/MM/yyyy', { locale: ptBR })}
              </p>
            </CardContent></Card>
          )}
          {(customer.address || customer.city) && (() => {
            const fullAddress = [
              customer.address && customer.address_number ? `${customer.address}, ${customer.address_number}` : customer.address,
              customer.complement,
              customer.neighborhood,
              customer.city && customer.state ? `${customer.city} - ${customer.state}` : (customer.city || customer.state),
              customer.zip_code
            ].filter(Boolean).join(', ');
            const encodedAddress = encodeURIComponent(fullAddress);
            const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;
            const wazeUrl = `https://waze.com/ul?q=${encodedAddress}&navigate=yes`;
            const embedUrl = `https://maps.google.com/maps?q=${encodedAddress}&t=&z=15&ie=UTF8&iwloc=&output=embed`;

            return (
              <Card className="sm:col-span-2"><CardContent className="p-4 space-y-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Endereço</p>
                <p className="text-sm font-medium flex items-center gap-1">
                  <MapPin className="h-3 w-3 shrink-0" />
                  {fullAddress}
                </p>
                <div className="rounded-lg overflow-hidden border h-48 w-full">
                  <iframe
                    title="Mapa do cliente"
                    src={embedUrl}
                    width="100%"
                    height="100%"
                    style={{ border: 0 }}
                    allowFullScreen
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <a
                    href={googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors hover:bg-accent"
                  >
                    <img src="/icons/google-maps.png" alt="Google Maps" className="h-5 w-5 object-contain" />
                    Abrir no Google Maps
                  </a>
                  <a
                    href={wazeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors hover:bg-accent"
                  >
                    <img src="/icons/waze.png" alt="Waze" className="h-5 w-5 object-contain" />
                    Abrir no Waze
                  </a>
                </div>
              </CardContent></Card>
            );
          })()}
          {/* Responsável no Local */}
          <Card className="sm:col-span-2"><CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <UserCircle className="h-3.5 w-3.5" />
                Responsável no Local (falar com)
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setEditingContact(null); setContactFormOpen(true); }}
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
              </Button>
            </div>
            {contacts.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">Nenhum contato cadastrado</p>
            ) : (
              <div className="space-y-2">
                {contacts.map((c) => {
                  const whatsappNumber = c.phone?.replace(/\D/g, '');
                  const whatsappUrl = whatsappNumber ? `https://wa.me/55${whatsappNumber}` : null;
                  return (
                    <div key={c.id} className="flex items-start justify-between gap-3 rounded-lg border p-3 bg-muted/30">
                      <div className="space-y-1 min-w-0 flex-1">
                        <p className="text-sm font-medium">{c.name}</p>
                        {c.position && (
                          <p className="text-xs text-muted-foreground">{c.position}</p>
                        )}
                        {c.phone && (
                          <a href={`tel:${c.phone}`} className="text-xs text-muted-foreground flex items-center gap-1 hover:text-primary transition-colors">
                            <Phone className="h-3 w-3" />{c.phone}
                          </a>
                        )}
                        {c.email && (
                          <a href={`mailto:${c.email}`} className="text-xs text-muted-foreground flex items-center gap-1 hover:text-primary transition-colors">
                            <Mail className="h-3 w-3" />{c.email}
                          </a>
                        )}
                      </div>
                      <div className="flex gap-1 shrink-0">
                        {whatsappUrl && (
                          <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" title="Falar no WhatsApp">
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-[#25D366] hover:text-[#25D366] hover:bg-[#25D366]/10">
                              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                              </svg>
                            </Button>
                          </a>
                        )}
                        <Button variant="edit-ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingContact(c); setContactFormOpen(true); }}>
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="destructive-ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteContactId(c.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent></Card>

          {customer.notes && (
            <Card className="sm:col-span-2"><CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Observações</p>
              <p className="text-sm mt-1">{customer.notes}</p>
            </CardContent></Card>
          )}
        </div>
      )}

      {activeTab === 'equipamentos' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-widest text-foreground/70">
              Equipamentos do Cliente
            </h2>
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setEquipFormOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Equipamento
            </Button>
          </div>
          {customerEquipment.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <Package className="mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Nenhum equipamento cadastrado para este cliente</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {customerEquipment.map((eq) => (
                <Card
                  key={eq.id}
                  className="cursor-pointer hover:shadow-md transition-shadow overflow-hidden"
                  onClick={() => navigate(`/equipamentos/${eq.id}`, { state: { from: 'customer', customerId: id } })}
                >
                  {eq.photo_url && (
                    <div className="h-32 w-full bg-muted">
                      <img
                        src={eq.photo_url}
                        alt={eq.name}
                        className="h-full w-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    </div>
                  )}
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="font-medium truncate">{eq.name}</p>
                      <Badge variant={eq.status === 'active' ? 'default' : 'secondary'} className="text-xs shrink-0">
                        {eq.status === 'active' ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </div>
                    {(eq.brand || eq.model) && (
                      <p className="text-xs text-muted-foreground">
                        {[eq.brand, eq.model].filter(Boolean).join(' - ')}
                      </p>
                    )}
                    {eq.identifier && (
                      <p className="text-xs font-mono text-muted-foreground">ID: {eq.identifier}</p>
                    )}
                    {eq.location && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3 w-3" />{eq.location}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'historico' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-widest text-foreground/70">Histórico de OS</h2>
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setOsFormOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Nova OS
            </Button>
          </div>
          {customerOrders.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <ClipboardList className="mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Nenhuma OS registrada para este cliente</p>
            </div>
          ) : (
            <Card><CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                     <TableRow>
                      <SortableTableHead sortKey="order_number" sortConfig={osSortConfig} onSort={handleOsSort}>OS</SortableTableHead>
                      <SortableTableHead sortKey="status" sortConfig={osSortConfig} onSort={handleOsSort}>Status</SortableTableHead>
                      <SortableTableHead sortKey="scheduled_date" sortConfig={osSortConfig} onSort={handleOsSort} className="hidden sm:table-cell">Data</SortableTableHead>
                      <SortableTableHead sortKey="" sortConfig={osSortConfig} onSort={() => {}}>Ações</SortableTableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ordersPagination.paginatedItems.map((os) => (
                      <TableRow key={os.id}>
                        <TableCell><span className="font-mono font-medium">#{String(os.order_number).padStart(4, '0')}</span></TableCell>
                        <TableCell><Badge variant="outline">{osStatusLabels[os.status]}</Badge></TableCell>
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
      )}

      {activeTab === 'chamados' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-widest text-foreground/70">Chamados do Portal</h2>
          </div>
          {portalTickets.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <Megaphone className="mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Nenhum chamado aberto pelo portal do cliente</p>
              {!portalLink && (
                <p className="text-xs text-muted-foreground mt-1">Gere o link do portal para o cliente abrir chamados</p>
              )}
            </div>
          ) : (
            <Card><CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                     <TableRow>
                      <SortableTableHead sortKey="order_number" sortConfig={ticketSortConfig} onSort={handleTicketSort}>OS</SortableTableHead>
                      <SortableTableHead sortKey="description" sortConfig={ticketSortConfig} onSort={handleTicketSort}>Descrição</SortableTableHead>
                      <SortableTableHead sortKey="status" sortConfig={ticketSortConfig} onSort={handleTicketSort}>Status</SortableTableHead>
                      <SortableTableHead sortKey="created_at" sortConfig={ticketSortConfig} onSort={handleTicketSort} className="hidden sm:table-cell">Data</SortableTableHead>
                      <SortableTableHead sortKey="" sortConfig={ticketSortConfig} onSort={() => {}}>Ações</SortableTableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ticketsPagination.paginatedItems.map((os) => (
                      <TableRow key={os.id}>
                        <TableCell><span className="font-mono font-medium">#{String(os.order_number).padStart(4, '0')}</span></TableCell>
                        <TableCell><p className="text-sm truncate max-w-[200px]">{os.description || '-'}</p></TableCell>
                        <TableCell><Badge variant="outline">{osStatusLabels[os.status]}</Badge></TableCell>
                        <TableCell className="hidden sm:table-cell">
                          {format(new Date(os.created_at), 'dd/MM/yyyy', { locale: ptBR })}
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
              <DataTablePagination page={ticketsPagination.page} totalPages={ticketsPagination.totalPages} totalItems={ticketsPagination.totalItems} from={ticketsPagination.from} to={ticketsPagination.to} pageSize={ticketsPagination.pageSize} onPageChange={ticketsPagination.setPage} onPageSizeChange={ticketsPagination.setPageSize} />
            </CardContent></Card>
          )}
        </div>
      )}

      {activeTab === 'contratos' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-widest text-foreground/70">Contratos</h2>
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setContractFormOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Contrato
            </Button>
          </div>
          {customerContracts.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <FileText className="mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Nenhum contrato vinculado a este cliente</p>
            </div>
          ) : (
            <Card><CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                     <TableRow>
                      <SortableTableHead sortKey="name" sortConfig={contractSortConfig} onSort={handleContractSort}>Nome</SortableTableHead>
                      <SortableTableHead sortKey="status" sortConfig={contractSortConfig} onSort={handleContractSort}>Status</SortableTableHead>
                      <SortableTableHead sortKey="frequency_type" sortConfig={contractSortConfig} onSort={handleContractSort} className="hidden sm:table-cell">Frequência</SortableTableHead>
                      <SortableTableHead sortKey="start_date" sortConfig={contractSortConfig} onSort={handleContractSort} className="hidden sm:table-cell">Início</SortableTableHead>
                      <SortableTableHead sortKey="" sortConfig={contractSortConfig} onSort={() => {}}>Ações</SortableTableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contractsPagination.paginatedItems.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell><p className="font-medium truncate max-w-[200px]">{c.name}</p></TableCell>
                        <TableCell>
                          <Badge variant={c.status === 'active' ? 'default' : 'secondary'}>
                            {c.status === 'active' ? 'Ativo' : c.status === 'paused' ? 'Pausado' : 'Encerrado'}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-sm">
                          {getFrequencyLabel(c.frequency_type, c.frequency_value)}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-sm">
                          {format(new Date(c.start_date), 'dd/MM/yyyy', { locale: ptBR })}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => navigate(`/contratos/${c.id}`)}>
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <DataTablePagination page={contractsPagination.page} totalPages={contractsPagination.totalPages} totalItems={contractsPagination.totalItems} from={contractsPagination.from} to={contractsPagination.to} pageSize={contractsPagination.pageSize} onPageChange={contractsPagination.setPage} onPageSizeChange={contractsPagination.setPageSize} />
            </CardContent></Card>
          )}
        </div>
      )}

      {activeTab === 'financeiro' && (
        <div className="space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-widest text-foreground/70">Transações do Cliente</h2>
          {customerTransactions.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <DollarSign className="mb-2 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Nenhuma transação registrada para este cliente</p>
            </div>
          ) : (
            <Card><CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                     <TableRow>
                      <SortableTableHead sortKey="description" sortConfig={finSortConfig} onSort={handleFinSort}>Descrição</SortableTableHead>
                      <SortableTableHead sortKey="amount" sortConfig={finSortConfig} onSort={handleFinSort}>Valor</SortableTableHead>
                      <SortableTableHead sortKey="transaction_date" sortConfig={finSortConfig} onSort={handleFinSort} className="hidden sm:table-cell">Data</SortableTableHead>
                      <SortableTableHead sortKey="is_paid" sortConfig={finSortConfig} onSort={handleFinSort}>Status</SortableTableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactionsPagination.paginatedItems.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell><p className="font-medium">{t.description}</p></TableCell>
                        <TableCell>
                          <span className={t.transaction_type === 'entrada' ? 'text-success' : 'text-destructive'}>
                            {t.transaction_type === 'entrada' ? '+' : '-'} {formatCurrency(t.amount)}
                          </span>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          {format(new Date(t.transaction_date), 'dd/MM/yyyy', { locale: ptBR })}
                        </TableCell>
                        <TableCell>
                          <Badge variant={t.is_paid ? 'default' : 'secondary'}>
                            {t.is_paid ? 'Pago' : 'Pendente'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <DataTablePagination page={transactionsPagination.page} totalPages={transactionsPagination.totalPages} totalItems={transactionsPagination.totalItems} from={transactionsPagination.from} to={transactionsPagination.to} pageSize={transactionsPagination.pageSize} onPageChange={transactionsPagination.setPage} onPageSizeChange={transactionsPagination.setPageSize} />
            </CardContent></Card>
          )}
        </div>
      )}

      {/* Equipment Form Dialog */}
      <EquipmentFormDialog
        open={equipFormOpen}
        onOpenChange={setEquipFormOpen}
        equipment={null}
        onSubmit={async (data: any) => {
          await createEquipment.mutateAsync({ ...data, customer_id: id });
        }}
        customers={customer ? [customer] : []}
        categories={categories}
        isLoading={createEquipment.isPending}
      />

      {/* OS Form Dialog - pre-filled with this customer */}
      <ServiceOrderFormDialog
        open={osFormOpen}
        onOpenChange={setOsFormOpen}
        defaultCustomerId={id}
        onSubmit={async (data: any) => {
          await createServiceOrder.mutateAsync(data);
        }}
        isLoading={createServiceOrder.isPending}
      />

      {/* Contract Form Dialog - pre-filled with this customer */}
      <ContractFormDialog
        open={contractFormOpen}
        onOpenChange={setContractFormOpen}
        defaultCustomerId={id}
        onCreated={(contractId) => navigate(`/contratos/${contractId}`)}
      />

      {/* Edit Customer Dialog */}
      <CustomerFormDialog
        open={editCustomerOpen}
        onOpenChange={setEditCustomerOpen}
        customer={customer}
        onSubmit={async (data: any) => {
          await updateCustomer.mutateAsync({ id: customer.id, ...data });
        }}
        isLoading={updateCustomer.isPending}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cliente</AlertDialogTitle>
            <AlertDialogDescription>Tem certeza que deseja excluir o cliente "{customer.name}"? Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                await deleteCustomer.mutateAsync(customer.id);
                navigate('/clientes');
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Contact Form Dialog */}
      <ContactFormDialog
        open={contactFormOpen}
        onOpenChange={(open) => { setContactFormOpen(open); if (!open) setEditingContact(null); }}
        contact={editingContact}
        onSubmit={async (data) => {
          if (editingContact) {
            await updateContact.mutateAsync({ id: editingContact.id, ...data });
          } else {
            await createContact.mutateAsync({ customer_id: id!, ...data });
          }
        }}
        isLoading={createContact.isPending || updateContact.isPending}
      />

      {/* Delete Contact Confirmation */}
      <AlertDialog open={!!deleteContactId} onOpenChange={(open) => { if (!open) setDeleteContactId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir contato</AlertDialogTitle>
            <AlertDialogDescription>Tem certeza que deseja excluir este contato?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (deleteContactId) {
                  await deleteContact.mutateAsync(deleteContactId);
                  setDeleteContactId(null);
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
