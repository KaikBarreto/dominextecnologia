import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Phone, Mail, MapPin, Calendar, ClipboardList, DollarSign, Package, ExternalLink, Plus, Edit, Trash2, UserCircle, Copy, FileText, Megaphone, CheckSquare, CheckCircle2, ChevronDown } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { useTableSort } from '@/hooks/useTableSort';
import { SortableTableHead } from '@/components/ui/SortableTableHead';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MobilePillTabs } from '@/components/mobile/MobilePillTabs';
import { FABButton } from '@/components/mobile/FABButton';
import { useCustomers } from '@/hooks/useCustomers';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useServiceOrders } from '@/hooks/useServiceOrders';
import { useFinancial } from '@/hooks/useFinancial';
import { getErrorMessage } from '@/utils/errorMessages';
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
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyModules } from '@/hooks/useCompanyModules';
import { TaskFormDialog, TaskFormData } from '@/components/schedule/TaskFormDialog';
import { RowActionsMenu } from '@/components/ui/RowActionsMenu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { normalizeOptionalForeignKeys } from '@/utils/foreignKeys';
import { useQueryClient } from '@tanstack/react-query';

type TabKey = 'geral' | 'equipamentos' | 'historico' | 'tarefas' | 'financeiro' | 'chamados' | 'contratos';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { isAdminOrGestor, hasPermission } = useAuth();
  const canViewCustomerFinancial = isAdminOrGestor() || hasPermission('fn:view_customer_financial');
  const { hasModule } = useCompanyModules();
  const hasPortal = hasModule('customer_portal');
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
  const [contractFormOpen, setContractFormOpen] = useState(false);
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const customer = customers.find(c => c.id === id);

  const customerOptions = useMemo(
    () =>
      customers.map((c) => ({
        value: c.id,
        label: c.name,
        sublabel: c.document || c.phone || undefined,
      })),
    [customers]
  );
  const customerOrders = serviceOrders.filter(os => os.customer_id === id && (os as any).entry_type !== 'tarefa');
  const customerTasks = serviceOrders.filter(os => os.customer_id === id && (os as any).entry_type === 'tarefa');
  const customerTransactions = transactions.filter(t => t.customer_id === id);
  const customerContracts = contracts.filter(c => c.customer_id === id);

  // Portal tickets (origin = 'portal')
  const portalTickets = customerOrders.filter(os => (os as any).origin === 'portal');

  const { sortedItems: sortedOrders, sortConfig: osSortConfig, handleSort: handleOsSort } = useTableSort(customerOrders);
  const ordersPagination = useDataPagination(sortedOrders);
  const { sortedItems: sortedTasks, sortConfig: taskSortConfig, handleSort: handleTaskSort } = useTableSort(customerTasks);
  const tasksPagination = useDataPagination(sortedTasks);
  const { sortedItems: sortedTransactions, sortConfig: finSortConfig, handleSort: handleFinSort } = useTableSort(customerTransactions);
  const transactionsPagination = useDataPagination(sortedTransactions);
  const { sortedItems: sortedTickets, sortConfig: ticketSortConfig, handleSort: handleTicketSort } = useTableSort(portalTickets);
  const ticketsPagination = useDataPagination(sortedTickets);
  const { sortedItems: sortedContracts, sortConfig: contractSortConfig, handleSort: handleContractSort } = useTableSort(customerContracts);
  const contractsPagination = useDataPagination(sortedContracts);

  const tabs: { key: TabKey; label: string }[] = useMemo(() => {
    const allTabs: { key: TabKey; label: string }[] = [
      { key: 'geral', label: 'Geral' },
      { key: 'equipamentos', label: 'Equipamentos' },
      { key: 'historico', label: 'Histórico de OS' },
      { key: 'tarefas', label: 'Tarefas' },
    ];
    if (hasPortal) {
      allTabs.push({ key: 'chamados', label: 'Chamados' });
    }
    allTabs.push({ key: 'contratos', label: 'Contratos' });
    if (canViewCustomerFinancial) {
      allTabs.push({ key: 'financeiro', label: 'Financeiro' });
    }
    return allTabs;
  }, [canViewCustomerFinancial, hasPortal]);

  // Portal é criado automaticamente para todo cliente: apenas buscamos o token ativo existente.
  useEffect(() => {
    if (!id) return;
    let active = true;
    supabase
      .from('customer_portals')
      .select('token')
      .eq('customer_id', id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (active && data) setPortalLink(`${window.location.origin}/portal/${(data as any).token}`);
      });
    return () => { active = false; };
  }, [id]);

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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 min-w-0">
        {/* Seta de voltar própria da página: só no desktop (mobile/tablet usam a global do shell). */}
        <Button variant="ghost" size="icon" className="shrink-0 hidden lg:flex" onClick={() => navigate('/clientes')}>
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
          {/* Desktop: nome vira gatilho de troca de cliente (select com busca). Mobile: título simples. */}
          {!isMobile ? (
            <Popover open={switcherOpen} onOpenChange={setSwitcherOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="group flex items-center gap-1.5 max-w-full text-left rounded-md -mx-1 px-1 hover:bg-accent/50 transition-colors"
                  aria-label="Trocar de cliente"
                >
                  <h1 className="text-xl sm:text-2xl font-bold truncate">{customer.name}</h1>
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-0" align="start">
                <Command>
                  <CommandInput placeholder="Buscar cliente..." />
                  <CommandList className="max-h-[40vh] overflow-y-auto overscroll-contain">
                    <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
                    <CommandGroup>
                      {customerOptions.map((opt) => (
                        <CommandItem
                          key={opt.value}
                          value={`${opt.label} ${opt.sublabel ?? ''}`}
                          onSelect={() => {
                            setSwitcherOpen(false);
                            if (opt.value !== id) navigate(`/clientes/${opt.value}`);
                          }}
                        >
                          <div className="min-w-0">
                            <span className="block truncate">{opt.label}</span>
                            {opt.sublabel && (
                              <span className="block text-xs text-muted-foreground truncate">{opt.sublabel}</span>
                            )}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          ) : (
            <h1 className="text-xl sm:text-2xl font-bold truncate">{customer.name}</h1>
          )}
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <Badge variant={customer.customer_type === 'pj' ? 'default' : 'secondary'}>
              {customer.customer_type === 'pj' ? 'PJ' : 'PF'}
            </Badge>
            {customer.company_name && (
              <span className="text-sm text-muted-foreground truncate">{customer.company_name}</span>
            )}
          </div>
        </div>
        <div className="ml-auto shrink-0">
          <RowActionsMenu
            actions={[
              {
                label: 'Copiar link do portal',
                icon: Copy,
                onClick: () => { if (portalLink) { navigator.clipboard.writeText(portalLink); toast({ title: 'Link do portal copiado!' }); } },
                hidden: !hasPortal || !portalLink,
              },
              {
                label: 'Abrir portal',
                icon: ExternalLink,
                onClick: () => { if (portalLink) window.open(portalLink, '_blank', 'noopener,noreferrer'); },
                hidden: !hasPortal || !portalLink,
              },
              {
                label: 'Editar',
                icon: Edit,
                variant: 'edit',
                onClick: () => setEditCustomerOpen(true),
              },
              {
                label: 'Excluir',
                icon: Trash2,
                variant: 'delete',
                onClick: () => setDeleteConfirmOpen(true),
              },
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
            <Card className={cn('sm:col-span-2', isMobile && 'rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)]')}><CardContent className="p-4 flex justify-center">
              <img src={customer.photo_url} alt={customer.name} className="h-32 w-32 rounded-full object-cover border" />
            </CardContent></Card>
          )}
          {(customer as any).origin && (() => {
            const originData = activeOrigins.find(o => o.name === (customer as any).origin);
            const LucideIcon = originData ? (LucideIcons as any)[originData.icon] : null;
            return (
              <Card className={cn(isMobile && 'rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)]')}><CardContent className="p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Origem</p>
                <div className="flex items-center gap-2 mt-1">
                  {LucideIcon && originData && (
                    <div className="h-5 w-5 rounded flex items-center justify-center" style={{ backgroundColor: originData.color }}>
                      <LucideIcon className="h-3 w-3 text-white" />
                    </div>
                  )}
                  <p className="text-sm font-medium leading-tight">{(customer as any).origin}</p>
                </div>
              </CardContent></Card>
            );
          })()}
          {customer.document && (
            <Card className={cn(isMobile && 'rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)]')}><CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">CPF/CNPJ</p>
              <p className="text-sm font-medium mt-1 leading-tight">{customer.document}</p>
            </CardContent></Card>
          )}
          {customer.email && (
            <Card className={cn(isMobile && 'rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)]')}><CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Email</p>
              <p className="text-sm font-medium mt-1 flex items-center gap-1 leading-tight"><Mail className="h-3 w-3" />{customer.email}</p>
            </CardContent></Card>
          )}
          {customer.phone && (
            <Card className={cn(isMobile && 'rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)]')}><CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Telefone</p>
              <p className="text-sm font-medium mt-1 flex items-center gap-1 leading-tight"><Phone className="h-3 w-3" />{customer.phone}</p>
            </CardContent></Card>
          )}
          {customer.birth_date && (
            <Card className={cn(isMobile && 'rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)]')}><CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Data de Nascimento</p>
              <p className="text-sm font-medium mt-1 flex items-center gap-1 leading-tight">
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
              <Card className={cn('sm:col-span-2', isMobile && 'rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)]')}><CardContent className="p-4 space-y-3">
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
                    className="flex items-center gap-2 rounded-lg border px-3 py-2 min-h-[44px] text-xs font-medium transition-all hover:bg-accent active:scale-[0.98]"
                  >
                    <img src="/icons/google-maps.png" alt="Google Maps" className="h-5 w-5 object-contain" />
                    Abrir no Google Maps
                  </a>
                  <a
                    href={wazeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-lg border px-3 py-2 min-h-[44px] text-xs font-medium transition-all hover:bg-accent active:scale-[0.98]"
                  >
                    <img src="/icons/waze.png" alt="Waze" className="h-5 w-5 object-contain" />
                    Abrir no Waze
                  </a>
                </div>
              </CardContent></Card>
            );
          })()}
          {/* Responsável no Local */}
          <Card className={cn('sm:col-span-2', isMobile && 'rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)]')}><CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <UserCircle className="h-3.5 w-3.5" />
                Responsável no Local (falar com)
              </p>
              <Button
                variant="outline"
                size="sm"
                className="min-h-[44px]"
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
                    <div key={c.id} className={cn('flex items-start justify-between gap-3 rounded-lg border p-3 bg-muted/30', isMobile && 'rounded-2xl active:scale-[0.98] transition-transform duration-100')}>
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
                      <div className="shrink-0">
                        <RowActionsMenu
                          triggerClassName="h-7 w-7"
                          actions={[
                            {
                              label: 'WhatsApp',
                              icon: Phone,
                              onClick: () => whatsappUrl && window.open(whatsappUrl, '_blank', 'noopener,noreferrer'),
                              hidden: !whatsappUrl,
                            },
                            {
                              label: 'Editar contato',
                              icon: Edit,
                              variant: 'edit',
                              onClick: () => { setEditingContact(c); setContactFormOpen(true); },
                            },
                            {
                              label: 'Excluir contato',
                              icon: Trash2,
                              variant: 'delete',
                              onClick: () => setDeleteContactId(c.id),
                            },
                          ]}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent></Card>

          {customer.notes && (
            <Card className={cn('sm:col-span-2', isMobile && 'rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)]')}><CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Observações</p>
              <p className="text-sm mt-1 leading-relaxed">{customer.notes}</p>
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
            <Button className="hidden lg:flex bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setEquipFormOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Equipamento
            </Button>
          </div>
          {customerEquipment.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center px-4 py-16">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <Package className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-base font-medium leading-tight">Nenhum equipamento</p>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">Cadastre o primeiro equipamento deste cliente</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {customerEquipment.map((eq) => (
                <Card
                  key={eq.id}
                  className={cn(
                    'cursor-pointer overflow-hidden transition-all',
                    isMobile
                      ? 'rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] active:scale-[0.98] transition-transform duration-100'
                      : 'hover:shadow-md'
                  )}
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
                    <div className="flex items-center justify-between min-h-[44px]">
                      <p className="font-medium truncate leading-tight">{eq.name}</p>
                      <Badge variant={eq.status === 'active' ? 'default' : 'secondary'} className="text-xs shrink-0">
                        {eq.status === 'active' ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </div>
                    {(eq.brand || eq.model) && (
                      <p className="text-xs text-muted-foreground leading-relaxed">
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
          {isMobile && (
            <FABButton
              icon={<Plus className="h-5 w-5" />}
              label="Equipamento"
              onClick={() => setEquipFormOpen(true)}
            />
          )}
        </div>
      )}

      {activeTab === 'historico' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-widest text-foreground/70">Histórico de OS</h2>
            <Button className="hidden lg:flex bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setOsFormOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Nova OS
            </Button>
          </div>
          {customerOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center px-4 py-16">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <ClipboardList className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-base font-medium leading-tight">Nenhuma OS registrada</p>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">Crie a primeira ordem de serviço deste cliente</p>
            </div>
          ) : (
            <Card className={cn(isMobile && 'rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)]')}><CardContent className="p-0">
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
                      <TableRow key={os.id} className={cn(isMobile && 'active:bg-muted/50 transition-colors min-h-[44px]')}>
                         <TableCell><span className="font-mono font-medium">#{String(os.order_number).padStart(6, '0')}</span></TableCell>
                        <TableCell><Badge variant="outline">{osStatusLabels[os.status]}</Badge></TableCell>
                        <TableCell className="hidden sm:table-cell">
                          {os.scheduled_date ? format(new Date(os.scheduled_date), 'dd/MM/yyyy', { locale: ptBR }) : '-'}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px]" onClick={() => window.open(`${window.location.origin}/os-tecnico/${os.id}`, '_blank')}>
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
          {isMobile && (
            <FABButton
              icon={<Plus className="h-5 w-5" />}
              label="OS"
              onClick={() => setOsFormOpen(true)}
            />
          )}
        </div>
      )}

      {activeTab === 'tarefas' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-widest text-foreground/70">Tarefas do Cliente</h2>
            <Button className="hidden lg:flex bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setTaskFormOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Nova Tarefa
            </Button>
          </div>
          {customerTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center px-4 py-16">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <CheckSquare className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-base font-medium leading-tight">Nenhuma tarefa</p>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">Crie a primeira tarefa deste cliente</p>
            </div>
          ) : (
            <Card className={cn(isMobile && 'rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)]')}><CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableTableHead sortKey="task_title" sortConfig={taskSortConfig} onSort={handleTaskSort}>Tarefa</SortableTableHead>
                      <SortableTableHead sortKey="status" sortConfig={taskSortConfig} onSort={handleTaskSort}>Status</SortableTableHead>
                      <SortableTableHead sortKey="scheduled_date" sortConfig={taskSortConfig} onSort={handleTaskSort} className="hidden sm:table-cell">Data</SortableTableHead>
                      <SortableTableHead sortKey="scheduled_time" sortConfig={taskSortConfig} onSort={handleTaskSort} className="hidden sm:table-cell">Horário</SortableTableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tasksPagination.paginatedItems.map((task: any) => {
                      const isDone = task.status === 'finalizado' || task.status === 'concluido';
                      return (
                        <TableRow key={task.id} className={cn(isDone ? 'opacity-60' : '', isMobile && 'active:bg-muted/50 transition-colors min-h-[44px]')}>
                          <TableCell>
                            <div className="flex items-center gap-2 min-h-[44px]">
                              {isDone && <CheckCircle2 className="h-4 w-4 text-success shrink-0" />}
                              <span className={cn('font-medium leading-tight', isDone && 'line-through')}>{task.task_title || task.description || '-'}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={isDone ? 'default' : 'outline'}>
                              {isDone ? 'Concluída' : task.status === 'em_andamento' ? 'Em andamento' : 'Pendente'}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            {task.scheduled_date ? format(new Date(task.scheduled_date), 'dd/MM/yyyy', { locale: ptBR }) : '-'}
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            {task.scheduled_time ? task.scheduled_time.slice(0, 5) : '-'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <DataTablePagination page={tasksPagination.page} totalPages={tasksPagination.totalPages} totalItems={tasksPagination.totalItems} from={tasksPagination.from} to={tasksPagination.to} pageSize={tasksPagination.pageSize} onPageChange={tasksPagination.setPage} onPageSizeChange={tasksPagination.setPageSize} />
            </CardContent></Card>
          )}
          {isMobile && (
            <FABButton
              icon={<Plus className="h-5 w-5" />}
              label="Tarefa"
              onClick={() => setTaskFormOpen(true)}
            />
          )}
        </div>
      )}

      {activeTab === 'chamados' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-widest text-foreground/70">Chamados do Portal</h2>
          </div>
          {portalTickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center px-4 py-16">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <Megaphone className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-base font-medium leading-tight">Nenhum chamado</p>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                {!portalLink ? 'Gere o link do portal para o cliente abrir chamados' : 'Nenhum chamado aberto pelo portal do cliente'}
              </p>
            </div>
          ) : (
            <Card className={cn(isMobile && 'rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)]')}><CardContent className="p-0">
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
                      <TableRow key={os.id} className={cn(isMobile && 'active:bg-muted/50 transition-colors')}>
                        <TableCell><span className="font-mono font-medium">#{String(os.order_number).padStart(6, '0')}</span></TableCell>
                        <TableCell><p className="text-sm truncate max-w-[200px] leading-relaxed">{os.description || '-'}</p></TableCell>
                        <TableCell><Badge variant="outline">{osStatusLabels[os.status]}</Badge></TableCell>
                        <TableCell className="hidden sm:table-cell">
                          {format(new Date(os.created_at), 'dd/MM/yyyy', { locale: ptBR })}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px]" onClick={() => window.open(`${window.location.origin}/os-tecnico/${os.id}`, '_blank')}>
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
            <Button className="hidden lg:flex bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setContractFormOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Contrato
            </Button>
          </div>
          {customerContracts.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center px-4 py-16">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <FileText className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-base font-medium leading-tight">Nenhum contrato</p>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">Vincule o primeiro contrato a este cliente</p>
            </div>
          ) : (
            <Card className={cn(isMobile && 'rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)]')}><CardContent className="p-0">
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
                      <TableRow key={c.id} className={cn(isMobile && 'active:bg-muted/50 transition-colors')}>
                        <TableCell><p className="font-medium truncate max-w-[200px] leading-tight">{c.name}</p></TableCell>
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
                          <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px]" onClick={() => navigate(`/contratos/${c.id}`)}>
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
          {isMobile && (
            <FABButton
              icon={<Plus className="h-5 w-5" />}
              label="Contrato"
              onClick={() => setContractFormOpen(true)}
            />
          )}
        </div>
      )}

      {activeTab === 'financeiro' && (
        <div className="space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-widest text-foreground/70">Transações do Cliente</h2>
          {customerTransactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center px-4 py-16">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <DollarSign className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-base font-medium leading-tight">Nenhuma transação</p>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">Nenhuma transação registrada para este cliente</p>
            </div>
          ) : (
            <Card className={cn(isMobile && 'rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)]')}><CardContent className="p-0">
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
                      <TableRow key={t.id} className={cn(isMobile && 'active:bg-muted/50 transition-colors')}>
                        <TableCell><p className="font-medium leading-tight">{t.description}</p></TableCell>
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

      {/* Task Form Dialog - pre-filled with this customer */}
      <TaskFormDialog
        open={taskFormOpen}
        onOpenChange={setTaskFormOpen}
        defaultCustomerId={id}
        isLoading={creatingTask}
        onSubmit={async (data: TaskFormData) => {
          setCreatingTask(true);
          try {
            const { getCurrentUserCompanyId } = await import('@/hooks/useUserCompany');
            const company_id = await getCurrentUserCompanyId();
            const payload = normalizeOptionalForeignKeys({
              entry_type: 'tarefa',
              task_title: data.task_title,
              task_type_id: data.task_type_id || null,
              service_type_id: data.service_type_id || null,
              customer_id: id || null,
              technician_id: data.technician_id || null,
              team_id: data.team_id || null,
              scheduled_date: data.scheduled_date || null,
              scheduled_time: data.scheduled_time || null,
              duration_minutes: data.duration_minutes || 60,
              description: data.description || null,
              os_type: 'visita_tecnica',
              status: 'pendente',
              company_id,
            } as any, ['task_type_id', 'service_type_id', 'customer_id', 'technician_id', 'team_id']);

            const { data: created, error } = await supabase.from('service_orders').insert(payload as any).select('id');
            if (error) throw error;

            if (created && data.assignee_user_ids && data.assignee_user_ids.length > 0) {
              const assigneeRows = created.flatMap((row: any) =>
                data.assignee_user_ids!.map(uid => ({ service_order_id: row.id, user_id: uid }))
              );
              await supabase.from('service_order_assignees').insert(assigneeRows);
            }

            toast({ title: 'Tarefa criada com sucesso!' });
            queryClient.invalidateQueries({ queryKey: ['service-orders'] });
          } catch (err: any) {
            toast({ variant: 'destructive', title: 'Erro ao criar tarefa', description: getErrorMessage(err) });
          } finally {
            setCreatingTask(false);
          }
        }}
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
