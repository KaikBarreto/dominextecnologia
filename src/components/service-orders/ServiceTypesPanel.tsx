import { useState } from 'react';
import { Plus, Pencil, Trash2, Wrench } from 'lucide-react';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Table, TableBody, TableCell, TableHeader, TableRow,
} from '@/components/ui/table';
import { useTableSort } from '@/hooks/useTableSort';
import { SortableTableHead } from '@/components/ui/SortableTableHead';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Badge } from '@/components/ui/badge';
import { useServiceTypes } from '@/hooks/useServiceTypes';
import { useIsMobile } from '@/hooks/use-mobile';
import { RowActionsMenu } from '@/components/ui/RowActionsMenu';
import { MobileListItem, type ItemAction } from '@/components/mobile/MobileListItem';
import { FABButton } from '@/components/mobile/FABButton';
import { EmptyState } from '@/components/mobile/EmptyState';
import { TaxCodeCombobox } from '@/components/fiscal/TaxCodeCombobox';
import { useCompanyModules } from '@/hooks/useCompanyModules';

/** Converte string crua de input numérico em number (padrão do time anti-"0" preso). */
const num = (s: string, fallback = 0): number => {
  if (s == null || s.trim() === '') return fallback;
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
};

interface ServiceTypeForm {
  name: string;
  color: string;
  description: string;
  is_active: boolean;
  requires_equipment: boolean;
  number_prefix: string;
  // Fiscal (NFS-e) — opcionais. iss_aliquota fica como string crua no form.
  codigo_servico: string;
  codigo_nbs: string;
  iss_aliquota: string;
  item_lc116: string;
}

const defaultForm: ServiceTypeForm = {
  name: '',
  color: '#22c55e',
  description: '',
  is_active: true,
  requires_equipment: true,
  number_prefix: '',
  codigo_servico: '',
  codigo_nbs: '',
  iss_aliquota: '',
  item_lc116: '',
};

export function ServiceTypesPanel() {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.os.serviceTypes;

  const { serviceTypes, isLoading, createServiceType, updateServiceType, deleteServiceType } = useServiceTypes();
  const { hasModule } = useCompanyModules();
  const showFiscal = hasModule('nfe');
  const isMobile = useIsMobile();
  const { sortedItems: sortedTypes, sortConfig: stSortConfig, handleSort: handleStSort } = useTableSort(serviceTypes);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ServiceTypeForm>(defaultForm);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [toDeleteId, setToDeleteId] = useState<string | null>(null);

  const handleNew = () => {
    setEditingId(null);
    setForm(defaultForm);
    setFormOpen(true);
  };

  const handleEdit = (st: any) => {
    setEditingId(st.id);
    setForm({
      name: st.name,
      color: st.color,
      description: st.description || '',
      is_active: st.is_active,
      requires_equipment: st.requires_equipment ?? true,
      number_prefix: (st as any).number_prefix || '',
      codigo_servico: (st as any).codigo_servico || '',
      codigo_nbs: (st as any).codigo_nbs || '',
      iss_aliquota: (st as any).iss_aliquota != null ? String((st as any).iss_aliquota) : '',
      item_lc116: (st as any).item_lc116 || '',
    });
    setFormOpen(true);
  };

  const handleSave = async () => {
    const { iss_aliquota, codigo_servico, codigo_nbs, item_lc116, ...rest } = form;
    const payload = {
      ...rest,
      // Fiscal: campos opcionais — string vazia vira null pra não poluir o cadastro.
      codigo_servico: codigo_servico.trim() || null,
      codigo_nbs: codigo_nbs.trim() || null,
      item_lc116: item_lc116.trim() || null,
      iss_aliquota: iss_aliquota.trim() === '' ? null : num(iss_aliquota, 0),
    };
    if (editingId) {
      await updateServiceType.mutateAsync({ id: editingId, ...payload });
    } else {
      await createServiceType.mutateAsync(payload);
    }
    setFormOpen(false);
  };

  const handleDelete = async () => {
    if (toDeleteId) {
      await deleteServiceType.mutateAsync(toDeleteId);
      setToDeleteId(null);
      setDeleteDialogOpen(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header: no mobile escondemos texto explicativo (já está no MobilePageHeader da page) e o botão vira FAB. */}
      {!isMobile && (
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{t.title}</h2>
            <p className="text-sm text-muted-foreground">
              {t.subtitle}
            </p>
          </div>
          <Button onClick={handleNew}>
            <Plus className="mr-2 h-4 w-4" />
            {t.btnNew}
          </Button>
        </div>
      )}

      {serviceTypes.length === 0 ? (
        isMobile ? (
          <EmptyState
            icon={<Wrench className="h-12 w-12" />}
            title={t.emptyTitle}
            description={t.emptyDescriptionMobile}
          />
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Wrench className="mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="text-lg font-medium">{t.emptyTitle}</h3>
              <p className="text-muted-foreground">{t.emptyDescriptionDesktop}</p>
            </CardContent>
          </Card>
        )
      ) : isMobile ? (
        /* -------------------------------------------------------------------
         * Mobile: lista nativa com MobileListItem (swipe + menu ⋮).
         * ------------------------------------------------------------------- */
        <div className="rounded-xl border bg-card overflow-hidden">
          {sortedTypes.map((st) => {
            const itemActions: ItemAction[] = [
              {
                key: 'edit',
                label: t.actionEdit,
                icon: <Pencil className="h-4 w-4" />,
                variant: 'edit',
                onClick: () => handleEdit(st),
              },
              {
                key: 'delete',
                label: t.actionDelete,
                icon: <Trash2 className="h-4 w-4" />,
                variant: 'destructive',
                onClick: () => { setToDeleteId(st.id); setDeleteDialogOpen(true); },
              },
            ];

            const subtitleParts: string[] = [];
            if (st.description) subtitleParts.push(st.description);
            if (st.number_prefix) subtitleParts.push(`${t.prefixLabel} ${st.number_prefix}`);

            return (
              <MobileListItem
                key={st.id}
                onClick={() => handleEdit(st)}
                actions={itemActions}
                className={!st.is_active ? 'opacity-60' : ''}
                leading={
                  <div
                    className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: st.color }}
                  >
                    <Wrench className="h-5 w-5 text-white" />
                  </div>
                }
                title={st.name}
                subtitle={
                  <span className="flex items-center gap-2 flex-wrap">
                    {subtitleParts.length > 0 && (
                      <span className="truncate">{subtitleParts.join(' • ')}</span>
                    )}
                    {!st.is_active && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{t.badgeInactive}</Badge>
                    )}
                    {st.requires_equipment && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">{t.colEquipment}</Badge>
                    )}
                  </span>
                }
              />
            );
          })}
        </div>
      ) : (
        /* -------------------------------------------------------------------
         * Desktop: tabela 100% intacta.
         * ------------------------------------------------------------------- */
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead sortKey="" sortConfig={stSortConfig} onSort={() => {}}>{t.colColor}</SortableTableHead>
                  <SortableTableHead sortKey="name" sortConfig={stSortConfig} onSort={handleStSort}>{t.colName}</SortableTableHead>
                  <SortableTableHead sortKey="description" sortConfig={stSortConfig} onSort={handleStSort}>{t.colDescription}</SortableTableHead>
                  <SortableTableHead sortKey="number_prefix" sortConfig={stSortConfig} onSort={handleStSort}>{t.colPrefix}</SortableTableHead>
                  <SortableTableHead sortKey="requires_equipment" sortConfig={stSortConfig} onSort={handleStSort}>{t.colEquipment}</SortableTableHead>
                  <SortableTableHead sortKey="is_active" sortConfig={stSortConfig} onSort={handleStSort}>{t.colStatus}</SortableTableHead>
                  <SortableTableHead sortKey="" sortConfig={stSortConfig} onSort={() => {}} className="w-[100px]">{t.colActions}</SortableTableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedTypes.map((st) => (
                  <TableRow key={st.id} className={!st.is_active ? 'opacity-60' : ''}>
                    <TableCell>
                      <div
                        className="h-6 w-6 rounded-full"
                        style={{ backgroundColor: st.color }}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{st.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                      {st.description || '-'}
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-sm">{(st as any).number_prefix || '-'}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={(st as any).requires_equipment ? 'default' : 'secondary'} className="text-xs">
                        {(st as any).requires_equipment ? t.badgeYes : t.badgeNo}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={st.is_active ? 'default' : 'secondary'} className="text-xs">
                        {st.is_active ? t.badgeActive : t.badgeInactive}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <RowActionsMenu
                        actions={[
                          { label: t.actionEdit, icon: Pencil, variant: 'edit', onClick: () => handleEdit(st) },
                          { label: t.actionDelete, icon: Trash2, variant: 'delete', onClick: () => { setToDeleteId(st.id); setDeleteDialogOpen(true); } },
                        ]}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* FAB mobile-only para criar novo tipo de serviço. */}
      {isMobile && (
        <FABButton
          icon={<Plus className="h-5 w-5" />}
          label={t.fabLabel}
          onClick={handleNew}
        />
      )}

      <ResponsiveModal
        open={formOpen}
        onOpenChange={setFormOpen}
        title={editingId ? t.modalTitleEdit : t.modalTitleCreate}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setFormOpen(false)}>{t.btnCancel}</Button>
            <Button onClick={handleSave} disabled={!form.name.trim()}>
              {editingId ? t.btnSave : t.btnCreate}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t.labelName}</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={t.placeholderName}
            />
          </div>
          <div className="space-y-2">
            <Label>{t.labelColor}</Label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                className="h-10 w-10 rounded cursor-pointer border-0"
              />
              <Input
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                className="flex-1"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t.labelDescription}</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder={t.placeholderDescription}
            />
          </div>
          <div className="space-y-2">
            <Label>{t.labelPrefix}</Label>
            <div className="flex items-center gap-3">
              <Input
                value={form.number_prefix}
                onChange={(e) => setForm({ ...form, number_prefix: e.target.value })}
                placeholder={t.placeholderPrefix}
                className="w-40"
              />
              <span className="text-sm font-mono text-muted-foreground whitespace-nowrap">
                → {form.number_prefix || 'OS'}-2026-0001
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={form.requires_equipment}
              onCheckedChange={(checked) => setForm({ ...form, requires_equipment: checked })}
            />
            <Label>{t.labelEquipmentRequired}</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={form.is_active}
              onCheckedChange={(checked) => setForm({ ...form, is_active: checked })}
            />
            <Label>{t.labelActive}</Label>
          </div>

          {/* -------------------------------------------------------------------
           * Fiscal (NFS-e): classificação tributária por tipo de serviço.
           * Só aparece pra empresas com o módulo `nfe`. Todos os campos são
           * opcionais — o tipo de serviço salva normalmente sem eles.
           * ------------------------------------------------------------------- */}
          {showFiscal && (
            <div className="space-y-5 rounded-lg border bg-muted/30 p-4">
              <div className="space-y-0.5">
                <p className="text-sm font-semibold">{t.fiscalTitle}</p>
                <p className="text-xs text-muted-foreground">
                  {t.fiscalSubtitle}
                </p>
              </div>

              {/* Grupo 1: classificação do serviço (código nacional + item da LC 116). */}
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">{t.labelCTribNac}</Label>
                  <TaxCodeCombobox
                    type="servico"
                    value={form.codigo_servico}
                    onSelect={(codigo, item) =>
                      setForm((f) => ({
                        ...f,
                        codigo_servico: codigo,
                        // Auto-preenche o item LC 116 quando o código traz a referência.
                        item_lc116: item?.itemLc116 ? String(item.itemLc116) : f.item_lc116,
                      }))
                    }
                    placeholder={t.placeholderTaxSearch}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    {t.helperCTribNac}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">{t.labelLC116}</Label>
                  <Input
                    value={form.item_lc116}
                    onChange={(e) => setForm({ ...form, item_lc116: e.target.value })}
                    placeholder="14.01"
                  />
                </div>
              </div>

              {/* Grupo 2: NBS. */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">{t.labelNBS}</Label>
                <TaxCodeCombobox
                  type="nbs"
                  value={form.codigo_nbs}
                  onSelect={(codigo) => setForm((f) => ({ ...f, codigo_nbs: codigo }))}
                  placeholder={t.placeholderTaxSearch}
                />
                <p className="text-[11px] text-muted-foreground">
                  {t.helperNBS}
                </p>
              </div>

              {/* Grupo 3: tributação (ISS). */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">{t.labelISS}</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={form.iss_aliquota}
                  onChange={(e) => setForm({ ...form, iss_aliquota: e.target.value })}
                  placeholder="5"
                  className="sm:max-w-[160px]"
                />
              </div>
            </div>
          )}

        </div>
      </ResponsiveModal>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.deleteDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.btnCancelDelete}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t.btnDelete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
