import { useState } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Package, Plus, Search, AlertTriangle, DollarSign, Edit, Trash2, TrendingUp, Boxes } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useInventory, type InventoryItem } from '@/hooks/useInventory';
import { InventoryFormDialog } from '@/components/inventory/InventoryFormDialog';
import { useDataPagination } from '@/hooks/useDataPagination';
import { DataTablePagination } from '@/components/ui/DataTablePagination';
import { useTableSort } from '@/hooks/useTableSort';
import { SortableTableHead } from '@/components/ui/SortableTableHead';

export default function Inventory() {
  const isMobile = useIsMobile();
  const { items, isLoading, stats, deleteItem } = useInventory();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredItems = items.filter(item =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.sku?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.category?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const { sortedItems, sortConfig, handleSort } = useTableSort(filteredItems);
  const pagination = useDataPagination(sortedItems);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const handleEdit = (item: InventoryItem) => {
    setEditingItem(item);
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja excluir este item?')) {
      await deleteItem.mutateAsync(id);
    }
  };

  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open);
    if (!open) setEditingItem(null);
  };

  const isLowStock = (item: InventoryItem) => {
    return item.quantity !== null && 
           item.min_quantity !== null && 
           item.quantity <= item.min_quantity;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Estoque</h1>
          <p className="text-muted-foreground">Controle de peças e materiais</p>
        </div>
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          Novo Item
        </Button>
      </div>

      {/* Stats Cards - Dashboard style */}
      {isLoading ? (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}><CardContent className="p-4 lg:p-6"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <Card className="relative overflow-hidden border-0 shadow-lg bg-[hsl(var(--primary))] text-white dark:bg-card dark:text-card-foreground dark:border dark:border-primary/30 dark:shadow-[0_0_15px_-3px_hsl(var(--primary)/0.15)]">
            <CardContent className="p-4 lg:p-6">
              <div className="flex flex-col items-center text-center lg:flex-row lg:items-start lg:justify-between lg:text-left">
                <div className="p-2 rounded-xl bg-black/10 dark:bg-primary/15 mb-2 lg:mb-0 lg:order-2">
                  <Boxes className="h-4 w-4 text-white dark:text-primary" />
                </div>
                <div className="space-y-1 lg:order-1 min-w-0">
                  <p className="text-xs font-medium text-white/80 dark:text-muted-foreground">Total de Itens</p>
                  <p className="text-xl lg:text-2xl font-bold dark:text-primary">{stats.totalItems}</p>
                  <p className="text-[10px] text-white/60 dark:text-muted-foreground">cadastrados</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-0 shadow-lg bg-[hsl(var(--info))] text-white dark:bg-card dark:text-card-foreground dark:border dark:border-info/30 dark:shadow-[0_0_15px_-3px_hsl(var(--info)/0.15)]">
            <CardContent className="p-4 lg:p-6">
              <div className="flex flex-col items-center text-center lg:flex-row lg:items-start lg:justify-between lg:text-left">
                <div className="p-2 rounded-xl bg-black/10 dark:bg-info/15 mb-2 lg:mb-0 lg:order-2">
                  <DollarSign className="h-4 w-4 text-white dark:text-info" />
                </div>
                <div className="space-y-1 lg:order-1 min-w-0">
                  <p className="text-xs font-medium text-white/80 dark:text-muted-foreground">Valor Investido</p>
                  <p className="text-xl lg:text-2xl font-bold dark:text-info">{formatCurrency(stats.totalValue)}</p>
                  <p className="text-[10px] text-white/60 dark:text-muted-foreground">preço de custo</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-0 shadow-lg bg-[hsl(var(--success))] text-white dark:bg-card dark:text-card-foreground dark:border dark:border-success/30 dark:shadow-[0_0_15px_-3px_hsl(var(--success)/0.15)]">
            <CardContent className="p-4 lg:p-6">
              <div className="flex flex-col items-center text-center lg:flex-row lg:items-start lg:justify-between lg:text-left">
                <div className="p-2 rounded-xl bg-black/10 dark:bg-success/15 mb-2 lg:mb-0 lg:order-2">
                  <TrendingUp className="h-4 w-4 text-white dark:text-success" />
                </div>
                <div className="space-y-1 lg:order-1 min-w-0">
                  <p className="text-xs font-medium text-white/80 dark:text-muted-foreground">Projeção de Venda</p>
                  <p className="text-xl lg:text-2xl font-bold dark:text-success">{formatCurrency(stats.totalSaleValue)}</p>
                  <p className="text-[10px] text-white/60 dark:text-muted-foreground">preço de venda</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-0 shadow-lg bg-[hsl(var(--warning))] text-white dark:bg-card dark:text-card-foreground dark:border dark:border-warning/30 dark:shadow-[0_0_15px_-3px_hsl(var(--warning)/0.15)]">
            <CardContent className="p-4 lg:p-6">
              <div className="flex flex-col items-center text-center lg:flex-row lg:items-start lg:justify-between lg:text-left">
                <div className="p-2 rounded-xl bg-black/10 dark:bg-warning/15 mb-2 lg:mb-0 lg:order-2">
                  <AlertTriangle className="h-4 w-4 text-white dark:text-warning" />
                </div>
                <div className="space-y-1 lg:order-1 min-w-0">
                  <p className="text-xs font-medium text-white/80 dark:text-muted-foreground">Estoque Baixo</p>
                  <p className="text-xl lg:text-2xl font-bold dark:text-warning">{stats.lowStockItems}</p>
                  <p className="text-[10px] text-white/60 dark:text-muted-foreground">itens em alerta</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input 
          placeholder="Buscar por nome, código ou categoria..." 
          className="pl-10"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Items Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Itens do Estoque
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Package className="mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="text-lg font-medium">
                {searchQuery ? 'Nenhum item encontrado' : 'Estoque vazio'}
              </h3>
              <p className="text-muted-foreground">
                {searchQuery ? 'Tente buscar por outro termo' : 'Clique em "Novo Item" para adicionar peças ao estoque'}
              </p>
            </div>
          ) : (
            <>
            {isMobile ? (
              <div className="space-y-3">
                {pagination.paginatedItems.map((item) => (
                  <Card key={item.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm truncate">{item.name}</p>
                            {isLowStock(item) && <Badge variant="warning" className="shrink-0"><AlertTriangle className="mr-1 h-3 w-3" />Baixo</Badge>}
                          </div>
                          {item.sku && <p className="text-xs text-muted-foreground">{item.sku}</p>}
                        </div>
                        {item.category && <Badge variant="secondary" className="shrink-0">{item.category}</Badge>}
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Qtd: <span className="font-medium text-foreground">{item.quantity || 0} {item.unit}</span></span>
                        <span className="text-muted-foreground">Custo: <span className="font-medium text-foreground">{item.cost_price ? formatCurrency(item.cost_price) : '-'}</span></span>
                        <span className="text-muted-foreground">Venda: <span className="font-medium text-foreground">{item.sale_price ? formatCurrency(item.sale_price) : '-'}</span></span>
                      </div>
                      <div className="flex justify-end gap-1 pt-1 border-t">
                        <Button variant="edit-ghost" size="sm" onClick={() => handleEdit(item)}><Edit className="h-3.5 w-3.5 mr-1" />Editar</Button>
                        <Button variant="destructive-ghost" size="sm" onClick={() => handleDelete(item.id)}><Trash2 className="h-3.5 w-3.5 mr-1" />Excluir</Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead className="text-right">Quantidade</TableHead>
                    <TableHead className="text-right">Custo Unit.</TableHead>
                    <TableHead className="text-right">Venda Unit.</TableHead>
                    <TableHead className="w-[100px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagination.paginatedItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {item.name}
                          {isLowStock(item) && (
                            <Badge variant="warning">
                              <AlertTriangle className="mr-1 h-3 w-3" />
                              Baixo
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{item.sku || '-'}</TableCell>
                      <TableCell>
                        {item.category && (
                          <Badge variant="secondary">{item.category}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.quantity || 0} {item.unit}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.cost_price ? formatCurrency(item.cost_price) : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.sale_price ? formatCurrency(item.sale_price) : '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="edit-ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleEdit(item)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="destructive-ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleDelete(item.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            )}
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
        </CardContent>
      </Card>

      {/* Form Dialog */}
      <InventoryFormDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        item={editingItem}
      />
    </div>
  );
}
