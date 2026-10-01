// ─────────────────────────────────────────────────────────────────────────────
// centerViewport — mover o viewport de um canvas React Flow neste app.
//
// ⚠️ LEIA ANTES DE "SIMPLIFICAR" ISTO USANDO A API DO REACT FLOW.
//
// Comprovado ao vivo no navegador (organograma, @xyflow/react 12.11.x, montado
// em tela cheia via portal): TODO comando programático de viewport é NO-OP
// neste setup — `fitView()`, `setViewport()`, `setCenter()`, o store `panBy()`
// e até o prop `defaultViewport`. O `store.transform` fica travado em [0,0,1]
// mesmo com o store perfeito (width/height certos, `nodesInitialized: true`,
// nós com `measured`). Remover o `<ReactFlowProvider>` externo não resolve.
// Causa exata desconhecida (incompatibilidade do React Flow neste setup).
//
// A ÚNICA coisa que move o viewport é um EVENTO DE MOUSE REAL, que o d3-zoom
// obedece: `WheelEvent` muda o zoom e um arrasto de `MouseEvent` translada pelo
// delta exato. **`PointerEvent` NÃO funciona — tem que ser `MouseEvent`.**
//
// Por isso tudo aqui lê o transform e os nós DIRETO DO DOM e despacha eventos
// sintéticos. Não é gambiarra por preguiça: é o que funciona.
//
// COMPARTILHADO entre o Organograma e os Processos (fluxograma).
// ─────────────────────────────────────────────────────────────────────────────

/** Transform vigente do viewport, lido do style inline do React Flow. */
export interface CanvasTransform {
  x: number;
  y: number;
  /** zoom (o `k` do d3-zoom). */
  k: number;
}

/** Elementos do canvas que os helpers precisam. `null` quando ainda não montou. */
interface CanvasParts {
  pane: Element;
  viewportEl: HTMLElement;
  /** Retângulo do wrapper em coordenadas de TELA. */
  rect: DOMRect;
}

const IDENTITY: CanvasTransform = { x: 0, y: 0, k: 1 };

function resolveParts(wrapper: HTMLElement | null): CanvasParts | null {
  if (!wrapper) return null;
  const pane = wrapper.querySelector('.react-flow__pane');
  const viewportEl = wrapper.querySelector('.react-flow__viewport') as HTMLElement | null;
  if (!pane || !viewportEl) return null;
  return { pane, viewportEl, rect: wrapper.getBoundingClientRect() };
}

/** Lê o transform vigente do `.react-flow__viewport` (style inline). */
export function readCanvasTransform(viewportEl: HTMLElement): CanvasTransform {
  const m = viewportEl.style.transform.match(
    /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)\s*scale\(([\d.]+)\)/,
  );
  return m ? { x: +m[1], y: +m[2], k: +m[3] } : IDENTITY;
}

/** Init de MouseEvent com os campos que o d3-zoom exige. */
function mouseInit(x: number, y: number, buttons = 1): MouseEventInit {
  return {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: x,
    clientY: y,
    button: 0,
    buttons,
  };
}

/**
 * Translada o viewport por (dx, dy) PIXELS DE TELA via arrasto de mouse sintético.
 * `mousedown` no pane + 2 `mousemove` no window (o intermediário faz o d3-zoom
 * reconhecer o gesto) + `mouseup` no window.
 */
function dragPaneBy(parts: CanvasParts, dx: number, dy: number): void {
  if (dx === 0 && dy === 0) return;
  const cx = parts.rect.left + parts.rect.width / 2;
  const cy = parts.rect.top + parts.rect.height / 2;
  parts.pane.dispatchEvent(new MouseEvent('mousedown', mouseInit(cx, cy)));
  window.dispatchEvent(new MouseEvent('mousemove', mouseInit(cx + dx * 0.5, cy + dy * 0.5)));
  window.dispatchEvent(new MouseEvent('mousemove', mouseInit(cx + dx, cy + dy)));
  window.dispatchEvent(new MouseEvent('mouseup', mouseInit(cx + dx, cy + dy, 0)));
}

/** Delta de tela que leva um ponto de FLOW ao centro do wrapper. */
function deltaToCenter(parts: CanvasParts, flowX: number, flowY: number) {
  const cur = readCanvasTransform(parts.viewportEl);
  return {
    dx: Math.round(parts.rect.width / 2 - (flowX * cur.k + cur.x)),
    dy: Math.round(parts.rect.height / 2 - (flowY * cur.k + cur.y)),
  };
}

/** Lê a posição de um `.react-flow__node` em coordenadas de FLOW. */
function readNodeFlowRect(
  el: HTMLElement,
  zoom: number,
): { x: number; y: number; width: number; height: number } | null {
  const m = el.style.transform.match(/translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/);
  if (!m) return null;
  const k = zoom || 1;
  // offsetWidth/Height vêm em px de TELA (o scale está no ancestral) → dividir
  // pelo zoom devolve o tamanho em coordenadas de flow.
  return { x: +m[1], y: +m[2], width: el.offsetWidth / k, height: el.offsetHeight / k };
}

/**
 * Centraliza um PONTO arbitrário de flow no container (usado pela navegação do
 * minimapa). Só pan, sem mexer no zoom.
 */
export function centerCanvasOnFlowPoint(
  wrapper: HTMLElement | null,
  flowX: number,
  flowY: number,
): void {
  const parts = resolveParts(wrapper);
  if (!parts) return;
  const { dx, dy } = deltaToCenter(parts, flowX, flowY);
  dragPaneBy(parts, dx, dy);
}

/**
 * Centraliza o nó de id informado (usado pela busca). Só pan, sem mexer no zoom
 * — tirar a pessoa do canto sem reenquadrar o resto é o comportamento esperado.
 */
export function centerCanvasOnNode(wrapper: HTMLElement | null, nodeId: string): void {
  const parts = resolveParts(wrapper);
  if (!parts) return;
  const nodeEl = parts.viewportEl
    .closest('.react-flow')
    ?.querySelector(`.react-flow__node[data-id="${CSS.escape(nodeId)}"]`) as HTMLElement | null;
  if (!nodeEl) return;
  const zoom = readCanvasTransform(parts.viewportEl).k;
  const r = readNodeFlowRect(nodeEl, zoom);
  if (!r) return;
  centerCanvasOnFlowPoint(wrapper, r.x + r.width / 2, r.y + r.height / 2);
}

export interface FitOptions {
  /** Folga em cada lado, como fração do bounding box. Default 0.15. */
  padding?: number;
  /** Teto de zoom — não ampliar grafo pequeno além disso. Default 1. */
  maxZoom?: number;
  /** Seletor dos nós a considerar. Default: todos. Raias passam `:not(.lane)`. */
  nodeSelector?: string;
}

/**
 * Enquadra TODOS os nós: converge o zoom por `WheelEvent` sintético e depois faz
 * o pan exato. Se o zoom não convergir limpo, o pan sozinho já tira o grafo do
 * canto (por isso o delta é recalculado DEPOIS do zoom, no zoom vigente).
 */
export function fitCanvasToNodes(wrapper: HTMLElement | null, options: FitOptions = {}): void {
  const parts = resolveParts(wrapper);
  if (!parts) return;
  const { padding = 0.15, maxZoom = 1, nodeSelector = '.react-flow__node' } = options;

  const nodeEls = Array.from(
    (parts.viewportEl.closest('.react-flow') ?? parts.viewportEl).querySelectorAll(nodeSelector),
  ) as HTMLElement[];
  if (!nodeEls.length) return;

  const zoomNow = readCanvasTransform(parts.viewportEl).k;
  const b = nodeEls.reduce(
    (acc, el) => {
      const r = readNodeFlowRect(el, zoomNow);
      if (!r) return acc;
      return {
        minX: Math.min(acc.minX, r.x),
        minY: Math.min(acc.minY, r.y),
        maxX: Math.max(acc.maxX, r.x + r.width),
        maxY: Math.max(acc.maxY, r.y + r.height),
      };
    },
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );
  if (!Number.isFinite(b.minX)) return;

  const bw = Math.max(b.maxX - b.minX, 1);
  const bh = Math.max(b.maxY - b.minY, 1);
  const centerX = (b.minX + b.maxX) / 2;
  const centerY = (b.minY + b.maxY) / 2;

  // 1) ZOOM alvo por wheel sintético no centro do container, com teto de
  //    iterações e parada ao cruzar o alvo (evita oscilar em volta dele).
  const targetZoom = Math.min(
    parts.rect.width / (bw * (1 + 2 * padding)),
    parts.rect.height / (bh * (1 + 2 * padding)),
    maxZoom,
  );
  const cxScr = parts.rect.left + parts.rect.width / 2;
  const cyScr = parts.rect.top + parts.rect.height / 2;
  let guard = 0;
  while (guard++ < 40 && Math.abs(readCanvasTransform(parts.viewportEl).k - targetZoom) > 0.02) {
    const before = readCanvasTransform(parts.viewportEl).k;
    parts.pane.dispatchEvent(
      new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        view: window,
        deltaY: before > targetZoom ? 100 : -100, // 100 = zoom out, -100 = zoom in
        clientX: cxScr,
        clientY: cyScr,
      }),
    );
    const after = readCanvasTransform(parts.viewportEl).k;
    if (Math.sign(after - targetZoom) !== Math.sign(before - targetZoom)) break;
  }

  // 2) PAN exato no zoom que ficou vigente.
  const { dx, dy } = deltaToCenter(parts, centerX, centerY);
  dragPaneBy(parts, dx, dy);
}
