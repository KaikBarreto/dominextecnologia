import { useState } from 'react';
import { Truck, Plus, Search, Pencil, Trash2, Eye } from 'lucide-react';
import { fuzzyIncludes } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { useSuppliers, type Supplier } from '@/hooks/useSuppliers';
import { useDataPagination } from '@/hooks/useDataPagination';
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
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/mobile/EmptyState';
import { MobileListItem, type ItemAction } from '@/components/mobile/MobileListItem';
import { DataTablePagination } from '@/components/ui/DataTablePagination';
import { RowActionsMenu } from '@/components/ui/RowActionsMenu';
// Reusa o formulário do módulo de Estoque/Compras (mesmo hook `useSuppliers`,
// mesma tabela `suppliers`). Não recriamos um segundo CRUD de fornecedor.
import { SupplierFormDialog } from '@/components/inventory/SupplierFormDialog';
import { SupplierDetailDialog } from '@/components/customers/SupplierDetailDialog';

/**
 * Aba "Fornecedores" dentro da tela Clientes. Pedido do CEO: fornecedor hoje
 * só é alcançável por um botão dentro de Compras (Estoque) — aqui ele ganha
 * um lugar próprio, ao lado de Clientes, com a mesma régua de listagem
 * (busca, paginação, EmptyState) e uma "ficha" que mostra o histórico de
 * gastos (financial_transactions.supplier_id), do mesmo jeito que a ficha do
 * cliente mostra as receitas.
 *
 * CRUD reaproveitado: `useSuppliers` + `SupplierFormDialog` (ambos já usados
 * por MaterialPurchasesTab/CotacaoDialog/CompraDetailView/NfeImportDialog no
 * Estoque). Nenhum dos dois foi alterado — só consumidos aqui também.
 */
export function SuppliersTab() {
  const isMobile = useIsMobile();
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.customers.suppliers;
  const { suppliers, isLoading, isError, refetch, deleteSupplier } = useSuppliers();

  const [searchTerm, setSearchTerm] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [supplierToDelete, setSupplierToDelete] = useState<Supplier | null>(null);
  const [viewingSupplier, setViewingSupplier] = useState<Supplier | null>(null);

  const filteredSuppliers = suppliers.filter((supplier) =>
    fuzzyIncludes(supplier.name, searchTerm) ||
    fuzzyIncludes(supplier.cpf_cnpj ?? '', searchTerm) ||
    fuzzyIncludes(supplier.contact_name ?? '', searchTerm) ||
    fuzzyIncludes(supplier.email ?? '', searchTerm),
  );

  const pagination = useDataPagination(filteredSuppliers, 10, 'suppliers-list');

  const openNew = () => { setEditingSupplier(null); setFormOpen(true); };
  const openEdit = (supplier: Supplier, e?: React.MouseEvent) => { e?.stopPropagation(); setEditingSupplier(supplier); setFormOpen(true); };
  const requestDelete = (supplier: Supplier, e?: React.MouseEvent) => { e?.stopPropagation(); setSupplierToDelete(supplier); };

  const handleDelete = async () => {
    if (!supplierToDelete) return;
    await deleteSupplier.mutateAsync(supplierToDelete.id);
    setSupplierToDelete(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={isMobile ? t.searchPlaceholderMobile : t.searchPlaceholder}
            className="pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" />
          {isMobile ? t.newSupplierShort : t.newSupplier}
        </Button>
      </div>

      {isMobile ? (
        <>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : isError ? (
            <EmptyState
              icon={<Truck className="h-12 w-12 text-destructive" />}
              title={t.loadError}
              description={t.loadErrorDesc}
              action={{ label: t.retry, onClick: () => refetch() }}
            />
          ) : filteredSuppliers.length === 0 ? (
            <EmptyState
              icon={<Truck className="h-12 w-12" />}
              title={searchTerm ? t.emptySearch : t.emptyNone}
              description={searchTerm ? t.emptySearchDesc : t.emptyNoneDescTapMobile}
            />
          ) : (
            <>
              <div className="rounded-xl border bg-card overflow-hidden">
                {pagination.paginatedItems.map((supplier) => {
                  const actions: ItemAction[] = [
                    { key: 'view', label: t.view, icon: <Eye className="h-4 w-4" />, onClick: () => setViewingSupplier(supplier) },
                    { key: 'edit', label: t.edit, icon: <Pencil className="h-4 w-4" />, variant: 'edit', onClick: () => openEdit(supplier) },
                    { key: 'delete', label: t.delete, icon: <Trash2 className="h-4 w-4" />, variant: 'destructive', onClick: () => requestDelete(supplier) },
                  ];
                  const subtitleParts = [supplier.cpf_cnpj, supplier.contact_name, supplier.phone].filter(Boolean);
                  return (
                    <MobileListItem
                      key={supplier.id}
                      onClick={() => setViewingSupplier(supplier)}
                      actions={actions}
                      leading={
                        <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                          <Truck className="h-4 w-4" />
                        </div>
                      }
                      title={supplier.name}
                      subtitle={subtitleParts.length > 0 ? subtitleParts.join(' • ') : t.noData}
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
        <div>
          <h2 className="text-base font-bold uppercase tracking-widest text-foreground/70 mb-4">
            {t.listHeading}
          </h2>
          <Card className="w-full max-w-full overflow-hidden">
            <CardContent className="p-0">
              <div className="p-4 sm:p-6">
                {isLoading ? (
                  <div className="space-y-4">
                    {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
                  </div>
                ) : isError ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Truck className="mb-4 h-12 w-12 text-destructive" />
                    <h3 className="text-lg font-medium">{t.loadError}</h3>
                    <p className="text-muted-foreground mb-4">{t.loadErrorDesc}</p>
                    <Button variant="outline" onClick={() => refetch()}>{t.retry}</Button>
                  </div>
                ) : filteredSuppliers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Truck className="mb-4 h-12 w-12 text-muted-foreground" />
                    <h3 className="text-lg font-medium">{searchTerm ? t.emptySearch : t.emptyNone}</h3>
                    <p className="text-muted-foreground">{searchTerm ? t.emptySearchDesc : t.emptyNoneDescClick}</p>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs uppercase tracking-wider">{t.colName}</TableHead>
                            <TableHead className="hidden md:table-cell text-xs uppercase tracking-wider">{t.colDocument}</TableHead>
                            <TableHead className="hidden sm:table-cell text-xs uppercase tracking-wider">{t.colContact}</TableHead>
                            <TableHead className="w-[100px] text-xs uppercase tracking-wider">{t.colActions}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pagination.paginatedItems.map((supplier) => (
                            <TableRow key={supplier.id} className="cursor-pointer" onClick={() => setViewingSupplier(supplier)}>
                              <TableCell>
                                <p className="font-medium">{supplier.name}</p>
                                {supplier.email && <p className="text-xs text-muted-foreground">{supplier.email}</p>}
                              </TableCell>
                              <TableCell className="hidden md:table-cell">{supplier.cpf_cnpj || '-'}</TableCell>
                              <TableCell className="hidden sm:table-cell">
                                <div className="space-y-0.5">
                                  {supplier.contact_name && <p className="text-sm">{supplier.contact_name}</p>}
                                  {supplier.phone && <p className="text-xs text-muted-foreground">{supplier.phone}</p>}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div onClick={(e) => e.stopPropagation()}>
                                  <RowActionsMenu
                                    actions={[
                                      { label: t.view, icon: Eye, onClick: () => setViewingSupplier(supplier) },
                                      { label: t.edit, icon: Pencil, variant: 'edit', onClick: () => openEdit(supplier) },
                                      { label: t.delete, icon: Trash2, variant: 'delete', onClick: () => requestDelete(supplier) },
                                    ]}
                                  />
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

      <SupplierFormDialog open={formOpen} onOpenChange={setFormOpen} supplier={editingSupplier} />

      {viewingSupplier && (
        <SupplierDetailDialog
          supplier={viewingSupplier}
          open={!!viewingSupplier}
          onOpenChange={(open) => { if (!open) setViewingSupplier(null); }}
        />
      )}

      <AlertDialog open={!!supplierToDelete} onOpenChange={(open) => { if (!open) setSupplierToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">{t.deleteConfirm.replace('{name}', supplierToDelete?.name ?? '')}</span>
              <span className="block">{t.deleteWarningCascade}</span>
              <span className="block">{t.deleteWarningFinance}</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
