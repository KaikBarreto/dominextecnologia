import { useState } from 'react';
import { Plus, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { QuickCustomerDialog } from '@/components/financial/QuickCustomerDialog';
import { cn } from '@/lib/utils';
import type { Customer } from '@/types/database';
import { usePartyLabels } from '@/hooks/usePartyLabels';
import { PartyLabelBadge } from '@/components/customers/PartyLabelBadge';

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
  /**
   * Default do "Atende como" no quick-create embutido (módulo PDV). Repassado
   * direto pro `QuickCustomerDialog` — ver lá a regra completa. Sem efeito
   * quando `onCreateFull` está presente (o pai controla o próprio
   * `CustomerFormDialog` e sua própria prop `defaultCustomerKind`).
   */
  defaultCustomerKind?: 'servico' | 'loja';
  className?: string;
  /** Repassado ao combobox interno, pra `<Label htmlFor>` focar o campo certo. */
  id?: string;
  /** Tratamento visual compacto do resumo do PDV, com contexto dentro do campo. */
  variant?: 'default' | 'summary';
  /** Rótulo contextual mostrado acima do nome no modo `summary`. */
  summaryLabel?: string;
  /** Rótulo acessível do quick-add externo no modo `summary`. */
  createLabel?: string;
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
  defaultCustomerKind,
  className,
  id,
  variant = 'default',
  summaryLabel,
  createLabel,
}: CustomerSelectFieldProps) {
  const [quickOpen, setQuickOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const { byId } = usePartyLabels();

  const options = [
    ...(allowNone ? [{ value: noneValue, label: noneLabel }] : []),
    ...customers.map((c) => {
      const label = byId(c.label_id);
      return {
        value: c.id,
        label: c.name,
        sublabel: c.document || c.email || c.phone || c.celular || undefined,
        // O sublabel mostra só UM dado, mas a busca enxerga todos, inclusive a etiqueta.
        keywords: [c.company_name, c.nome_fantasia, c.document, c.email, c.phone, c.celular, label?.name].filter(
          (k): k is string => !!k,
        ),
        suffix: <PartyLabelBadge label={label} />,
        selectedSuffix: <PartyLabelBadge label={label} compact />,
      };
    }),
  ];

  const handleCreateClick = (query = searchQuery) => {
    setSearchQuery(query);
    if (onCreateFull) {
      onCreateFull();
      return;
    }
    setQuickOpen(true);
  };

  const quickAddLabel = createLabel ?? 'Criar cliente';
  const field = variant === 'summary' ? (
    <div
      className={cn(
        'flex min-h-14 w-full overflow-hidden rounded-md border border-input bg-background ring-offset-background transition-colors focus-within:border-ring focus-within:ring-1 focus-within:ring-ring',
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 hover:bg-muted/50">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <UserRound className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          {summaryLabel && (
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {summaryLabel}
            </span>
          )}
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
            indicatorClassName="-translate-y-2"
            className="h-7 min-w-0 justify-between border-0 bg-transparent p-0 text-sm font-semibold shadow-none hover:bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={disabled}
        onClick={() => handleCreateClick()}
        className="h-auto w-14 self-stretch shrink-0 rounded-none border-l border-background/15 bg-foreground text-background hover:bg-foreground/90 hover:text-background focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-background"
        aria-label={quickAddLabel}
        title={quickAddLabel}
      >
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  ) : (
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
          onClick={() => handleCreateClick()}
          className="h-10 w-10 shrink-0 rounded-none rounded-r-md border-l border-input bg-muted text-muted-foreground hover:bg-primary hover:text-primary-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
          aria-label={quickAddLabel}
          title={quickAddLabel}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
  );

  return (
    <>
      {field}

      {/* Quick-create embutido — só existe quando o pai não trouxe o próprio
          fluxo completo via `onCreateFull`. */}
      {!onCreateFull && (
        <QuickCustomerDialog
          open={quickOpen}
          initialName={searchQuery}
          onOpenChange={setQuickOpen}
          requireDocument={requireDocument}
          defaultCustomerKind={defaultCustomerKind}
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
