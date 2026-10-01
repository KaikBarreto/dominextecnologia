// ─────────────────────────────────────────────────────────────────────────────
// ProcessNode — UM componente, 7 variantes visuais por `data.shape`.
//
// Molde estrutural: `orgchart/OrgChartNode.tsx` (handles nos 4 lados, seleção).
// Diferente do organograma, não há botão "+" de adição conectada aqui (não
// listado nos requisitos da seção 4 do briefing) — a conexão nasce do arrasto
// normal de handle, como o próprio React Flow já oferece.
//
// Exporta `ProcessStepNode` (não `ProcessNode` — esse nome já é o tipo de dado
// do grafo em `@/lib/flowchart/types`; usar outro nome evita qualquer
// ambiguidade de import entre tipo e componente em `ProcessCanvas.tsx`).
// ─────────────────────────────────────────────────────────────────────────────

import { memo, createContext, useContext } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Layers, StickyNote } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { SignedAvatarImage } from '@/components/ui/SignedAvatarImage';
import { cn } from '@/lib/utils';
import { idealForeground } from '@/lib/colorContrast';
import { getShapeSpec } from '@/lib/flowchart/shapes';
import type { ProcessNodeData } from '@/lib/flowchart/types';
import type { Employee } from '@/hooks/useEmployees';
import { resolveProcessIcon, SHAPE_ACCENT } from './processIcons';

// Funcionários vivos: o nó resolve nome/foto por `responsibleEmployeeId` NO
// RENDER (sempre atualizado). `responsibleLabel` é o fallback em texto livre.
const EmployeesContext = createContext<Record<string, Employee>>({});
export const ProcessEmployeesProvider = EmployeesContext.Provider;

/** Selo saturado do ícone. Nunca círculo DESSATURADO atrás do ícone — a régua
 *  do CEO é cor cheia com o ícone em branco por cima. */
function IconBadge({ icon: Icon, accent, size = 'md' }: { icon: typeof Layers; accent: string; size?: 'sm' | 'md' }) {
  const box = size === 'sm' ? 'h-6 w-6 rounded-md' : 'h-7 w-7 rounded-lg';
  const glyph = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';
  return (
    <span
      className={cn('flex shrink-0 items-center justify-center shadow-sm', box)}
      style={{ backgroundColor: accent, color: idealForeground(accent) }}
    >
      <Icon className={glyph} strokeWidth={2.4} />
    </span>
  );
}

function getInitials(name: string) {
  return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
}

// Config dos 4 lados — mesma convenção de id do organograma (`${dir}-source` /
// `${dir}-target`), reaproveitando a classe CSS `.org-handle` já definida em
// `src/index.css` (bolinha discreta em repouso, realça no hover do `.group`).
const SIDES: { dir: string; pos: Position }[] = [
  { dir: 'top', pos: Position.Top },
  { dir: 'right', pos: Position.Right },
  { dir: 'bottom', pos: Position.Bottom },
  { dir: 'left', pos: Position.Left },
];

interface ResponsibleChipProps {
  employeeId?: string;
  label?: string;
}

function ResponsibleChip({ employeeId, label }: ResponsibleChipProps) {
  const employees = useContext(EmployeesContext);
  const emp = employeeId ? employees[employeeId] : undefined;
  const name = emp?.name ?? label;
  if (!name) return null;
  return (
    <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
      <Avatar className="h-4 w-4 shrink-0">
        {emp && <SignedAvatarImage src={emp.photo_url} alt={name} />}
        <AvatarFallback className="bg-muted text-[8px] font-semibold text-muted-foreground">
          {getInitials(name)}
        </AvatarFallback>
      </Avatar>
      <span className="min-w-0 truncate text-[10px] text-muted-foreground">{name}</span>
    </div>
  );
}

function ProcessStepNodeInner({ data, selected }: NodeProps) {
  const d = data as ProcessNodeData;
  const spec = getShapeSpec(d.shape);
  const Icon = resolveProcessIcon(d.shape, d.icon);
  // Acento = cor escolhida na etapa, senão a cor canônica da forma. É o que dá
  // ritmo visual e deixa a forma reconhecível de longe, sem ler o rótulo.
  const accent = d.color || SHAPE_ACCENT[d.shape];
  const showResponsible =
    d.shape !== 'note' && d.shape !== 'start' && d.shape !== 'end' &&
    !!(d.responsibleEmployeeId || d.responsibleLabel);

  const handles = (spec.acceptsIncoming || spec.acceptsOutgoing) && (
    <>
      {SIDES.map(({ dir, pos }) => (
        <div key={dir}>
          {spec.acceptsIncoming && (
            <Handle id={`${dir}-target`} type="target" position={pos} className="org-handle" />
          )}
          {spec.acceptsOutgoing && (
            <Handle id={`${dir}-source`} type="source" position={pos} className="org-handle" />
          )}
        </div>
      ))}
    </>
  );

  // ── Anotação: só texto, borda esquerda grossa, sem handle ──────────────────
  if (d.shape === 'note') {
    return (
      <div
        className={cn(
          'group relative flex gap-2.5 rounded-xl border-l-4 border-amber-400 bg-amber-50 px-3 py-3 shadow-sm dark:bg-amber-950/40',
          selected && 'ring-2 ring-primary',
        )}
        style={{ width: spec.size.width, height: spec.size.height }}
      >
        <IconBadge icon={StickyNote} accent="#D97706" size="sm" />
        <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-[12px] font-medium leading-snug text-amber-900 dark:text-amber-50">
          {d.label || ''}
        </p>
      </div>
    );
  }

  // ── Início / Fim: pill saturado (ação verde/vermelho padronizada) ──────────
  if (d.shape === 'start' || d.shape === 'end') {
    const tone = d.shape === 'start' ? 'bg-success text-success-foreground' : 'bg-destructive text-destructive-foreground';
    return (
      <div
        className={cn(
          'group relative flex items-center justify-center gap-1.5 rounded-full px-4 py-2 shadow-sm transition-shadow',
          tone,
          selected ? 'ring-2 ring-primary ring-offset-2' : 'hover:shadow-md',
        )}
        style={{ width: spec.size.width, height: spec.size.height }}
      >
        {handles}
        <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={2.6} />
        <span className="line-clamp-2 min-w-0 break-words text-center text-[15px] font-bold tracking-tight leading-tight">
          {d.label || ''}
        </span>
      </div>
    );
  }

  const bg = d.color;
  const fg = bg ? idealForeground(bg) : undefined;

  // ── Decisão: losango (quadrado interno rotacionado 45°) ────────────────────
  if (d.shape === 'decision') {
    return (
      <div
        className={cn('group relative', selected && 'z-10')}
        style={{ width: spec.size.width, height: spec.size.height }}
      >
        {handles}
        <div
          className={cn(
            'absolute rounded-sm border shadow-sm transition-shadow',
            !bg && 'bg-card',
            selected ? 'ring-2 ring-primary' : 'hover:shadow-md',
          )}
          style={{ inset: '14.6%', transform: 'rotate(45deg)', backgroundColor: bg }}
        />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-8 py-8 text-center">
          <IconBadge icon={Icon} accent={accent} size="sm" />
          <span
            className="line-clamp-3 min-w-0 break-words text-[12.5px] font-bold leading-tight"
            style={{ color: fg }}
          >
            {d.label || ''}
          </span>
        </div>
      </div>
    );
  }

  // ── Documento: retângulo com base ondulada (SVG) ────────────────────────────
  if (d.shape === 'document') {
    return (
      <div
        className={cn('group relative', selected && 'z-10')}
        style={{ width: spec.size.width, height: spec.size.height }}
      >
        {handles}
        <svg
          className={cn('absolute inset-0 drop-shadow-sm', selected && 'drop-shadow')}
          viewBox="0 0 240 112"
          preserveAspectRatio="none"
          width="100%"
          height="100%"
        >
          <path
            d="M0,0 L240,0 L240,92 C200,110 160,74 120,92 C80,110 40,74 0,92 Z"
            fill={bg ?? 'hsl(var(--card))'}
            stroke={selected ? 'hsl(var(--primary))' : 'hsl(var(--border))'}
            strokeWidth={selected ? 2 : 1}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-4 pb-5 text-center">
          <IconBadge icon={Icon} accent={accent} size="sm" />
          <span
            className="line-clamp-2 min-w-0 break-words text-[13px] font-bold leading-tight"
            style={{ color: fg }}
          >
            {d.label || ''}
          </span>
        </div>
      </div>
    );
  }

  // ── Atraso: pill com relógio + duração ──────────────────────────────────────
  if (d.shape === 'delay') {
    return (
      <div
        className={cn(
          'group relative flex flex-col items-center justify-center gap-0.5 rounded-full border px-4 py-2 shadow-sm transition-shadow',
          !bg && 'bg-card',
          selected ? 'ring-2 ring-primary' : 'hover:shadow-md',
        )}
        style={{ width: spec.size.width, height: spec.size.height, backgroundColor: bg, color: fg }}
      >
        {handles}
        <div className="flex min-w-0 items-center gap-2">
          <IconBadge icon={Icon} accent={accent} size="sm" />
          <span className="min-w-0 truncate text-[13px] font-bold leading-tight">{d.label || ''}</span>
        </div>
        {d.duration && (
          <span
            className="mt-0.5 truncate rounded-full px-2 py-0.5 text-[11px] font-bold"
            style={{ backgroundColor: accent, color: idealForeground(accent) }}
          >
            {d.duration}
          </span>
        )}
      </div>
    );
  }

  // ── Tarefa / Subprocesso: retângulo com barra de acento à esquerda ─────────
  //
  // A barra colorida substitui o antigo "preencher o card inteiro de cor": dá o
  // mesmo reconhecimento de longe sem obrigar o texto a brigar por contraste.
  // Quando o usuário ESCOLHE uma cor, o card é preenchido (comportamento que
  // ele já esperava) e o texto deriva do contraste ideal.
  return (
    <div
      className={cn(
        'group relative flex flex-col gap-1.5 overflow-hidden rounded-xl border py-2.5 pl-3.5 pr-3 shadow-sm transition-shadow',
        !bg && 'bg-card',
        selected ? 'ring-2 ring-primary' : 'hover:shadow-md',
      )}
      style={{ width: spec.size.width, height: spec.size.height, backgroundColor: bg, color: fg }}
    >
      {handles}
      {/* Barra de acento — só quando o card NÃO está preenchido de cor. */}
      {!bg && (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-1.5"
          style={{ backgroundColor: accent }}
        />
      )}

      <div className="flex min-w-0 items-start gap-2">
        <IconBadge icon={Icon} accent={accent} size="sm" />
        <span className="line-clamp-2 min-w-0 flex-1 break-words text-[13px] font-bold leading-snug tracking-tight">
          {d.label || ''}
        </span>
      </div>

      {d.description && (
        <p className="line-clamp-2 min-w-0 break-words text-[11px] leading-snug opacity-70">
          {d.description}
        </p>
      )}

      {showResponsible && (
        <div className="mt-auto">
          <ResponsibleChip employeeId={d.responsibleEmployeeId} label={d.responsibleLabel} />
        </div>
      )}

      {/* Subprocesso: selo de camadas na borda, indicando que abre outro processo. */}
      {d.shape === 'subprocess' && (
        <span className="absolute -bottom-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground shadow-sm">
          <Layers className="h-3 w-3" strokeWidth={2.6} />
        </span>
      )}
    </div>
  );
}

export const ProcessStepNode = memo(ProcessStepNodeInner);
