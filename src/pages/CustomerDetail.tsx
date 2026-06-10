import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Phone, Mail, MapPin, Calendar, ClipboardList, DollarSign, Package, ExternalLink, Plus, Edit, Trash2, UserCircle, Copy, FileText, Megaphone, CheckSquare, CheckCircle2, ChevronDown, Pencil } from 'lucide-react';
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
import { MobileListItem, type ItemAction } from '@/components/mobile/MobileListItem';
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
import { ImagePreviewModal } from '@/components/ui/ImagePreviewModal';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

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
  const [editingEquipment, setEditingEquipment] = useState<any | null>(null);
  const [equipmentToDelete, setEquipmentToDelete] = useState<any | null>(null);
  const [osFormOpen, setOsFormOpen] = useState(false);
  const [editCustomerOpen, setEditCustomerOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [contactFormOpen, setContactFormOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<typeof contacts[0] | null>(null);
  const [deleteContactId, setDeleteContactId] = useState<string | null>(null);
  const [portalLink, setPortalLink] = useState<string | null>(null);
  const [portalIsPublic, setPortalIsPublic] = useState(true);
  const [updatingPortalVisibility, setUpdatingPortalVisibility] = useState(false);
  const [contractFormOpen, setContractFormOpen] = useState(false);
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const customer = customers.find(c => c.id === id);

  const getCategoryName = (categoryId?: string | null) =>
    categoryId ? categories.find(c => c.id === categoryId)?.name : undefined;
  const getCategoryColor = (categoryId?: string | null) =>
    categoryId ? categories.find(c => c.id === categoryId)?.color : undefined;

  const handleEditEquipment = (eq: any) => { setEditingEquipment(eq); setEquipFormOpen(true); };
  const handleDeleteEquipment = async () => {
    if (!equipmentToDelete) return;
    const { error } = await supabase.from('equipment').delete().eq('id', equipmentToDelete.id);
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao excluir', description: getErrorMessage(error) });
    } else {
      queryClient.invalidateQueries({ queryKey: ['equipment'] });
      toast({ title: 'Equipamento excluído!' });
    }
    setEquipmentToDelete(null);
  };

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
      .select('token, is_public')
      .eq('customer_id', id)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (active && data) {
          setPortalLink(`${window.location.origin}/portal/${(data as any).token}`);
          // is_public default = ligado (true) quando ainda não carregou / coluna ausente.
          setPortalIsPublic((data as any).is_public !== false);
        }
      });
    return () => { active = false; };
  }, [id]);

  const handleTogglePortalPublic = async (next: boolean) => {
    if (!id) return;
    const prev = portalIsPublic;
    setPortalIsPublic(next); // otimista
    setUpdatingPortalVisibility(true);
    const { error } = await supabase
      .from('customer_portals')
      .update({ is_public: next } as any)
      .eq('customer_id', id);
    setUpdatingPortalVisibility(false);
    if (error) {
      setPortalIsPublic(prev);
      toast({ variant: 'destructive', title: 'Erro ao atualizar portal', description: getErrorMessage(error) });
      return;
    }
    toast({ title: next ? 'Portal público ativado' : 'Portal agora exige login' });
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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 min-w-0">
        {/* Seta de voltar própria da página: só no desktop (mobile/tablet usam a global do shell). */}
        <Button variant="ghost" size="icon" className="shrink-0 hidden lg:flex" onClick={() => navigate('/clientes')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        {customer.photo_url ? (
          <button
            type="button"
            onClick={() => setPreviewImage(customer.photo_url!)}
            className="shrink-0 rounded-full transition-opacity hover:opacity-90 cursor-pointer"
            aria-label="Ver foto do cliente"
          >
            <img src={customer.photo_url} alt={customer.name} className="h-12 w-12 sm:h-14 sm:w-14 rounded-full object-cover border" />
          </button>
        ) : (
          <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-full bg-muted flex items-center justify-center shrink-0">
            <Package className="h-6 w-6 text-muted-foreground" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          {/* Nome vira gatilho de troca de cliente (select com busca) — mobile e desktop. */}
          <Popover open={switcherOpen} onOpenChange={setSwitcherOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="group flex items-center gap-1.5 max-w-full text-left rounded-md -mx-1 px-1 hover:bg-accent/50 transition-colors"
                  aria-label="Trocar de cliente"
                >
                  <h1 className="text-xl sm:text-2xl font-bold truncate">{customer.name}</h1>
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-[calc(100vw-2rem)] sm:w-72 p-0" align="start">
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
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <Badge variant={customer.customer_type === 'pj' ? 'default' : 'secondary'}>
              {customer.customer_type === 'pj' ? 'PJ' : 'PF'}
            </Badge>
            {customer.company_name && (
              <span className="text-sm text-muted-foreground truncate">{customer.company_name}</span>
            )}
          </div>
        </div>
        <div className="ml-auto shrink-0 flex items-center gap-2 sm:gap-3">
          {hasPortal && portalLink && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <span className="text-xs sm:text-sm font-medium text-muted-foreground whitespace-nowrap">
                      Portal Público
                    </span>
                    <Switch
                      checked={portalIsPublic}
                      disabled={updatingPortalVisibility}
                      onCheckedChange={handleTogglePortalPublic}
                      aria-label="Portal Público"
                    />
                  </label>
                </TooltipTrigger>
                <TooltipContent className="max-w-[260px]">
                  <p>
                    Ligado: qualquer pessoa com o link vê o portal (somente leitura).
                    Desligado: o link exige login da sua empresa.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <RowActionsMenu
            label="Ações"
            triggerClassName="border border-border px-3"
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
          {/* Card único "Informações" — rótulo → valor */}
          {(() => {
            type InfoRow = { label: string; node: React.ReactNode };
            const rows: InfoRow[] = [];

            const originName = (customer as any).origin as string | undefined;
            if (originName) {
              const originData = activeOrigins.find(o => o.name === originName);
              const LucideIcon = originData ? (LucideIcons as any)[originData.icon] : null;
              rows.push({
                label: 'Origem',
                node: (
                  <div className="flex items-center gap-2">
                    {LucideIcon && originData && (
                      <div className="h-5 w-5 rounded flex items-center justify-center shrink-0" style={{ backgroundColor: originData.color }}>
                        <LucideIcon className="h-3 w-3 text-white" />
                      </div>
                    )}
                    <span className="text-sm font-medium leading-tight">{originName}</span>
                  </div>
                ),
              });
            }
            if (customer.document) {
              rows.push({ label: 'CPF/CNPJ', node: <span className="text-sm font-medium leading-tight">{customer.document}</span> });
            }
            if (customer.email) {
              rows.push({
                label: 'Email',
                node: (
                  <span className="text-sm font-medium flex items-center gap-1 leading-tight">
                    <Mail className="h-3 w-3 shrink-0" />{customer.email}
                  </span>
                ),
              });
            }
            if (customer.phone) {
              const whatsappNumber = customer.phone.replace(/\D/g, '');
              const whatsappUrl = `https://wa.me/55${whatsappNumber}`;
              rows.push({
                label: 'Telefone',
                node: (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium flex items-center gap-1 leading-tight">
                      <Phone className="h-3 w-3 shrink-0" />{customer.phone}
                    </span>
                    <button
                      type="button"
                      onClick={() => window.open(whatsappUrl, '_blank', 'noopener,noreferrer')}
                      className="flex h-11 w-11 items-center justify-center rounded-lg transition-colors hover:bg-accent active:scale-[0.98]"
                      aria-label="Abrir WhatsApp do cliente"
                      title="WhatsApp"
                    >
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="#25D366" xmlns="http://www.w3.org/2000/svg">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.247-.694.247-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                      </svg>
                    </button>
                  </div>
                ),
              });
            }
            if (customer.birth_date) {
              rows.push({
                label: 'Data de Nascimento',
                node: (
                  <span className="text-sm font-medium flex items-center gap-1 leading-tight">
                    <Calendar className="h-3 w-3 shrink-0" />
                    {format(new Date(customer.birth_date), 'dd/MM/yyyy', { locale: ptBR })}
                  </span>
                ),
              });
            }

            if (rows.length === 0) return null;
            return (
              <Card className={cn('sm:col-span-2', isMobile && 'rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)]')}>
                <CardContent className="p-4 sm:p-6">
                  <h2 className="text-sm font-bold uppercase tracking-widest text-foreground/70 mb-4">Informações</h2>
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
            <Button className="hidden lg:flex bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => { setEditingEquipment(null); setEquipFormOpen(true); }}>
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
          ) : isMobile ? (
            <div className="rounded-xl border bg-card overflow-hidden">
              {customerEquipment.map((eq) => {
                const categoryColor = getCategoryColor(eq.category_id);
                const categoryName = getCategoryName(eq.category_id);
                const itemActions: ItemAction[] = [
                  {
                    key: 'edit',
                    label: 'Editar',
                    icon: <Pencil className="h-4 w-4" />,
                    variant: 'edit' as const,
                    onClick: () => handleEditEquipment(eq),
                  },
                  {
                    key: 'delete',
                    label: 'Excluir',
                    icon: <Trash2 className="h-4 w-4" />,
                    variant: 'destructive' as const,
                    onClick: () => setEquipmentToDelete(eq),
                  },
                ];
                return (
                  <MobileListItem
                    key={eq.id}
                    onClick={() => navigate(`/equipamentos/${eq.id}`, { state: { from: 'customer', customerId: id } })}
                    actions={itemActions}
                    leading={
                      eq.photo_url ? (
                        <img src={eq.photo_url} alt={eq.name} className="h-10 w-10 rounded-lg object-cover" />
                      ) : (
                        <div
                          className="h-10 w-10 rounded-lg flex items-center justify-center text-white"
                          style={{ backgroundColor: categoryColor || 'hsl(var(--muted))' }}
                        >
                          <Package className={cn('h-5 w-5', !categoryColor && 'text-muted-foreground')} />
                        </div>
                      )
                    }
                    title={
                      <span className="truncate">
                        {eq.name}
                        {eq.model && <span className="text-muted-foreground font-normal"> · {eq.model}</span>}
                      </span>
                    }
                    subtitle={
                      <span className="inline-flex items-center gap-1.5 flex-wrap">
                        {categoryName && (
                          <span className="inline-flex items-center gap-1">
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: categoryColor }} />
                            {categoryName}
                          </span>
                        )}
                        {!categoryName && (eq.identifier || '—')}
                      </span>
                    }
                    trailing={
                      <Badge variant={eq.status === 'active' ? 'default' : 'secondary'} className="text-[10px] px-2 py-0.5">
                        {eq.status === 'active' ? 'Ativo' : 'Inativo'}
                      </Badge>
                    }
                  />
                );
              })}
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableCell className="w-[60px] text-xs uppercase tracking-wider font-medium text-muted-foreground">Foto</TableCell>
                        <TableCell className="text-xs uppercase tracking-wider font-medium text-muted-foreground">Nome</TableCell>
                        <TableCell className="hidden sm:table-cell text-xs uppercase tracking-wider font-medium text-muted-foreground">Local</TableCell>
                        <TableCell className="hidden lg:table-cell text-xs uppercase tracking-wider font-medium text-muted-foreground">Categoria</TableCell>
                        <TableCell className="hidden lg:table-cell text-xs uppercase tracking-wider font-medium text-muted-foreground">Status</TableCell>
                        <TableCell className="w-[100px] text-xs uppercase tracking-wider font-medium text-muted-foreground">Ações</TableCell>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {customerEquipment.map((eq) => (
                        <TableRow
                          key={eq.id}
                          className="cursor-pointer"
                          onClick={() => navigate(`/equipamentos/${eq.id}`, { state: { from: 'customer', customerId: id } })}
                        >
                          <TableCell>
                            {eq.photo_url ? (
                              <img src={eq.photo_url} alt={eq.name} className="h-10 w-10 rounded object-cover" />
                            ) : (
                              <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                                <Package className="h-4 w-4 text-muted-foreground" />
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{eq.name}</p>
                              {eq.identifier && (
                                <p className="text-xs text-muted-foreground font-mono">{eq.identifier}</p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <span className="text-sm">{eq.location || '-'}</span>
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            {getCategoryName(eq.category_id) || '-'}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell">
                            <Badge variant={eq.status === 'active' ? 'default' : 'secondary'}>
                              {eq.status === 'active' ? 'Ativo' : 'Inativo'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div onClick={(e) => e.stopPropagation()}>
                              <RowActionsMenu
                                actions={[
                                  { label: 'Editar', icon: Pencil, variant: 'edit', onClick: () => handleEditEquipment(eq) },
                                  { label: 'Excluir', icon: Trash2, variant: 'delete', onClick: () => setEquipmentToDelete(eq) },
                                ]}
                              />
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
          {isMobile && (
            <FABButton
              icon={<Plus className="h-5 w-5" />}
              label="Equipamento"
              onClick={() => { setEditingEquipment(null); setEquipFormOpen(true); }}
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
        onOpenChange={(open) => { setEquipFormOpen(open); if (!open) setEditingEquipment(null); }}
        equipment={editingEquipment}
        onSubmit={async (data: any) => {
          if (editingEquipment) {
            const { error } = await supabase.from('equipment').update(data).eq('id', editingEquipment.id);
            if (error) {
              toast({ variant: 'destructive', title: 'Erro ao atualizar', description: getErrorMessage(error) });
              return;
            }
            queryClient.invalidateQueries({ queryKey: ['equipment'] });
            toast({ title: 'Equipamento atualizado!' });
          } else {
            await createEquipment.mutateAsync({ ...data, customer_id: id });
          }
          setEditingEquipment(null);
        }}
        customers={customer ? [customer] : []}
        categories={categories}
        isLoading={createEquipment.isPending}
      />

      {/* Delete Equipment Confirmation */}
      <AlertDialog open={!!equipmentToDelete} onOpenChange={(open) => { if (!open) setEquipmentToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir equipamento</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir "{equipmentToDelete?.name}"? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteEquipment}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

      {/* Preview da foto do cliente */}
      <ImagePreviewModal
        src={previewImage || ''}
        alt={customer.name}
        open={!!previewImage}
        onClose={() => setPreviewImage(null)}
      />
    </div>
  );
}
