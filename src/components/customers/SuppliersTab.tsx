import { useState } from 'react';
import { Truck, Plus, Pencil, Trash2, Eye } from 'lucide-react';
import { fuzzyIncludes } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { useSuppliers, type Supplier } from '@/hooks/useSuppliers';
import { useDataPagination } from '@/hooks/useDataPagination';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/mobile/EmptyState';
import { MobileListItem, type ItemAction } from '@/components/mobile/MobileListItem';
import { MobileListToolbar } from '@/components/mobile/MobileListToolbar';
import { DataTablePagination } from '@/components/ui/DataTablePagination';
import { ListDetailLayout } from '@/components/ui/ListDetailLayout';
// Reusa o formulário do módulo de Estoque/Compras (mesmo hook `useSuppliers`,
// mesma tabela `suppliers`). Não recriamos um segundo CRUD de fornecedor.
import { SupplierFormDialog } from '@/components/inventory/SupplierFormDialog';
import { SupplierDetailContent, SupplierDetailDialog } from '@/components/customers/SupplierDetailDialog';
import { usePartyLabels } from '@/hooks/usePartyLabels';
import { PartyLabelBadge } from '@/components/customers/PartyLabelBadge';

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
  const { byId: labelById } = usePartyLabels();

  const [searchTerm, setSearchTerm] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [supplierToDelete, setSupplierToDelete] = useState<Supplier | null>(null);
  const [viewingSupplier, setViewingSupplier] = useState<Supplier | null>(null);

  const filteredSuppliers = suppliers.filter((supplier) =>
    fuzzyIncludes(supplier.name, searchTerm) ||
    fuzzyIncludes(supplier.cpf_cnpj ?? '', searchTerm) ||
    fuzzyIncludes(supplier.contact_name ?? '', searchTerm) ||
    fuzzyIncludes(supplier.email ?? '', searchTerm) ||
    fuzzyIncludes(supplier.address ?? '', searchTerm),
  );
  const selectedSupplier = viewingSupplier
    ? suppliers.find((supplier) => supplier.id === viewingSupplier.id) ?? viewingSupplier
    : null;

  const pagination = useDataPagination(filteredSuppliers, 10, 'suppliers-list');

  const openNew = () => { setEditingSupplier(null); setFormOpen(true); };
  const openEdit = (supplier: Supplier, e?: React.MouseEvent) => { e?.stopPropagation(); setEditingSupplier(supplier); setFormOpen(true); };
  const requestDelete = (supplier: Supplier, e?: React.MouseEvent) => { e?.stopPropagation(); setSupplierToDelete(supplier); };

  const handleDelete = async () => {
    if (!supplierToDelete) return;
    await deleteSupplier.mutateAsync(supplierToDelete.id);
    if (selectedSupplier?.id === supplierToDelete.id) setViewingSupplier(null);
    setSupplierToDelete(null);
  };

  return (
    <div className="space-y-4">
      {isMobile ? (
        <MobileListToolbar
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          searchPlaceholder={t.searchPlaceholderMobile}
        >
          <Button
            className="h-10 w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={openNew}
          >
            <Plus className="h-4 w-4" />
            {t.newSupplierShort}
          </Button>
        </MobileListToolbar>
      ) : null}

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
                      trailing={<PartyLabelBadge label={labelById((supplier as Supplier & { label_id?: string | null }).label_id)} compact />}
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
        <ListDetailLayout
          items={suppliers.map((supplier) => ({
            id: supplier.id,
            title: supplier.name,
            subtitle: [supplier.cpf_cnpj, supplier.contact_name, supplier.phone].filter(Boolean).join(' · ') || undefined,
            searchText: [supplier.email, supplier.address, supplier.notes].filter(Boolean).join(' '),
            leading: (
              // Ícone solto: sem a bolha translúcida atrás (régua de UI).
              <div className="flex h-10 w-10 items-center justify-center text-muted-foreground">
                <Truck className="h-5 w-5" />
              </div>
            ),
            trailing: <PartyLabelBadge label={labelById((supplier as Supplier & { label_id?: string | null }).label_id)} />,
          }))}
          selectedId={selectedSupplier?.id}
          listTitle={t.listHeading}
          storageKey="suppliers-list-detail"
          searchPlaceholder={t.searchPlaceholderMobile}
          emptyLabel={t.emptySearch}
          onSelect={(supplierId) => {
            const selected = suppliers.find((supplier) => supplier.id === supplierId);
            if (selected) setViewingSupplier(selected);
          }}
        >
          {/* "Novo Fornecedor" no topo da coluna de detalhe: numa linha própria
              acima do layout, empurrava o painel da lista pra baixo. */}
          <div className="mb-4 flex justify-end">
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={openNew}>
              <Plus className="mr-2 h-4 w-4" />
              {t.newSupplier}
            </Button>
          </div>
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-12 w-64" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : isError ? (
            <EmptyState
              icon={<Truck className="h-12 w-12 text-destructive" />}
              title={t.loadError}
              description={t.loadErrorDesc}
              action={{ label: t.retry, onClick: () => refetch() }}
            />
          ) : suppliers.length === 0 ? (
            <EmptyState
              icon={<Truck className="h-12 w-12" />}
              title={t.emptyNone}
              description={t.emptyNoneDescClick}
            />
          ) : selectedSupplier ? (
            <div className="space-y-6">
              <div className="flex items-start justify-between gap-4 border-b pb-4">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t.detail.title}</p>
                  <h2 className="mt-1 truncate text-2xl font-bold">{selectedSupplier.name}</h2>
                </div>
                {/* Mesma régua da ficha de cliente: Editar e Excluir em
                    evidência, em ghost com a cor da ação. */}
                <div className="flex shrink-0 items-center gap-2">
                  <Button variant="ghost" size="sm" className="text-warning hover:text-warning" onClick={() => openEdit(selectedSupplier)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    {t.edit}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:bg-destructive hover:text-white"
                    onClick={() => requestDelete(selectedSupplier)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t.delete}
                  </Button>
                </div>
              </div>
              <SupplierDetailContent key={selectedSupplier.id} supplier={selectedSupplier} />
            </div>
          ) : (
            <EmptyState
              icon={<Truck className="h-12 w-12" />}
              title={t.selectPrompt}
              description={t.selectPromptDesc}
            />
          )}
        </ListDetailLayout>
      )}

      <SupplierFormDialog open={formOpen} onOpenChange={setFormOpen} supplier={editingSupplier} />

      {isMobile && selectedSupplier && (
        <SupplierDetailDialog
          supplier={selectedSupplier}
          open={!!selectedSupplier}
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
