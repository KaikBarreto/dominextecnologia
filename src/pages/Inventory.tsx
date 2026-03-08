import { useState } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Package, Plus, Search, AlertTriangle, DollarSign, Edit, Trash2 } from 'lucide-react';
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

  const pagination = useDataPagination(filteredItems);

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

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="bg-gradient-to-br from-card to-muted/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total de Itens</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-16 mt-1" />
                ) : (
                  <p className="text-2xl font-bold">{stats.totalItems}</p>
                )}
              </div>
              <div className="rounded-full bg-primary p-3">
                <Package className="h-6 w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-card to-warning/5">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Estoque Baixo</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-16 mt-1" />
                ) : (
                  <p className="text-2xl font-bold text-warning">{stats.lowStockItems}</p>
                )}
              </div>
              <div className="rounded-full bg-warning p-3">
                <AlertTriangle className="h-6 w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-card to-success/5">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Valor Total</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-24 mt-1" />
                ) : (
                  <p className="text-2xl font-bold text-success">{formatCurrency(stats.totalValue)}</p>
                )}
              </div>
              <div className="rounded-full bg-success p-3">
                <DollarSign className="h-6 w-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

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
