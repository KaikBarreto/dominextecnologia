import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Plus, Trash2, Wrench, Tags, SlidersHorizontal } from 'lucide-react';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatMoney } from '@/lib/format';
import { fuzzyIncludesAny } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useTableSort } from '@/hooks/useTableSort';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { MobilePillTabs } from '@/components/mobile/MobilePillTabs';
import { Badge } from '@/components/ui/badge';
import { useServiceTypes, type ServiceType } from '@/hooks/useServiceTypes';
import { useServiceTypeCategories } from '@/hooks/useServiceTypeCategories';
import { useIsMobile } from '@/hooks/use-mobile';
import { MobileListItem, type ItemAction } from '@/components/mobile/MobileListItem';
import { FABButton } from '@/components/mobile/FABButton';
import { EmptyState } from '@/components/mobile/EmptyState';
import { FilterCheckboxGroup } from '@/components/mobile/FilterCheckboxGroup';
import { MobileListToolbar } from '@/components/mobile/MobileListToolbar';
import { FilterSheet } from '@/components/mobile/FilterSheet';
import { TaxCodeCombobox } from '@/components/fiscal/TaxCodeCombobox';
import { useCompanyModules } from '@/hooks/useCompanyModules';
import { ServiceTypeCategoriesDialog } from '@/components/service-orders/ServiceTypeCategoriesDialog';
import { ListDetailLayout, type ListDetailItem } from '@/components/ui/ListDetailLayout';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

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
  // Categoria de serviço (agrupamento) — string vazia = sem categoria.
  category_id: string;
  // Fiscal (NFS-e) — opcionais. iss_aliquota fica como string crua no form.
  codigo_servico: string;
  /** cTribMun: complemento municipal de 3 dígitos do código de tributação. */
  codigo_tributacao_municipal: string;
  codigo_nbs: string;
  iss_aliquota: string;
  item_lc116: string;
  // Preço padrão para auto-preenchimento de orçamentos. String crua no form (campo de dinheiro).
  default_price: string;
}

const defaultForm: ServiceTypeForm = {
  name: '',
  color: '#22c55e',
  description: '',
  is_active: true,
  requires_equipment: true,
  number_prefix: '',
  category_id: '',
  codigo_servico: '',
  codigo_tributacao_municipal: '',
  codigo_nbs: '',
  iss_aliquota: '',
  item_lc116: '',
  default_price: '',
};

/** Abas do formulário de tipo de serviço. */
export type ServiceTypeFormTab = 'dados' | 'fiscal';

export interface ServiceTypesPanelProps {
  /**
   * Aba aberta por padrão ao criar/editar um tipo de serviço.
   * Em contexto fiscal (Configurações fiscais → Serviços) abre direto em
   * `fiscal`; no cadastro do dia a dia continua em `dados`.
   * Só tem efeito quando a empresa tem o módulo de nota fiscal.
   */
  defaultFormTab?: ServiceTypeFormTab;
  /**
   * Modo embutido: o painel está dentro de outro modal/drawer.
   * Troca o botão flutuante do mobile por um botão inline (o flutuante fica
   * atrás do drawer e vira ação inalcançável) e enxuga o cabeçalho.
   */
  embedded?: boolean;
}

export function ServiceTypesPanel({
  defaultFormTab = 'dados',
  embedded = false,
}: ServiceTypesPanelProps = {}) {
  const { locale, currency } = useAppLocaleContext();
  const t = MESSAGES[locale].app.os.serviceTypes;
  const tCat = MESSAGES[locale].app.os.serviceTypeCategories;

  const { serviceTypes, isLoading, createServiceType, updateServiceType, deleteServiceType } = useServiceTypes();
  const { categories } = useServiceTypeCategories();
  const { hasModule } = useCompanyModules();
  const showFiscal = hasModule('nfe');
  const isMobile = useIsMobile();
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [categoriesDialogOpen, setCategoriesDialogOpen] = useState(false);

  // Helper: resolve category name by id
  const getCategoryName = useCallback((categoryId: string | null): string | undefined => {
    if (!categoryId) return undefined;
    return categories.find((c) => c.id === categoryId)?.name;
  }, [categories]);
  const getCategoryColor = (categoryId: string | null): string | undefined => {
    if (!categoryId) return undefined;
    return categories.find((c) => c.id === categoryId)?.color ?? undefined;
  };

  // Busca universal (ignora filtros) + filtro por categoria (vazio = todos).
  const filteredTypes = serviceTypes.filter((st) => {
    const matchesSearch = !isMobile || fuzzyIncludesAny([st.name, st.description], searchQuery);
    const matchesCategory =
      categoryFilter.length === 0 ||
      (categoryFilter.includes('__none__') && !st.category_id) ||
      (st.category_id != null && categoryFilter.includes(st.category_id));
    return matchesSearch && matchesCategory;
  });

  const { sortedItems: sortedTypes } = useTableSort(filteredTypes);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ServiceTypeForm>(defaultForm);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [toDeleteId, setToDeleteId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Aba ativa do formulário. Sem o módulo de nota fiscal só existe "Dados".
  const [formTab, setFormTab] = useState<ServiceTypeFormTab>('dados');
  const activeFormTab: ServiceTypeFormTab = showFiscal ? formTab : 'dados';

  const handleNew = () => {
    setEditingId(null);
    setForm(defaultForm);
    setFormTab(showFiscal ? defaultFormTab : 'dados');
    setFormOpen(true);
  };

  const handleEdit = useCallback((st: ServiceType) => {
    setSelectedId(st.id);
    setEditingId(st.id);
    setFormTab(showFiscal ? defaultFormTab : 'dados');
    setForm({
      name: st.name,
      color: st.color,
      description: st.description || '',
      is_active: st.is_active,
      requires_equipment: st.requires_equipment ?? true,
      number_prefix: st.number_prefix || '',
      category_id: st.category_id || '',
      codigo_servico: st.codigo_servico || '',
      codigo_tributacao_municipal: st.codigo_tributacao_municipal || '',
      codigo_nbs: st.codigo_nbs || '',
      iss_aliquota: st.iss_aliquota != null ? String(st.iss_aliquota) : '',
      item_lc116: st.item_lc116 || '',
      default_price: st.default_price != null ? String(st.default_price) : '',
    });
  }, [defaultFormTab, showFiscal]);

  // cTribMun é opcional, mas quando preenchido tem que ter os 3 dígitos.
  const cTribMunInvalid =
    form.codigo_tributacao_municipal.length > 0 && form.codigo_tributacao_municipal.length !== 3;

  const handleSave = async () => {
    const {
      iss_aliquota, codigo_servico, codigo_tributacao_municipal, codigo_nbs,
      item_lc116, default_price, category_id, ...rest
    } = form;
    const payload = {
      ...rest,
      // Categoria: string vazia vira null.
      category_id: category_id.trim() || null,
      // Fiscal: campos opcionais — string vazia vira null pra não poluir o cadastro.
      codigo_servico: codigo_servico.trim() || null,
      codigo_tributacao_municipal: codigo_tributacao_municipal.trim() || null,
      codigo_nbs: codigo_nbs.trim() || null,
      item_lc116: item_lc116.trim() || null,
      iss_aliquota: iss_aliquota.trim() === '' ? null : num(iss_aliquota, 0),
      // Preço padrão: string vazia vira null, valor preenchido converte pra número.
      default_price: default_price.trim() === '' ? null : num(default_price, 0) || null,
    };
    if (editingId) {
      await updateServiceType.mutateAsync({ id: editingId, ...payload });
    } else {
      await createServiceType.mutateAsync(payload);
      setFormOpen(false);
    }
  };

  const handleDelete = async () => {
    if (toDeleteId) {
      await deleteServiceType.mutateAsync(toDeleteId);
      if (selectedId === toDeleteId) setSelectedId(null);
      setToDeleteId(null);
      setDeleteDialogOpen(false);
    }
  };

  // Opções do filtro de categoria (inclui "Sem categoria" se houver tipos sem categoria).
  const hasSomeWithoutCategory = serviceTypes.some((st) => !st.category_id);
  const categoryFilterOptions = [
    ...(hasSomeWithoutCategory
      ? [{ value: '__none__', label: tCat.noCategory }]
      : []),
    ...categories.map((c) => ({
      value: c.id,
      label: c.name,
      color: c.color ?? undefined,
    })),
  ];

  const selectedType = serviceTypes.find((serviceType) => serviceType.id === selectedId);
  const listItems = useMemo<ListDetailItem[]>(
    () => filteredTypes.map((serviceType) => ({
      id: serviceType.id,
      title: serviceType.name,
      subtitle: [getCategoryName(serviceType.category_id), serviceType.number_prefix].filter(Boolean).join(' • ') || serviceType.description || undefined,
      searchText: [serviceType.description, getCategoryName(serviceType.category_id), serviceType.number_prefix].filter(Boolean).join(' '),
      leading: (
        <span className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ backgroundColor: serviceType.color }}>
          <Wrench className="h-4 w-4 text-white" />
        </span>
      ),
      trailing: !serviceType.is_active ? <Badge variant="secondary" className="text-[10px]">{t.badgeInactive}</Badge> : undefined,
    })),
    [filteredTypes, getCategoryName, t.badgeInactive],
  );

  useEffect(() => {
    if (isMobile) return;
    if (selectedId && serviceTypes.some((serviceType) => serviceType.id === selectedId)) return;
    const first = filteredTypes[0];
    if (first) handleEdit(first);
  }, [filteredTypes, handleEdit, isMobile, selectedId, serviceTypes]);

  useEffect(() => {
    if (selectedType && editingId !== selectedType.id) handleEdit(selectedType);
  }, [editingId, handleEdit, selectedType]);

  const restoreSelectedForm = () => {
    if (selectedType) handleEdit(selectedType);
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

  const inlineEditor = (
    <Tabs value={activeFormTab} onValueChange={(value) => setFormTab(value as ServiceTypeFormTab)} className="space-y-5">
      {showFiscal && (
        <MobilePillTabs
          variant="underline"
          tabs={[{ value: 'dados', label: t.tabDados }, { value: 'fiscal', label: t.tabFiscal }]}
          activeTab={activeFormTab}
          onTabChange={(value) => setFormTab(value as ServiceTypeFormTab)}
        />
      )}
      <TabsContent value="dados" className="mt-0 space-y-5">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
          <div className="space-y-2">
            <Label>{t.labelName}</Label>
            <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder={t.placeholderName} />
          </div>
          <div className="space-y-2">
            <Label>{t.labelColor}</Label>
            <div className="flex items-center gap-2">
              <input type="color" value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} className="h-10 w-10 cursor-pointer rounded border-0" />
              <Input value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} />
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <Label>{tCat.labelCategory}</Label>
          <Select value={form.category_id || '__none__'} onValueChange={(value) => setForm({ ...form, category_id: value === '__none__' ? '' : value })}>
            <SelectTrigger><SelectValue placeholder={tCat.noCategory} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">{tCat.noCategory}</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  <span className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: category.color ?? '#6B7280' }} />
                    {category.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>{t.labelDescription}</Label>
          <Textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder={t.placeholderDescription} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>{t.labelPrefix}</Label>
            <Input value={form.number_prefix} onChange={(event) => setForm({ ...form, number_prefix: event.target.value })} placeholder={t.placeholderPrefix} />
            <p className="font-mono text-[11px] text-muted-foreground">{`→ ${form.number_prefix || 'OS'}-2026-0001`}</p>
          </div>
          <div className="space-y-2">
            <Label>{t.labelDefaultPrice}</Label>
            <Input type="number" min={0} step="0.01" value={form.default_price} onChange={(event) => setForm({ ...form, default_price: event.target.value })} placeholder={t.placeholderDefaultPrice} />
            <p className="text-[11px] text-muted-foreground">{t.helperDefaultPrice}</p>
          </div>
        </div>
        <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
          <div className="flex items-center gap-2">
            <Switch checked={form.requires_equipment} onCheckedChange={(checked) => setForm({ ...form, requires_equipment: checked })} />
            <Label>{t.labelEquipmentRequired}</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={form.is_active} onCheckedChange={(checked) => setForm({ ...form, is_active: checked })} />
            <Label>{t.labelActive}</Label>
          </div>
        </div>
      </TabsContent>
      {showFiscal && (
        <TabsContent value="fiscal" className="mt-0 space-y-5">
          <div>
            <p className="text-sm font-semibold">{t.fiscalTitle}</p>
            <p className="text-xs text-muted-foreground">{t.fiscalSubtitle}</p>
          </div>
          <div className="space-y-1.5">
            <Label>{t.labelCTribNac}</Label>
            <TaxCodeCombobox
              type="servico"
              value={form.codigo_servico}
              onSelect={(codigo, item) => setForm((current) => ({ ...current, codigo_servico: codigo, item_lc116: item?.itemLc116 ? String(item.itemLc116) : current.item_lc116 }))}
              placeholder={t.placeholderTaxSearch}
            />
            <p className="text-[11px] text-muted-foreground">{t.helperCTribNac}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>{t.labelCTribMun}</Label>
                <Input
                  value={form.codigo_tributacao_municipal}
                  onChange={(event) => setForm({ ...form, codigo_tributacao_municipal: event.target.value.replace(/\D/g, '').slice(0, 3) })}
                  placeholder={t.placeholderCTribMun}
                  inputMode="numeric"
                  maxLength={3}
                />
                {cTribMunInvalid && <p className="text-sm text-destructive">{t.errorCTribMun}</p>}
                <p className="text-[11px] text-muted-foreground">{t.helperCTribMun}</p>
              </div>
              <div className="space-y-1.5">
                <Label>{t.labelLC116}</Label>
                <Input value={form.item_lc116} onChange={(event) => setForm({ ...form, item_lc116: event.target.value })} placeholder="14.01" />
              </div>
            </div>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>{t.labelNBS}</Label>
                <TaxCodeCombobox type="nbs" value={form.codigo_nbs} onSelect={(codigo) => setForm((current) => ({ ...current, codigo_nbs: codigo }))} placeholder={t.placeholderTaxSearch} />
                <p className="text-[11px] text-muted-foreground">{t.helperNBS}</p>
              </div>
              <div className="space-y-1.5">
                <Label>{t.labelISS}</Label>
                <Input type="text" inputMode="decimal" value={form.iss_aliquota} onChange={(event) => setForm({ ...form, iss_aliquota: event.target.value })} placeholder="5" />
              </div>
            </div>
          </div>
        </TabsContent>
      )}
    </Tabs>
  );

  const detail = selectedType ? (
    <section className="min-w-0">
      {isMobile && (
        <Button variant="ghost" size="sm" className="mb-3 -ml-2" onClick={() => setSelectedId(null)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar aos tipos de serviço
        </Button>
      )}
      <div className="mb-5 flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ficha do tipo de serviço</p>
          <h3 className="mt-1 truncate text-xl font-semibold">{selectedType.name}</h3>
        </div>
        <Button variant="outline" size="sm" className="shrink-0 text-destructive hover:text-destructive" onClick={() => { setToDeleteId(selectedType.id); setDeleteDialogOpen(true); }}>
          <Trash2 className="mr-2 h-4 w-4" />
          {t.actionDelete}
        </Button>
      </div>
      {inlineEditor}
      <div className="mt-6 flex justify-end border-t pt-4">
        <Button onClick={handleSave} disabled={!form.name.trim() || cTribMunInvalid || updateServiceType.isPending}>{t.btnSave}</Button>
      </div>
    </section>
  ) : (
    <div className="flex min-h-72 items-center justify-center text-center text-sm text-muted-foreground">
      Selecione um tipo de serviço para consultar e editar a ficha.
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header: no mobile escondemos texto explicativo e o botão vira FAB.
          Embutido em outro modal, o título some (o modal já tem o dele). */}
      {!isMobile && (
        <div className="flex items-center justify-end gap-3">
          <div className="flex items-center gap-2 ml-auto">
            <Button variant="outline" size="sm" onClick={() => setCategoriesDialogOpen(true)}>
              <Tags className="mr-2 h-4 w-4" />
              {tCat.btnManage}
            </Button>
            <Button onClick={handleNew}>
              <Plus className="mr-2 h-4 w-4" />
              {t.btnNew}
            </Button>
          </div>
        </div>
      )}

      {/* Mobile: com dados, toolbar padrão (busca em cima, filtro+ações embaixo).
          Sem dados, só os botões soltos (nada pra buscar/filtrar ainda). Embutido
          não tem botão flutuante (ficaria atrás do drawer), então o "Novo Tipo"
          vem inline aqui. */}
      {isMobile && !selectedType && (
        serviceTypes.length > 0 ? (
          <MobileListToolbar
            searchValue={searchQuery}
            onSearchChange={setSearchQuery}
            searchPlaceholder={t.searchPlaceholder}
          >
            {categories.length > 0 && (
              <FilterSheet
                activeCount={categoryFilter.length}
                onClear={() => setCategoryFilter([])}
                triggerClassName="h-10"
              >
                <FilterCheckboxGroup
                  label={tCat.filterLabel}
                  options={categoryFilterOptions}
                  selected={categoryFilter}
                  onChange={setCategoryFilter}
                  emptyLabel={tCat.filterEmpty}
                />
              </FilterSheet>
            )}
            {/* Ação rara: fica só com o ícone pra os controles caberem em 390px. */}
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 shrink-0"
              onClick={() => setCategoriesDialogOpen(true)}
              title={tCat.btnManage}
              aria-label={tCat.btnManage}
            >
              <Tags className="h-4 w-4" />
            </Button>
            {embedded && (
              <Button size="sm" className="h-10 shrink-0 gap-1.5" onClick={handleNew}>
                <Plus className="h-4 w-4" />
                <span className="hidden min-[340px]:inline">{t.btnNew}</span>
              </Button>
            )}
          </MobileListToolbar>
        ) : (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => setCategoriesDialogOpen(true)}
            >
              <Tags className="mr-2 h-4 w-4" />
              {tCat.btnManage}
            </Button>
            {embedded && (
              <Button size="sm" className="flex-1" onClick={handleNew}>
                <Plus className="mr-2 h-4 w-4" />
                {t.btnNew}
              </Button>
            )}
          </div>
        )
      )}

      {serviceTypes.length === 0 ? (
        <EmptyState
          icon={<Wrench className="h-12 w-12" />}
          title={t.emptyTitle}
          description={isMobile ? t.emptyDescriptionMobile : t.emptyDescriptionDesktop}
        />
      ) : isMobile && selectedType ? detail : isMobile && sortedTypes.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t.noResults}</p>
      ) : isMobile ? (
        <div className="rounded-xl border bg-card overflow-hidden">
          {sortedTypes.map((st) => {
            const itemActions: ItemAction[] = [
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

            const formattedPrice =
              st.default_price != null && st.default_price > 0
                ? formatMoney(st.default_price, currency, locale)
                : null;

            const categoryName = getCategoryName(st.category_id);
            const categoryColor = getCategoryColor(st.category_id);

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
                    {categoryName && (
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <span
                          className="inline-block h-2 w-2 rounded-full shrink-0"
                          style={{ backgroundColor: categoryColor ?? '#6B7280' }}
                        />
                        {categoryName}
                      </span>
                    )}
                    {subtitleParts.length > 0 && (
                      <span className="truncate">{subtitleParts.join(' • ')}</span>
                    )}
                    {formattedPrice && (
                      <span className="text-[11px] font-medium text-foreground/70">{formattedPrice}</span>
                    )}
                    {!st.is_active && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{t.badgeInactive}</Badge>
                    )}
                  </span>
                }
              />
            );
          })}
        </div>
      ) : (
        <ListDetailLayout
          items={listItems}
          selectedId={selectedId ?? undefined}
          listTitle={t.title}
          listDescription={`${filteredTypes.length} ${filteredTypes.length === 1 ? 'tipo cadastrado' : 'tipos cadastrados'}`}
          listFilters={categories.length > 0 ? (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 w-full justify-center gap-2">
                  <SlidersHorizontal className="h-4 w-4" />
                  Filtros
                  {categoryFilter.length > 0 && (
                    <Badge className="h-5 min-w-5 bg-primary px-1.5 text-[10px] text-primary-foreground">
                      {categoryFilter.length}
                    </Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-80 p-4">
                <FilterCheckboxGroup
                  label={tCat.filterLabel}
                  options={categoryFilterOptions}
                  selected={categoryFilter}
                  onChange={setCategoryFilter}
                  emptyLabel={tCat.filterEmpty}
                />
                {categoryFilter.length > 0 && (
                  <Button variant="ghost" size="sm" className="mt-3 w-full" onClick={() => setCategoryFilter([])}>
                    Limpar filtros
                  </Button>
                )}
              </PopoverContent>
            </Popover>
          ) : undefined}
          searchPlaceholder={t.searchPlaceholder}
          emptyLabel={t.noResults}
          storageKey="service-types-list"
          onSelect={(id) => {
            const serviceType = serviceTypes.find((item) => item.id === id);
            if (serviceType) handleEdit(serviceType);
          }}
        >
          {detail}
        </ListDetailLayout>
      )}

      {/* FAB mobile-only para criar novo tipo de serviço (só fora de modal). */}
      {isMobile && !embedded && (
        <FABButton
          icon={<Plus className="h-5 w-5" />}
          label={t.fabLabel}
          onClick={handleNew}
        />
      )}

      {/* Modal de CRUD de categorias */}
      <ServiceTypeCategoriesDialog
        open={categoriesDialogOpen}
        onOpenChange={setCategoriesDialogOpen}
      />

      <ResponsiveModal
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) restoreSelectedForm();
        }}
        title={t.modalTitleCreate}
        className="sm:max-w-[860px]"
        footer={
          <div className="space-y-2">
            {/* O erro pode estar na aba Fiscal enquanto o usuário olha a de
                Dados — sem esta linha o botão fica travado sem explicação. */}
            {cTribMunInvalid && activeFormTab !== 'fiscal' && (
              <p className="text-xs text-destructive text-right">{t.errorCTribMun}</p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setFormOpen(false)}>{t.btnCancel}</Button>
              <Button onClick={handleSave} disabled={!form.name.trim() || cTribMunInvalid}>
                {t.btnCreate}
              </Button>
            </div>
          </div>
        }
      >
        <Tabs
          value={activeFormTab}
          onValueChange={(v) => setFormTab(v as ServiceTypeFormTab)}
          className="space-y-4"
        >
          {/* Abas dentro de modal = pills roláveis, nunca abas cinza.
              Sem o módulo de nota fiscal não existe segunda aba. */}
          {showFiscal && (
            <MobilePillTabs
              variant="underline"
              tabs={[
                { value: 'dados', label: t.tabDados },
                { value: 'fiscal', label: t.tabFiscal },
              ]}
              activeTab={activeFormTab}
              onTabChange={(v) => setFormTab(v as ServiceTypeFormTab)}
            />
          )}

          {/* ---- Aba: Dados (uso do dia a dia) ---- */}
          <TabsContent value="dados" className="mt-0 space-y-4">
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

            {/* Categoria de serviço */}
            <div className="space-y-2">
              <Label>{tCat.labelCategory}</Label>
              <Select
                value={form.category_id || '__none__'}
                onValueChange={(v) => setForm({ ...form, category_id: v === '__none__' ? '' : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder={tCat.noCategory} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{tCat.noCategory}</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block h-3 w-3 rounded-full shrink-0"
                          style={{ backgroundColor: cat.color ?? '#6B7280' }}
                        />
                        {cat.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{t.labelDescription}</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder={t.placeholderDescription}
              />
            </div>

            {/* Grid 2 colunas: Prefixo + Preço Padrão */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t.labelPrefix}</Label>
                <Input
                  value={form.number_prefix}
                  onChange={(e) => setForm({ ...form, number_prefix: e.target.value })}
                  placeholder={t.placeholderPrefix}
                />
                <p className="font-mono text-[11px] text-muted-foreground">
                  {`→ ${form.number_prefix || 'OS'}-2026-0001`}
                </p>
              </div>
              <div className="space-y-2">
                <Label>{t.labelDefaultPrice}</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.default_price}
                  onChange={(e) => setForm({ ...form, default_price: e.target.value })}
                  placeholder={t.placeholderDefaultPrice}
                />
                <p className="text-[11px] text-muted-foreground">{t.helperDefaultPrice}</p>
              </div>
            </div>

            {/* Switches (Equipamento obrigatório + Ativo) */}
            <div className="grid gap-4 sm:grid-cols-2">
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
            </div>
          </TabsContent>

          {/* -------------------------------------------------------------------
           * Aba Fiscal (NFS-e): classificação tributária por tipo de serviço.
           * Só aparece pra empresas com o módulo `nfe`. Todos os campos são
           * opcionais — o tipo de serviço salva normalmente sem eles.
           * Preenchidos aqui, a emissão da nota puxa tudo de uma vez.
           * ------------------------------------------------------------------- */}
          {showFiscal && (
            <TabsContent value="fiscal" className="mt-0 space-y-5">
              <div className="space-y-0.5">
                <p className="text-sm font-semibold">{t.fiscalTitle}</p>
                <p className="text-xs text-muted-foreground">
                  {t.fiscalSubtitle}
                </p>
              </div>

              {/* Código do serviço (classificação nacional): ocupa largura total */}
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

              {/* Grid 2 colunas para os campos restantes (desktop) */}
              <div className="grid gap-4 sm:grid-cols-2">
                {/* Coluna 1: cTribMun + LC116 */}
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">{t.labelCTribMun}</Label>
                    <Input
                      value={form.codigo_tributacao_municipal}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          // Só dígitos, no máximo 3 (formato do cTribMun).
                          codigo_tributacao_municipal: e.target.value.replace(/\D/g, '').slice(0, 3),
                        })
                      }
                      placeholder={t.placeholderCTribMun}
                      inputMode="numeric"
                      maxLength={3}
                    />
                    {cTribMunInvalid && (
                      <p className="text-sm text-destructive">{t.errorCTribMun}</p>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      {t.helperCTribMun}
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

                {/* Coluna 2: NBS + ISS */}
                <div className="space-y-4">
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

                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">{t.labelISS}</Label>
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={form.iss_aliquota}
                      onChange={(e) => setForm({ ...form, iss_aliquota: e.target.value })}
                      placeholder="5"
                    />
                  </div>
                </div>
              </div>
            </TabsContent>
          )}
        </Tabs>
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
