import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Search, Calendar as CalendarIcon, ArrowUpDown, ArrowUp, ArrowDown, RefreshCw, AlertTriangle, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AdminRenewalModal } from '@/components/admin/AdminRenewalModal';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AdminExpiringAlert } from '@/components/admin/AdminExpiringAlert';

export default function AdminSubscriptions() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [expirationFilter, setExpirationFilter] = useState('all');
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [selectedCompany, setSelectedCompany] = useState<any>(null);
  const [renewalModalOpen, setRenewalModalOpen] = useState(false);
  const [updatingField, setUpdatingField] = useState<{ id: string; field: string } | null>(null);
  const [alertsOpen, setAlertsOpen] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const { data: companies, isLoading, refetch } = useQuery({
    queryKey: ['admin-subscriptions'],
    queryFn: async () => {
      const { data, error } = await supabase.from('companies').select('*').order('subscription_expires_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const handleSort = (column: string) => {
    if (sortColumn === column) setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    else { setSortColumn(column); setSortDirection('asc'); }
  };

  const SortIcon = ({ column }: { column: string }) => {
    if (sortColumn !== column) return <ArrowUpDown className="ml-2 h-4 w-4 text-muted-foreground" />;
    return sortDirection === 'asc' ? <ArrowUp className="ml-2 h-4 w-4" /> : <ArrowDown className="ml-2 h-4 w-4" />;
  };

  const getExpirationColor = (expirationDate: string | null) => {
    if (!expirationDate) return 'bg-gray-100';
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const exp = new Date(expirationDate); exp.setHours(0, 0, 0, 0);
    const days = differenceInDays(exp, today);
    if (days > 0) return 'bg-green-600 text-white';
    if (days === 0) return 'bg-yellow-500 text-white';
    if (days >= -7) return 'bg-purple-600 text-white';
    return 'bg-red-600 text-white';
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { label: string; className: string }> = {
      active: { label: 'Ativo', className: 'bg-green-500 hover:bg-green-600 text-white' },
      testing: { label: 'Testando', className: 'bg-orange-500 hover:bg-orange-600 text-white' },
      inactive: { label: 'Desativado', className: 'bg-red-500 hover:bg-red-600 text-white' },
    };
    const v = variants[status] || { label: status, className: 'bg-gray-500 text-white' };
    return v;
  };

  const filtered = useMemo(() => {
    if (!companies) return [];
    return companies.filter((c: any) => {
      const matchSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = statusFilter === 'all' || c.subscription_status === statusFilter;
      
      let matchExpiration = true;
      if (expirationFilter !== 'all' && c.subscription_expires_at) {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const exp = new Date(c.subscription_expires_at); exp.setHours(0, 0, 0, 0);
        const d = differenceInDays(exp, today);
        switch (expirationFilter) {
          case 'today': matchExpiration = d === 0; break;
          case '7days': matchExpiration = d > 0 && d <= 7; break;
          case '15days': matchExpiration = d > 0 && d <= 15; break;
          case '30days': matchExpiration = d > 0 && d <= 30; break;
          case 'overdue': matchExpiration = d < 0; break;
        }
      }
      return matchSearch && matchStatus && matchExpiration;
    });
  }, [companies, searchTerm, statusFilter, expirationFilter]);

  const sorted = useMemo(() => {
    if (!sortColumn) return filtered;
    return [...filtered].sort((a: any, b: any) => {
      let aV = a[sortColumn], bV = b[sortColumn];
      if (aV == null) return 1;
      if (bV == null) return -1;
      if (sortColumn === 'subscription_expires_at') { aV = new Date(aV).getTime(); bV = new Date(bV).getTime(); }
      if (typeof aV === 'number') return sortDirection === 'asc' ? aV - bV : bV - aV;
      return sortDirection === 'asc' ? String(aV).localeCompare(String(bV), 'pt-BR') : String(bV).localeCompare(String(aV), 'pt-BR');
    });
  }, [filtered, sortColumn, sortDirection]);

  const totalPages = Math.ceil(sorted.length / itemsPerPage);
  const paginatedData = sorted.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const summaryCards = useMemo(() => {
    if (!companies) return { today: 0, next7: 0, overdue: 0 };
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return {
      today: companies.filter((c: any) => { if (!c.subscription_expires_at) return false; const e = new Date(c.subscription_expires_at); e.setHours(0, 0, 0, 0); return differenceInDays(e, today) === 0; }).length,
      next7: companies.filter((c: any) => { if (!c.subscription_expires_at) return false; const e = new Date(c.subscription_expires_at); e.setHours(0, 0, 0, 0); const d = differenceInDays(e, today); return d > 0 && d <= 7; }).length,
      overdue: companies.filter((c: any) => { if (!c.subscription_expires_at) return false; const e = new Date(c.subscription_expires_at); e.setHours(0, 0, 0, 0); return differenceInDays(e, today) < 0; }).length,
    };
  }, [companies]);

  const updateExpiration = async (companyId: string, newDate: Date) => {
    setUpdatingField({ id: companyId, field: 'subscription_expires_at' });
    try {
      const { error } = await supabase.from('companies').update({ subscription_expires_at: newDate.toISOString() }).eq('id', companyId);
      if (error) throw error;
      toast({ title: 'Data atualizada!' });
      refetch();
      queryClient.invalidateQueries({ queryKey: ['admin-companies'] });
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setUpdatingField(null);
    }
  };

  const updateStatus = async (companyId: string, newStatus: string) => {
    setUpdatingField({ id: companyId, field: 'subscription_status' });
    try {
      const { error } = await supabase.from('companies').update({ subscription_status: newStatus }).eq('id', companyId);
      if (error) throw error;
      toast({ title: 'Status atualizado!' });
      refetch();
      queryClient.invalidateQueries({ queryKey: ['admin-companies'] });
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setUpdatingField(null);
    }
  };

  const updatePlan = async (companyId: string, newPlan: string) => {
    setUpdatingField({ id: companyId, field: 'subscription_plan' });
    try {
      const { error } = await supabase.from('companies').update({ subscription_plan: newPlan }).eq('id', companyId);
      if (error) throw error;
      toast({ title: 'Plano atualizado!' });
      refetch();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setUpdatingField(null);
    }
  };

  const expiringCount = summaryCards.today + summaryCards.next7 + summaryCards.overdue;

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4 lg:space-y-6 px-3 sm:px-4 lg:px-6 py-4 lg:py-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-xl lg:text-2xl font-bold">Assinaturas</h1>
        <Button onClick={() => refetch()} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />Atualizar
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 lg:gap-4">
        <Card className="relative overflow-hidden border-0 shadow-lg bg-amber-500 text-white">
          <CardContent className="p-4 lg:p-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1"><p className="text-xs lg:text-sm font-medium text-white/80">Vencendo Hoje</p><p className="text-lg lg:text-2xl font-bold">{summaryCards.today}</p></div>
              <div className="p-2 rounded-xl bg-amber-600"><CalendarIcon className="h-5 w-5 text-white" /></div>
            </div>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden border-0 shadow-lg bg-blue-500 text-white">
          <CardContent className="p-4 lg:p-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1"><p className="text-xs lg:text-sm font-medium text-white/80">Vencendo em 7 dias</p><p className="text-lg lg:text-2xl font-bold">{summaryCards.next7}</p></div>
              <div className="p-2 rounded-xl bg-blue-600"><CalendarIcon className="h-5 w-5 text-white" /></div>
            </div>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden border-0 shadow-lg bg-red-500 text-white">
          <CardContent className="p-4 lg:p-6">
            <div className="flex items-start justify-between">
              <div className="space-y-1"><p className="text-xs lg:text-sm font-medium text-white/80">Vencidas</p><p className="text-lg lg:text-2xl font-bold">{summaryCards.overdue}</p></div>
              <div className="p-2 rounded-xl bg-red-600"><CalendarIcon className="h-5 w-5 text-white" /></div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Expiring Alert */}
      {expiringCount > 0 && (
        <Collapsible open={alertsOpen} onOpenChange={setAlertsOpen}>
          <Card className="border-0 shadow-lg overflow-hidden bg-gradient-to-r from-amber-500/5 to-orange-500/5">
            <CollapsibleTrigger className="w-full">
              <CardHeader className="py-4 cursor-pointer hover:bg-muted/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-amber-500/20 ring-4 ring-amber-500/10">
                      <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div className="text-left">
                      <CardTitle className="text-base sm:text-lg">Alertas de Vencimento</CardTitle>
                      <p className="text-sm text-muted-foreground">{expiringCount} empresas precisam de atenção</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="bg-amber-500/20 text-amber-700 dark:text-amber-300">{expiringCount}</Badge>
                    <ChevronDown className={cn('h-5 w-5 text-muted-foreground transition-transform', alertsOpen && 'rotate-180')} />
                  </div>
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0 pb-4">
                <AdminExpiringAlert companies={companies || []} />
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar empresa..." value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }} className="pl-10" />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-row">
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setCurrentPage(1); }}>
            <SelectTrigger className="w-full sm:w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Status</SelectItem>
              <SelectItem value="active">Ativo</SelectItem>
              <SelectItem value="testing">Testando</SelectItem>
              <SelectItem value="inactive">Desativado</SelectItem>
            </SelectContent>
          </Select>
          <Select value={expirationFilter} onValueChange={(v) => { setExpirationFilter(v); setCurrentPage(1); }}>
            <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Vencimento" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos Vencimentos</SelectItem>
              <SelectItem value="today">Vence Hoje</SelectItem>
              <SelectItem value="7days">Próximos 7 Dias</SelectItem>
              <SelectItem value="15days">Próximos 15 Dias</SelectItem>
              <SelectItem value="30days">Próximos 30 Dias</SelectItem>
              <SelectItem value="overdue">Vencidas</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <Card className="border-0 shadow-lg">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="cursor-pointer" onClick={() => handleSort('name')}>
                    <div className="flex items-center">Empresa <SortIcon column="name" /></div>
                  </TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead className="cursor-pointer" onClick={() => handleSort('subscription_expires_at')}>
                    <div className="flex items-center">Vencimento <SortIcon column="subscription_expires_at" /></div>
                  </TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedData.map((company: any) => {
                  const st = getStatusBadge(company.subscription_status);
                  return (
                    <TableRow key={company.id}>
                      <TableCell className="font-medium">
                        <div>
                          <p>{company.name}</p>
                          {company.email && <p className="text-xs text-muted-foreground">{company.email}</p>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={company.subscription_status}
                          onValueChange={(v) => updateStatus(company.id, v)}
                          disabled={updatingField?.id === company.id && updatingField?.field === 'subscription_status'}
                        >
                          <SelectTrigger className="w-[120px] h-8 text-xs border-0 p-0">
                            <Badge className={st.className}>{st.label}</Badge>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="active">Ativo</SelectItem>
                            <SelectItem value="testing">Testando</SelectItem>
                            <SelectItem value="inactive">Desativado</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={company.subscription_plan || 'starter'}
                          onValueChange={(v) => updatePlan(company.id, v)}
                          disabled={updatingField?.id === company.id && updatingField?.field === 'subscription_plan'}
                        >
                          <SelectTrigger className="w-[110px] h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="starter">Starter</SelectItem>
                            <SelectItem value="pro">Pro</SelectItem>
                            <SelectItem value="enterprise">Enterprise</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-sm">{(company.subscription_value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</TableCell>
                      <TableCell>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="ghost" size="sm" className={cn('text-xs px-2 py-1 rounded', getExpirationColor(company.subscription_expires_at))}>
                              {company.subscription_expires_at ? format(parseISO(company.subscription_expires_at), 'dd/MM/yyyy', { locale: ptBR }) : '-'}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={company.subscription_expires_at ? parseISO(company.subscription_expires_at) : undefined}
                              onSelect={(date) => date && updateExpiration(company.id, date)}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { setSelectedCompany(company); setRenewalModalOpen(true); }}
                        >
                          <RefreshCw className="h-3 w-3 mr-1" />Renovar
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {sorted.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhuma empresa encontrada</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-sm text-muted-foreground">
                {sorted.length} empresa{sorted.length !== 1 ? 's' : ''} • Página {currentPage} de {totalPages}
              </p>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-8 w-8" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" className="h-8 w-8" disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedCompany && (
        <AdminRenewalModal
          company={selectedCompany}
          open={renewalModalOpen}
          onOpenChange={setRenewalModalOpen}
          onSuccess={() => { setRenewalModalOpen(false); refetch(); }}
        />
      )}
    </div>
  );
}
