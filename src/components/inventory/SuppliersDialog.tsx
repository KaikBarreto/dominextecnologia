import { useState } from 'react';
import { Plus, Pencil, Trash2, Search, Users } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/mobile/EmptyState';
import { fuzzyIncludes } from '@/lib/utils';
import { useSuppliers, type Supplier } from '@/hooks/useSuppliers';
import { SupplierFormDialog } from './SupplierFormDialog';

interface SuppliersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SuppliersDialog({ open, onOpenChange }: SuppliersDialogProps) {
  const { suppliers, isLoading, deleteSupplier } = useSuppliers();
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [toDelete, setToDelete] = useState<Supplier | null>(null);

  const filtered = suppliers.filter((s) =>
    !search.trim() ||
    fuzzyIncludes(s.name, search) ||
    fuzzyIncludes(s.cpf_cnpj ?? '', search) ||
    fuzzyIncludes(s.contact_name ?? '', search),
  );

  const openNew = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (s: Supplier) => { setEditing(s); setFormOpen(true); };

  return (
    <>
      <ResponsiveModal
        open={open}
        onOpenChange={onOpenChange}
        title="Fornecedores"
        className="sm:max-w-[640px]"
      >
        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar fornecedor..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Button onClick={openNew} className="gap-1.5">
              <Plus className="h-4 w-4" /> Novo
            </Button>
          </div>

          {isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Carregando...</p>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<Users className="h-8 w-8" />}
              title={search ? 'Nenhum fornecedor encontrado' : 'Nenhum fornecedor cadastrado'}
              description={search ? 'Tente outro termo de busca.' : 'Cadastre fornecedores para usá-los nas cotações.'}
              action={search ? undefined : { label: 'Novo fornecedor', onClick: openNew }}
            />
          ) : (
            <div className="space-y-2">
              {filtered.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{s.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[s.cpf_cnpj, s.contact_name, s.phone].filter(Boolean).join(' • ') || 'Sem dados adicionais'}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-warning hover:text-warning"
                      onClick={() => openEdit(s)}
                      aria-label="Editar"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setToDelete(s)}
                      aria-label="Excluir"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </ResponsiveModal>

      <SupplierFormDialog open={formOpen} onOpenChange={setFormOpen} supplier={editing} />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir fornecedor?</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete ? `"${toDelete.name}" será removido. ` : ''}
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={async () => {
                if (toDelete) await deleteSupplier.mutateAsync(toDelete.id);
                setToDelete(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
