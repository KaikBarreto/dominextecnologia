import { useState } from 'react';
import { Plus, Pencil, Trash2, Power, PowerOff, Search, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { RowActionsMenu } from '@/components/ui/RowActionsMenu';
import { MobileListItem, type ItemAction } from '@/components/mobile/MobileListItem';
import { FABButton } from '@/components/mobile/FABButton';
import { EmptyState } from '@/components/mobile/EmptyState';
import { useIsMobile } from '@/hooks/use-mobile';
import { useCanManageFinanceSettings } from '@/hooks/useCanManageFinanceSettings';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import {
  useCostCenters,
  CostCenterInactiveDuplicateError,
  type CostCenter,
  type CostCenterInput,
} from '@/hooks/useCostCenters';
import { CostCenterFormDialog } from './CostCenterFormDialog';

/**
 * Tela "Centro de Custo" — aba nova dentro de Financeiro > Relatório, ao lado
 * de Categorias. Quem só lê (sem `fn:manage_settings`/admin/gestor) vê a
 * lista normalmente, mas sem os botões de criar/editar/ativar/excluir — a
 * RLS já bloqueia no banco, isso aqui é só não oferecer um botão que vai dar
 * erro.
 */
export function FinanceCostCenters() {
  const isMobile = useIsMobile();
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.finance.costCentersScreen;
  const canManage = useCanManageFinanceSettings();

  const {
    costCenters,
    isLoading,
    createCostCenter,
    updateCostCenter,
    deleteCostCenter,
    reactivateCostCenter,
  } = useCostCenters();

  const [searchQuery, setSearchQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CostCenter | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  // Colisão de nome com um centro homônimo INATIVO (23505): oferece reativar
  // em vez de simplesmente falhar. `input` guarda os dados digitados no
  // formulário pra aplicar na reativação.
  const [reactivateTarget, setReactivateTarget] = useState<{ existing: CostCenter; input: CostCenterInput } | null>(null);

  const filtered = costCenters.filter((c) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return c.name.toLowerCase().includes(q) || (c.description ?? '').toLowerCase().includes(q);
  });

  const handleNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const handleEdit = (cc: CostCenter) => {
    setEditing(cc);
    setFormOpen(true);
  };

  const handleSubmit = async (data: CostCenterInput) => {
    try {
      if (editing) {
        await updateCostCenter.mutateAsync({ ...data, id: editing.id });
      } else {
        await createCostCenter.mutateAsync(data);
      }
      setEditing(null);
      setFormOpen(false);
    } catch (err) {
      if (err instanceof CostCenterInactiveDuplicateError) {
        setFormOpen(false);
        setReactivateTarget({ existing: err.existing, input: data });
      }
      // Outros erros já mostraram toast via onError da mutation.
    }
  };

  const handleToggleActive = (cc: CostCenter) => {
    updateCostCenter.mutate({
      id: cc.id,
      name: cc.name,
      color: cc.color,
      description: cc.description,
      is_active: !cc.is_active,
    });
  };

  const handleDelete = async () => {
    if (deleteId) {
      await deleteCostCenter.mutateAsync(deleteId);
      setDeleteId(null);
    }
  };

  const handleConfirmReactivate = async () => {
    if (!reactivateTarget) return;
    await reactivateCostCenter.mutateAsync({ id: reactivateTarget.existing.id, ...reactivateTarget.input });
    setReactivateTarget(null);
  };

  const buildActions = (cc: CostCenter): ItemAction[] => {
    if (!canManage) return [];
    return [
      {
        key: 'edit',
        label: t.actions.edit,
        icon: <Pencil className="h-4 w-4" />,
        variant: 'edit' as const,
        onClick: () => handleEdit(cc),
      },
      {
        key: 'toggle',
        label: cc.is_active ? t.actions.deactivate : t.actions.activate,
        icon: cc.is_active ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />,
        onClick: () => handleToggleActive(cc),
      },
      {
        key: 'delete',
        label: t.actions.delete,
        icon: <Trash2 className="h-4 w-4" />,
        variant: 'destructive' as const,
        onClick: () => setDeleteId(cc.id),
      },
    ];
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24 lg:pb-0">
      {!isMobile && (
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{t.header.title}</h2>
            <p className="text-sm text-muted-foreground">{t.header.subtitle}</p>
          </div>
          {canManage && (
            <Button onClick={handleNew}>
              <Plus className="mr-2 h-4 w-4" />
              {t.newButton}
            </Button>
          )}
        </div>
      )}

      {costCenters.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t.searchPlaceholder}
            className="pl-9"
          />
        </div>
      )}

      {costCenters.length === 0 ? (
        <EmptyState
          size={isMobile ? 'compact' : 'default'}
          icon={<Layers className="h-10 w-10" />}
          title={t.empty.title}
          description={t.empty.description}
          action={canManage ? { label: t.empty.newAction, onClick: handleNew } : undefined}
        />
      ) : filtered.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-8">{t.noResults}</p>
      ) : isMobile ? (
        <div className="rounded-xl border bg-card overflow-hidden">
          {filtered.map((cc) => (
            <MobileListItem
              key={cc.id}
              actions={buildActions(cc)}
              onClick={canManage ? () => handleEdit(cc) : undefined}
              className={!cc.is_active ? 'opacity-60' : ''}
              leading={
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-full shrink-0 shadow-sm"
                  style={{ backgroundColor: cc.color }}
                >
                  <Layers className="h-5 w-5 text-white" />
                </div>
              }
              title={cc.name}
              subtitle={
                <span className="flex items-center gap-2 flex-wrap">
                  {cc.description && <span className="truncate">{cc.description}</span>}
                  {!cc.is_active && (
                    <Badge className="bg-slate-600 text-white text-[10px] px-1.5 py-0">{t.status.inactive}</Badge>
                  )}
                </span>
              }
            />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]" />
                  <TableHead>{t.table.name}</TableHead>
                  <TableHead>{t.table.description}</TableHead>
                  <TableHead>{t.table.status}</TableHead>
                  <TableHead className="w-[100px]">{t.table.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((cc) => (
                  <TableRow key={cc.id} className={!cc.is_active ? 'opacity-60' : ''}>
                    <TableCell>
                      <div className="h-6 w-6 rounded-full" style={{ backgroundColor: cc.color }} />
                    </TableCell>
                    <TableCell className="font-medium">{cc.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[280px] truncate">
                      {cc.description || '-'}
                    </TableCell>
                    <TableCell>
                      {cc.is_active ? (
                        <Badge className="bg-success text-white">{t.status.active}</Badge>
                      ) : (
                        <Badge className="bg-slate-600 text-white">{t.status.inactive}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {canManage && (
                        <RowActionsMenu
                          actions={[
                            { label: t.actions.edit, icon: Pencil, variant: 'edit', onClick: () => handleEdit(cc) },
                            {
                              label: cc.is_active ? t.actions.deactivate : t.actions.activate,
                              icon: cc.is_active ? PowerOff : Power,
                              onClick: () => handleToggleActive(cc),
                            },
                            { label: t.actions.delete, icon: Trash2, variant: 'delete', onClick: () => setDeleteId(cc.id) },
                          ]}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {isMobile && canManage && (
        <FABButton
          icon={<Plus className="h-5 w-5" />}
          label={t.fabLabel}
          onClick={handleNew}
        />
      )}

      <CostCenterFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        costCenter={editing}
        onSubmit={handleSubmit}
        isLoading={createCostCenter.isPending || updateCostCenter.isPending}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.deleteDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>{t.deleteDialog.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.deleteDialog.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t.deleteDialog.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!reactivateTarget} onOpenChange={(open) => !open && setReactivateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.reactivateDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.reactivateDialog.description.replace('{name}', reactivateTarget?.existing.name ?? '')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.reactivateDialog.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmReactivate}>
              {t.reactivateDialog.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
