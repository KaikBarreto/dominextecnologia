/**
 * PDF Page Renderer — snapshot + slice strategy.
 *
 * Strategy:
 * 1. Clone the report DOM into a hidden off-screen container with fixed A4 width.
 * 2. Force all accordions/collapsibles open and remove print:hidden elements.
 * 3. Enlarge inline thumbnail images (since the PDF reader can't expand them).
 * 4. Wait for all images in the clone to fully load.
 * 5. Capture the entire clone with html2canvas as ONE tall canvas.
 * 6. Slice the canvas vertically into A4-proportioned pages and add to jsPDF.
 *
 * This preserves the original report layout exactly (no block-based reflow).
 */

const A4_WIDTH_PX = 794;   // A4 at 96 DPI
const A4_HEIGHT_PX = 1123; // A4 at 96 DPI

async function waitForImages(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll('img'));
  await Promise.all(
    imgs.map(img => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise<void>(resolve => {
        const done = () => resolve();
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', done, { once: true });
        // Safety timeout: skip slow/broken images after 8s
        setTimeout(done, 8000);
      });
    })
  );
}

/**
 * Renderiza um elemento (relatório) num PDF A4 e devolve o Blob (sem salvar).
 *
 * É o MIOLO compartilhado: clona o elemento offscreen (A4 794px), força
 * accordions abertos, amplia thumbnails, captura com html2canvas-pro (scale 2) e
 * fatia em páginas A4 evitando cortar imagens. Retorna `pdf.output('blob')`.
 *
 * `generateReportPDF` reusa esta função e depois faz `pdf.save`. Quem precisa
 * abrir o PDF em nova aba (openPdfInTab) chama esta versão direto e recebe o Blob.
 */
export async function renderElementToPdfBlob(
  reportElement: HTMLElement,
  opts?: { pageMarginTopPx?: number; pageMarginBottomPx?: number },
): Promise<Blob> {
  const html2canvas = (await import('html2canvas-pro')).default;
  const { jsPDF } = await import('jspdf');

  // Off-screen container at A4 width
  const offscreen = document.createElement('div');
  offscreen.style.cssText = `
    position: fixed; left: -9999px; top: 0;
    width: ${A4_WIDTH_PX}px;
    background: white;
    font-family: 'Montserrat', sans-serif;
    z-index: -1;
  `;
  document.body.appendChild(offscreen);

  try {
    // Clone the live report
    const clone = reportElement.cloneNode(true) as HTMLElement;
    clone.style.width = `${A4_WIDTH_PX}px`;
    clone.style.maxWidth = `${A4_WIDTH_PX}px`;
    clone.style.borderRadius = '0';
    clone.style.overflow = 'visible';
    clone.style.boxShadow = 'none';

    // Force every Radix accordion/collapsible open
    clone.querySelectorAll('[data-state]').forEach(el => el.setAttribute('data-state', 'open'));
    clone.querySelectorAll('[role="region"], [data-radix-collapsible-content], [data-radix-accordion-content]').forEach(el => {
      const h = el as HTMLElement;
      h.style.cssText += ';display:block!important;height:auto!important;max-height:none!important;overflow:visible!important;opacity:1!important;visibility:visible!important;animation:none!important;transition:none!important;';
    });
    clone.querySelectorAll('[hidden], [style*="display: none"], [style*="height: 0"]').forEach(el => {
      const h = el as HTMLElement;
      h.removeAttribute('hidden');
      h.style.cssText += ';display:block!important;height:auto!important;overflow:visible!important;';
    });

    // Remove anything marked print:hidden
    clone.querySelectorAll('.print\\:hidden, [class*="print:hidden"]').forEach(el => el.remove());

    // Neutralize sticky checklist headers: in the PDF they must be static and
    // shadow-free regardless of the live "stuck" state captured in the snapshot
    // (the sticky header gains a shadow when glued to the top during scroll).
    clone.querySelectorAll('[class*="sticky"]').forEach(el => {
      (el as HTMLElement).style.cssText += ';position:static!important;box-shadow:none!important;';
    });

    // Inject style overrides for known html2canvas weaknesses:
    // - flexbox `gap` is poorly supported → emulate via margin on adjacent siblings
    // - `ml-auto` sometimes fails inside flex → re-assert
    // Also enlarge inline thumbnails (in the PDF the reader can't open lightboxes).
    const styleFix = document.createElement('style');
    styleFix.textContent = `
      /* Emulate Tailwind gap-x-* via margin-left on subsequent flex children */
      .pdf-clone [class*="gap-x-1"] > * + *  { margin-left: 4px !important; }
      .pdf-clone [class*="gap-x-1.5"] > * + * { margin-left: 6px !important; }
      .pdf-clone [class*="gap-x-2"] > * + *  { margin-left: 8px !important; }
      .pdf-clone [class*="gap-x-3"] > * + *  { margin-left: 12px !important; }
      .pdf-clone [class*="gap-x-4"] > * + *  { margin-left: 16px !important; }
      .pdf-clone [class*="gap-x-6"] > * + *  { margin-left: 24px !important; }
      /* Emulate Tailwind gap-* (no axis) on flex-row containers */
      .pdf-clone [class*=" gap-1 "] > * + *,  .pdf-clone [class^="gap-1 "] > * + *,  .pdf-clone [class$=" gap-1"] > * + *  { margin-left: 4px !important; }
      .pdf-clone [class*=" gap-2 "] > * + *,  .pdf-clone [class^="gap-2 "] > * + *,  .pdf-clone [class$=" gap-2"] > * + *  { margin-left: 8px !important; }
      .pdf-clone [class*=" gap-3 "] > * + *,  .pdf-clone [class^="gap-3 "] > * + *,  .pdf-clone [class$=" gap-3"] > * + *  { margin-left: 12px !important; }
      .pdf-clone [class*=" gap-4 "] > * + *,  .pdf-clone [class^="gap-4 "] > * + *,  .pdf-clone [class$=" gap-4"] > * + *  { margin-left: 16px !important; }
      /* Re-assert ml-auto */
      .pdf-clone [class*="ml-auto"] { margin-left: auto !important; }
      /* Force flex layouts to respect direction even if media queries flake */
      .pdf-clone .flex.flex-row { display: flex !important; flex-direction: row !important; }
    `;
    clone.classList.add('pdf-clone');
    clone.prepend(styleFix);

    // Enlarge inline thumbnails. Cap both width AND height so a portrait photo
    // doesn't fill an entire A4 page.
    const enlargeThumb = (el: HTMLImageElement) => {
      el.style.cssText += ';width:auto!important;max-width:480px!important;height:auto!important;max-height:340px!important;object-fit:contain!important;display:block!important;margin:8px auto!important;border-radius:6px!important;';
    };
    clone.querySelectorAll('img').forEach(img => {
      const el = img as HTMLImageElement;
      // Skip the company logo (usually small, in header) — keep its inline sizing
      if (el.closest('[data-pdf-logo]') || el.alt?.toLowerCase().includes('logo')) return;
      enlargeThumb(el);
    });

    offscreen.appendChild(clone);

    // Wait for layout + image loads
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 100))));
    await waitForImages(clone);
    await new Promise(r => setTimeout(r, 150));

    // Capture entire report as one canvas
    const fullCanvas = await html2canvas(clone, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      width: A4_WIDTH_PX,
      windowWidth: A4_WIDTH_PX,
      height: clone.scrollHeight,
      windowHeight: clone.scrollHeight,
    });

    // Map bounding boxes (in canvas pixels — scale=2) of everything we must not
    // split across a page boundary. Always: images. Opt-in: any element marked
    // with [data-pdf-keep] (atomic content blocks — cards, paragraphs, chart
    // pairs). Reports that don't use the marker keep the historical behavior.
    const SCALE = 2;
    const cloneTop = clone.getBoundingClientRect().top;
    const toBox = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { top: (r.top - cloneTop) * SCALE, bottom: (r.bottom - cloneTop) * SCALE };
    };
    const imageBoxes = Array.from(clone.querySelectorAll('img')).map(toBox);
    const keepBoxes = Array.from(clone.querySelectorAll('[data-pdf-keep]')).map(toBox);
    const atomicBoxes = [...imageBoxes, ...keepBoxes];

    // Slice into A4 pages, snapping page breaks before any image that would be split.
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidthMm = pdf.internal.pageSize.getWidth();
    const pdfHeightMm = pdf.internal.pageSize.getHeight();

    const pageHeightPx = Math.floor((A4_HEIGHT_PX / A4_WIDTH_PX) * fullCanvas.width);

    // ── Page margins (OPT-IN, in canvas px) ─────────────────────────────────
    // Default 0/0 → paginação BYTE-idêntica ao histórico (OSReport etc.).
    // Se o elemento (ou um ancestral no clone) tiver [data-pdf-margins], usa um
    // default de respiro no topo/base — sem tocar em quem chama esta função.
    // Valores em px de canvas (scale=2): ~72 topo / ~64 base ≈ 36/32 CSS px.
    const wantsMargins = !!(reportElement.closest?.('[data-pdf-margins]') || clone.querySelector('[data-pdf-margins]') || clone.matches?.('[data-pdf-margins]'));
    const attrTop = clone.matches?.('[data-pdf-margins]')
      ? clone.getAttribute('data-pdf-margin-top')
      : clone.querySelector('[data-pdf-margins]')?.getAttribute('data-pdf-margin-top');
    const attrBottom = clone.matches?.('[data-pdf-margins]')
      ? clone.getAttribute('data-pdf-margin-bottom')
      : clone.querySelector('[data-pdf-margins]')?.getAttribute('data-pdf-margin-bottom');
    const attrTopFirst = clone.matches?.('[data-pdf-margins]')
      ? clone.getAttribute('data-pdf-margin-top-first')
      : clone.querySelector('[data-pdf-margins]')?.getAttribute('data-pdf-margin-top-first');
    const marginTop = Math.max(
      0,
      opts?.pageMarginTopPx ?? (attrTop ? Number(attrTop) : wantsMargins ? 72 : 0),
    );
    const marginBottom = Math.max(
      0,
      opts?.pageMarginBottomPx ?? (attrBottom ? Number(attrBottom) : wantsMargins ? 64 : 0),
    );
    // Margem de topo da PRIMEIRA página (capa). Opt-in por
    // [data-pdf-margin-top-first]; na ausência, 0 quando há margens (capa colada
    // no topo). Sem opt-in de margens, fica 0 = idêntico ao histórico.
    const firstPageMarginTop = Math.max(
      0,
      attrTopFirst != null ? Number(attrTopFirst) : wantsMargins ? 0 : marginTop,
    );
    const hasMargins = marginTop > 0 || marginBottom > 0;

    // ── Cap na altura REAL do conteúdo (mata página em branco no fim) ────────
    // Maior `bottom` entre os blocos atômicos (imagens + [data-pdf-keep] +
    // rodapé/folhas). Só aplica o cap quando temos margens/keeps: sem opt-in
    // o comportamento fica idêntico ao histórico (usa fullCanvas.height).
    const contentBottom = atomicBoxes.length
      ? Math.max(...atomicBoxes.map((b) => b.bottom))
      : fullCanvas.height;
    const applyCap = hasMargins || keepBoxes.length > 0;
    const contentHeight = applyCap
      ? Math.min(fullCanvas.height, Math.ceil(contentBottom + marginBottom))
      : fullCanvas.height;

    let cursorY = 0;
    let pageIndex = 0;
    while (cursorY < contentHeight) {
      // Margem de topo desta página: 0 na capa (página 0) por padrão quando há
      // margens; margem normal nas páginas 2+. A altura ÚTIL varia por página.
      const topMargin = pageIndex === 0 ? firstPageMarginTop : marginTop;
      const usableHeight = Math.max(1, pageHeightPx - topMargin - marginBottom);

      let pageEndY = Math.min(cursorY + usableHeight, contentHeight);

      // If an atomic box (image or [data-pdf-keep] block) straddles pageEndY,
      // push the break up to its top so the entire block lands on the next page.
      // Skip if the block is taller than the usable height (cannot avoid) or is
      // glued to the top of the current page (would just move the same break).
      // We snap to the HIGHEST offending box so no earlier block is left split.
      for (const box of atomicBoxes) {
        if (box.top < pageEndY && box.bottom > pageEndY) {
          const boxHeight = box.bottom - box.top;
          if (boxHeight <= usableHeight && box.top > cursorY + usableHeight * 0.15) {
            pageEndY = Math.min(pageEndY, Math.floor(box.top));
          }
        }
      }

      // Safety: never produce an empty page
      if (pageEndY <= cursorY) pageEndY = Math.min(cursorY + usableHeight, contentHeight);

      const sliceHeight = pageEndY - cursorY;
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = fullCanvas.width;
      pageCanvas.height = pageHeightPx;
      const ctx = pageCanvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      // Slice de conteúdo desenhado deslocado pra baixo em topMargin → topo (e
      // base) ganha respiro. Na capa (página 0), topMargin=0 = colada no topo.
      ctx.drawImage(
        fullCanvas,
        0, cursorY, fullCanvas.width, sliceHeight,
        0, topMargin, fullCanvas.width, sliceHeight
      );

      const imgData = pageCanvas.toDataURL('image/jpeg', 0.92);
      if (pageIndex > 0) pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidthMm, pdfHeightMm);

      cursorY = pageEndY;
      pageIndex++;
    }

    return pdf.output('blob');
  } finally {
    document.body.removeChild(offscreen);
  }
}

/**
 * Gera o PDF do relatório e dispara o download (`pdf.save`), preservando o
 * comportamento histórico usado por OSReport e outros geradores.
 */
export async function generateReportPDF(reportElement: HTMLElement, filename: string): Promise<void> {
  const blob = await renderElementToPdfBlob(reportElement);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
