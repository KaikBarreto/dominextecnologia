import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Phone, Mail, MapPin, Calendar, ClipboardList, DollarSign, Package, ExternalLink, Plus } from 'lucide-react';
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
import { ServiceOrderFormDialog } from '@/components/service-orders/ServiceOrderFormDialog';
import { osStatusLabels } from '@/types/database';
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
  const { customers, isLoading } = useCustomers();
  const { serviceOrders, createServiceOrder } = useServiceOrders();
  const { transactions } = useFinancial();
  const { equipment: customerEquipment, createEquipment } = useEquipment(id);
  const { categories } = useEquipmentCategories();

  const [equipFormOpen, setEquipFormOpen] = useState(false);
  const [osFormOpen, setOsFormOpen] = useState(false);

  const customer = customers.find(c => c.id === id);
  const customerOrders = serviceOrders.filter(os => os.customer_id === id);
  const customerTransactions = transactions.filter(t => t.customer_id === id);

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
        {(customer as any).photo_url ? (
          <img src={(customer as any).photo_url} alt="" className="h-12 w-12 rounded-full object-cover border" />
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
            {(customer as any).company_name && (
              <span className="text-sm text-muted-foreground">{(customer as any).company_name}</span>
            )}
          </div>
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
          {(customer as any).birth_date && (
            <Card><CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Data de Nascimento</p>
              <p className="text-sm font-medium mt-1 flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {format(new Date((customer as any).birth_date), 'dd/MM/yyyy', { locale: ptBR })}
              </p>
            </CardContent></Card>
          )}
          {(customer.address || customer.city) && (
            <Card className="sm:col-span-2"><CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Endereço</p>
              <p className="text-sm font-medium mt-1 flex items-center gap-1">
                <MapPin className="h-3 w-3 shrink-0" />
                {[customer.address, (customer as any).complement, customer.city, customer.state, customer.zip_code].filter(Boolean).join(', ')}
              </p>
            </CardContent></Card>
          )}
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
                    {customerOrders.map((os) => (
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
                    {customerTransactions.map((t) => (
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
    </div>
  );
}
