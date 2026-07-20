import { useState } from 'react';
import { Plus, Pencil, Trash2, Link2, ClipboardList } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { RowActionsMenu } from '@/components/ui/RowActionsMenu';
import { EmptyState } from '@/components/mobile/EmptyState';
import { useToast } from '@/hooks/use-toast';
import { buildSlugSegment } from '@/utils/prettyLinks';
import {
  useLeadCaptureForms,
  type LeadCaptureForm,
  type LeadCaptureFormInput,
} from '@/hooks/useLeadCaptureForms';
import { LeadCaptureFormDialog } from './LeadCaptureFormDialog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function isExpired(form: LeadCaptureForm): boolean {
  return !!form.expires_at && new Date(form.expires_at).getTime() < Date.now();
}

export function LeadCaptureManagerDialog({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const { forms, isLoading, createForm, updateForm, toggleActive, deleteForm } = useLeadCaptureForms();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<LeadCaptureForm | null>(null);
  const [toDelete, setToDelete] = useState<LeadCaptureForm | null>(null);

  const handleSubmit = async (data: LeadCaptureFormInput) => {
    if (editing) {
      await updateForm.mutateAsync({ ...data, id: editing.id });
    } else {
      await createForm.mutateAsync(data);
    }
    setEditing(null);
  };

  const copyLink = (form: LeadCaptureForm) => {
    if (!form.short_code) return;
    const segment = buildSlugSegment([form.title], form.short_code, 'cadastro');
    const url = `${window.location.origin}/cadastro/${segment}`;
    navigator.clipboard?.writeText(url).then(
      () => toast({ title: 'Link gerado e copiado!' }),
      () => toast({ title: 'Link gerado', description: url }),
    );
  };

  const statusBadge = (form: LeadCaptureForm) => {
    if (isExpired(form)) {
      return <Badge className="border-transparent bg-slate-600 text-white hover:bg-slate-600">Expirado</Badge>;
    }
    if (!form.is_active) {
      return <Badge className="border-transparent bg-slate-600 text-white hover:bg-slate-600">Inativo</Badge>;
    }
    return <Badge className="border-transparent bg-emerald-600 text-white hover:bg-emerald-600">Ativo</Badge>;
  };

  return (
    <>
      <ResponsiveModal
        open={open}
        onOpenChange={onOpenChange}
        title="Formulários de captação"
        description="Links públicos para o cliente se cadastrar sozinho."
        footer={
          <Button
            className="w-full gap-2"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Novo formulário
          </Button>
        }
      >
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : forms.length === 0 ? (
          <EmptyState
            size="compact"
            icon={<ClipboardList className="h-8 w-8" />}
            title="Nenhum formulário ainda"
            description="Crie um link público para receber cadastros de novos clientes."
          />
        ) : (
          <div className="rounded-xl border bg-card">
            {forms.map((form, idx) => (
              <div
                key={form.id}
                className={`flex items-center gap-3 px-3 py-3 ${idx > 0 ? 'border-t' : ''}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 truncate text-sm font-medium">{form.title}</p>
                    {statusBadge(form)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {form.submission_count} {form.submission_count === 1 ? 'cadastro' : 'cadastros'}
                  </p>
                </div>
                <Switch
                  checked={form.is_active && !isExpired(form)}
                  disabled={isExpired(form) || toggleActive.isPending}
                  onCheckedChange={(v) => toggleActive.mutate({ id: form.id, is_active: v })}
                  aria-label="Ativar formulário"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  title="Copiar link"
                  onClick={() => copyLink(form)}
                >
                  <Link2 className="h-4 w-4" />
                </Button>
                <RowActionsMenu
                  triggerClassName="h-8 w-8"
                  actions={[
                    {
                      label: 'Editar',
                      icon: Pencil,
                      variant: 'edit',
                      onClick: () => {
                        setEditing(form);
                        setFormOpen(true);
                      },
                    },
                    {
                      label: 'Excluir',
                      icon: Trash2,
                      variant: 'delete',
                      onClick: () => setToDelete(form),
                    },
                  ]}
                />
              </div>
            ))}
          </div>
        )}
      </ResponsiveModal>

      <LeadCaptureFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        form={editing}
        onSubmit={handleSubmit}
        isLoading={createForm.isPending || updateForm.isPending}
      />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir formulário</AlertDialogTitle>
            <AlertDialogDescription>
              {`Tem certeza que deseja excluir "${toDelete?.title ?? ''}"? O link deixará de funcionar.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (toDelete) deleteForm.mutate(toDelete.id);
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
