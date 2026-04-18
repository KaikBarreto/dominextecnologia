import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  useSalespeople, useAllSalespersonSales, useAllSalespersonAdvances,
  useDeleteSalesperson, type Salesperson,
} from '@/hooks/useSalespersonData';
import { SalespersonFormDialog } from '@/components/admin/salesperson/SalespersonFormDialog';
import { SalespersonDashboardStats } from '@/components/admin/salesperson/SalespersonDashboardStats';
import { SalespersonPerformanceTable } from '@/components/admin/salesperson/SalespersonPerformanceTable';

export default function AdminSalespeople() {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState<Salesperson | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const { data: salespeople = [], isLoading: loadingS } = useSalespeople();
  const { data: sales = [], isLoading: loadingSa } = useAllSalespersonSales();
  const { data: advances = [], isLoading: loadingA } = useAllSalespersonAdvances();
  const deleteMutation = useDeleteSalesperson();

  const isLoading = loadingS || loadingSa || loadingA;
  const filtered = salespeople.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.email || '').toLowerCase().includes(search.toLowerCase())
  );

  const handleEdit = (s: Salesperson) => { setEditing(s); setIsFormOpen(true); };
  const handleDelete = async () => {
    if (!deleteId) return;
    await deleteMutation.mutateAsync(deleteId);
    setDeleteId(null);
  };

  return (
    <div className="container mx-auto px-3 sm:px-4 lg:px-6 py-4 lg:py-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-foreground">Vendedores</h1>
          <p className="text-sm text-muted-foreground">Dashboard de controle gerencial da equipe comercial</p>
        </div>
        <Button onClick={() => { setEditing(null); setIsFormOpen(true); }} className="gap-2">
          <Plus className="h-4 w-4" /> Novo Vendedor
        </Button>
      </div>

      {isLoading ? (
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : (
        <>
          <SalespersonDashboardStats salespeople={salespeople} sales={sales} advances={advances} />

          <div className="space-y-4">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            {filtered.length > 0 ? (
              <SalespersonPerformanceTable
                salespeople={filtered}
                sales={sales}
                advances={advances}
                onEdit={handleEdit}
                onDelete={setDeleteId}
              />
            ) : (
              <div className="text-center py-12 border rounded-lg">
                <p className="text-muted-foreground">Nenhum vendedor encontrado.</p>
              </div>
            )}
          </div>
        </>
      )}

      <SalespersonFormDialog
        open={isFormOpen}
        onOpenChange={(o) => { setIsFormOpen(o); if (!o) setEditing(null); }}
        editingSalesperson={editing}
      />

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover este vendedor? Todas as vendas e vales associados serão removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
