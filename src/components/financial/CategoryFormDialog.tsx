import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { Eye, Loader2, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { CATEGORY_ICONS, getCategoryIcon, type CategoryIconKey } from './categoryIcons';
import { ColorPicker } from '@/components/ui/ColorPicker';
import type { FinancialCategory } from '@/hooks/useFinancialCategories';
import { buildCategoryTree } from '@/lib/category-tree';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import {
  legacyDreGroupForNature,
  resolveCategoryDreNature,
  type ConfigurableDreGroupLike,
  type ConfigurableDreNature,
} from '@/lib/dre-groups';

/**
 * Sentinela da opção "sem pai". Um `value=''` no combobox vira `key=''` no
 * item do cmdk e confunde a comparação de selecionado com "nada escolhido";
 * o valor que vai pro banco continua sendo `null`.
 */
const NO_PARENT = '__none__';

const DRE_PREVIEW_COPY: Record<string, {
  title: string;
  unchanged: string;
  before: string;
  categoryPlaceholder: string;
  informative: string;
  value: string;
  both: string;
  effects: Record<ConfigurableDreNature, string>;
}> = {
  'pt-br': {
    title: 'Prévia no DRE', unchanged: 'Sem alterar lançamentos', before: 'Resultado anterior',
    categoryPlaceholder: 'Esta categoria', informative: 'fora do DRE', value: 'valor', both: 'Entradas somam à receita; saídas seguem o grupo escolhido.',
    effects: {
      revenue: 'Soma ao resultado como receita.',
      deduction: 'Reduz a receita líquida.',
      cost: 'Reduz o lucro bruto.',
      operating_expense: 'Reduz o resultado operacional.',
      non_operating: 'Entra depois do resultado operacional.',
      excluded: 'Não aparece no DRE atual e não altera o resultado.',
    },
  },
  en: {
    title: 'P&L preview', unchanged: 'Does not change entries', before: 'Previous result',
    categoryPlaceholder: 'This category', informative: 'outside P&L', value: 'amount', both: 'Income adds to revenue; expenses follow the selected group.',
    effects: {
      revenue: 'Adds to the result as revenue.', deduction: 'Reduces net revenue.',
      cost: 'Reduces gross profit.', operating_expense: 'Reduces operating result.',
      non_operating: 'Appears after operating result.', excluded: 'Does not appear in the current P&L or affect the result.',
    },
  },
  es: {
    title: 'Vista previa del DRE', unchanged: 'No modifica los movimientos', before: 'Resultado anterior',
    categoryPlaceholder: 'Esta categoría', informative: 'fuera del DRE', value: 'valor', both: 'Los ingresos suman a los ingresos brutos; los gastos siguen el grupo elegido.',
    effects: {
      revenue: 'Suma al resultado como ingreso.', deduction: 'Reduce el ingreso neto.',
      cost: 'Reduce la utilidad bruta.', operating_expense: 'Reduce el resultado operativo.',
      non_operating: 'Aparece después del resultado operativo.', excluded: 'No aparece en el DRE actual ni altera el resultado.',
    },
  },
  fr: {
    title: 'Aperçu du compte de résultat', unchanged: 'Ne modifie pas les écritures', before: 'Résultat précédent',
    categoryPlaceholder: 'Cette catégorie', informative: 'hors résultat', value: 'montant', both: 'Les entrées augmentent les produits ; les dépenses suivent le groupe choisi.',
    effects: {
      revenue: 'S’ajoute au résultat comme produit.', deduction: 'Réduit le produit net.',
      cost: 'Réduit la marge brute.', operating_expense: 'Réduit le résultat opérationnel.',
      non_operating: 'Apparaît après le résultat opérationnel.', excluded: 'N’apparaît pas dans le compte de résultat actuel et ne modifie pas le résultat.',
    },
  },
};

export function CategoryDrePlacementPreview({
  categoryName,
  groupName,
  type,
  nature,
  locale,
}: {
  categoryName: string;
  groupName: string;
  type: string;
  nature: ConfigurableDreNature;
  locale: string;
}) {
  const copy = DRE_PREVIEW_COPY[locale] ?? DRE_PREVIEW_COPY['pt-br'];
  const excluded = nature === 'excluded';
  const income = type === 'entrada';
  return (
    <div className="overflow-hidden rounded-xl border bg-muted/20" data-testid="dre-placement-preview">
      <div className="flex items-center justify-between gap-3 border-b bg-background/80 px-3 py-2.5">
        <span className="flex items-center gap-2 text-xs font-medium"><Eye className="h-4 w-4 text-muted-foreground" />{copy.title}</span>
        <span className="text-[11px] text-muted-foreground">{copy.unchanged}</span>
      </div>
      <div className="space-y-2 p-3">
        <div className="flex justify-between text-xs text-muted-foreground"><span>{copy.before}</span><span>…</span></div>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/20 bg-background px-3 py-2 shadow-sm">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{groupName}</p>
            <p className="truncate text-sm font-medium">{categoryName.trim() || copy.categoryPlaceholder}</p>
          </div>
          <span className={excluded ? 'text-sm font-semibold text-muted-foreground' : income ? 'text-sm font-semibold text-emerald-600' : 'text-sm font-semibold text-destructive'}>
            {excluded ? copy.informative : type === 'ambos' ? `± ${copy.value}` : income ? `+ ${copy.value}` : `− ${copy.value}`}
          </span>
        </div>
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          {excluded ? <Minus className="h-3.5 w-3.5" /> : income ? <TrendingUp className="h-3.5 w-3.5 text-emerald-600" /> : <TrendingDown className="h-3.5 w-3.5 text-destructive" />}
          {excluded ? copy.effects.excluded : type === 'ambos' ? copy.both : income ? copy.effects.revenue : copy.effects[nature]}
        </p>
      </div>
    </div>
  );
}

const baseSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  color: z.string().min(1),
  icon: z.string().default('Tag'),
  dre_group: z.string().default('opex'),
  dre_group_id: z.string().default(''),
  dfc_group: z.enum(['operacional', 'investimento', 'financiamento']).default('operacional'),
  /** `''` = categoria principal (raiz). Vira `null` no submit. */
  parent_id: z.string().default(''),
});

type FormData = z.infer<typeof baseSchema>;
export type CategoryFormSubmitData = Omit<FormData, 'dre_group_id' | 'parent_id'> & {
  dre_group_id: string | null;
  parent_id: string | null;
};

interface CategoryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: FinancialCategory | null;
  onSubmit: (data: CategoryFormSubmitData) => Promise<void>;
  isLoading?: boolean;
  /** Nome pré-preenchido ao criar (ex.: texto digitado no SearchableSelect). Só vale na criação. */
  initialName?: string;
  /** Tipo pré-selecionado ao criar (entrada/saida/ambos). Só vale na criação. */
  initialType?: string;
  /**
   * Validação extra do nome (colisão com outra categoria). Devolve a mensagem
   * de erro ou `null`. Roda ANTES do submit: o erro aparece embaixo do campo e
   * o formulário não é limpo.
   */
  validateName?: (name: string, type: string) => string | null;
  /**
   * Lista COMPLETA de categorias da empresa, usada só pra montar o campo
   * "Categoria principal". Vem do `useFinancialCategories` de quem chama (a
   * mesma consulta já em cache), nunca de uma consulta nova. Sem ela o campo
   * simplesmente não aparece e o formulário é o de sempre.
   */
  categories?: FinancialCategory[];
  /** Pai pré-selecionado ao criar (ação "Adicionar subcategoria"). Só vale na criação. */
  initialParentId?: string | null;
  /** Grupos configuráveis do DRE, já ordenados pelo hook da empresa. */
  dreGroups?: ConfigurableDreGroupLike[];
}

export function CategoryFormDialog({ open, onOpenChange, category, onSubmit, isLoading, initialName, initialType, validateName, categories, initialParentId, dreGroups = [] }: CategoryFormDialogProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.finance.categoryForm;
  const tc = MESSAGES[locale].app.finance.categories;

  const schema = baseSchema.extend({
    name: z.string().min(1, t.validations.nameRequired),
    type: z.string().min(1, t.validations.typeRequired),
    color: z.string().min(1, t.validations.colorRequired),
  });

  const allCategories = useMemo(() => categories ?? [], [categories]);
  const tree = useMemo(() => buildCategoryTree(allCategories), [allCategories]);
  const initialParent = !category && initialParentId ? tree.byId.get(initialParentId) : null;

  const defaultGroupId = useCallback((
    type: string,
    legacyGroup: string | null | undefined,
    currentId?: string | null,
  ) => {
    if (currentId && dreGroups.some((group) => group.id === currentId && group.is_active)) return currentId;
    const nature = resolveCategoryDreNature(
      { type, dre_group: legacyGroup ?? 'opex', dre_group_id: null },
      dreGroups,
    );
    return dreGroups.find((group) => group.is_active && group.nature === nature)?.id ?? '';
  }, [dreGroups]);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: category?.name ?? initialName ?? '',
      type: category?.type ?? initialParent?.type ?? initialType ?? 'ambos',
      color: category?.color ?? initialParent?.color ?? '#00C597',
      icon: category?.icon ?? initialParent?.icon ?? 'Tag',
      dre_group: category?.dre_group ?? initialParent?.dre_group ?? 'opex',
      dre_group_id: defaultGroupId(
        category?.type ?? initialParent?.type ?? initialType ?? 'ambos',
        category?.dre_group ?? initialParent?.dre_group,
        category?.dre_group_id ?? initialParent?.dre_group_id,
      ),
      dfc_group: category?.dfc_group ?? initialParent?.dfc_group ?? 'operacional',
      parent_id: category?.parent_id ?? initialParentId ?? '',
    },
  });

  // Resync form when opening or switching category
  useEffect(() => {
    if (open) {
      form.reset({
        // Na criação, respeita o nome/tipo pré-preenchidos (quick-create do SearchableSelect).
        name: category?.name ?? initialName ?? '',
        type: category?.type ?? initialParent?.type ?? initialType ?? 'ambos',
        color: category?.color ?? initialParent?.color ?? '#00C597',
        icon: category?.icon ?? initialParent?.icon ?? 'Tag',
        dre_group: category?.dre_group ?? initialParent?.dre_group ?? 'opex',
        dre_group_id: defaultGroupId(
          category?.type ?? initialParent?.type ?? initialType ?? 'ambos',
          category?.dre_group ?? initialParent?.dre_group,
          category?.dre_group_id ?? initialParent?.dre_group_id,
        ),
        dfc_group: category?.dfc_group ?? initialParent?.dfc_group ?? 'operacional',
        parent_id: category?.parent_id ?? initialParentId ?? '',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, category?.id, initialName, initialType, initialParentId, initialParent?.id]);

  const isSystem = category?.is_system === true;
  const selectedColor = form.watch('color');
  const selectedParentId = form.watch('parent_id');
  const selectedType = form.watch('type');
  const selectedDreGroupId = form.watch('dre_group_id');
  const selectedLegacyDreGroup = form.watch('dre_group');
  const selectableDreGroups = useMemo(
    () => dreGroups.filter((group) => {
      if (!group.is_active && group.id !== category?.dre_group_id) return false;
      if (selectedType === 'entrada') return group.nature === 'revenue' || group.nature === 'excluded';
      return group.nature !== 'revenue';
    }),
    [dreGroups, selectedType, category?.dre_group_id],
  );
  const selectedDreGroup = dreGroups.find((group) => group.id === selectedDreGroupId);
  const selectedDreNature = selectedDreGroup?.nature ?? resolveCategoryDreNature(
    { type: selectedType, dre_group: selectedLegacyDreGroup, dre_group_id: null },
    dreGroups,
  );
  const selectedDreGroupName = selectedDreGroup?.name
    ?? (selectedLegacyDreGroup === 'impostos' ? t.dreGroups.impostos
      : selectedLegacyDreGroup === 'cmv' ? t.dreGroups.cmv
        : selectedLegacyDreGroup === 'outros' ? t.dreGroups.outros
          : t.dreGroups.opex);

  useEffect(() => {
    if (!open || dreGroups.length === 0) return;
    const currentId = form.getValues('dre_group_id');
    if (selectableDreGroups.some((group) => group.id === currentId)) return;
    const desiredId = defaultGroupId(
      selectedType,
      form.getValues('dre_group'),
      category?.dre_group_id ?? initialParent?.dre_group_id,
    );
    const fallback = selectableDreGroups.find((group) => group.id === desiredId) ?? selectableDreGroups[0];
    if (!fallback) return;
    form.setValue('dre_group_id', fallback.id, { shouldDirty: !isSystem });
    form.setValue('dre_group', legacyDreGroupForNature(fallback.nature), { shouldDirty: !isSystem });
  }, [open, isSystem, dreGroups.length, selectableDreGroups, selectedType, category?.dre_group_id, initialParent?.dre_group_id, defaultGroupId, form]);

  /**
   * Candidatas a PAI: só categorias RAIZ da empresa, tirando a própria.
   * Subcategoria não pode ser pai de ninguém (o banco recusa neto), então ela
   * nem entra na lista. Tudo em memória, sobre a lista que já veio.
   */
  // Categoria que JÁ tem subcategoria não pode virar subcategoria de outra
  // (o gatilho recusa). O campo aparece explicando, em vez de sumir sem motivo.
  const hasOwnChildren = !!category && tree.hasChildren(category.id);
  const parentCandidates = useMemo(
    () => tree.roots.filter((c) => c.id !== category?.id),
    [tree, category?.id],
  );
  const parentOptions = useMemo(
    () => parentCandidates.map((c) => {
      const Icon = getCategoryIcon(c.icon);
      return {
        value: c.id,
        label: c.name,
        icon: (
          <span className="flex h-5 w-5 items-center justify-center rounded-full shrink-0" style={{ backgroundColor: c.color }}>
            <Icon className="h-3 w-3 text-white" />
          </span>
        ),
      };
    }),
    [parentCandidates],
  );
  const showParentField = parentCandidates.length > 0 || !!category?.parent_id;

  /**
   * Trocar o PAI pré-preenche tipo, grupos DRE/DFC, cor e ícone com os dele. É
   * só PADRÃO: todos os campos seguem editáveis, porque uma subcategoria tem
   * classificação própria de propósito (um pai em CSP pode ter filha em OPEX,
   * por exemplo).
   *
   * O `ref` guarda o último pai visto pra o efeito só reagir à MUDANÇA feita
   * pelo usuário — sem ele, reabrir o formulário de uma categoria existente
   * reescreveria o grupo dela com o do pai.
   */
  const lastParentRef = useRef<string | null>(null);
  useEffect(() => {
    if (!open) { lastParentRef.current = null; return; }
    if (lastParentRef.current === null) { lastParentRef.current = selectedParentId ?? ''; return; }
    if (lastParentRef.current === selectedParentId) return;
    lastParentRef.current = selectedParentId ?? '';
    const parent = selectedParentId ? tree.byId.get(selectedParentId) : null;
    if (!parent) return;
    form.setValue('type', parent.type, { shouldDirty: true });
    form.setValue('dre_group', parent.dre_group ?? 'opex', { shouldDirty: true });
    form.setValue(
      'dre_group_id',
      defaultGroupId(parent.type, parent.dre_group, parent.dre_group_id),
      { shouldDirty: true },
    );
    form.setValue('dfc_group', parent.dfc_group ?? 'operacional', { shouldDirty: true });
    form.setValue('color', parent.color, { shouldDirty: true });
    form.setValue('icon', parent.icon ?? 'Tag', { shouldDirty: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedParentId, open]);

  // Categoria de SISTEMA: nome, cor e ícone continuam livres; tipo e grupo do
  // DRE ficam travados. São eles que identificam o PAPEL da categoria (quem o
  // lançamento automático procura) e a linha dela no resultado, e trocá-los
  // arrancaria a categoria do papel sem aviso nenhum.
  const handleSubmit = async (data: FormData) => {
    const nameError = validateName?.(data.name, data.type);
    if (nameError) {
      form.setError('name', { type: 'manual', message: nameError });
      return;
    }
    const selectedGroup = dreGroups.find((group) => group.id === data.dre_group_id);
    // `dre_group` legado continua sincronizado porque lançamentos automáticos e
    // migrations antigas ainda o usam como papel semântico. A nova FK controla
    // nome/ordem de apresentação.
    await onSubmit({
      ...data,
      dre_group: selectedGroup ? legacyDreGroupForNature(selectedGroup.nature) : data.dre_group,
      dre_group_id: data.dre_group_id || null,
      parent_id: data.parent_id ? data.parent_id : null,
    });
    form.reset();
  };

  const iconKeys = Object.keys(CATEGORY_ICONS) as CategoryIconKey[];

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={category ? t.titleEdit : (initialParentId ? t.titleNewChild : t.titleNew)}
      className="sm:max-w-[760px]"
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t.cancelLabel}</Button>
          <Button onClick={form.handleSubmit(handleSubmit)} disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {category ? t.saveLabel : t.createLabel}
          </Button>
        </div>
      }
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <FormField control={form.control} name="name" render={({ field }) => (
            <FormItem>
              <FormLabel>{t.nameLabel}</FormLabel>
              <FormControl><Input placeholder={t.namePlaceholder} {...field} /></FormControl>
              {isSystem && <FormDescription>{tc.systemLockedHint}</FormDescription>}
              <FormMessage />
            </FormItem>
          )} />

          {showParentField && (
            <FormField control={form.control} name="parent_id" render={({ field }) => (
              <FormItem>
                <FormLabel>{t.parentLabel}</FormLabel>
                <FormControl>
                  <SearchableSelect
                    options={[{ value: NO_PARENT, label: t.parentNone }, ...parentOptions]}
                    value={field.value || NO_PARENT}
                    onValueChange={(v) => field.onChange(v === NO_PARENT ? '' : v)}
                    placeholder={t.parentNone}
                    searchPlaceholder={t.parentSearchPlaceholder}
                    disabled={hasOwnChildren}
                    className="w-full justify-between font-normal"
                  />
                </FormControl>
                <FormDescription>
                  {hasOwnChildren ? t.parentLockedHint : (field.value ? t.parentDreHint : t.parentHint)}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )} />
          )}

          <FormField control={form.control} name="type" render={({ field }) => (
            <FormItem>
              <FormLabel>{t.typeLabel}</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isSystem}>
                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="entrada">{t.types.entrada}</SelectItem>
                  <SelectItem value="saida">{t.types.saida}</SelectItem>
                  <SelectItem value="ambos">{t.types.ambos}</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />

          {dreGroups.length > 0 ? (
            <FormField control={form.control} name="dre_group_id" render={({ field }) => (
              <FormItem>
                <FormLabel>{locale === 'pt-br' ? 'Onde aparece no DRE' : t.dreGroupLabel}</FormLabel>
                <Select onValueChange={field.onChange} value={field.value} disabled={isSystem}>
                  <FormControl><SelectTrigger className="h-11"><SelectValue placeholder="Selecione o grupo do DRE" /></SelectTrigger></FormControl>
                  <SelectContent>
                    {selectableDreGroups.map((group) => (
                      <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>{t.dreGroupHint}</FormDescription>
                <CategoryDrePlacementPreview
                  categoryName={form.watch('name')}
                  groupName={selectedDreGroupName}
                  type={selectedType}
                  nature={selectedDreNature}
                  locale={locale}
                />
                <FormMessage />
              </FormItem>
            )} />
          ) : (
            <FormField control={form.control} name="dre_group" render={({ field }) => (
              <FormItem>
                <FormLabel>{t.dreGroupLabel}</FormLabel>
                <Select onValueChange={field.onChange} value={field.value} disabled={isSystem}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="impostos">{t.dreGroups.impostos}</SelectItem>
                    <SelectItem value="cmv">{t.dreGroups.cmv}</SelectItem>
                    <SelectItem value="opex">{t.dreGroups.opex}</SelectItem>
                    <SelectItem value="outros">{t.dreGroups.outros}</SelectItem>
                  </SelectContent>
                </Select>
                <FormDescription>{t.dreGroupHint}</FormDescription>
                <CategoryDrePlacementPreview
                  categoryName={form.watch('name')}
                  groupName={selectedDreGroupName}
                  type={selectedType}
                  nature={selectedDreNature}
                  locale={locale}
                />
                <FormMessage />
              </FormItem>
            )} />
          )}

          <FormField control={form.control} name="dfc_group" render={({ field }) => (
            <FormItem>
              <FormLabel>{t.dfcGroupLabel}</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="operacional">{t.dfcGroups.operacional}</SelectItem>
                  <SelectItem value="investimento">{t.dfcGroups.investimento}</SelectItem>
                  <SelectItem value="financiamento">{t.dfcGroups.financiamento}</SelectItem>
                </SelectContent>
              </Select>
              <FormDescription>{t.dfcGroupHint}</FormDescription>
              <FormMessage />
            </FormItem>
          )} />

          <FormField control={form.control} name="color" render={({ field }) => (
            <FormItem>
              <FormLabel>{t.colorLabel}</FormLabel>
              <ColorPicker value={field.value} onChange={field.onChange} />
              <FormMessage />
            </FormItem>
          )} />

          <FormField control={form.control} name="icon" render={({ field }) => (
            <FormItem>
              <FormLabel>{t.iconLabel}</FormLabel>
              <div className="grid max-h-[160px] grid-cols-6 gap-2 overflow-y-auto p-1 sm:grid-cols-8">
                {iconKeys.map((key) => {
                  const Icon = CATEGORY_ICONS[key];
                  const isSelected = field.value === key;
                  return (
                    <button
                      type="button"
                      key={key}
                      onClick={() => field.onChange(key)}
                      title={key}
                      className={`flex h-10 w-full items-center justify-center rounded-lg border-2 transition-all ${
                        isSelected ? 'border-foreground text-white' : 'border-transparent text-muted-foreground hover:bg-muted'
                      }`}
                      style={isSelected ? { backgroundColor: selectedColor } : undefined}
                    >
                      <Icon className="h-4 w-4" />
                    </button>
                  );
                })}
              </div>
              <FormMessage />
            </FormItem>
          )} />
        </form>
      </Form>
    </ResponsiveModal>
  );
}
