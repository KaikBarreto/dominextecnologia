import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { CategoryFormDialog } from '@/components/financial/CategoryFormDialog';
import { getCategoryIcon } from '@/components/financial/categoryIcons';
import { useFinancialCategories } from '@/hooks/useFinancialCategories';
import { useCanManageFinanceSettings } from '@/hooks/useCanManageFinanceSettings';
import { filterCategoriesForSelect } from '@/lib/financial-category-filter';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { cn } from '@/lib/utils';

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
}: CategorySelectFieldProps) {
  const { locale } = useAppLocaleContext();
  const tf = MESSAGES[locale].app.finance.transactionForm;
  const { categories, createCategory } = useFinancialCategories();
  const canManage = useCanManageFinanceSettings();

  const [formOpen, setFormOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = filterCategoriesForSelect(categories, type, value);
  const options = filtered.map((c) => {
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
  });
  // Categoria apagada da tabela (não só desativada): sintetiza a opção pra o
  // valor gravado continuar visível em vez de sumir no placeholder.
  if (value && !options.some((o) => o.value === value)) {
    options.push({ value, label: value, sublabel: tf.categoryInactiveSuffix, icon: undefined });
  }

  // `any` aqui espelha o mesmo contrato do `handleCreateCategoryInline` em
  // TransactionFormDialog: recebe o shape do CategoryFormDialog e repassa
  // direto pro `createCategory.mutateAsync` (CategoryInput).
  const handleCreate = async (data: any) => {
    const created = await createCategory.mutateAsync(data);
    if (created?.name) onValueChange(created.name);
    setFormOpen(false);
  };

  return (
    <>
      <div
        className={cn(
          'flex items-center h-10 rounded-md border border-input bg-background ring-offset-background focus-within:border-ring focus-within:ring-1 focus-within:ring-ring focus-within:ring-offset-0',
          className,
        )}
      >
        <SearchableSelect
          id={id}
          options={options}
          value={value}
          onValueChange={onValueChange}
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

      {canManage && (
        <CategoryFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          category={null}
          initialName={searchQuery}
          initialType={type}
          onSubmit={handleCreate}
          isLoading={createCategory.isPending}
        />
      )}
    </>
  );
}
