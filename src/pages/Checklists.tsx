import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, FileText, Trash2, Search, Pencil, BookOpen } from 'lucide-react';
import { cn, fuzzyIncludes } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHeader, TableRow,
} from '@/components/ui/table';
import { useTableSort } from '@/hooks/useTableSort';
import { SortableTableHead } from '@/components/ui/SortableTableHead';
import { useDataPagination } from '@/hooks/useDataPagination';
import { DataTablePagination } from '@/components/ui/DataTablePagination';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useFormTemplates } from '@/hooks/useFormTemplates';
import { useServiceTypes } from '@/hooks/useServiceTypes';
import { MobilePageHeader } from '@/components/mobile/MobilePageHeader';
import { FABButton } from '@/components/mobile/FABButton';
import { MobileListItem, type ItemAction } from '@/components/mobile/MobileListItem';
import { EmptyState } from '@/components/mobile/EmptyState';
import { ChecklistCatalogModal } from '@/components/technician/ChecklistCatalogModal';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

type TemplateWithServiceIds = { service_type_ids?: string[] };

function getServiceIds(template: unknown): string[] | undefined {
  return (template as TemplateWithServiceIds).service_type_ids;
}

export default function ChecklistsPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.os.checklists;
  const [createOpen, setCreateOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [allServices, setAllServices] = useState(true);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const { templates, createTemplate, setTemplateServices, deleteTemplate } = useFormTemplates();
  const { serviceTypes } = useServiceTypes();

  // Templates de norma PMOC (is_pmoc_default) são materializados/gerenciados pelo
  // fluxo de contrato PMOC e referenciados por contrato — não devem aparecer (nem
  // ser excluídos) na gestão de checklists comum.
  const activeTemplates = templates.filter((template) => template.is_active && !template.is_pmoc_default);
  const filteredTemplates = activeTemplates.filter((t) => fuzzyIncludes(t.name, searchTerm));
  const { sortedItems: sortedTemplates, sortConfig, handleSort } = useTableSort(filteredTemplates);
  const pagination = useDataPagination(sortedTemplates, 10, 'checklists-list');

  const handleCreate = () => {
    if (!newName.trim()) return;
    createTemplate.mutate({ name: newName }, {
      onSuccess: (data) => {
        if (!allServices && selectedServiceIds.length > 0 && data) {
          setTemplateServices.mutate({ templateId: data.id, serviceTypeIds: selectedServiceIds });
        }
        setNewName('');
        setAllServices(true);
        setSelectedServiceIds([]);
        setCreateOpen(false);
        // Navigate to the new checklist page
        if (data) {
          navigate(`/checklists/${data.id}`);
        }
      },
    });
  };

  const toggleServiceId = (id: string) => {
    setSelectedServiceIds(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  const handleDelete = () => {
    if (deleteId) {
      deleteTemplate.mutate(deleteId, {
        onSuccess: () => setDeleteId(null),
      });
    }
  };

  const templateToDelete = activeTemplates.find((t) => t.id === deleteId);

  return (
    <div className={cn('space-y-6 min-w-0 w-full max-w-full overflow-x-hidden', isMobile && 'pb-24')}>
      <MobilePageHeader
        title={t.title}
        subtitle={t.subtitle}
        icon={FileText}
        actions={
          isMobile ? (
            <Button variant="outline" size="sm" onClick={() => setCatalogOpen(true)}>
              <BookOpen className="mr-1.5 h-4 w-4" />
              {t.btnCatalog}
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setCatalogOpen(true)}>
                <BookOpen className="mr-2 h-4 w-4" />
                {t.btnCatalogFull}
              </Button>
              <Button
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => setCreateOpen(true)}
              >
                <Plus className="mr-2 h-4 w-4" />
                {t.btnNew}
              </Button>
            </div>
          )
        }
      />

      {/* Busca fixa no topo */}
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={isMobile ? t.searchPlaceholderMobile : t.searchPlaceholderDesktop}
            className="pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {isMobile ? (
        // -----------------------------------------------------------------
        // Mobile: lista nativa, sem Card wrapper.
        // -----------------------------------------------------------------
        <>
          {filteredTemplates.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-12 w-12" />}
              title={searchTerm ? t.emptySearchTitle : t.emptyTitle}
              description={searchTerm ? t.emptySearchDesc : t.emptyDescriptionMobile}
            />
          ) : (
            <>
              <div className="rounded-xl border bg-card overflow-hidden">
                {pagination.paginatedItems.map((template) => {
                  const serviceIds = getServiceIds(template);
                  const appliesToAll = !serviceIds || serviceIds.length === 0;
                  const questionsCount = template.questions?.length || 0;
                  const scopeLabel = appliesToAll
                    ? t.scopeAll
                    : (serviceIds!.length === 1
                        ? t.scopeServices.replace('{n}', '1')
                        : t.scopeServicesPlural.replace('{n}', String(serviceIds!.length)));
                  const questionsLabel = questionsCount === 1
                    ? t.questionsCount.replace('{n}', '1')
                    : t.questionsCountPlural.replace('{n}', String(questionsCount));

                  const itemActions: ItemAction[] = [
                    {
                      key: 'edit',
                      label: t.actionEditView,
                      icon: <Pencil className="h-4 w-4" />,
                      variant: 'edit',
                      onClick: () => navigate(`/checklists/${template.id}`),
                    },
                    {
                      key: 'delete',
                      label: t.actionDelete,
                      icon: <Trash2 className="h-4 w-4" />,
                      variant: 'destructive',
                      onClick: () => setDeleteId(template.id),
                    },
                  ];

                  return (
                    <MobileListItem
                      key={template.id}
                      onClick={() => navigate(`/checklists/${template.id}`)}
                      actions={itemActions}
                      leading={
                        <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                          <FileText className="h-5 w-5" />
                        </div>
                      }
                      title={template.name}
                      subtitle={`${questionsLabel} • ${scopeLabel}`}
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
        // -----------------------------------------------------------------
        // Desktop: mantém Card + tabela 100% como estava.
        // -----------------------------------------------------------------
        <Card>
          <CardContent className="p-0">
            {filteredTemplates.length === 0 ? (
              searchTerm ? (
                <EmptyState
                  icon={<FileText className="h-12 w-12" />}
                  title={t.emptySearchTitle}
                  description={t.emptySearchDesc}
                />
              ) : (
                <EmptyState
                  icon={<FileText className="h-12 w-12" />}
                  title={t.emptyTitle}
                  description={t.emptyDescriptionDesktop}
                  action={{ label: t.btnNew, onClick: () => setCreateOpen(true) }}
                />
              )
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableTableHead sortKey="name" sortConfig={sortConfig} onSort={handleSort}>{t.colName}</SortableTableHead>
                        <SortableTableHead sortKey="" sortConfig={sortConfig} onSort={() => {}} className="hidden sm:table-cell">{t.colQuestions}</SortableTableHead>
                        <SortableTableHead sortKey="" sortConfig={sortConfig} onSort={() => {}} className="hidden md:table-cell">{t.colServices}</SortableTableHead>
                        <SortableTableHead sortKey="is_active" sortConfig={sortConfig} onSort={handleSort}>{t.colStatus}</SortableTableHead>
                        <SortableTableHead sortKey="" sortConfig={sortConfig} onSort={() => {}} className="w-[80px]">{t.colActions}</SortableTableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagination.paginatedItems.map((template) => {
                        const serviceIds = getServiceIds(template);
                        const appliesToAll = !serviceIds || serviceIds.length === 0;
                        const linkedServices = appliesToAll
                          ? []
                          : serviceTypes.filter(st => serviceIds!.includes(st.id));

                        return (
                          <TableRow
                            key={template.id}
                            className="cursor-pointer"
                            onClick={() => navigate(`/checklists/${template.id}`)}
                          >
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                                <span className="font-medium">{template.name}</span>
                              </div>
                            </TableCell>
                            <TableCell className="hidden sm:table-cell">
                              <span className="text-sm">{template.questions?.length || 0}</span>
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              {appliesToAll ? (
                                <Badge variant="secondary" className="text-xs">{t.badgeAll}</Badge>
                              ) : (
                                <div className="flex flex-wrap gap-1">
                                  {linkedServices.slice(0, 3).map(st => (
                                    <Badge key={st.id} variant="outline" className="text-xs">
                                      <span className="inline-block h-2 w-2 rounded-full mr-1" style={{ backgroundColor: st.color }} />
                                      {st.name}
                                    </Badge>
                                  ))}
                                  {linkedServices.length > 3 && (
                                    <Badge variant="outline" className="text-xs">+{linkedServices.length - 3}</Badge>
                                  )}
                                </div>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant={template.is_active ? 'default' : 'secondary'} className="text-xs">
                                {template.is_active ? t.badgeActive : t.badgeInactive}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="destructive-ghost"
                                size="icon"
                                onClick={(e) => { e.stopPropagation(); setDeleteId(template.id); }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
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
          </CardContent>
        </Card>
      )}

      {/* FAB mobile-only — desktop usa botão inline no header. */}
      {isMobile && (
        <FABButton
          icon={<Plus className="h-5 w-5" />}
          label={t.fabLabel}
          onClick={() => setCreateOpen(true)}
        />
      )}

      {/* Create Modal */}
      <ResponsiveModal open={createOpen} onOpenChange={setCreateOpen} title={t.createTitle}>
        <div className="space-y-4">
          <div>
            <Label>{t.labelName}</Label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t.placeholderName}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreate(); } }}
              className="mt-1"
            />
          </div>

          <div className="space-y-3">
            <Label>{t.labelServices}</Label>
            <div className="flex items-center gap-2">
              <Switch checked={allServices} onCheckedChange={(checked) => {
                setAllServices(checked);
                if (checked) setSelectedServiceIds([]);
              }} />
              <Label className="text-sm cursor-pointer">{t.switchAllServices}</Label>
            </div>
            {!allServices && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {serviceTypes.filter(st => st.is_active).map((st) => (
                  <label key={st.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer hover:bg-muted/50 transition-colors">
                    <Checkbox
                      checked={selectedServiceIds.includes(st.id)}
                      onCheckedChange={() => toggleServiceId(st.id)}
                    />
                    <span className="inline-block h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: st.color }} />
                    {st.name}
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>{t.btnCancel}</Button>
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleCreate}
              disabled={!newName.trim() || createTemplate.isPending}
            >
              {t.btnCreate}
            </Button>
          </div>
        </div>
      </ResponsiveModal>

      {/* Catálogo: modo "create" — pede nome e cria um checklist novo já populado. */}
      <ChecklistCatalogModal
        open={catalogOpen}
        onOpenChange={setCatalogOpen}
        mode="create"
        onCreated={(id) => navigate(`/checklists/${id}`)}
      />

      {/* Delete dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.deactivateTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {templateToDelete
                ? t.deactivateDescriptionWithName.replace('{name}', templateToDelete.name)
                : t.deactivateDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.btnCancelDelete}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t.btnDeactivate}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
