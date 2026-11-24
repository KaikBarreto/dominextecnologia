import { useEffect, useMemo, useState } from 'react';
import { ClipboardList, LayoutList, ShieldCheck, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface EnvironmentEquipmentNavigatorGroup {
  key: string;
  label: string;
  equipmentIds: string[];
}

interface EnvironmentEquipmentNavigatorProps {
  environments: EnvironmentEquipmentNavigatorGroup[];
  looseGroup?: EnvironmentEquipmentNavigatorGroup | null;
  selectedEnvironmentKey: string | null;
  getEquipmentLabel: (equipmentId: string) => string;
  onSelectOverview: () => void;
  onSelectEnvironment: (environmentKey: string) => void;
  onSelectEquipment: (environmentKey: string, equipmentId: string) => void;
  labels: {
    ariaLabel: string;
    title: string;
    overview: string;
  };
  className?: string;
}

/**
 * Navegação contextual compartilhada pelos fluxos de contrato. No desktop vira
 * uma coluna persistente; no celular, uma faixa horizontal compacta. A escolha
 * de equipamento continua sendo responsabilidade do formulário, que abre o
 * checklist e move o foco visual para o bloco correto.
 */
export function EnvironmentEquipmentNavigator({
  environments,
  looseGroup,
  selectedEnvironmentKey,
  getEquipmentLabel,
  onSelectOverview,
  onSelectEnvironment,
  onSelectEquipment,
  labels,
  className,
}: EnvironmentEquipmentNavigatorProps) {
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string | null>(null);
  const groups = useMemo(
    () => (looseGroup ? [...environments, looseGroup] : environments),
    [environments, looseGroup],
  );
  const selectedGroup = groups.find((group) => group.key === selectedEnvironmentKey) ?? null;

  useEffect(() => {
    if (!selectedGroup?.equipmentIds.includes(selectedEquipmentId ?? '')) {
      setSelectedEquipmentId(null);
    }
  }, [selectedEquipmentId, selectedGroup]);

  const selectOverview = () => {
    setSelectedEquipmentId(null);
    onSelectOverview();
  };

  const selectEnvironment = (key: string) => {
    setSelectedEquipmentId(null);
    onSelectEnvironment(key);
  };

  const selectEquipment = (key: string, equipmentId: string) => {
    setSelectedEquipmentId(equipmentId);
    onSelectEquipment(key, equipmentId);
  };

  return (
    <nav aria-label={labels.ariaLabel} className={cn('min-w-0', className)}>
      <div className="space-y-2 lg:hidden">
        <div className="flex gap-2 overflow-x-auto pb-1">
        <Button
          type="button"
          size="sm"
          variant={selectedEnvironmentKey === null ? 'default' : 'outline'}
          className="h-10 shrink-0 gap-1.5 rounded-xl"
          onClick={selectOverview}
          aria-current={selectedEnvironmentKey === null ? 'page' : undefined}
        >
          <LayoutList className="h-4 w-4" />
          {labels.overview}
        </Button>
        {groups.map((group) => (
          <Button
            key={group.key}
            type="button"
            size="sm"
            variant={selectedEnvironmentKey === group.key ? 'default' : 'outline'}
            className="h-10 shrink-0 gap-1.5 rounded-xl"
            onClick={() => selectEnvironment(group.key)}
            aria-current={selectedEnvironmentKey === group.key ? 'page' : undefined}
          >
            {group.key === looseGroup?.key ? <Wrench className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
            <span className="max-w-44 truncate">{group.label}</span>
            <Badge variant="secondary" className="h-5 min-w-5 px-1.5 text-[10px]">
              {group.equipmentIds.length}
            </Badge>
          </Button>
        ))}
        </div>

        {selectedGroup && selectedGroup.equipmentIds.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-2" aria-label={selectedGroup.label}>
            {selectedGroup.equipmentIds.map((equipmentId) => (
              <Button
                key={equipmentId}
                type="button"
                size="sm"
                variant={selectedEquipmentId === equipmentId ? 'default' : 'outline'}
                className="h-9 max-w-64 shrink-0 gap-1.5 rounded-xl text-xs"
                onClick={() => selectEquipment(selectedGroup.key, equipmentId)}
                aria-current={selectedEquipmentId === equipmentId ? 'page' : undefined}
              >
                <ClipboardList className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{getEquipmentLabel(equipmentId)}</span>
              </Button>
            ))}
          </div>
        )}
      </div>

      <div className="sticky top-4 hidden max-h-[calc(100vh-11rem)] overflow-y-auto border-r pr-4 lg:block">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {labels.title}
        </p>
        <button
          type="button"
          onClick={selectOverview}
          className={cn(
            'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors',
            selectedEnvironmentKey === null ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
          )}
        >
          <LayoutList className="h-4 w-4 shrink-0" />
          {labels.overview}
        </button>

        <div className="mt-2 space-y-2">
          {groups.map((group) => {
            const active = selectedEnvironmentKey === group.key;
            return (
              <div key={group.key} className="space-y-1">
                <button
                  type="button"
                  onClick={() => selectEnvironment(group.key)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
                    active ? 'bg-muted font-semibold text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                  )}
                >
                  {group.key === looseGroup?.key ? <Wrench className="h-4 w-4 shrink-0" /> : <ShieldCheck className="h-4 w-4 shrink-0" />}
                  <span className="min-w-0 flex-1 truncate">{group.label}</span>
                  <span className="text-xs tabular-nums">{group.equipmentIds.length}</span>
                </button>

                {group.equipmentIds.length > 0 && (
                  <div className="ml-3 border-l pl-2">
                    {group.equipmentIds.map((equipmentId) => (
                      <button
                        key={equipmentId}
                        type="button"
                        onClick={() => selectEquipment(group.key, equipmentId)}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                          active && selectedEquipmentId === equipmentId
                            ? 'bg-primary/10 font-semibold text-primary'
                            : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                        )}
                      >
                        <ClipboardList className="h-3.5 w-3.5 shrink-0" />
                        <span className="min-w-0 truncate">{getEquipmentLabel(equipmentId)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
