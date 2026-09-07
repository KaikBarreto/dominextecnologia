import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { QuickCustomerDialog } from '@/components/financial/QuickCustomerDialog';
import { cn } from '@/lib/utils';
import type { Customer } from '@/types/database';

export interface CustomerSelectFieldProps {
  value?: string;
  onValueChange: (id: string) => void;
  /** Lista já carregada pelo pai (não busca de novo aqui). */
  customers: Customer[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  /** Adiciona uma opção "Nenhum" (ou `noneLabel` custom) no topo da lista. */
  allowNone?: boolean;
  /** Valor sentinela usado pelo pai pra representar "sem cliente" (ex: 'none', '_none'). */
  noneValue?: string;
  noneLabel?: string;
  /** Exige CPF/CNPJ no quick-create (default false). Cobrança Asaas deve passar true. */
  requireDocument?: boolean;
  /**
   * Quando presente, o botão "+" chama isso em vez de abrir o `QuickCustomerDialog`
   * embutido — uso pra telas que precisam do `CustomerFormDialog` completo
   * (endereço, dados fiscais etc.), como Contrato e OS multi-equipamento.
   */
  onCreateFull?: () => void;
  /** Chamado após criar pelo QuickCustomerDialog embutido (além de já selecionar). */
  onCreated?: (id: string) => void;
  className?: string;
  /** Repassado ao combobox interno, pra `<Label htmlFor>` focar o campo certo. */
  id?: string;
}

/**
 * Select de cliente padronizado (padrão EcoSistema): combobox com busca +
 * botão "+" quadrado colado DENTRO da borda do campo, que cria o cliente na
 * hora. Substitui as 3 variações que conviviam no repo (SearchableSelect puro,
 * SearchableSelect+onCreateOption no rodapé do popover, SearchableSelect+botão
 * externo). Reusa `SearchableSelect` (combobox) e `QuickCustomerDialog`
 * (criação rápida) — nunca chama supabase direto.
 */
export function CustomerSelectField({
  value,
  onValueChange,
  customers,
  placeholder = 'Selecione o cliente...',
  searchPlaceholder = 'Buscar cliente...',
  emptyMessage,
  disabled,
  allowNone = false,
  noneValue = 'none',
  noneLabel = 'Nenhum',
  requireDocument = false,
  onCreateFull,
  onCreated,
  className,
  id,
}: CustomerSelectFieldProps) {
  const [quickOpen, setQuickOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const options = [
    ...(allowNone ? [{ value: noneValue, label: noneLabel }] : []),
    ...customers.map((c) => ({
      value: c.id,
      label: c.name,
      sublabel: c.document || c.email || c.phone || c.celular || undefined,
    })),
  ];

  const handleCreateClick = () => {
    if (onCreateFull) {
      onCreateFull();
      return;
    }
    setQuickOpen(true);
  };

  return (
    <>
      <div
        className={cn(
          'flex items-center h-10 rounded-md border border-input bg-background ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
          className,
        )}
      >
        <SearchableSelect
          id={id}
          options={options}
          value={value}
          onValueChange={onValueChange}
          onSearchChange={setSearchQuery}
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
          onClick={handleCreateClick}
          className="h-10 w-10 shrink-0 rounded-none rounded-r-md border-l border-input bg-muted text-muted-foreground hover:bg-primary hover:text-primary-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
          aria-label="Criar cliente"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Quick-create embutido — só existe quando o pai não trouxe o próprio
          fluxo completo via `onCreateFull`. */}
      {!onCreateFull && (
        <QuickCustomerDialog
          open={quickOpen}
          initialName={searchQuery}
          onOpenChange={setQuickOpen}
          requireDocument={requireDocument}
          onCreated={(newId) => {
            onValueChange(newId);
            onCreated?.(newId);
            setQuickOpen(false);
          }}
        />
      )}
    </>
  );
}
