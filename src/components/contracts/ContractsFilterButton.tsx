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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  FilterCheckboxGroup,
  type FilterCheckboxOption,
} from '@/components/mobile/FilterCheckboxGroup';
import type { ContractHealthStatus } from '@/hooks/useContractHealth';

interface ContractsFilterButtonProps {
  // Status (multi-select).
  statusOptions: FilterCheckboxOption[];
  statusFilter: string[];
  onStatusChange: (next: string[]) => void;

  // Saúde (single).
  healthFilter: 'all' | ContractHealthStatus;
  onHealthChange: (next: 'all' | ContractHealthStatus) => void;

  // Tipo (single).
  typeFilter: 'all' | 'pmoc' | 'common';
  onTypeChange: (next: 'all' | 'pmoc' | 'common') => void;

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

          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1.5 block">
              Saúde
            </label>
            <Select
              value={healthFilter}
              onValueChange={(v) => onHealthChange(v as typeof healthFilter)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="em_dia">Em dia</SelectItem>
                <SelectItem value="manutencao_pendente">
                  Manutenção Pendente
                </SelectItem>
                <SelectItem value="necessita_atencao">
                  ATENÇÃO
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1.5 block">
              Tipo
            </label>
            <Select
              value={typeFilter}
              onValueChange={(v) => onTypeChange(v as typeof typeFilter)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="pmoc">PMOC</SelectItem>
                <SelectItem value="common">Comum (não-PMOC)</SelectItem>
              </SelectContent>
            </Select>
          </div>
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
