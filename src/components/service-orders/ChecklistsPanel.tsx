import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowDownAZ, Plus, FileText, Trash2, Pencil, BookOpen, RotateCcw } from 'lucide-react';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { Button } from '@/components/ui/button';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useFormTemplates } from '@/hooks/useFormTemplates';
import { useServiceTypes } from '@/hooks/useServiceTypes';
import { useServiceTypeCategories } from '@/hooks/useServiceTypeCategories';
import { useIsMobile } from '@/hooks/use-mobile';
import { MobileListItem, type ItemAction } from '@/components/mobile/MobileListItem';
import { MobileListToolbar } from '@/components/mobile/MobileListToolbar';
import { FABButton } from '@/components/mobile/FABButton';
import { EmptyState } from '@/components/mobile/EmptyState';
import { ChecklistCatalogModal } from '@/components/technician/ChecklistCatalogModal';
import { ChecklistOsPreview } from '@/components/service-orders/ChecklistOsPreview';
import { Skeleton } from '@/components/ui/skeleton';
import type { FormQuestion, FormTemplate } from '@/types/database';
import { ListDetailLayout, type ListDetailSortOption } from '@/components/ui/ListDetailLayout';
import { DataTablePagination } from '@/components/ui/DataTablePagination';
import { useDataPagination } from '@/hooks/useDataPagination';
import ChecklistDetail from '@/pages/ChecklistDetail';

type TemplateWithServiceIds = { service_type_ids?: string[] };
type ChecklistTemplate = FormTemplate & { questions?: FormQuestion[] };

function getServiceIds(template: unknown): string[] | undefined {
  return (template as TemplateWithServiceIds).service_type_ids;
}

export function ChecklistsPanel() {
  const isMobile = useIsMobile();
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.os.checklists;
  const [createOpen, setCreateOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [allServices, setAllServices] = useState(true);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailMode, setDetailMode] = useState<'preview' | 'edit'>('preview');
  const [editorInitialAction, setEditorInitialAction] = useState<'create-question' | undefined>();
  const [editorSession, setEditorSession] = useState(0);
  const [mobileSearch, setMobileSearch] = useState('');
  const [mobileSort, setMobileSort] = useState<'name-asc' | 'name-desc'>('name-asc');

  const {
    templates, isLoading, isError, refetch,
    createTemplate, setTemplateServices, deleteTemplate,
  } = useFormTemplates();
  const { serviceTypes } = useServiceTypes();
  const { categories: serviceTypeCategories } = useServiceTypeCategories();
  const activeTemplates = templates.filter((template) => template.is_active);
  const selectedTemplate = useMemo(
    () => activeTemplates.find((template) => template.id === selectedId) as ChecklistTemplate | undefined,
    [activeTemplates, selectedId],
  );

  const checklistSortOptions = useMemo<ListDetailSortOption[]>(() => [
    {
      value: 'name-asc', label: 'Nome (A-Z)', shortLabel: 'A-Z',
      compare: (a, b) => a.title.localeCompare(b.title, locale, { sensitivity: 'base' }),
    },
    {
      value: 'name-desc', label: 'Nome (Z-A)', shortLabel: 'Z-A',
      compare: (a, b) => b.title.localeCompare(a.title, locale, { sensitivity: 'base' }),
    },
  ], [locale]);

  const listItems = useMemo(() => activeTemplates.map((template) => {
    const serviceIds = getServiceIds(template) ?? [];
    const questionsCount = template.questions?.length ?? 0;
    const scopeLabel = serviceIds.length === 0
      ? t.scopeAll
      : (serviceIds.length === 1 ? t.scopeServices : t.scopeServicesPlural).replace('{n}', String(serviceIds.length));
    const questionsLabel = (questionsCount === 1 ? t.questionsCount : t.questionsCountPlural)
      .replace('{n}', String(questionsCount));
    return {
      id: template.id,
      title: template.name,
      subtitle: `${questionsLabel} · ${scopeLabel}`,
      searchText: [template.description, ...serviceTypes.filter((service) => serviceIds.includes(service.id)).map((service) => service.name)]
        .filter(Boolean)
        .join(' '),
      leading: (
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <FileText className="h-4 w-4" />
        </span>
      ),
      trailing: <Badge variant="outline" className="px-1.5 py-0 text-[10px] tabular-nums">{questionsCount}</Badge>,
    };
  }), [activeTemplates, serviceTypes, t]);

  const mobileTemplates = useMemo(() => {
    const query = mobileSearch.trim().toLocaleLowerCase(locale);
    return activeTemplates
      .filter((template) => {
        if (!query) return true;
        const serviceIds = getServiceIds(template) ?? [];
        const serviceNames = serviceTypes
          .filter((service) => serviceIds.includes(service.id))
          .map((service) => service.name)
          .join(' ');
        return `${template.name} ${template.description ?? ''} ${serviceNames}`
          .toLocaleLowerCase(locale)
          .includes(query);
      })
      .slice()
      .sort((a, b) => {
        const result = a.name.localeCompare(b.name, locale, { sensitivity: 'base' });
        return mobileSort === 'name-asc' ? result : -result;
      });
  }, [activeTemplates, locale, mobileSearch, mobileSort, serviceTypes]);
  const mobilePagination = useDataPagination(mobileTemplates, 10, 'service-checklists-mobile');
  const setMobilePage = mobilePagination.setPage;

  useEffect(() => {
    if (isMobile) return;
    if (!selectedId || !activeTemplates.some((template) => template.id === selectedId)) {
      setSelectedId(activeTemplates[0]?.id ?? null);
      setDetailMode('preview');
    }
  }, [activeTemplates, isMobile, selectedId]);

  useEffect(() => {
    setMobilePage(1);
  }, [mobileSearch, mobileSort, setMobilePage]);

  const selectTemplate = (id: string) => {
    setSelectedId(id);
    setDetailMode('preview');
    setEditorInitialAction(undefined);
  };

  const openEditor = (initialAction?: 'create-question') => {
    setEditorInitialAction(initialAction);
    setEditorSession((current) => current + 1);
    setDetailMode('edit');
  };

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
        if (data) {
          setSelectedId(data.id);
          openEditor();
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
        onSuccess: () => {
          setDeleteId(null);
          setDetailMode('preview');
        },
      });
    }
  };

  const templateToDelete = activeTemplates.find((t) => t.id === deleteId);
  const detailContent = selectedTemplate ? (
    detailMode === 'edit' ? (
      <ChecklistDetail
        key={`${selectedTemplate.id}-${editorSession}`}
        templateId={selectedTemplate.id}
        embedded
        initialAction={editorInitialAction}
        onExit={() => {
          setDetailMode('preview');
          setEditorInitialAction(undefined);
        }}
      />
    ) : (
      <ChecklistOsPreview
        template={selectedTemplate}
        serviceTypes={serviceTypes}
        onAddQuestion={() => openEditor('create-question')}
        onEdit={() => openEditor()}
        onBack={() => setSelectedId(null)}
        showBack={isMobile}
      />
    )
  ) : (
    <div className="flex min-h-64 items-center justify-center px-6 text-center text-sm text-muted-foreground">
      Selecione um checklist para visualizar como ele ficará na OS.
    </div>
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-80 w-full" />
          <Skeleton className="h-80 w-full" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center border-y py-10 text-center">
        <AlertCircle className="mb-3 h-9 w-9 text-destructive" />
        <h3 className="font-semibold">Não foi possível carregar os checklists</h3>
        <p className="mt-1 text-sm text-muted-foreground">Verifique sua conexão e tente novamente.</p>
        <Button variant="outline" className="mt-4" onClick={() => void refetch()}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Section header. A page (Services.tsx) já tem o MobilePageHeader "Serviços";
          aqui é um sub-header da aba, sem duplicar header full. No mobile o texto
          fica enxuto e as ações viram botão de catálogo + FAB de criar. */}
      {detailMode !== 'edit' && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">{t.title}</h2>
            <p className="text-sm text-muted-foreground">
              {t.subtitle}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setCatalogOpen(true)}>
              <BookOpen className="mr-2 h-4 w-4" />
              {isMobile ? t.btnCatalog : t.btnCatalogFull}
            </Button>
            {!isMobile && (
              <Button
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => setCreateOpen(true)}
              >
                <Plus className="mr-2 h-4 w-4" />
                {t.btnNew}
              </Button>
            )}
          </div>
        </div>
      )}

      {activeTemplates.length === 0 ? (
        isMobile ? (
          <EmptyState
            icon={<FileText className="h-12 w-12" />}
            title={t.emptyTitle}
            description={t.emptyDescriptionMobile}
          />
        ) : (
          <div className="flex flex-col items-center justify-center border-y py-12 text-center">
            <FileText className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="text-lg font-medium">{t.emptyTitle}</h3>
            <p className="text-muted-foreground">{t.emptyDescriptionDesktop}</p>
          </div>
        )
      ) : isMobile && selectedTemplate ? (
        detailContent
      ) : isMobile ? (
        <div className="space-y-3">
          <MobileListToolbar
            searchValue={mobileSearch}
            onSearchChange={setMobileSearch}
            searchPlaceholder="Buscar checklist..."
          >
            <Select value={mobileSort} onValueChange={(value) => setMobileSort(value as typeof mobileSort)}>
              <SelectTrigger className="h-10 w-[150px]">
                <ArrowDownAZ className="mr-2 h-4 w-4" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name-asc">Nome A-Z</SelectItem>
                <SelectItem value="name-desc">Nome Z-A</SelectItem>
              </SelectContent>
            </Select>
          </MobileListToolbar>

          {mobilePagination.paginatedItems.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-12 w-12" />}
              title="Nenhum checklist encontrado"
              description="Ajuste a busca para encontrar outro checklist."
            />
          ) : (
            <div className="overflow-hidden rounded-xl border bg-card">
              {mobilePagination.paginatedItems.map((template) => {
                const serviceIds = getServiceIds(template) ?? [];
                const questionsCount = template.questions?.length ?? 0;
                const scopeLabel = serviceIds.length === 0
                  ? t.scopeAll
                  : (serviceIds.length === 1 ? t.scopeServices : t.scopeServicesPlural).replace('{n}', String(serviceIds.length));
                const questionsLabel = (questionsCount === 1 ? t.questionsCount : t.questionsCountPlural)
                  .replace('{n}', String(questionsCount));
                const itemActions: ItemAction[] = [
                  {
                    key: 'edit',
                    label: t.actionEditView,
                    icon: <Pencil className="h-4 w-4" />,
                    variant: 'edit',
                    onClick: () => {
                      setSelectedId(template.id);
                      openEditor();
                    },
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
                    onClick={() => selectTemplate(template.id)}
                    actions={itemActions}
                    leading={
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <FileText className="h-5 w-5" />
                      </div>
                    }
                    title={template.name}
                    subtitle={`${questionsLabel} · ${scopeLabel}`}
                  />
                );
              })}
              <DataTablePagination
                page={mobilePagination.page}
                totalPages={mobilePagination.totalPages}
                totalItems={mobilePagination.totalItems}
                from={mobilePagination.from}
                to={mobilePagination.to}
                pageSize={mobilePagination.pageSize}
                onPageChange={setMobilePage}
                onPageSizeChange={mobilePagination.setPageSize}
              />
            </div>
          )}
        </div>
      ) : (
        <ListDetailLayout
          items={listItems}
          selectedId={selectedId ?? undefined}
          listTitle="Lista de checklists"
          listDescription="Selecione para visualizar ou editar"
          storageKey="service-checklists-list-detail"
          sortOptions={checklistSortOptions}
          pageSize={10}
          searchPlaceholder="Buscar checklist..."
          emptyLabel="Nenhum checklist encontrado"
          onSelect={selectTemplate}
          detailClassName="min-w-0"
        >
          {detailContent}
        </ListDetailLayout>
      )}

      {/* FAB mobile-only para criar novo checklist. */}
      {isMobile && !selectedTemplate && (
        <FABButton
          icon={<Plus className="h-5 w-5" />}
          label={t.fabLabel}
          onClick={() => setCreateOpen(true)}
        />
      )}

      {/* Create Modal */}
      <ResponsiveModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        title={t.createTitle}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>{t.btnCancel}</Button>
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleCreate}
              disabled={!newName.trim() || createTemplate.isPending}
            >
              {t.btnCreate}
            </Button>
          </div>
        }
      >
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
                {serviceTypes.filter(t => t.is_active).map((st) => {
                  const cat = st.category_id
                    ? serviceTypeCategories.find(c => c.id === st.category_id)
                    : undefined;
                  return (
                    <label key={st.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer hover:bg-muted/50 transition-colors">
                      <Checkbox
                        checked={selectedServiceIds.includes(st.id)}
                        onCheckedChange={() => toggleServiceId(st.id)}
                      />
                      <span className="inline-block h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: st.color }} />
                      <span className="flex-1 min-w-0">
                        <span className="truncate">{st.name}</span>
                        {cat && (
                          <span className="block text-xs text-muted-foreground truncate">{cat.name}</span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </ResponsiveModal>

      {/* Catálogo: modo "create" — pede nome e cria um checklist novo já populado. */}
      <ChecklistCatalogModal
        open={catalogOpen}
        onOpenChange={setCatalogOpen}
        mode="create"
        onCreated={(id) => {
          setSelectedId(id);
          openEditor();
        }}
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
