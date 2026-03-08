import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Phone, Mail, MapPin, Calendar, ClipboardList, DollarSign, Package, ExternalLink, Plus, Edit, Trash2, UserCircle, Link2, Copy, QrCode, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCustomers } from '@/hooks/useCustomers';
import { useServiceOrders } from '@/hooks/useServiceOrders';
import { useFinancial } from '@/hooks/useFinancial';
import { useEquipment } from '@/hooks/useEquipment';
import { useEquipmentCategories } from '@/hooks/useEquipmentCategories';
import { EquipmentFormDialog } from '@/components/customers/EquipmentFormDialog';
import { CustomerFormDialog } from '@/components/customers/CustomerFormDialog';
import { ContactFormDialog } from '@/components/customers/ContactFormDialog';
import { ServiceOrderFormDialog } from '@/components/service-orders/ServiceOrderFormDialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useCustomerContacts } from '@/hooks/useCustomerContacts';
import { osStatusLabels } from '@/types/database';
import { useDataPagination } from '@/hooks/useDataPagination';
import { DataTablePagination } from '@/components/ui/DataTablePagination';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type TabKey = 'geral' | 'equipamentos' | 'historico' | 'financeiro';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKey>('geral');
  const { customers, isLoading, updateCustomer, deleteCustomer } = useCustomers();
  const { serviceOrders, createServiceOrder } = useServiceOrders();
  const { transactions } = useFinancial();
  const { equipment: customerEquipment, createEquipment } = useEquipment(id);
  const { categories } = useEquipmentCategories();

  const { contacts, createContact, updateContact, deleteContact } = useCustomerContacts(id);

  const [equipFormOpen, setEquipFormOpen] = useState(false);
  const [osFormOpen, setOsFormOpen] = useState(false);
  const [editCustomerOpen, setEditCustomerOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [contactFormOpen, setContactFormOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<typeof contacts[0] | null>(null);
  const [deleteContactId, setDeleteContactId] = useState<string | null>(null);

  const customer = customers.find(c => c.id === id);
  const customerOrders = serviceOrders.filter(os => os.customer_id === id);
  const customerTransactions = transactions.filter(t => t.customer_id === id);
  const ordersPagination = useDataPagination(customerOrders);
  const transactionsPagination = useDataPagination(customerTransactions);

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
    { key: 'financeiro', label: 'Financeiro' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/clientes')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        {customer.photo_url ? (
          <img src={customer.photo_url} alt="" className="h-12 w-12 rounded-full object-cover border" />
        ) : (
          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
            <Package className="h-5 w-5 text-muted-foreground" />
          </div>
        )}
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{customer.name}</h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge variant={customer.customer_type === 'pj' ? 'default' : 'secondary'}>
              {customer.customer_type === 'pj' ? 'PJ' : 'PF'}
            </Badge>
            {customer.company_name && (
              <span className="text-sm text-muted-foreground">{customer.company_name}</span>
            )}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="edit-ghost" size="sm" onClick={() => setEditCustomerOpen(true)}>
            <Edit className="h-4 w-4 mr-1" /> Editar
          </Button>
          <Button variant="destructive-ghost" size="sm" onClick={() => setDeleteConfirmOpen(true)}>
            <Trash2 className="h-4 w-4 mr-1" /> Excluir
          </Button>
        </div>
      </div>

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

      {activeTab === 'geral' && (
        <div className="grid gap-4 sm:grid-cols-2">
          {customer.photo_url && (
            <Card className="sm:col-span-2"><CardContent className="p-4 flex justify-center">
              <img src={customer.photo_url} alt={customer.name} className="h-32 w-32 rounded-full object-cover border" />
            </CardContent></Card>
          )}
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
                    <img src="https://maps.google.com/mapfiles/ms/icons/red-dot.png" alt="Google Maps" className="h-5 w-5" />
                    Abrir no Google Maps
                  </a>
                  <a
                    href={wazeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors hover:bg-accent"
                  >
                    <img src="https://www.waze.com/favicon.ico" alt="Waze" className="h-5 w-5" />
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
                {contacts.map((c) => (
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
                      <Button variant="edit-ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingContact(c); setContactFormOpen(true); }}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="destructive-ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteContactId(c.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
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
                  onClick={() => navigate(`/equipamentos/${eq.id}`)}
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
                      <TableHead className="text-xs uppercase tracking-wider">OS</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider">Status</TableHead>
                      <TableHead className="hidden sm:table-cell text-xs uppercase tracking-wider">Data</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider">Ações</TableHead>
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
                      <TableHead className="text-xs uppercase tracking-wider">Descrição</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider">Valor</TableHead>
                      <TableHead className="hidden sm:table-cell text-xs uppercase tracking-wider">Data</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider">Status</TableHead>
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
