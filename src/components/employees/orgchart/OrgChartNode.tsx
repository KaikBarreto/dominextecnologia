import { memo, createContext, useContext } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { SignedAvatarImage } from '@/components/ui/SignedAvatarImage';
import { cn } from '@/lib/utils';
import { idealForeground } from '@/lib/colorContrast';
import type { Employee } from '@/hooks/useEmployees';
import type { OrgNodeData } from '@/hooks/useOrgCharts';

// Contexto com os funcionários vivos: o nó de tipo 'employee' resolve
// nome/cargo/foto por employeeId NO RENDER (fica sempre atualizado). Guardamos
// snapshot de nome/cargo no data como fallback se o funcionário for removido.
const EmployeesContext = createContext<Record<string, Employee>>({});
export const OrgEmployeesProvider = EmployeesContext.Provider;

function getInitials(name: string) {
  return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
}

export const ORG_NODE_TYPE = 'orgNode';

function OrgChartNodeInner({ data, selected }: NodeProps) {
  const employees = useContext(EmployeesContext);
  const d = data as OrgNodeData;

  // Resolve dados vivos do funcionário; cai no snapshot se removido/manual.
  const emp = d.kind === 'employee' && d.employeeId ? employees[d.employeeId] : undefined;
  const name = emp?.name ?? d.name ?? '';
  const role = emp?.position ?? d.role ?? '';
  const photoUrl = emp?.photo_url ?? null;
  const removed = d.kind === 'employee' && !!d.employeeId && !emp;

  const sectorColor = d.sectorColor;
  const sectorFg = sectorColor ? idealForeground(sectorColor) : undefined;

  return (
    <div
      className={cn(
        'relative w-[220px] rounded-xl border bg-card shadow-sm transition-shadow',
        selected ? 'ring-2 ring-primary shadow-md' : 'hover:shadow-md',
      )}
    >
      {/* Handle de destino (topo) — recebe conexão do superior hierárquico. */}
      <Handle type="target" position={Position.Top} className="!h-2.5 !w-2.5 !bg-primary !border-background" />

      {/* Barra/etiqueta do setor no topo do card. */}
      {(d.sector || sectorColor) && (
        <div
          className="flex items-center gap-1.5 rounded-t-xl px-3 py-1 text-[11px] font-medium"
          style={
            sectorColor
              ? { backgroundColor: sectorColor, color: sectorFg }
              : { backgroundColor: 'hsl(var(--muted))' }
          }
        >
          <span className="truncate">{d.sector || ''}</span>
        </div>
      )}

      <div className="flex items-center gap-3 p-3">
        <Avatar className="h-11 w-11 shrink-0">
          {d.kind === 'employee' && <SignedAvatarImage src={photoUrl} alt={name} />}
          <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
            {name ? getInitials(name) : '?'}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className={cn('truncate text-sm font-semibold leading-tight', removed && 'text-muted-foreground line-through')}>
            {name || '—'}
          </p>
          {role && <p className="truncate text-xs text-muted-foreground leading-tight mt-0.5">{role}</p>}
        </div>
      </div>

      {/* Handle de origem (base) — arrasta daqui pro topo de um subordinado. */}
      <Handle type="source" position={Position.Bottom} className="!h-2.5 !w-2.5 !bg-primary !border-background" />
    </div>
  );
}

export const OrgChartNode = memo(OrgChartNodeInner);
