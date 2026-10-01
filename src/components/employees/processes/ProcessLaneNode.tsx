// ─────────────────────────────────────────────────────────────────────────────
// ProcessLaneNode — raia (swimlane): faixa horizontal que diz QUEM é
// responsável pelo trecho. É nó-PAI do React Flow.
//
// ⚠️ CAMINHO SEGUIDO: nó-pai nativo do React Flow (`parentId` + `extent:
// 'parent'`), plano A do briefing — NÃO o plano B (raia decorativa +
// `data.laneId`).
//
// EVIDÊNCIA (sem ferramenta de QA de navegador disponível nesta sessão — este
// agente só tem Read/Edit/Write/Bash, sem Chrome DevTools/Playwright — não foi
// possível arrastar um nó ao vivo e confirmar visualmente):
//   - Lido o bundle de `@xyflow/react@12.11.2` (node_modules): tanto o resize
//     de nó-pai (`NodeResizer`/`XYResizer`) quanto a mudança de posição de um
//     filho (`extent: 'parent'`) passam pelo MESMO pipeline de
//     `triggerNodeChanges` → `onNodesChange` que já está PROVADO funcionando
//     no organograma (arrastar um card já funciona lá, hoje, em produção).
//   - Esse pipeline é inteiramente dos "node changes" (posição/dimensão),
//     resolvido por `nodeLookup`/`parentLookup` — é um caminho de código
//     DIFERENTE do bug documentado em `centerViewport.ts` (que é só sobre o
//     TRANSFORM DE VIEWPORT via d3-zoom: `fitView`/`setViewport`/`setCenter`).
//     Nada no mecanismo de parentesco de nó usa viewport.
//   - O próprio React Flow tem uma feature de "auto-expandir o pai quando o
//     filho se aproxima da borda" (`handleExpandParent`, disparada tanto no
//     arrasto comum quanto no resize) — evidência de que o motor trata
//     parentId/extent como um caminho de 1ª classe, não um extra frágil.
// Decisão: seguir o plano A. Se QA ao vivo (CDP/navegador) revelar arrasto
// pra dentro da raia inconsistente, o plano B (raia decorativa + `laneId` no
// `data` da etapa, sem `parentId`/`extent`) é a saída — a store de dados
// (`ProcessNodeData.laneId`) já existe pronta pra essa migração.
// ─────────────────────────────────────────────────────────────────────────────

import { memo, createContext, useContext, useRef, useState, useEffect } from 'react';
import { NodeResizer, type NodeProps } from '@xyflow/react';
import { idealForeground } from '@/lib/colorContrast';
import { cn } from '@/lib/utils';
import type { ProcessLaneData } from '@/lib/flowchart/types';

const DEFAULT_LANE_COLOR = '#64748b';
const MIN_LANE_WIDTH = 320;
const MIN_LANE_HEIGHT = 140;

// Callback de rename + placeholder ficam FORA do `data` do nó (que é
// serializado no banco) — mesmo padrão do `OrgQuickAddProvider` no
// organograma: dado vivo entra por contexto, não vaza função na persistência.
interface LaneConfigCtx {
  namePlaceholder: string;
  onRename: (laneId: string, name: string) => void;
}
const LaneConfigContext = createContext<LaneConfigCtx>({
  namePlaceholder: '',
  onRename: () => {/* sem provider acima: no-op */},
});
export const ProcessLaneConfigProvider = LaneConfigContext.Provider;

function ProcessLaneNodeInner({ id, data, selected, width, height }: NodeProps) {
  const d = data as ProcessLaneData;
  const { namePlaceholder, onRename } = useContext(LaneConfigContext);
  const color = d.color || DEFAULT_LANE_COLOR;
  const fg = idealForeground(color);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(d.label ?? '');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editing) setDraft(d.label ?? '');
  }, [d.label, editing]);

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== d.label) onRename(id, next);
  };

  // `width`/`height` do NodeProps podem vir undefined no 1º frame — o
  // fallback cobre isso até o React Flow medir o nó.
  const w = width ?? 480;
  const h = height ?? 160;

  return (
    <div
      className={cn(
        'relative h-full w-full rounded-xl border-2 border-dashed bg-card/40 shadow-sm',
        selected && 'border-solid ring-2 ring-primary',
      )}
      style={{ width: w, height: h, borderColor: selected ? undefined : `${color}66` }}
    >
      {/* Redimensionar — só visível quando a raia está selecionada. */}
      <NodeResizer
        nodeId={id}
        isVisible={!!selected}
        minWidth={MIN_LANE_WIDTH}
        minHeight={MIN_LANE_HEIGHT}
        color={color}
        handleClassName="!h-3 !w-3 !rounded-full !border-2"
      />

      {/* Cabeçalho vertical à esquerda — nome editável + cor da raia.
          `nodrag` impede que o clique no nome inicie o arrasto da raia. */}
      <div
        className="absolute inset-y-0 left-0 flex w-10 flex-col items-center justify-center gap-2 rounded-l-xl py-3"
        style={{ backgroundColor: color, color: fg }}
      >
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
              else if (e.key === 'Escape') { e.preventDefault(); setEditing(false); setDraft(d.label ?? ''); }
            }}
            placeholder={namePlaceholder}
            autoFocus
            className="nodrag nopan w-48 -rotate-90 rounded bg-black/10 px-1.5 py-0.5 text-center text-xs font-semibold outline-none ring-1 ring-white/40 placeholder:opacity-70"
            style={{ color: fg }}
          />
        ) : (
          <button
            type="button"
            className="nodrag nopan w-48 -rotate-90 truncate rounded px-1.5 py-0.5 text-center text-xs font-semibold transition-colors hover:bg-black/10"
            style={{ color: fg }}
            onClick={() => { setEditing(true); requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.select(); }); }}
            title={d.label || namePlaceholder}
          >
            {d.label || namePlaceholder || ''}
          </button>
        )}
      </div>
    </div>
  );
}

export const ProcessLaneNode = memo(ProcessLaneNodeInner);
