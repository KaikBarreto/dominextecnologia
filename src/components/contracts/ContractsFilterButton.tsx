import { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  FilterCheckboxGroup,
  type FilterCheckboxOption,
} from '@/components/mobile/FilterCheckboxGroup';

// Opções de Saúde e Tipo (multi-select). Vazio = mostra tudo.
const HEALTH_OPTIONS: FilterCheckboxOption[] = [
  { value: 'em_dia', label: 'Em dia' },
  { value: 'manutencao_pendente', label: 'Manutenção Pendente' },
  { value: 'necessita_atencao', label: 'ATENÇÃO' },
];

const TYPE_OPTIONS: FilterCheckboxOption[] = [
  { value: 'pmoc', label: 'PMOC' },
  { value: 'common', label: 'Comum (não-PMOC)' },
];

interface ContractsFilterButtonProps {
  // Status (multi-select).
  statusOptions: FilterCheckboxOption[];
  statusFilter: string[];
  onStatusChange: (next: string[]) => void;

  // Saúde (multi-select).
  healthFilter: string[];
  onHealthChange: (next: string[]) => void;

  // Tipo (multi-select).
  typeFilter: string[];
  onTypeChange: (next: string[]) => void;

  /** Quantidade de filtros ativos (badge no botão). */
  activeCount: number;
  /** Limpa apenas os filtros de status/saúde/tipo (não mexe na busca). */
  onClear: () => void;
}

/**
 * Botão "Filtros" do desktop pra tela de Contratos. Substitui os 3 selects
 * (Status, Saúde, Tipo) renderizados inline na toolbar pra desentulhar a tela.
 *
 * Padrão: igual ao `FilterSheet` mobile, mas com sheet à direita no desktop.
 * Mobile continua usando o `FilterSheet` original (este componente é
 * desktop-only — o pai decide quando renderizar).
 */
export function ContractsFilterButton({
  statusOptions,
  statusFilter,
  onStatusChange,
  healthFilter,
  onHealthChange,
  typeFilter,
  onTypeChange,
  activeCount,
  onClear,
}: ContractsFilterButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="gap-2 h-10 shrink-0">
          <SlidersHorizontal className="h-4 w-4" />
          Filtros
          {activeCount > 0 && (
            <Badge
              variant="secondary"
              className="ml-1 h-5 min-w-5 px-1.5 text-[10px]"
            >
              {activeCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md p-0 flex flex-col"
      >
        <SheetHeader className="px-5 pt-5 pb-3 border-b">
          <SheetTitle>Filtros</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          <FilterCheckboxGroup
            label="Status"
            options={statusOptions}
            selected={statusFilter}
            onChange={onStatusChange}
            emptyLabel="Todos"
          />

          <FilterCheckboxGroup
            label="Saúde"
            options={HEALTH_OPTIONS}
            selected={healthFilter}
            onChange={onHealthChange}
            emptyLabel="Todas"
          />

          <FilterCheckboxGroup
            label="Tipo"
            options={TYPE_OPTIONS}
            selected={typeFilter}
            onChange={onTypeChange}
            emptyLabel="Todos"
          />
        </div>

        <div className="sticky bottom-0 border-t bg-background px-5 py-3 flex items-center gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={onClear}
            disabled={activeCount === 0}
          >
            Limpar filtros
          </Button>
          <Button className="flex-1" onClick={() => setOpen(false)}>
            Aplicar
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
