import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { SupplierFormDialog } from '@/components/inventory/SupplierFormDialog';
import { cn } from '@/lib/utils';
import type { Supplier } from '@/hooks/useSuppliers';

export interface SupplierSelectFieldProps {
  value?: string;
  onValueChange: (id: string) => void;
  /** Lista já carregada pelo pai (não busca de novo aqui). */
  suppliers: Supplier[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  /** Aria-label localizado do botão "+" (mesmo padrão do `newCategoryAriaLabel`). */
  createAriaLabel?: string;
  className?: string;
  /** Repassado ao combobox interno, pra `<Label htmlFor>` focar o campo certo. */
  id?: string;
}

/**
 * Select de fornecedor no MESMO estilo do `CustomerSelectField`: combobox com
 * busca + botão "+" quadrado colado DENTRO da borda do campo, que cria o
 * fornecedor na hora sem sair do form. Reusa `SearchableSelect` e o
 * `SupplierFormDialog` já existente do módulo de Compras/Estoque (não existe
 * quick-create dedicado pra fornecedor, então embutimos o form completo —
 * ele já é enxuto: só o nome é obrigatório). Nunca chama supabase direto; quem
 * fala com o banco é `useSuppliers` (dentro do `SupplierFormDialog`).
 */
export function SupplierSelectField({
  value,
  onValueChange,
  suppliers,
  placeholder,
  searchPlaceholder,
  emptyMessage,
  disabled,
  createAriaLabel,
  className,
  id,
}: SupplierSelectFieldProps) {
  const [formOpen, setFormOpen] = useState(false);

  const options = suppliers.map((s) => ({
    value: s.id,
    label: s.name,
    sublabel: s.cpf_cnpj || s.email || s.phone || undefined,
  }));

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
          placeholder={placeholder}
          searchPlaceholder={searchPlaceholder}
          emptyMessage={emptyMessage}
          disabled={disabled}
          className="flex-1 min-w-0 justify-between rounded-none rounded-l-md border-0 bg-transparent hover:bg-transparent text-foreground hover:text-foreground shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-3 h-10 font-normal"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={disabled}
          onClick={() => setFormOpen(true)}
          className="h-10 w-10 shrink-0 rounded-none rounded-r-md border-l border-input bg-muted text-muted-foreground hover:bg-primary hover:text-primary-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
          aria-label={createAriaLabel}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <SupplierFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        supplier={null}
        onCreated={(created) => {
          onValueChange(created.id);
          setFormOpen(false);
        }}
      />
    </>
  );
}
