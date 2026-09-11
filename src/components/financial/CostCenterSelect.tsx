import { useMemo, useState } from 'react';
import { SearchableSelect, type SearchableSelectOption } from '@/components/ui/SearchableSelect';
import { useCostCenters, CostCenterInactiveDuplicateError, type CostCenter, type CostCenterInput } from '@/hooks/useCostCenters';
import { filterCostCentersForSelect } from '@/lib/cost-center-filter';
import { CostCenterFormDialog } from './CostCenterFormDialog';
import { useCanManageFinanceSettings } from '@/hooks/useCanManageFinanceSettings';
import { useToast } from '@/hooks/use-toast';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

/** Sentinela do "nenhum centro de custo". Radix proíbe value="" (crasha). */
const NONE = '__none__';

export interface CostCenterSelectProps {
  value: string | null;
  onValueChange: (value: string | null) => void;
  /** Mostra o "+" de criar na hora. Default true, mas só renderiza se o usuário puder criar. */
  allowCreate?: boolean;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function CostCenterSelect({
  value,
  onValueChange,
  allowCreate = true,
  placeholder,
  className,
  disabled,
}: CostCenterSelectProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.finance.costCenters;
  const { toast } = useToast();
  // Mesmo gate do resto do domínio (admin/gestor ou `fn:manage_settings`), agora
  // num hook único pra não divergir das outras telas: sem ele quem só lança
  // clicava no "+" e tomava erro do banco (RLS bloqueia criar centro de custo).
  const canManage = useCanManageFinanceSettings();
  const { costCenters, createCostCenter } = useCostCenters();
  const [createOpen, setCreateOpen] = useState(false);
  const [initialName, setInitialName] = useState('');

  // Só ativos na lista, mas o selecionado NUNCA some — senão o campo aparece
  // vazio ao editar um lançamento antigo cujo centro de custo foi desativado
  // depois. Ver src/lib/cost-center-filter.ts (com teste puro dedicado).
  const visible = useMemo<CostCenter[]>(
    () => filterCostCentersForSelect(costCenters, value),
    [costCenters, value]
  );

  const options: SearchableSelectOption[] = [
    { value: NONE, label: t.none },
    ...visible.map((c) => ({
      value: c.id,
      label: c.name,
      sublabel: c.is_active ? undefined : t.inactiveSuffix,
      icon: (
        <span
          className="inline-block h-2.5 w-2.5 rounded-full shrink-0"
          style={{ backgroundColor: c.color }}
        />
      ),
    })),
  ];

  const handleCreate = (query: string) => {
    setInitialName(query);
    setCreateOpen(true);
  };

  const showCreate = allowCreate && canManage;

  return (
    <>
      <SearchableSelect
        options={options}
        value={value ?? NONE}
        onValueChange={(v) => onValueChange(v === NONE ? null : v)}
        placeholder={placeholder ?? t.fieldPlaceholder}
        searchPlaceholder={t.selectSearchPlaceholder}
        emptyMessage={t.selectEmptyMessage}
        className={className}
        disabled={disabled}
        onCreateOption={showCreate ? handleCreate : undefined}
        createOptionLabel={t.selectCreateWithName}
        createAlwaysLabel={showCreate ? t.selectCreateLabel : undefined}
      />
      {showCreate && (
        <CostCenterFormDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          initialName={initialName}
          isLoading={createCostCenter.isPending}
          onSubmit={async (data: CostCenterInput) => {
            try {
              const created = await createCostCenter.mutateAsync(data);
              onValueChange(created.id);
              setCreateOpen(false);
            } catch (err) {
              // Colisão com um homônimo inativo: sem toast de erro genérico
              // (a mutation já não dispara um). Orienta a reativar na tela de
              // Centros de Custo em vez de tentar de novo aqui.
              if (err instanceof CostCenterInactiveDuplicateError) {
                toast({
                  title: t.selectInactiveDuplicateTitle,
                  description: t.selectInactiveDuplicateDescription,
                });
              }
            }
          }}
        />
      )}
    </>
  );
}
