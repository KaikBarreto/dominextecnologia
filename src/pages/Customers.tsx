import { useState } from 'react';
import { fuzzyIncludes, cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { Users, Plus, Search, Pencil, Trash2, Phone, Mail, MapPin, Settings2, Eye } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useCustomers } from '@/hooks/useCustomers';
import { CustomerFormDialog } from '@/components/customers/CustomerFormDialog';
import { useDataPagination } from '@/hooks/useDataPagination';
import { DataTablePagination } from '@/components/ui/DataTablePagination';
import { useTableSort } from '@/hooks/useTableSort';
import { SortableTableHead } from '@/components/ui/SortableTableHead';
import type { Customer } from '@/types/database';
import { CustomerOriginManagerDialog } from '@/components/customers/CustomerOriginManagerDialog';
import { MobilePageHeader } from '@/components/mobile/MobilePageHeader';
import { FABButton } from '@/components/mobile/FABButton';
import { MobileListItem, type ItemAction } from '@/components/mobile/MobileListItem';
import { EmptyState } from '@/components/mobile/EmptyState';

// Gera iniciais (máx 2 caracteres) para avatar fallback.
function getInitials(name?: string) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export default function Customers() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { isAdminOrGestor, hasPermission } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
  const [originConfigOpen, setOriginConfigOpen] = useState(false);

  const canCreateCustomer = isAdminOrGestor() || hasPermission('fn:create_customer');
  const canEditCustomer = isAdminOrGestor() || hasPermission('fn:edit_customer');
  const canDeleteCustomer = isAdminOrGestor() || hasPermission('fn:delete_customer');

  const { customers, isLoading, isError, refetch, createCustomer, updateCustomer, deleteCustomer } = useCustomers();

  const filteredCustomers = customers.filter(
    (customer) =>
      fuzzyIncludes(customer.name, searchTerm) ||
      fuzzyIncludes(customer.email, searchTerm) ||
      fuzzyIncludes(customer.document, searchTerm) ||
      fuzzyIncludes(customer.company_name, searchTerm)
  );

  const { sortedItems, sortConfig, handleSort } = useTableSort(filteredCustomers);
  const pagination = useDataPagination(sortedItems, 10, 'customers-list');

  const handleSubmit = async (data: any) => {
    if (editingCustomer) {
      await updateCustomer.mutateAsync({ ...data, id: editingCustomer.id });
    } else {
      await createCustomer.mutateAsync(data);
    }
    setEditingCustomer(null);
  };

  const handleEdit = (customer: Customer, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingCustomer(customer);
    setFormOpen(true);
  };

  const handleDeleteClick = (customer: Customer, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setCustomerToDelete(customer);
    setDeleteDialogOpen(true);
  };

  const handleDelete = async () => {
    if (customerToDelete) {
      await deleteCustomer.mutateAsync(customerToDelete.id);
      setCustomerToDelete(null);
      setDeleteDialogOpen(false);
    }
  };

  const openNewCustomer = () => { setEditingCustomer(null); setFormOpen(true); };

  return (
    <div className={cn('space-y-6 min-w-0 w-full max-w-full overflow-x-hidden', isMobile && 'pb-24')}>
      <MobilePageHeader
        title="Clientes"
        subtitle="Gerencie seus clientes"
        icon={Users}
        actions={
          isMobile ? undefined : (
            <>
              <Button variant="outline" size="icon" onClick={() => setOriginConfigOpen(true)} title="Configurar origens">
                <Settings2 className="h-4 w-4" />
              </Button>
              {canCreateCustomer && (
                <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={openNewCustomer}>
                  <Plus className="mr-2 h-4 w-4" />
                  Novo Cliente
                </Button>
              )}
            </>
          )
        }
      />

      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={isMobile ? 'Buscar clientes...' : 'Buscar por nome, empresa, email ou documento...'}
            className="pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        {isMobile && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOriginConfigOpen(true)}
            className="self-start gap-2"
          >
            <Settings2 className="h-4 w-4" />
            Origens
          </Button>
        )}
      </div>

      {isMobile ? (
        // -----------------------------------------------------------------
        // Mobile: lista nativa, sem Card wrapper, sem header redundante.
        // -----------------------------------------------------------------
        <>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : isError ? (
            <EmptyState
              icon={<Users className="h-12 w-12 text-destructive" />}
              title="Erro ao carregar clientes"
              description="Não foi possível conectar ao servidor. Tente novamente."
              action={{ label: 'Tentar novamente', onClick: () => refetch() }}
            />
          ) : filteredCustomers.length === 0 ? (
            <EmptyState
              icon={<Users className="h-12 w-12" />}
              title={searchTerm ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}
              description={searchTerm ? 'Tente uma busca diferente' : 'Toque em "Novo Cliente" para começar'}
            />
          ) : (
            <>
              <div className="rounded-xl border bg-card overflow-hidden">
                {pagination.paginatedItems.map((customer) => {
                  const itemActions: ItemAction[] = [
                    {
                      key: 'view',
                      label: 'Visualizar',
                      icon: <Eye className="h-4 w-4" />,
                      onClick: () => navigate(`/clientes/${customer.id}`),
                    },
                    ...(canEditCustomer
                      ? [{
                          key: 'edit',
                          label: 'Editar',
                          icon: <Pencil className="h-4 w-4" />,
                          variant: 'edit' as const,
                          onClick: () => handleEdit(customer),
                        }]
                      : []),
                    ...(canDeleteCustomer
                      ? [{
                          key: 'delete',
                          label: 'Excluir',
                          icon: <Trash2 className="h-4 w-4" />,
                          variant: 'destructive' as const,
                          onClick: () => handleDeleteClick(customer),
                        }]
                      : []),
                  ];

                  const subtitleParts = [customer.phone, customer.city].filter(Boolean);

                  return (
                    <MobileListItem
                      key={customer.id}
                      onClick={() => navigate(`/clientes/${customer.id}`)}
                      actions={itemActions}
                      leading={
                        customer.photo_url ? (
                          <img
                            src={customer.photo_url}
                            alt={customer.name}
                            className="h-10 w-10 rounded-full object-cover"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">
                            {getInitials(customer.name)}
                          </div>
                        )
                      }
                      title={customer.name}
                      subtitle={
                        subtitleParts.length > 0
                          ? subtitleParts.join(' • ')
                          : (customer.company_name || customer.email || '—')
                      }
                      trailing={
                        <Badge
                          variant={customer.customer_type === 'pj' ? 'default' : 'secondary'}
                          className="text-[10px] px-2 py-0.5"
                        >
                          {customer.customer_type === 'pj' ? 'PJ' : 'PF'}
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
        // -----------------------------------------------------------------
        // Desktop: mantém Card + tabela 100% como estava.
        // -----------------------------------------------------------------
        <div>
          <h2 className="text-base font-bold uppercase tracking-widest text-foreground/70 mb-4">
            Lista de Clientes
          </h2>
          <Card className="w-full max-w-full overflow-hidden">
            <CardContent className="p-0">
              <div className="p-4 sm:p-6">
                {isLoading ? (
                  <div className="space-y-4">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : isError ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Users className="mb-4 h-12 w-12 text-destructive" />
                    <h3 className="text-lg font-medium">Erro ao carregar clientes</h3>
                    <p className="text-muted-foreground mb-4">
                      Não foi possível conectar ao servidor. Tente novamente.
                    </p>
                    <Button variant="outline" onClick={() => refetch()}>Tentar novamente</Button>
                  </div>
                ) : filteredCustomers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Users className="mb-4 h-12 w-12 text-muted-foreground" />
                    <h3 className="text-lg font-medium">
                      {searchTerm ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}
                    </h3>
                    <p className="text-muted-foreground">
                      {searchTerm ? 'Tente uma busca diferente' : 'Clique em "Novo Cliente" para começar'}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[50px] text-xs uppercase tracking-wider">Foto</TableHead>
                            <SortableTableHead sortKey="name" sortConfig={sortConfig} onSort={handleSort}>Nome</SortableTableHead>
                            <SortableTableHead sortKey="company_name" sortConfig={sortConfig} onSort={handleSort} className="hidden lg:table-cell">Empresa</SortableTableHead>
                            <SortableTableHead sortKey="customer_type" sortConfig={sortConfig} onSort={handleSort} className="hidden md:table-cell">Tipo</SortableTableHead>
                            <TableHead className="hidden sm:table-cell text-xs uppercase tracking-wider">Contato</TableHead>
                            <SortableTableHead sortKey="city" sortConfig={sortConfig} onSort={handleSort} className="hidden xl:table-cell">Endereço</SortableTableHead>
                            <TableHead className="w-[100px] text-xs uppercase tracking-wider">Ações</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pagination.paginatedItems.map((customer) => (
                            <TableRow key={customer.id} className="cursor-pointer" onClick={() => navigate(`/clientes/${customer.id}`)}>
                              <TableCell>
                                {customer.photo_url ? (
                                  <img src={customer.photo_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                                ) : (
                                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                                    <Users className="h-4 w-4 text-muted-foreground" />
                                  </div>
                                )}
                              </TableCell>
                              <TableCell>
                                <div>
                                  <p className="font-medium">{customer.name}</p>
                                  {customer.document && (
                                    <p className="text-xs text-muted-foreground">{customer.document}</p>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="hidden lg:table-cell">
                                {customer.company_name || '-'}
                              </TableCell>
                              <TableCell className="hidden md:table-cell">
                                <Badge variant={customer.customer_type === 'pj' ? 'default' : 'secondary'}>
                                  {customer.customer_type === 'pj' ? 'PJ' : 'PF'}
                                </Badge>
                              </TableCell>
                              <TableCell className="hidden sm:table-cell">
                                <div className="space-y-1">
                                  {customer.phone && (
                                    <div className="flex items-center gap-1 text-sm">
                                      <Phone className="h-3 w-3" />{customer.phone}
                                    </div>
                                  )}
                                  {customer.email && (
                                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                                      <Mail className="h-3 w-3" />{customer.email}
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="hidden xl:table-cell">
                                {(customer.city || customer.address) ? (
                                  <div className="flex items-center gap-1 text-sm">
                                    <MapPin className="h-3 w-3 shrink-0" />
                                    <span className="truncate max-w-[200px]">
                                      {[customer.address, customer.city, customer.state].filter(Boolean).join(', ')}
                                    </span>
                                  </div>
                                ) : '-'}
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                                  {canEditCustomer && (
                                    <Button variant="edit-ghost" size="icon" onClick={(e) => handleEdit(customer, e)}>
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                  )}
                                  {canDeleteCustomer && (
                                    <Button
                                      variant="destructive-ghost"
                                      size="icon"
                                      onClick={(e) => handleDeleteClick(customer, e)}
                                    >
                                      <Trash2 className="h-4 w-4" />
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

      {/* FAB mobile-only — desktop usa botão inline no header. */}
      {isMobile && canCreateCustomer && (
        <FABButton
          icon={<Plus className="h-5 w-5" />}
          label="Novo Cliente"
          onClick={openNewCustomer}
        />
      )}

      <CustomerFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        customer={editingCustomer}
        onSubmit={handleSubmit}
        isLoading={createCustomer.isPending || updateCustomer.isPending}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cliente</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o cliente "{customerToDelete?.name}"? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CustomerOriginManagerDialog open={originConfigOpen} onOpenChange={setOriginConfigOpen} />
    </div>
  );
}
