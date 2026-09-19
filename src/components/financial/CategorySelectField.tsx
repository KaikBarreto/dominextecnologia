import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SearchableSelect, type SearchableSelectOption } from '@/components/ui/SearchableSelect';
import { CategoryFormDialog } from '@/components/financial/CategoryFormDialog';
import { getCategoryIcon } from '@/components/financial/categoryIcons';
import { useFinancialCategories, type FinancialCategory } from '@/hooks/useFinancialCategories';
import { useCanManageFinanceSettings } from '@/hooks/useCanManageFinanceSettings';
import { filterCategoriesForSelect } from '@/lib/financial-category-filter';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { cn } from '@/lib/utils';
import { groupByDre, shouldGroupByDre } from '@/lib/dre-groups';
import { buildCategoryTree, resolveCategoryCascade } from '@/lib/category-tree';

/** Sentinela da opção "usar a categoria principal" no segundo select. */
const USE_PARENT = '__parent__';

export interface CategorySelectFieldProps {
  value: string;
  onValueChange: (name: string) => void;
  /** Tipo do lançamento — filtra as categorias compatíveis (entrada/saida, mais as `ambos`). */
  type: 'entrada' | 'saida';
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  /**
   * Nomes usados quando a empresa não tem NENHUMA categoria cadastrada ainda.
   * Existe só pra o campo não nascer vazio em empresa nova — some assim que a
   * primeira categoria é criada.
   */
  fallbackNames?: string[];
}

/**
 * Select de categoria padronizado no mesmo estilo do campo Cliente
 * (`CustomerSelectField`): combobox com busca + botão "+" quadrado colado
 * DENTRO da borda do campo, que cria a categoria na hora sem sair do form.
 *
 * O "+" só aparece pra quem pode gerenciar configuração financeira
 * (`useCanManageFinanceSettings` — ÚNICO portão de quick-create do
 * financeiro). Quem não tem a permissão nem vê o botão.
 *
 * Sempre mantém na lista a categoria JÁ selecionada, mesmo desativada ou
 * apagada da tabela (via `filterCategoriesForSelect`) — sem isso o campo
 * parece vazio ao editar um lançamento antigo.
 *
 * 🔴 CASCATA: quando a categoria escolhida tem subcategorias, aparece um
 * SEGUNDO select. O que é gravado continua sendo o NOME DA FOLHA escolhida,
 * numa string só, no mesmo campo de sempre — nunca "Pai › Filha". O caminho é
 * só visual; quem guarda a relação é `financial_categories.parent_id`.
 */
export function CategorySelectField({
  value,
  onValueChange,
  type,
  placeholder,
  searchPlaceholder,
  disabled,
  className,
  id,
  fallbackNames,
}: CategorySelectFieldProps) {
  const { locale } = useAppLocaleContext();
  const fin = MESSAGES[locale].app.finance;
  const tf = fin.transactionForm;
  const { categories, createCategory } = useFinancialCategories();
  const canManage = useCanManageFinanceSettings();

  const [formOpen, setFormOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = filterCategoriesForSelect(categories, type, value);
  /**
   * Árvore montada sobre o RECORTE visível (tipo + ativas + a já selecionada).
   * Filha cujo pai não está no recorte (pai inativo, por exemplo) é tratada
   * como raiz — senão ela sumiria do select e o lançamento ficaria sem como
   * ser categorizado. O(n) sobre a lista que o hook já trouxe.
   */
  const tree = useMemo(() => buildCategoryTree(filtered), [filtered]);
  const cascade = resolveCategoryCascade(tree, value);

  const toOption = (c: FinancialCategory) => {
    const Icon = getCategoryIcon(c.icon);
    return {
      value: c.name,
      label: c.name,
      sublabel: c.is_active ? undefined : tf.categoryInactiveSuffix,
      icon: (
        <span className="flex h-5 w-5 items-center justify-center rounded-full shrink-0" style={{ backgroundColor: c.color }}>
          <Icon className="h-3 w-3 text-white" />
        </span>
      ),
    };
  };
  // Só as RAÍZES no primeiro select: a filha é escolhida no segundo. Sem isso
  // a mesma categoria apareceria duas vezes na mesma lista.
  const options: SearchableSelectOption[] = tree.roots.map(toOption);
  if (options.length === 0 && fallbackNames?.length) {
    options.push(...fallbackNames.map((name) => ({ value: name, label: name, sublabel: undefined, icon: undefined })));
  }
  // Categoria apagada da tabela (não só desativada): sintetiza a opção pra o
  // valor gravado continuar visível em vez de sumir no placeholder.
  const orphanOption =
    cascade.parentName && !options.some((o) => o.value === cascade.parentName)
      ? { value: cascade.parentName, label: cascade.parentName, sublabel: tf.categoryInactiveSuffix, icon: undefined }
      : null;
  if (orphanOption) options.push(orphanOption);

  /**
   * DESPESA é lida em seções do DRE (Impostos, CSP, Despesas operacionais,
   * Outros), com o mesmo recorte e a mesma ordem da tela de configuração de
   * categorias — antes aqui era uma lista alfabética plana, e com ~30 categorias
   * achar a certa virava rolagem no escuro.
   *
   * RECEITA continua plana de propósito: `dre_group` só classifica despesa.
   * Empresa que nunca classificou (tudo em 'opex') também continua plana, senão
   * sobraria um título de seção solitário em cima de tudo.
   *
   * Agrupa só as RAÍZES, pelo mesmo motivo da tela de categorias: a filha vive
   * debaixo do pai, e quem decide a linha dela no resultado é o `dre_group`
   * dela mesma, não a seção em que o pai foi escolhido.
   */
  const dreGroups = type === 'saida' ? groupByDre(tree.roots, fin.categoryForm.dreGroups) : [];
  const useGroups = type === 'saida' && shouldGroupByDre(dreGroups);
  const groups = useGroups
    ? [
        ...dreGroups.map((g) => ({ heading: g.label, options: g.items.map(toOption) })),
        // A categoria órfã não tem grupo confiável: fica numa seção própria no
        // fim, em vez de ser enfiada num bucket do DRE que ela talvez não seja.
        ...(orphanOption ? [{ heading: tf.categoryInactiveSuffix, options: [orphanOption] }] : []),
      ]
    : undefined;

  // `any` aqui espelha o mesmo contrato do `handleCreateCategoryInline` em
  // TransactionFormDialog: recebe o shape do CategoryFormDialog e repassa
  // direto pro `createCategory.mutateAsync` (CategoryInput).
  const handleCreate = async (data: any) => {
    const created = await createCategory.mutateAsync(data);
    if (created?.name) onValueChange(created.name);
    setFormOpen(false);
  };

  // Escolher OUTRA categoria principal grava o nome dela na hora: o lançamento
  // continua válido mesmo que o usuário não abra o segundo select (o pai aceita
  // lançamento direto, ganhar filha não o transforma em cabeçalho).
  const handleParentChange = (name: string) => onValueChange(name);
  // Sentinela = "usar a categoria principal" → grava o nome do PAI.
  const handleChildChange = (name: string) =>
    onValueChange(name === USE_PARENT ? cascade.parentName : name);

  const subOptions: SearchableSelectOption[] = [
    { value: USE_PARENT, label: tf.subcategoryNone, sublabel: undefined, icon: undefined },
    ...cascade.children.map(toOption),
  ];

  return (
    <>
      <div className="space-y-2">
        <div
          className={cn(
            'flex items-center h-10 rounded-md border border-input bg-background ring-offset-background focus-within:border-ring focus-within:ring-1 focus-within:ring-ring focus-within:ring-offset-0',
            className,
          )}
        >
          <SearchableSelect
            id={id}
            options={options}
            groups={groups}
            value={cascade.parentName}
            onValueChange={handleParentChange}
            onSearchChange={setSearchQuery}
            placeholder={placeholder ?? tf.categoryPlaceholder}
            searchPlaceholder={searchPlaceholder ?? tf.categorySearchPlaceholder}
            disabled={disabled}
            className={cn(
              'flex-1 min-w-0 justify-between border-0 bg-transparent hover:bg-transparent text-foreground hover:text-foreground shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-3 h-10 font-normal rounded-none',
              canManage ? 'rounded-l-md' : 'rounded-md',
            )}
          />
          {canManage && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={disabled}
              onClick={() => setFormOpen(true)}
              className="h-10 w-10 shrink-0 rounded-none rounded-r-md border-l border-input bg-muted text-muted-foreground hover:bg-primary hover:text-primary-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
              aria-label={tf.newCategoryAriaLabel}
            >
              <Plus className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Segundo nível: só aparece quando a categoria escolhida TEM filhas.
            Quem não usa subcategoria nunca vê este campo. */}
        {cascade.children.length > 0 && (
          <div className="space-y-1">
            <span className="block text-[11px] font-medium text-muted-foreground">{tf.subcategoryLabel}</span>
            <SearchableSelect
              options={subOptions}
              value={cascade.childName || USE_PARENT}
              onValueChange={handleChildChange}
              placeholder={tf.subcategoryPlaceholder}
              searchPlaceholder={tf.subcategorySearchPlaceholder}
              disabled={disabled}
              className="w-full justify-between h-10 font-normal"
            />
          </div>
        )}
      </div>

      {canManage && (
        <CategoryFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          category={null}
          initialName={searchQuery}
          initialType={type}
          categories={categories}
          onSubmit={handleCreate}
          isLoading={createCategory.isPending}
        />
      )}
    </>
  );
}
