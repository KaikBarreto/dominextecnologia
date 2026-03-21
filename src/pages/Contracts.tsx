import { useState } from 'react';
import { fuzzyIncludes } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { useNavigate } from 'react-router-dom';
import { ScrollText, Plus, Search, Calendar, CheckCircle, Clock, AlertTriangle, Edit, Pause, Play, Trash2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useContracts, getFrequencyLabel } from '@/hooks/useContracts';
import { ContractFormDialog } from '@/components/contracts/ContractFormDialog';
import { format, differenceInDays, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useDataPagination } from '@/hooks/useDataPagination';
import { DataTablePagination } from '@/components/ui/DataTablePagination';
import { useTableSort } from '@/hooks/useTableSort';
import { SortableTableHead } from '@/components/ui/SortableTableHead';

const STATUS_CONFIG: Record<string, { label: string; variant: 'success' | 'outline' | 'destructive' | 'secondary' }> = {
  active: { label: 'Ativo', variant: 'success' },
  paused: { label: 'Pausado', variant: 'outline' },
  cancelled: { label: 'Cancelado', variant: 'destructive' },
  expired: { label: 'Expirado', variant: 'secondary' },
};

export default function Contracts() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { contracts, isLoading, stats, updateContractStatus, deleteContract } = useContracts();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const filtered = contracts.filter(c => {
    const matchesSearch = fuzzyIncludes(c.name, search) ||
      fuzzyIncludes(c.customers?.name, search);
    const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const { sortedItems, sortConfig, handleSort } = useTableSort(filtered);
  const pagination = useDataPagination(sortedItems);

  const getNextOccurrence = (c: typeof contracts[0]) => {
    const next = (c.contract_occurrences || [])
      .filter(o => o.status === 'scheduled')
      .sort((a, b) => new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime())[0];
    return next;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Contratos</h1>
          <p className="text-muted-foreground">Gerencie contratos recorrentes e manutenções programadas</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Novo Contrato
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card><CardContent className="p-6 flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Contratos Ativos</p>
            {isLoading ? <Skeleton className="h-8 w-12 mt-1" /> : <p className="text-2xl font-bold text-primary">{stats.active}</p>}
          </div>
          <CheckCircle className="h-8 w-8 text-primary" />
        </CardContent></Card>
        <Card><CardContent className="p-6 flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">OSs Geradas (mês)</p>
            {isLoading ? <Skeleton className="h-8 w-12 mt-1" /> : <p className="text-2xl font-bold">{stats.osGeneratedThisMonth}</p>}
          </div>
          <Calendar className="h-8 w-8 text-muted-foreground" />
        </CardContent></Card>
        <Card><CardContent className="p-6 flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Próximas 7 dias</p>
            {isLoading ? <Skeleton className="h-8 w-12 mt-1" /> : <p className="text-2xl font-bold text-warning">{stats.upcomingOccurrences}</p>}
          </div>
          <Clock className="h-8 w-8 text-warning" />
        </CardContent></Card>
        <Card><CardContent className="p-6 flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Vencendo em 30d</p>
            {isLoading ? <Skeleton className="h-8 w-12 mt-1" /> : <p className="text-2xl font-bold text-destructive">{stats.expiringContracts}</p>}
          </div>
          <AlertTriangle className="h-8 w-8 text-destructive" />
        </CardContent></Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar por nome ou cliente..." className="pl-10" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Ativo</SelectItem>
            <SelectItem value="paused">Pausado</SelectItem>
            <SelectItem value="cancelled">Cancelado</SelectItem>
            <SelectItem value="expired">Expirado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ScrollText className="mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="text-lg font-medium">{search ? 'Nenhum contrato encontrado' : 'Nenhum contrato cadastrado'}</h3>
              <p className="text-muted-foreground mt-1">
                {search ? 'Tente outro termo de busca' : 'Crie seu primeiro contrato para gerar OSs automaticamente.'}
              </p>
              {!search && (
                <Button onClick={() => setDialogOpen(true)} className="mt-4 gap-2">
                  <Plus className="h-4 w-4" /> Criar Contrato
                </Button>
              )}
            </div>
          ) : (
            <>
              {isMobile ? (
                <div className="p-4 space-y-3">
                  {pagination.paginatedItems.map(contract => {
                    const nextOcc = getNextOccurrence(contract);
                    const statusCfg = STATUS_CONFIG[contract.status] || STATUS_CONFIG.active;
                    const itemCount = contract.contract_items?.length || 0;
                    let nextDateColor = 'text-muted-foreground';
                    if (nextOcc) {
                      const daysUntil = differenceInDays(parseISO(nextOcc.scheduled_date + 'T12:00:00'), new Date());
                      if (daysUntil < 0) nextDateColor = 'text-destructive font-medium';
                      else if (daysUntil <= 7) nextDateColor = 'text-warning font-medium';
                      else nextDateColor = 'text-success';
                    }
                    return (
                      <Card key={contract.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(`/contratos/${contract.id}`)}>
                        <CardContent className="p-4 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <ScrollText className="h-4 w-4 text-muted-foreground shrink-0" />
                                <p className="font-medium text-sm truncate">{contract.name}</p>
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5 truncate">{contract.customers?.name || '-'}</p>
                            </div>
                            <Badge variant={statusCfg.variant} className="shrink-0">{statusCfg.label}</Badge>
                          </div>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <Badge variant="secondary">{getFrequencyLabel(contract.frequency_type, contract.frequency_value)}</Badge>
                            <span>{itemCount} {itemCount === 1 ? 'item' : 'itens'}</span>
                            {nextOcc && <span className={nextDateColor}>Próx: {format(parseISO(nextOcc.scheduled_date + 'T12:00:00'), 'dd/MM/yyyy')}</span>}
                          </div>
                          <div className="flex justify-end gap-1 pt-1 border-t" onClick={e => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-7 w-7" title={contract.status === 'active' ? 'Pausar' : 'Retomar'}
                              onClick={() => updateContractStatus.mutate({ id: contract.id, status: contract.status === 'active' ? 'paused' : 'active' })}>
                              {contract.status === 'active' ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                            </Button>
                            <Button variant="destructive-ghost" size="icon" className="h-7 w-7"
                              onClick={() => { if (confirm('Excluir contrato?')) deleteContract.mutate(contract.id); }}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableTableHead sortKey="name" sortConfig={sortConfig} onSort={handleSort}>Contrato</SortableTableHead>
                      <SortableTableHead sortKey="customers.name" sortConfig={sortConfig} onSort={handleSort}>Cliente</SortableTableHead>
                      <SortableTableHead sortKey="frequency_type" sortConfig={sortConfig} onSort={handleSort}>Frequência</SortableTableHead>
                      <TableHead>Próxima OS</TableHead>
                      <TableHead className="text-center">Itens</TableHead>
                      <SortableTableHead sortKey="status" sortConfig={sortConfig} onSort={handleSort}>Status</SortableTableHead>
                      <TableHead className="w-[140px]">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagination.paginatedItems.map(contract => {
                      const nextOcc = getNextOccurrence(contract);
                      const statusCfg = STATUS_CONFIG[contract.status] || STATUS_CONFIG.active;
                      const itemCount = contract.contract_items?.length || 0;

                      let nextDateColor = 'text-muted-foreground';
                      if (nextOcc) {
                        const daysUntil = differenceInDays(parseISO(nextOcc.scheduled_date + 'T12:00:00'), new Date());
                        if (daysUntil < 0) nextDateColor = 'text-destructive font-medium';
                        else if (daysUntil <= 7) nextDateColor = 'text-warning font-medium';
                        else nextDateColor = 'text-success';
                      }

                      return (
                        <TableRow
                          key={contract.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => navigate(`/contratos/${contract.id}`)}
                        >
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <ScrollText className="h-4 w-4 text-muted-foreground shrink-0" />
                              {contract.name}
                            </div>
                          </TableCell>
                          <TableCell>{contract.customers?.name || '-'}</TableCell>
                          <TableCell><Badge variant="secondary">{getFrequencyLabel(contract.frequency_type, contract.frequency_value)}</Badge></TableCell>
                          <TableCell>
                            {nextOcc ? (
                              <span className={nextDateColor}>{format(parseISO(nextOcc.scheduled_date + 'T12:00:00'), 'dd/MM/yyyy')}</span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">{itemCount} {itemCount === 1 ? 'item' : 'itens'}</TableCell>
                          <TableCell>
                            <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                              <Button
                                variant="ghost" size="icon" className="h-8 w-8"
                                title={contract.status === 'active' ? 'Pausar' : 'Retomar'}
                                onClick={() => updateContractStatus.mutate({
                                  id: contract.id,
                                  status: contract.status === 'active' ? 'paused' : 'active',
                                })}
                              >
                                {contract.status === 'active' ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                              </Button>
                              <Button
                                variant="destructive-ghost" size="icon" className="h-8 w-8"
                                onClick={() => { if (confirm('Excluir contrato?')) deleteContract.mutate(contract.id); }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              )}
              <DataTablePagination page={pagination.page} totalPages={pagination.totalPages} totalItems={pagination.totalItems} from={pagination.from} to={pagination.to} pageSize={pagination.pageSize} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} />
            </>
          )}
        </CardContent>
      </Card>

      <ContractFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={(id) => navigate(`/contratos/${id}`)}
      />
    </div>
  );
}
