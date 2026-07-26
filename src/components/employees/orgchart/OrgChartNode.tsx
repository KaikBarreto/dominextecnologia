import { memo, createContext, useContext } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Plus } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { SignedAvatarImage } from '@/components/ui/SignedAvatarImage';
import { cn } from '@/lib/utils';
import { idealForeground } from '@/lib/colorContrast';
import { FACTOR_COLOR, resolveProfile } from '@/lib/disc/profiles';
import { useDiscMessages } from '@/components/employees/disc/useDiscMessages';
import type { Employee } from '@/hooks/useEmployees';
import type { OrgNodeData } from '@/hooks/useOrgCharts';

// Contexto com os funcionários vivos: o nó de tipo 'employee' resolve
// nome/cargo/foto por employeeId NO RENDER (fica sempre atualizado). Guardamos
// snapshot de nome/cargo no data como fallback se o funcionário for removido.
const EmployeesContext = createContext<Record<string, Employee>>({});
export const OrgEmployeesProvider = EmployeesContext.Provider;

// Contexto paralelo com o CÓDIGO do perfil DISC concluído por funcionário
// (employeeId → profile_code, ex.: 'CI'). Fica FORA do data do nó (que é
// serializado no banco) — é dado vivo, resolvido no render. Undefined = sem
// perfil concluído → o nó não mostra badge.
const DiscProfilesContext = createContext<Record<string, string>>({});
export const OrgDiscProvider = DiscProfilesContext.Provider;

// Badge compacto do perfil DISC pro nó do organograma: código do par saturado na
// cor do fator primário + nome curto (branco). Truncável pra não estourar o card.
function NodeDiscBadge({ code }: { code: string }) {
  const { t: discT } = useDiscMessages();
  const meta = resolveProfile(code);
  const color = FACTOR_COLOR[meta.primary];
  const name =
    (discT.profiles as Record<string, { nome: string }>)[meta.code]?.nome ?? meta.code;
  return (
    <span
      className="mt-1 inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold leading-none text-white"
      style={{ backgroundColor: color }}
      title={`${code} · ${name}`}
    >
      <span className="font-black tracking-wide">{code}</span>
      <span className="truncate font-semibold opacity-90">{name}</span>
    </span>
  );
}

// Direção do "+" de adição rápida relativo ao nó de origem.
export type QuickAddDirection = 'top' | 'bottom' | 'left' | 'right';

// Contexto que injeta o callback de adição rápida + flag de desktop. Fica FORA
// do data do nó (que é serializado no banco) pra não vazar função na persistência.
interface QuickAddCtx {
  onQuickAdd?: (nodeId: string, dir: QuickAddDirection) => void;
  enabled: boolean;
  addLabel: string;
}
const QuickAddContext = createContext<QuickAddCtx>({ enabled: false, addLabel: 'Adicionar' });
export const OrgQuickAddProvider = QuickAddContext.Provider;

function getInitials(name: string) {
  return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
}

export const ORG_NODE_TYPE = 'orgNode';

function OrgChartNodeInner({ id, data, selected }: NodeProps) {
  const employees = useContext(EmployeesContext);
  const discProfiles = useContext(DiscProfilesContext);
  const quickAdd = useContext(QuickAddContext);
  const d = data as OrgNodeData;

  // Resolve dados vivos do funcionário; cai no snapshot se removido/manual.
  const emp = d.kind === 'employee' && d.employeeId ? employees[d.employeeId] : undefined;
  const name = emp?.name ?? d.name ?? '';
  const role = emp?.position ?? d.role ?? '';
  const photoUrl = emp?.photo_url ?? null;
  const removed = d.kind === 'employee' && !!d.employeeId && !emp;

  // Perfil DISC concluído (só nó de funcionário). Undefined → não mostra badge.
  const discCode =
    d.kind === 'employee' && d.employeeId ? discProfiles[d.employeeId] : undefined;

  const sectorColor = d.sectorColor;
  const sectorFg = sectorColor ? idealForeground(sectorColor) : undefined;

  const showQuickAdd = quickAdd.enabled && !!quickAdd.onQuickAdd;

  // Config dos 4 lados: posição do React Flow + classes de posicionamento do
  // handle (bolinha) e do "+" de quick-add. O "+" fica AFASTADO da borda pra não
  // brigar com o arraste do handle (que vive colado na borda).
  // O React Flow já centraliza o handle no lado indicado por `position` (via seu
  // próprio CSS). Não sobrescrevemos a posição do handle aqui — só o "+" recebe
  // classes de posicionamento (afastado da borda pra não brigar com o arraste).
  const SIDES = [
    { dir: 'top' as const, pos: Position.Top, plusCls: 'left-1/2 -top-7 -translate-x-1/2' },
    { dir: 'bottom' as const, pos: Position.Bottom, plusCls: 'left-1/2 -bottom-7 -translate-x-1/2' },
    { dir: 'left' as const, pos: Position.Left, plusCls: 'top-1/2 -left-7 -translate-y-1/2' },
    { dir: 'right' as const, pos: Position.Right, plusCls: 'top-1/2 -right-7 -translate-y-1/2' },
  ];

  return (
    <div
      className={cn(
        'group relative w-[220px] rounded-xl border bg-card shadow-sm transition-shadow',
        selected ? 'ring-2 ring-primary shadow-md' : 'hover:shadow-md',
      )}
    >
      {/* Handles de conexão manual nos 4 lados. Cada lado tem um par sobreposto:
          um `target` (embaixo) e um `source` (em cima) com o MESMO ponto de
          ancoragem — assim consigo tanto PUXAR um fio a partir do lado (source)
          quanto SOLTAR um fio nele (target). Os ids `<dir>-source` / `<dir>-target`
          entram no sourceHandle/targetHandle da aresta e são persistidos.
          Estilo `org-handle`: bolinha discreta em repouso, realça no hover do nó. */}
      {SIDES.map(({ dir, pos }) => (
        <div key={dir}>
          <Handle id={`${dir}-target`} type="target" position={pos} className="org-handle" />
          <Handle id={`${dir}-source`} type="source" position={pos} className="org-handle" />
        </div>
      ))}

      {/* "+" nos 4 lados (desktop, no hover): adiciona um nó JÁ CONECTADO naquela
          direção. Fica afastado da borda (não sobre o handle) pra não conflitar
          com o arraste de conexão. `nodrag`/`nopan` + stopPropagation garantem
          que o clique não inicie arrasto do nó. */}
      {showQuickAdd && (
        <>
          {SIDES.map(({ dir, plusCls }) => (
            <button
              key={dir}
              type="button"
              aria-label={quickAdd.addLabel}
              title={quickAdd.addLabel}
              className={cn(
                'nodrag nopan absolute z-30 flex h-5 w-5 items-center justify-center rounded-full',
                'bg-primary text-primary-foreground shadow-md ring-2 ring-background',
                'opacity-0 transition-opacity duration-150 group-hover:opacity-100',
                'hover:scale-110',
                plusCls,
              )}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                quickAdd.onQuickAdd?.(id, dir);
              }}
            >
              <Plus className="h-3 w-3" />
            </button>
          ))}
        </>
      )}

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
        <div className="flex min-w-0 flex-1 flex-col items-start">
          <p className={cn('w-full truncate text-sm font-semibold leading-tight', removed && 'text-muted-foreground line-through')}>
            {name || '—'}
          </p>
          {role && <p className="w-full truncate text-xs text-muted-foreground leading-tight mt-0.5">{role}</p>}
          {discCode && <NodeDiscBadge code={discCode} />}
        </div>
      </div>
    </div>
  );
}

export const OrgChartNode = memo(OrgChartNodeInner);
