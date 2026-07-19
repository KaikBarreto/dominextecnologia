import { useState } from 'react';
import { Plus, Pencil, Trash2, Search, Truck } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/mobile/EmptyState';
import { fuzzyIncludes } from '@/lib/utils';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { useSuppliers, type Supplier } from '@/hooks/useSuppliers';
import { SupplierFormDialog } from './SupplierFormDialog';

interface SuppliersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SuppliersDialog({ open, onOpenChange }: SuppliersDialogProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.inventory.suppliersDialog;
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
        title={t.title}
        className="sm:max-w-[640px]"
      >
        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder={t.searchPlaceholder}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Button onClick={openNew} className="gap-1.5">
              <Plus className="h-4 w-4" /> {t.newButton}
            </Button>
          </div>

          {isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t.loading}</p>
          ) : filtered.length === 0 ? (
            <EmptyState
              size="compact"
              icon={<Truck className="h-10 w-10" />}
              title={search ? t.empty.noneFoundTitle : t.empty.noneTitle}
              description={search ? t.empty.noneFoundDescription : t.empty.noneDescription}
              action={search ? undefined : { label: t.empty.newAction, onClick: openNew }}
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
                      {[s.cpf_cnpj, s.contact_name, s.phone].filter(Boolean).join(' • ') || t.noData}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-warning hover:text-warning"
                      onClick={() => openEdit(s)}
                      aria-label={t.ariaEdit}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setToDelete(s)}
                      aria-label={t.ariaDelete}
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
            <AlertDialogTitle>{t.deleteDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {toDelete
                ? t.deleteDialog.description.replace('{name}', toDelete.name)
                : t.deleteDialog.descriptionNoName}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.deleteDialog.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={async () => {
                if (toDelete) await deleteSupplier.mutateAsync(toDelete.id);
                setToDelete(null);
              }}
            >
              {t.deleteDialog.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
