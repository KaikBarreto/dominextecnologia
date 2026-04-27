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

export async function generateReportPDF(reportElement: HTMLElement, filename: string): Promise<void> {
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

    // Slice into A4 pages
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidthMm = pdf.internal.pageSize.getWidth();
    const pdfHeightMm = pdf.internal.pageSize.getHeight();

    // Each page in source pixels (canvas is at scale=2)
    const pageHeightPx = Math.floor((A4_HEIGHT_PX / A4_WIDTH_PX) * fullCanvas.width);
    const totalPages = Math.ceil(fullCanvas.height / pageHeightPx);

    for (let i = 0; i < totalPages; i++) {
      const sliceY = i * pageHeightPx;
      const sliceHeight = Math.min(pageHeightPx, fullCanvas.height - sliceY);

      // Create a per-page canvas at full A4 height (white-pad short last page)
      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = fullCanvas.width;
      pageCanvas.height = pageHeightPx;
      const ctx = pageCanvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      ctx.drawImage(
        fullCanvas,
        0, sliceY, fullCanvas.width, sliceHeight,
        0, 0, fullCanvas.width, sliceHeight
      );

      const imgData = pageCanvas.toDataURL('image/jpeg', 0.92);
      if (i > 0) pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidthMm, pdfHeightMm);
    }

    pdf.save(filename);
  } finally {
    document.body.removeChild(offscreen);
  }
}
