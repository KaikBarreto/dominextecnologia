import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Phone, Mail, MapPin, Calendar, ClipboardList, DollarSign, Plus, Eye, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCustomers } from '@/hooks/useCustomers';
import { useServiceOrders } from '@/hooks/useServiceOrders';
import { useFinancial } from '@/hooks/useFinancial';
import { osStatusLabels } from '@/types/database';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type TabKey = 'geral' | 'historico' | 'financeiro';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKey>('geral');
  const { customers, isLoading } = useCustomers();
  const { serviceOrders } = useServiceOrders();
  const { transactions } = useFinancial();

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
    { key: 'historico', label: 'Histórico' },
    { key: 'financeiro', label: 'Financeiro' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/clientes')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{customer.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant={customer.customer_type === 'pj' ? 'default' : 'secondary'}>
              {customer.customer_type === 'pj' ? 'PJ' : 'PF'}
            </Badge>
            {(customer as any).company_name && (
              <span className="text-sm text-muted-foreground">{(customer as any).company_name}</span>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-1 border-b">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px',
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

      {activeTab === 'historico' && (
        <div className="space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-widest text-foreground/70">
            Ordens de Serviço
          </h2>
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
                        <TableCell>
                          <Badge variant="outline">{osStatusLabels[os.status]}</Badge>
                        </TableCell>
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
          <h2 className="text-sm font-bold uppercase tracking-widest text-foreground/70">
            Transações do Cliente
          </h2>
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
    </div>
  );
}
