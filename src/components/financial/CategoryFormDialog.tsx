import { useEffect, useMemo, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { Loader2 } from 'lucide-react';
import { CATEGORY_ICONS, getCategoryIcon, type CategoryIconKey } from './categoryIcons';
import { ColorPicker } from '@/components/ui/ColorPicker';
import type { FinancialCategory } from '@/hooks/useFinancialCategories';
import { buildCategoryTree } from '@/lib/category-tree';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

/**
 * Sentinela da opção "sem pai". Um `value=''` no combobox vira `key=''` no
 * item do cmdk e confunde a comparação de selecionado com "nada escolhido";
 * o valor que vai pro banco continua sendo `null`.
 */
const NO_PARENT = '__none__';

const baseSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  color: z.string().min(1),
  icon: z.string().default('Tag'),
  dre_group: z.string().default('opex'),
  /** `''` = categoria principal (raiz). Vira `null` no submit. */
  parent_id: z.string().default(''),
});

type FormData = z.infer<typeof baseSchema>;

interface CategoryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: FinancialCategory | null;
  onSubmit: (data: FormData) => Promise<void>;
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
}

export function CategoryFormDialog({ open, onOpenChange, category, onSubmit, isLoading, initialName, initialType, validateName, categories, initialParentId }: CategoryFormDialogProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.finance.categoryForm;
  const tc = MESSAGES[locale].app.finance.categories;

  const schema = baseSchema.extend({
    name: z.string().min(1, t.validations.nameRequired),
    type: z.string().min(1, t.validations.typeRequired),
    color: z.string().min(1, t.validations.colorRequired),
  });

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: category?.name ?? initialName ?? '',
      type: category?.type ?? initialType ?? 'ambos',
      color: category?.color ?? '#00C597',
      icon: category?.icon ?? 'Tag',
      dre_group: (category as any)?.dre_group ?? 'opex',
      parent_id: category?.parent_id ?? initialParentId ?? '',
    },
  });

  // Resync form when opening or switching category
  useEffect(() => {
    if (open) {
      form.reset({
        // Na criação, respeita o nome/tipo pré-preenchidos (quick-create do SearchableSelect).
        name: category?.name ?? initialName ?? '',
        type: category?.type ?? initialType ?? 'ambos',
        color: category?.color ?? '#00C597',
        icon: category?.icon ?? 'Tag',
        dre_group: (category as any)?.dre_group ?? 'opex',
        parent_id: category?.parent_id ?? initialParentId ?? '',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, category?.id, initialName, initialType, initialParentId]);

  const selectedColor = form.watch('color');
  const selectedType = form.watch('type');
  const selectedParentId = form.watch('parent_id');

  /**
   * Candidatas a PAI: só categorias RAIZ da empresa, tirando a própria.
   * Subcategoria não pode ser pai de ninguém (o banco recusa neto), então ela
   * nem entra na lista. Tudo em memória, sobre a lista que já veio.
   */
  const allCategories = useMemo(() => categories ?? [], [categories]);
  const tree = useMemo(() => buildCategoryTree(allCategories), [allCategories]);
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
   * Trocar o PAI pré-preenche `type` e `dre_group` com os dele. É só PADRÃO:
   * os dois campos seguem editáveis, porque uma subcategoria tem grupo do DRE
   * PRÓPRIO de propósito (um pai em CSP pode ter filha em OPEX, e é assim que
   * a empresa do cliente já classifica).
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedParentId, open]);

  // Categoria de SISTEMA: nome, cor e ícone continuam livres; tipo e grupo do
  // DRE ficam travados. São eles que identificam o PAPEL da categoria (quem o
  // lançamento automático procura) e a linha dela no resultado, e trocá-los
  // arrancaria a categoria do papel sem aviso nenhum.
  const isSystem = category?.is_system === true;
  const showDreGroup = selectedType === 'saida' || selectedType === 'ambos';

  // Grupo DRE só se aplica a despesa (classifyCategory só roda no ramo de saída).
  // Se o campo some da tela, reseta o valor pra não gravar lixo herdado de uma escolha anterior.
  useEffect(() => {
    if (!showDreGroup) {
      form.setValue('dre_group', 'opex', { shouldDirty: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDreGroup]);

  const handleSubmit = async (data: FormData) => {
    const nameError = validateName?.(data.name, data.type);
    if (nameError) {
      form.setError('name', { type: 'manual', message: nameError });
      return;
    }
    // `''` no select vira `null` no banco: é o que significa "categoria principal".
    await onSubmit({ ...data, parent_id: data.parent_id ? data.parent_id : null } as any);
    form.reset();
  };

  const iconKeys = Object.keys(CATEGORY_ICONS) as CategoryIconKey[];

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={category ? t.titleEdit : (initialParentId ? t.titleNewChild : t.titleNew)}
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

          {showDreGroup && (
            <FormField control={form.control} name="dre_group" render={({ field }) => (
              <FormItem>
                <FormLabel>{t.dreGroupLabel}</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value} disabled={isSystem}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="impostos">{t.dreGroups.impostos}</SelectItem>
                    <SelectItem value="cmv">{t.dreGroups.cmv}</SelectItem>
                    <SelectItem value="opex">{t.dreGroups.opex}</SelectItem>
                  </SelectContent>
                </Select>
                {selectedType === 'ambos' && <FormDescription>{t.dreGroupHint}</FormDescription>}
                <FormMessage />
              </FormItem>
            )} />
          )}

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
              <div className="grid grid-cols-8 gap-2 max-h-[160px] overflow-y-auto p-1">
                {iconKeys.map((key) => {
                  const Icon = CATEGORY_ICONS[key];
                  const isSelected = field.value === key;
                  return (
                    <button
                      type="button"
                      key={key}
                      onClick={() => field.onChange(key)}
                      title={key}
                      className={`flex h-9 w-9 items-center justify-center rounded-lg border-2 transition-all ${
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
