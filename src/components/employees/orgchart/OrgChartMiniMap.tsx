import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  getNodesBounds,
  type Node,
  type Edge,
  type NodeTypes,
} from '@xyflow/react';
import type { OrgNodeData } from '@/hooks/useOrgCharts';

type RFNode = Node<OrgNodeData>;

// Cor da marca Dominex — usada no retângulo de viewport do minimapa.
const BRAND = '#00C597';

// Padding interno (px) ao redor do grafo dentro da caixa do mini.
const PAD = 12;

export interface OrgChartMiniMapProps {
  /** Mesmos nós do canvas principal (referência estável quando possível). */
  nodes: RFNode[];
  /** Mesmas arestas exibidas no canvas principal (displayEdges). */
  edges: Edge[];
  /** MESMO objeto nodeTypes do principal — dá a fidelidade "mesmo card". */
  nodeTypes: NodeTypes;
  isDark: boolean;
  /** Transform atual do canvas PRINCIPAL. */
  mainViewport: { x: number; y: number; zoom: number };
  /** Tamanho do container do canvas PRINCIPAL (px). */
  mainSize: { width: number; height: number };
  /**
   * Chamado ao clicar/arrastar no minimapa com o ponto de destino em coords de
   * FLOW. O Canvas centraliza nesse ponto via arrasto sintético (centerOnFlowPoint).
   */
  onNavigate: (flowX: number, flowY: number) => void;
}

// Computa o transform "fit-all" para o mini a partir dos nós e do tamanho da caixa.
// Retorna null quando não há nós ou a caixa é zero (evita divisão por zero).
function computeFit(
  nodes: RFNode[],
  boxW: number,
  boxH: number,
): { x: number; y: number; zoom: number } | null {
  if (!nodes.length || boxW <= 0 || boxH <= 0) return null;

  const bounds = getNodesBounds(nodes);
  if (bounds.width <= 0 || bounds.height <= 0) return null;

  const zoom = Math.min(
    (boxW - PAD * 2) / bounds.width,
    (boxH - PAD * 2) / bounds.height,
  );

  // Centraliza o grafo na caixa.
  const tx = PAD - bounds.x * zoom + ((boxW - PAD * 2) - bounds.width * zoom) / 2;
  const ty = PAD - bounds.y * zoom + ((boxH - PAD * 2) - bounds.height * zoom) / 2;

  return { x: tx, y: ty, zoom };
}

export function OrgChartMiniMap({
  nodes,
  edges,
  nodeTypes,
  isDark,
  mainViewport,
  mainSize,
  onNavigate,
}: OrgChartMiniMapProps) {
  // Ref para o wrapper da caixa do mini (mede tamanho real).
  const boxRef = useRef<HTMLDivElement | null>(null);

  // Tamanho real da caixa medido via ResizeObserver.
  const [boxSize, setBoxSize] = useState({ w: 0, h: 0 });

  // Instala ResizeObserver para medir a caixa do mini.
  // useLayoutEffect para medir antes do paint.
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      const e = entries[0];
      if (!e) return;
      const { width, height } = e.contentRect;
      setBoxSize({ w: width, h: height });
    });
    ro.observe(el);

    // Medição inicial síncrona.
    const rect = el.getBoundingClientRect();
    setBoxSize({ w: rect.width, h: rect.height });

    return () => ro.disconnect();
  }, []);

  // Signature estável: muda quando a topologia OU as posições dos nós mudam.
  const nodesSignature = useMemo(
    () =>
      `${nodes.length}|${nodes
        .map((n) => `${n.id}:${Math.round(n.position.x)},${Math.round(n.position.y)}`)
        .join(';')}`,
    [nodes],
  );

  // Fit computado — fonte de verdade do transform do mini.
  // É recalculado quando os nós ou o tamanho da caixa mudam.
  const fit = useMemo(
    () => computeFit(nodes, boxSize.w, boxSize.h),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nodesSignature, boxSize.w, boxSize.h],
  );

  // Ref que persiste o fit atual para ser lido de forma síncrona nos handlers de
  // ponteiro (sem recapturar o valor via closure defasada).
  const fitRef = useRef(fit);
  fitRef.current = fit;

  // Aplica o transform diretamente no .react-flow__viewport do mini via DOM.
  // O ReactFlow interno não sobrescreve transforms manuais num flow não-interativo
  // (panOnDrag=false, zoom*=false), então o transform "gruda".
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box || !fit) return;

    // Aguarda 2 frames para que o ReactFlow interno monte os nós no DOM antes de
    // aplicar o transform (mesmo padrão do MiniFitter anterior com duplo rAF).
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        const vp = box.querySelector<HTMLElement>('.react-flow__viewport');
        if (!vp) return;
        vp.style.transform = `translate(${fit.x}px, ${fit.y}px) scale(${fit.zoom})`;
        vp.style.transformOrigin = '0 0';
      });
    });

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [fit]);

  // Converte um ponto de clique (relativo à caixa) para coords de FLOW usando o
  // fit computado, e dispara a navegação no Canvas.
  const navigateFromPoint = (clientX: number, clientY: number) => {
    const box = boxRef.current;
    if (!box) return;
    const currentFit = fitRef.current;
    if (!currentFit || !currentFit.zoom) return;

    const rect = box.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const clickY = clientY - rect.top;

    // Inverso do transform: (pixelMini - translate) / zoom = coordFlow
    const flowX = (clickX - currentFit.x) / currentFit.zoom;
    const flowY = (clickY - currentFit.y) / currentFit.zoom;
    onNavigate(flowX, flowY);
  };

  const dragging = useRef(false);

  return (
    <div
      ref={boxRef}
      className="absolute bottom-3 right-3 z-20 h-40 w-56 overflow-hidden rounded-lg border bg-card/95 shadow-lg ring-1 ring-border"
    >
      <ReactFlowProvider>
        {/* Wrapper interno não-interativo: cards em miniatura, sem eventos. */}
        <div className="pointer-events-none absolute inset-0">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            colorMode={isDark ? 'dark' : 'light'}
            defaultViewport={{ x: 0, y: 0, zoom: 1 }}
            minZoom={0.001}
            maxZoom={4}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            panOnDrag={false}
            panOnScroll={false}
            zoomOnScroll={false}
            zoomOnPinch={false}
            zoomOnDoubleClick={false}
            preventScrolling={false}
            proOptions={{ hideAttribution: true }}
          />
        </div>
      </ReactFlowProvider>

      {/* Retângulo do viewport principal desenhado sobre o mini.
          Usa o fit computado (não useViewport, que retorna o transform travado). */}
      <ViewportRect
        mainViewport={mainViewport}
        mainSize={mainSize}
        fit={fit}
      />

      {/* Overlay de navegação: captura pointer ACIMA do mini flow. Clicar/arrastar
          centraliza o canvas principal no ponto correspondente. */}
      <div
        className="absolute inset-0 z-20 cursor-pointer"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          dragging.current = true;
          navigateFromPoint(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (!dragging.current) return;
          navigateFromPoint(e.clientX, e.clientY);
        }}
        onPointerUp={(e) => {
          dragging.current = false;
          e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onPointerCancel={() => {
          dragging.current = false;
        }}
      />
    </div>
  );
}

// ── Retângulo do viewport principal desenhado sobre o mini ─────────────────────
// Mapeia a área visível do canvas PRINCIPAL (em coords de flow) para pixels da
// caixa do minimapa, usando o fit COMPUTADO (não useViewport, que trava em 0,0,1).
function ViewportRect({
  mainViewport,
  mainSize,
  fit,
}: {
  mainViewport: { x: number; y: number; zoom: number };
  mainSize: { width: number; height: number };
  fit: { x: number; y: number; zoom: number } | null;
}) {
  if (!fit || !fit.zoom) return null;

  const { x: fx, y: fy, zoom: fz } = fit;
  const mz = mainViewport.zoom || 1;

  // Área visível do canvas principal em coords de FLOW.
  const flowX = -mainViewport.x / mz;
  const flowY = -mainViewport.y / mz;
  const flowW = mainSize.width / mz;
  const flowH = mainSize.height / mz;

  // Mapeia para pixels do mini usando o fit computado.
  const left = flowX * fz + fx;
  const top = flowY * fz + fy;
  const width = flowW * fz;
  const height = flowH * fz;

  return (
    <div
      className="pointer-events-none absolute z-10"
      style={{
        left,
        top,
        width: Math.max(width, 2),
        height: Math.max(height, 2),
        border: `2px solid ${BRAND}`,
        backgroundColor: 'rgba(0,197,151,0.08)',
        borderRadius: 3,
        boxSizing: 'border-box',
      }}
    />
  );
}
