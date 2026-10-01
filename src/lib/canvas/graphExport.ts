// ─────────────────────────────────────────────────────────────────────────────
// graphExport — exporta um canvas React Flow como PNG ou PDF.
//
// COMPARTILHADO entre o Organograma e os Processos (fluxograma). O que muda
// entre eles é só `graphName`/`filePrefix`; a mecânica de captura é a mesma.
//
// Captura o grafo INTEIRO (nós + arestas) via html-to-image/toCanvas, que
// serializa o DOM do `.react-flow__viewport` fielmente — incluindo o <svg> das
// arestas — ao contrário do html2canvas, que rasterizava o svg no tamanho
// intrínseco (300×150) e perdia os paths fora dele.
//
// O viewport é reposicionado via `style` no momento da captura (sem tocar no
// DOM ao vivo) usando `getViewportForBounds` do @xyflow/react, que calcula o
// transform exato para caber todos os nós na imagem.
//
// Após a captura, compõe: fundo do tema + grid pontilhado + grafo transparente.
//
// PNG  → canvas.toBlob('image/png') → download.
// PDF  → canvas.toDataURL('image/jpeg', 0.9) → jsPDF compress, rodapé Dominex
//        gated por !hideBranding.
// ─────────────────────────────────────────────────────────────────────────────

import type { Node } from '@xyflow/react';
import { getNodesBounds, getViewportForBounds } from '@xyflow/react';
import { DOMINEX_LOGO_BLACK_BASE64 } from '@/utils/dominexLogoBase64';

const PAD = 48;

// Converte nome do chart em slug de arquivo.
function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

// Carrega uma imagem base64 e retorna HTMLImageElement (para jsPDF).
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export interface GraphExportOptions {
  /** O `.react-flow__viewport` (passado pelo canvas). */
  element: HTMLElement;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  nodes: Node<any>[];
  isDark: boolean;
  /** Nome do grafo — vira o slug do arquivo baixado. */
  graphName: string;
  /** Prefixo do arquivo: `<prefix>-<slug>.png`. Ex.: 'organograma', 'processo'. */
  filePrefix: string;
}

export interface GraphPdfExportOptions extends GraphExportOptions {
  /** true quando white-label está ativo — suprime o rodapé Dominex */
  hideBranding: boolean;
}

/**
 * Captura o grafo inteiro via html-to-image/toCanvas.
 *
 * `element` = `.react-flow__viewport` (passado pelo Canvas).
 * Reposiciona o elemento via `style` inline no momento da captura para que
 * todos os nós caibam na imagem, sem tocar no DOM ao vivo.
 *
 * Retorna um canvas FINAL composto: fundo do tema + grid de pontos + grafo.
 * Resolução: 2× (pixelRatio: 2).
 */
async function captureGraph(
  element: HTMLElement,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  nodes: Node<any>[],
  isDark: boolean,
  /** Título impresso no topo da imagem. Vazio = sem faixa de título. */
  title?: string,
): Promise<HTMLCanvasElement> {
  if (nodes.length === 0) {
    throw new Error('EMPTY');
  }

  const { toCanvas } = await import('html-to-image');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bounds = getNodesBounds(nodes as any[]);

  // Cap 4000px por lado para não estourar memória em grafos grandes.
  const imageWidth  = Math.min(4000, Math.ceil(bounds.width)  + PAD * 2);
  const imageHeight = Math.min(4000, Math.ceil(bounds.height) + PAD * 2);

  // Viewport que encaixa todos os nós na imagem (padding 10%, zoom 0.2–2).
  const viewport = getViewportForBounds(bounds, imageWidth, imageHeight, 0.2, 2, 0.1);

  // Captura o viewport com fundo transparente para compor os dots depois.
  // Filtra a camada de arestas SVG para evitar artefatos — desenhamos as
  // arestas manualmente via Path2D logo abaixo.
  const capturedCanvas = await toCanvas(element, {
    width:      imageWidth,
    height:     imageHeight,
    pixelRatio: 2,
    cacheBust:  true,
    // backgroundColor undefined = fundo transparente.
    style: {
      width:           `${imageWidth}px`,
      height:          `${imageHeight}px`,
      transform:       `translate(${viewport.x}px,${viewport.y}px) scale(${viewport.zoom})`,
      transformOrigin: 'top left',
    },
    filter: (node: HTMLElement) => {
      // Exclui a camada SVG de arestas do React Flow — as arestas são
      // redesenhadas manualmente via Path2D com transform correto.
      return !(node.classList && node.classList.contains('react-flow__edges'));
    },
  });

  // ── Composição final: título + fundo + grid + arestas + nós ───────────────
  const PIXEL_RATIO = 2;
  // Faixa de título no topo. Sem ela a imagem sai do sistema sem dizer de que
  // processo é — e é justamente a imagem que o dono imprime e manda no grupo.
  const HEADER = title?.trim() ? 104 : 0;
  const headerPx = HEADER * PIXEL_RATIO;
  const outW = imageWidth  * PIXEL_RATIO;
  const outH = imageHeight * PIXEL_RATIO + headerPx;

  const out = document.createElement('canvas');
  out.width  = outW;
  out.height = outH;
  const ctx = out.getContext('2d');
  if (!ctx) return capturedCanvas; // fallback raro

  // 1. Fundo sólido do tema.
  ctx.fillStyle = isDark ? '#0C0C0C' : '#FFFFFF';
  ctx.fillRect(0, 0, outW, outH);

  // 2. Grid pontilhado via pattern (eficiente — sem loop pixel a pixel).
  //    Tile 44×44 (22px × pixelRatio=2) com 1 ponto central de raio 2px.
  const TILE = 22 * PIXEL_RATIO; // 44px
  const tile = document.createElement('canvas');
  tile.width  = TILE;
  tile.height = TILE;
  const tCtx = tile.getContext('2d');
  if (tCtx) {
    tCtx.clearRect(0, 0, TILE, TILE);
    tCtx.fillStyle = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';
    tCtx.beginPath();
    tCtx.arc(TILE / 2, TILE / 2, 2, 0, Math.PI * 2);
    tCtx.fill();
    const pattern = ctx.createPattern(tile, 'repeat');
    if (pattern) {
      ctx.fillStyle = pattern;
      // Abaixo da faixa de título: o grid atrás do título sujaria a leitura.
      ctx.fillRect(0, headerPx, outW, outH - headerPx);
    }
  }

  // 3. Arestas desenhadas via Path2D sob o mesmo transform do viewport.
  //    Os atributos `d` dos paths estão em coordenadas de flow (mesmo espaço
  //    dos nós), portanto basta aplicar o transform do viewport.
  //    Busca primeiro no próprio element (viewport); se não achar, sobe para
  //    o container .react-flow (caso o SVG fique fora do viewport na DOM).
  const edgePaths =
    element.querySelectorAll<SVGPathElement>('.react-flow__edge-path').length > 0
      ? element.querySelectorAll<SVGPathElement>('.react-flow__edge-path')
      : (element.closest('.react-flow') ?? element).querySelectorAll<SVGPathElement>('.react-flow__edge-path');

  if (edgePaths.length > 0) {
    ctx.save();
    // Aplica exatamente o mesmo transform que o toCanvas aplica ao viewport:
    //   translate(viewport.x, viewport.y) scale(viewport.zoom)
    // multiplicado pelo pixelRatio para ficar em pixels do canvas de saída.
    ctx.setTransform(
      viewport.zoom * PIXEL_RATIO, 0,
      0, viewport.zoom * PIXEL_RATIO,
      viewport.x * PIXEL_RATIO,
      viewport.y * PIXEL_RATIO + headerPx,
    );
    const strokeColor = isDark ? '#94a3b8' : '#64748b';
    const haloColor   = isDark ? '#0C0C0C' : '#FFFFFF';
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    edgePaths.forEach((p) => {
      const d = p.getAttribute('d');
      if (!d) return;

      // HALO: traço grosso na cor do fundo, desenhado ANTES da linha desta
      // aresta. Cada aresta abre um vão nas que já estavam no canvas, e o
      // cruzamento lê como uma passando sobre a outra em vez de virar borrão.
      // É o mesmo efeito que `ProcessFlowEdge` produz na tela — se um dos dois
      // mudar sem o outro, a imagem exportada deixa de bater com o que se vê.
      try {
        const halo = new Path2D(d);
        ctx.save();
        ctx.setLineDash([]);
        ctx.strokeStyle = haloColor;
        ctx.lineWidth = 7 / viewport.zoom;
        ctx.stroke(halo);
        ctx.restore();
      } catch (_) { /* path inválido — pula */ }

      ctx.strokeStyle = strokeColor;
      // lineWidth em coordenadas de flow: compensa a escala, resulta em ~1.5px
      // visuais no canvas final independente do zoom.
      ctx.lineWidth = 1.5 / viewport.zoom;
      // Honra o tracejado da aresta (fluxo de informação nos processos). O
      // organograma não usa dasharray, então aqui o caminho é no-op pra ele.
      const dash = p.getAttribute('stroke-dasharray') || getComputedStyle(p).strokeDasharray;
      const segs = dash && dash !== 'none'
        ? dash.split(/[\s,]+/).map(Number).filter((n) => Number.isFinite(n) && n > 0)
        : [];
      ctx.setLineDash(segs.length ? segs.map((n) => n / viewport.zoom) : []);
      try { ctx.stroke(new Path2D(d)); } catch (_) { /* path inválido — pula */ }
    });
    ctx.setLineDash([]);
    ctx.restore();
  }

  // 4. Nós (canvas transparente capturado) compostos sobre fundo+dots+arestas.
  ctx.drawImage(capturedCanvas, 0, headerPx, outW, imageHeight * PIXEL_RATIO);

  // 5. RÓTULOS das arestas ("Sim"/"Não" das decisões) — POR ÚLTIMO.
  //
  // A ordem importa: desenhados ANTES dos nós, os rótulos cujo meio da linha cai
  // atrás de uma caixa somem (foi o que aconteceu com três "Sim" na 1ª tentativa).
  // Rótulo escondido num fluxograma com decisão é o mesmo que rótulo ausente.
  //
  // Eles vivem DENTRO de `.react-flow__edges`, a mesma camada que o passo 3
  // descarta da captura — então, sem isto, a imagem de um processo com decisão
  // sai sem dizer qual caminho é qual. Redesenhamos lendo a posição do DOM e
  // aplicando o mesmo transform do viewport usado nas linhas.
  //
  // Estrutura do React Flow v12:
  //   <g class="react-flow__edge-textwrapper" transform="translate(X Y)">
  //     <rect class="react-flow__edge-textbg" x y width height />
  //     <text class="react-flow__edge-text" y="6">Não</text>
  const labelWrappers = (
    element.querySelectorAll<SVGGElement>('.react-flow__edge-textwrapper').length > 0
      ? element
      : (element.closest('.react-flow') ?? element)
  ).querySelectorAll<SVGGElement>('.react-flow__edge-textwrapper');

  if (labelWrappers.length > 0) {
    ctx.save();
    ctx.setTransform(
      viewport.zoom * PIXEL_RATIO, 0,
      0, viewport.zoom * PIXEL_RATIO,
      viewport.x * PIXEL_RATIO,
      viewport.y * PIXEL_RATIO + headerPx,
    );
    labelWrappers.forEach((g) => {
      const m = (g.getAttribute('transform') ?? '').match(
        /translate\(\s*(-?[\d.]+)[\s,]+(-?[\d.]+)\s*\)/,
      );
      if (!m) return;
      const gx = +m[1];
      const gy = +m[2];

      const textEl = g.querySelector<SVGTextElement>('.react-flow__edge-text');
      const label = textEl?.textContent?.trim();
      if (!label) return;

      // Pastilha de fundo, pra o rótulo não se perder em cima da linha.
      const bgEl = g.querySelector<SVGRectElement>('.react-flow__edge-textbg');
      if (bgEl) {
        const bx = parseFloat(bgEl.getAttribute('x') ?? '0');
        const by = parseFloat(bgEl.getAttribute('y') ?? '0');
        const bw = parseFloat(bgEl.getAttribute('width') ?? '0');
        const bh = parseFloat(bgEl.getAttribute('height') ?? '0');
        if (bw > 0 && bh > 0) {
          const bgFill = getComputedStyle(bgEl).fill;
          ctx.fillStyle = bgFill && bgFill !== 'none' ? bgFill : (isDark ? '#141414' : '#FFFFFF');
          // Honra o arredondamento (`rx`): os rótulos de bifurcação são PÍLULAS
          // saturadas, e exportá-las como retângulo reto descaracteriza o desenho.
          const rx = Math.min(parseFloat(bgEl.getAttribute('rx') ?? '0') || 0, bw / 2, bh / 2);
          ctx.beginPath();
          if (rx > 0 && typeof ctx.roundRect === 'function') {
            ctx.roundRect(gx + bx, gy + by, bw, bh, rx);
          } else {
            ctx.rect(gx + bx, gy + by, bw, bh);
          }
          ctx.fill();
        }
      }

      // Cor e tamanho vêm do estilo VIVO: o tema da captura é o mesmo da tela.
      const cs = getComputedStyle(textEl!);
      const fontSize = parseFloat(cs.fontSize) || 10;
      ctx.fillStyle = cs.fill && cs.fill !== 'none' ? cs.fill : (isDark ? '#F8F8F8' : '#0F172A');
      ctx.font = `${cs.fontWeight || 500} ${fontSize}px ${cs.fontFamily || 'sans-serif'}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      const ty = parseFloat(textEl!.getAttribute('y') ?? '0');
      ctx.fillText(label, gx, gy + ty);
    });
    ctx.restore();
  }

  // 6. TÍTULO — por último, pra nenhum nó encostado no topo passar por cima.
  if (HEADER > 0 && title) {
    const name = title.trim();
    ctx.save();
    ctx.setTransform(PIXEL_RATIO, 0, 0, PIXEL_RATIO, 0, 0);

    // Tampa a faixa de novo: nó colado no topo do grafo invadiria o título.
    ctx.fillStyle = isDark ? '#0C0C0C' : '#FFFFFF';
    ctx.fillRect(0, 0, imageWidth, HEADER);

    const left = PAD;
    const maxW = Math.max(imageWidth - PAD * 2, 120);
    ctx.fillStyle = isDark ? '#F8FAFC' : '#0F172A';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '700 34px Montserrat, system-ui, -apple-system, "Segoe UI", sans-serif';

    // Nome comprido corta com reticência em vez de vazar pra fora da imagem.
    let shown = name;
    if (ctx.measureText(shown).width > maxW) {
      while (shown.length > 1 && ctx.measureText(shown + '…').width > maxW) {
        shown = shown.slice(0, -1);
      }
      shown += '…';
    }
    ctx.fillText(shown, left, 60);

    // Filete separando o título do desenho.
    ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, HEADER - 16);
    ctx.lineTo(imageWidth - PAD, HEADER - 16);
    ctx.stroke();
    ctx.restore();
  }

  return out;
}

/**
 * Captura o grafo e devolve um data URL JPEG — pra EMBUTIR o desenho dentro de
 * outro documento (é assim que o POP leva o fluxograma junto do passo a passo).
 * Sempre em tema claro: o documento é A4 branco.
 *
 * Devolve `null` quando não há nó nenhum, em vez de estourar: documento sem
 * desenho ainda é um documento válido, só não tem a seção de fluxograma.
 */
export async function captureGraphDataUrl(
  element: HTMLElement,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  nodes: Node<any>[],
  quality = 0.92,
): Promise<string | null> {
  if (nodes.length === 0) return null;
  try {
    // SEM título: no POP o nome do processo já é o cabeçalho do documento, e
    // repeti-lo dentro da imagem logo abaixo fica redundante.
    const canvas = await captureGraph(element, nodes, false);
    return canvas.toDataURL('image/jpeg', quality);
  } catch {
    return null;
  }
}

/**
 * Exporta o grafo como PNG e baixa diretamente (sem abrir nova aba).
 */
export async function exportGraphPng({ element, nodes, isDark, graphName, filePrefix }: GraphExportOptions): Promise<void> {
  const canvas = await captureGraph(element, nodes, isDark, graphName);
  const slug = slugify(graphName) || filePrefix;

  await new Promise<void>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Falha ao gerar imagem PNG.'));
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filePrefix}-${slug}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      resolve();
    }, 'image/png');
  });
}

/**
 * Exporta o grafo como PDF e baixa diretamente.
 *
 * - Orientação: landscape se largura > altura, senão portrait.
 * - Fundo: cor do tema pintada na página inteira.
 * - JPEG 0.9 (sem canal alpha — fundo já pintado) mantém boa qualidade.
 * - Rodapé Dominex: suprimido quando `hideBranding = true` (white-label).
 *   No tema escuro usa apenas texto branco (logo preto ficaria invisível).
 */
export async function exportGraphPdf({
  element,
  nodes,
  isDark,
  graphName,
  filePrefix,
  hideBranding,
}: GraphPdfExportOptions): Promise<void> {
  const canvas = await captureGraph(element, nodes, isDark, graphName);
  const slug = slugify(graphName) || filePrefix;

  const { jsPDF } = (await import('jspdf')) as { jsPDF: typeof import('jspdf').jsPDF };

  // Reduz o canvas para o PDF se algum lado exceder 3000px (mantém proporção).
  const MAX_DIM = 3000;
  let pdfCanvas = canvas;
  const rawMax = Math.max(canvas.width, canvas.height);
  if (rawMax > MAX_DIM) {
    const ratio = MAX_DIM / rawMax;
    const offscreen = document.createElement('canvas');
    offscreen.width  = Math.round(canvas.width  * ratio);
    offscreen.height = Math.round(canvas.height * ratio);
    const ctx2d = offscreen.getContext('2d');
    if (ctx2d) {
      ctx2d.drawImage(canvas, 0, 0, offscreen.width, offscreen.height);
      pdfCanvas = offscreen;
    }
  }

  const imgW = pdfCanvas.width;
  const imgH = pdfCanvas.height;

  // Margem interna de página (mm).
  const MARGIN      = 8;
  const FOOTER_H    = 14; // reserva para rodapé quando presente (mm)
  const footerReserve = !hideBranding ? FOOTER_H : 0;

  // Orientação pela proporção.
  const orientation: 'landscape' | 'portrait' = imgW > imgH ? 'landscape' : 'portrait';

  // Tamanho de página em mm que caiba a imagem com margem.
  // Escala: convertemos px → mm a 96dpi (1 mm ≈ 3.7795 px).
  const PX_TO_MM   = 25.4 / 96;
  const contentW   = imgW * PX_TO_MM - MARGIN * 2;
  const contentH   = imgH * PX_TO_MM - MARGIN * 2;

  const pageW = contentW + MARGIN * 2;
  const pageH = contentH + MARGIN * 2 + footerReserve;

  const doc = new jsPDF({
    orientation,
    unit:     'mm',
    format:   [pageW, pageH],
    compress: true,
  });

  // Fundo na cor do tema.
  const bgColor = isDark ? '#0C0C0C' : '#FFFFFF';
  doc.setFillColor(bgColor);
  doc.rect(0, 0, pageW, pageH, 'F');

  // Imagem JPEG (sem canal alpha — fundo já pintado acima).
  const imgDataUrl = pdfCanvas.toDataURL('image/jpeg', 0.9);
  doc.addImage(imgDataUrl, 'JPEG', MARGIN, MARGIN, contentW, contentH, undefined, 'FAST');

  // ── Rodapé Dominex (suprimido no white-label) ──────────────────────────────
  if (!hideBranding) {
    const footerY = pageH - footerReserve + 2;

    // Linha separadora (baixa opacidade).
    doc.setDrawColor(isDark ? 80 : 200, isDark ? 80 : 200, isDark ? 80 : 200);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, footerY, pageW - MARGIN, footerY);

    if (isDark) {
      // No tema escuro o logo preto ficaria invisível — só texto branco.
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(255, 255, 255);
      doc.text('dominex.app', pageW / 2, footerY + 5, { align: 'center' });
    } else {
      // Tema claro: logo preto + texto cinza.
      try {
        const logoImg = await loadImage(DOMINEX_LOGO_BLACK_BASE64);
        const logoW = 22;
        const logoH = logoW / ((logoImg.width / logoImg.height) || 5);
        doc.addImage(
          DOMINEX_LOGO_BLACK_BASE64,
          'PNG',
          (pageW - logoW) / 2,
          footerY + 1,
          logoW,
          logoH,
        );
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(153, 153, 153);
        doc.text('dominex.app', pageW / 2, footerY + logoH + 3, { align: 'center' });
      } catch {
        // Fallback: só texto.
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(100, 100, 100);
        doc.text('dominex.app', pageW / 2, footerY + 5, { align: 'center' });
      }
    }
  }

  doc.save(`${filePrefix}-${slug}.pdf`);
}
