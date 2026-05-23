import { useMemo, useState } from 'react';
import {
  BadgeCheck, Plus, Search, Pencil, Trash2, Mail, Phone, RotateCcw,
  CheckCircle2, XCircle, ShieldCheck,
} from 'lucide-react';
import { cn, fuzzyIncludes } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { MobilePageHeader } from '@/components/mobile/MobilePageHeader';
import { StatCarousel } from '@/components/mobile/StatCarousel';
import { FABButton } from '@/components/mobile/FABButton';
import { MobileListItem, type ItemAction } from '@/components/mobile/MobileListItem';
import { EmptyState } from '@/components/mobile/EmptyState';
import { FilterSheet } from '@/components/mobile/FilterSheet';
import { FilterCheckboxGroup } from '@/components/mobile/FilterCheckboxGroup';
import { useDataPagination } from '@/hooks/useDataPagination';
import { DataTablePagination } from '@/components/ui/DataTablePagination';
import { useTableSort } from '@/hooks/useTableSort';
import { SortableTableHead } from '@/components/ui/SortableTableHead';
import {
  useResponsibleTechnicians,
  type ResponsibleTechnician,
} from '@/hooks/useResponsibleTechnicians';
import { ResponsibleTechnicianFormDialog } from '@/components/pmoc/ResponsibleTechnicianFormDialog';

// Multi-select status: vazio = todos. Valores possíveis: 'active' | 'inactive'.
type StatusKey = 'active' | 'inactive';

function getInitials(name?: string): string {
  if (!name) return 'RT';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export default function ResponsibleTechnicians() {
  const isMobile = useIsMobile();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusKey[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ResponsibleTechnician | null>(null);
  const [toDeactivate, setToDeactivate] = useState<ResponsibleTechnician | null>(null);

  const {
    technicians,
    isLoading,
    isError,
    refetch,
    deactivateTechnician,
    reactivateTechnician,
  } = useResponsibleTechnicians();

  const filteredTechnicians = useMemo(() => {
    return technicians.filter((rt) => {
      if (statusFilter.length > 0) {
        const key: StatusKey = rt.is_active ? 'active' : 'inactive';
        if (!statusFilter.includes(key)) return false;
      }
      if (searchTerm.trim().length > 0) {
        return (
          fuzzyIncludes(rt.full_name, searchTerm) ||
          fuzzyIncludes(rt.cft_crea ?? '', searchTerm) ||
          fuzzyIncludes(rt.modality ?? '', searchTerm) ||
          fuzzyIncludes(rt.registry_number ?? '', searchTerm) ||
          fuzzyIncludes(rt.email ?? '', searchTerm)
        );
      }
      return true;
    });
  }, [technicians, statusFilter, searchTerm]);

  const { sortedItems, sortConfig, handleSort } = useTableSort(filteredTechnicians);
  const pagination = useDataPagination(sortedItems, 10, 'responsible-technicians-list');

  const stats = useMemo(() => {
    const total = technicians.length;
    const active = technicians.filter((t) => t.is_active).length;
    return { total, active, inactive: total - active };
  }, [technicians]);

  // Toggle helper pros chips do StatCarousel.
  const toggleStatus = (key: StatusKey) =>
    setStatusFilter((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );

  const statItems = [
    {
      key: 'total',
      label: 'Total',
      count: stats.total,
      icon: <BadgeCheck className="h-4 w-4" />,
      accentColor: 'hsl(var(--primary))',
      active: statusFilter.length === 0,
      onClick: () => setStatusFilter([]),
    },
    {
      key: 'active',
      label: 'Ativos',
      count: stats.active,
      icon: <CheckCircle2 className="h-4 w-4" />,
      accentColor: '#22c55e',
      active: statusFilter.includes('active'),
      onClick: () => toggleStatus('active'),
    },
    {
      key: 'inactive',
      label: 'Inativos',
      count: stats.inactive,
      icon: <XCircle className="h-4 w-4" />,
      accentColor: '#64748b',
      active: statusFilter.includes('inactive'),
      onClick: () => toggleStatus('inactive'),
    },
  ];

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (rt: ResponsibleTechnician) => {
    setEditing(rt);
    setFormOpen(true);
  };

  const confirmDeactivate = async () => {
    if (!toDeactivate) return;
    await deactivateTechnician.mutateAsync(toDeactivate.id);
    setToDeactivate(null);
  };

  const handleReactivate = (rt: ResponsibleTechnician) => {
    reactivateTechnician.mutate(rt.id);
  };

  const activeFilterCount = statusFilter.length > 0 ? 1 : 0;

  // ----------------------------------------------------------------------
  // Loading
  // ----------------------------------------------------------------------
  if (isLoading) {
    return (
      <div className={cn('space-y-6 min-w-0 w-full max-w-full overflow-x-hidden', isMobile && 'pb-24')}>
        <MobilePageHeader
          title="Responsáveis Técnicos"
          subtitle="Cadastro regulatório PMOC (Lei 13.589/2018)"
          icon={ShieldCheck}
        />
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    );
  }

  // ----------------------------------------------------------------------
  // Error
  // ----------------------------------------------------------------------
  if (isError) {
    return (
      <div className={cn('space-y-6 min-w-0 w-full max-w-full overflow-x-hidden', isMobile && 'pb-24')}>
        <MobilePageHeader
          title="Responsáveis Técnicos"
          subtitle="Cadastro regulatório PMOC (Lei 13.589/2018)"
          icon={ShieldCheck}
        />
        <EmptyState
          icon={<XCircle className="h-12 w-12 text-destructive" />}
          title="Erro ao carregar responsáveis técnicos"
          description="Não foi possível conectar ao servidor. Tente novamente."
          action={{ label: 'Tentar novamente', onClick: () => refetch() }}
        />
      </div>
    );
  }

  return (
    <div className={cn('space-y-6 min-w-0 w-full max-w-full overflow-x-hidden', isMobile && 'pb-24')}>
      <MobilePageHeader
        title="Responsáveis Técnicos"
        subtitle="Cadastro regulatório PMOC (Lei 13.589/2018)"
        icon={ShieldCheck}
        actions={
          isMobile ? undefined : (
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={openNew}
            >
              <Plus className="mr-2 h-4 w-4" />
              Novo Responsável
            </Button>
          )
        }
      />

      {/* Stats — chips clicáveis filtram a lista */}
      <StatCarousel items={statItems} />

      {/* Busca + filtros */}
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={isMobile ? 'Buscar...' : 'Buscar por nome, CFT/CREA ou registro...'}
            className="pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Filtro mobile: bottom sheet com checkboxes multi-select. */}
        {isMobile && (
          <FilterSheet
            triggerLabel="Filtros"
            activeCount={activeFilterCount}
            onClear={() => setStatusFilter([])}
          >
            <FilterCheckboxGroup
              label="Status"
              options={[
                { value: 'active', label: 'Ativos' },
                { value: 'inactive', label: 'Inativos' },
              ]}
              selected={statusFilter}
              onChange={(next) => setStatusFilter(next as StatusKey[])}
            />
          </FilterSheet>
        )}
      </div>

      {/* Lista mobile */}
      {isMobile ? (
        <>
          {filteredTechnicians.length === 0 ? (
            <EmptyState
              icon={<ShieldCheck className="h-12 w-12" />}
              title={
                searchTerm || statusFilter.length > 0
                  ? 'Nenhum responsável encontrado'
                  : 'Nenhum responsável cadastrado'
              }
              description={
                searchTerm || statusFilter.length > 0
                  ? 'Tente outro filtro ou termo de busca'
                  : 'Toque em "Novo Responsável" para cadastrar o primeiro RT da sua empresa'
              }
            />
          ) : (
            <>
              <div className="rounded-xl border bg-card overflow-hidden">
                {pagination.paginatedItems.map((rt) => {
                  const actions: ItemAction[] = [
                    {
                      key: 'edit',
                      label: 'Editar',
                      icon: <Pencil className="h-4 w-4" />,
                      variant: 'edit' as const,
                      onClick: () => openEdit(rt),
                    },
                    ...(rt.is_active
                      ? [{
                          key: 'deactivate',
                          label: 'Inativar',
                          icon: <Trash2 className="h-4 w-4" />,
                          variant: 'destructive' as const,
                          onClick: () => setToDeactivate(rt),
                        }]
                      : [{
                          key: 'reactivate',
                          label: 'Reativar',
                          icon: <RotateCcw className="h-4 w-4" />,
                          onClick: () => handleReactivate(rt),
                        }]),
                  ];

                  const subtitleParts = [rt.cft_crea, rt.modality].filter(Boolean) as string[];

                  return (
                    <MobileListItem
                      key={rt.id}
                      actions={actions}
                      leading={
                        <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">
                          {getInitials(rt.full_name)}
                        </div>
                      }
                      title={rt.full_name}
                      subtitle={subtitleParts.length > 0 ? subtitleParts.join(' • ') : 'Sem registro informado'}
                      trailing={
                        <Badge
                          variant={rt.is_active ? 'success' : 'outline'}
                          className="text-[10px] px-1.5 py-0"
                        >
                          {rt.is_active ? 'Ativo' : 'Inativo'}
                        </Badge>
                      }
                    />
                  );
                })}
              </div>
              <DataTablePagination
                page={pagination.page}
                totalPages={pagination.totalPages}
                totalItems={pagination.totalItems}
                from={pagination.from}
                to={pagination.to}
                pageSize={pagination.pageSize}
                onPageChange={pagination.setPage}
                onPageSizeChange={pagination.setPageSize}
              />
            </>
          )}
        </>
      ) : (
        // -------------------------------------------------------------------
        // Desktop — Card + tabela.
        // -------------------------------------------------------------------
        <div>
          <h2 className="text-base font-bold uppercase tracking-widest text-foreground/70 mb-4">
            Lista de Responsáveis Técnicos
          </h2>
          <Card className="w-full max-w-full overflow-hidden">
            <CardContent className="p-0">
              <div className="p-4 sm:p-6">
                {filteredTechnicians.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <ShieldCheck className="mb-4 h-12 w-12 text-muted-foreground" />
                    <h3 className="text-lg font-medium">
                      {searchTerm || statusFilter.length > 0
                        ? 'Nenhum responsável encontrado'
                        : 'Nenhum responsável cadastrado'}
                    </h3>
                    <p className="text-muted-foreground">
                      {searchTerm || statusFilter.length > 0
                        ? 'Tente outro filtro ou termo de busca'
                        : 'Clique em "Novo Responsável" para começar'}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <SortableTableHead sortKey="full_name" sortConfig={sortConfig} onSort={handleSort}>
                              Nome
                            </SortableTableHead>
                            <SortableTableHead sortKey="cft_crea" sortConfig={sortConfig} onSort={handleSort} className="hidden md:table-cell">
                              CFT/CREA
                            </SortableTableHead>
                            <SortableTableHead sortKey="modality" sortConfig={sortConfig} onSort={handleSort} className="hidden lg:table-cell">
                              Modalidade
                            </SortableTableHead>
                            <SortableTableHead sortKey="registry_number" sortConfig={sortConfig} onSort={handleSort} className="hidden xl:table-cell">
                              Registro
                            </SortableTableHead>
                            <TableHead className="hidden sm:table-cell text-xs uppercase tracking-wider">Contato</TableHead>
                            <SortableTableHead sortKey="is_active" sortConfig={sortConfig} onSort={handleSort}>
                              Status
                            </SortableTableHead>
                            <TableHead className="w-[110px] text-xs uppercase tracking-wider">Ações</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pagination.paginatedItems.map((rt) => (
                            <TableRow key={rt.id} className="cursor-pointer" onClick={() => openEdit(rt)}>
                              <TableCell>
                                <div>
                                  <p className="font-medium">{rt.full_name}</p>
                                  {rt.modality && (
                                    <p className="text-xs text-muted-foreground md:hidden">{rt.modality}</p>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="hidden md:table-cell">{rt.cft_crea || '—'}</TableCell>
                              <TableCell className="hidden lg:table-cell">{rt.modality || '—'}</TableCell>
                              <TableCell className="hidden xl:table-cell">{rt.registry_number || '—'}</TableCell>
                              <TableCell className="hidden sm:table-cell">
                                <div className="space-y-1">
                                  {rt.phone && (
                                    <div className="flex items-center gap-1 text-sm">
                                      <Phone className="h-3 w-3" />
                                      {rt.phone}
                                    </div>
                                  )}
                                  {rt.email && (
                                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                      <Mail className="h-3 w-3" />
                                      {rt.email}
                                    </div>
                                  )}
                                  {!rt.phone && !rt.email && <span className="text-sm text-muted-foreground">—</span>}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge variant={rt.is_active ? 'success' : 'outline'}>
                                  {rt.is_active ? 'Ativo' : 'Inativo'}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                                  <Button
                                    variant="edit-ghost"
                                    size="icon"
                                    onClick={() => openEdit(rt)}
                                    title="Editar"
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  {rt.is_active ? (
                                    <Button
                                      variant="destructive-ghost"
                                      size="icon"
                                      onClick={() => setToDeactivate(rt)}
                                      title="Inativar"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  ) : (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleReactivate(rt)}
                                      title="Reativar"
                                    >
                                      <RotateCcw className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <DataTablePagination
                      page={pagination.page}
                      totalPages={pagination.totalPages}
                      totalItems={pagination.totalItems}
                      from={pagination.from}
                      to={pagination.to}
                      pageSize={pagination.pageSize}
                      onPageChange={pagination.setPage}
                      onPageSizeChange={pagination.setPageSize}
                    />
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* FAB mobile-only */}
      {isMobile && (
        <FABButton icon={<Plus className="h-5 w-5" />} label="Responsável" onClick={openNew} />
      )}

      <ResponsibleTechnicianFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        technician={editing}
      />

      <AlertDialog open={!!toDeactivate} onOpenChange={(open) => !open && setToDeactivate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Inativar responsável técnico</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja inativar "{toDeactivate?.full_name}"? Contratos PMOC que
              referenciam este RT continuarão funcionando, mas ele não poderá ser selecionado
              em novos contratos. Você pode reativá-lo a qualquer momento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeactivate}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Inativar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
