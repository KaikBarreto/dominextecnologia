/**
 * PDF Page Renderer — block-based A4 pagination system.
 *
 * Strategy:
 * 1. Clone the report DOM into a hidden off-screen container with fixed A4 width.
 * 2. Walk through top-level `[data-pdf-section]` blocks and measure heights.
 * 3. Distribute blocks into pages so nothing is cut mid-block.
 * 4. For each page, render only the assigned blocks inside an A4-sized div.
 * 5. Capture each page with html2canvas → add to jsPDF.
 *
 * Large blocks (questionnaires with many items) are split by their children
 * so individual responses are never cut.
 */

// A4 at 96 DPI ≈ 794 × 1123 px.  We use a slightly smaller content area for padding.
const A4_WIDTH_PX = 794;
const A4_HEIGHT_PX = 1123;
const PAGE_PADDING = 32; // px each side
const CONTENT_HEIGHT = A4_HEIGHT_PX - PAGE_PADDING * 2;

interface BlockInfo {
  element: HTMLElement;
  height: number;
}

/**
 * Measures the height of an element when placed in an A4-width container.
 */
function measureElement(el: HTMLElement, container: HTMLElement): number {
  container.appendChild(el);
  const h = el.offsetHeight;
  container.removeChild(el);
  return h;
}

/**
 * Splits a large block (e.g. questionnaire accordion) into sub-blocks
 * by its direct children so we can break between items.
 */
function splitLargeBlock(block: HTMLElement, maxHeight: number, measureContainer: HTMLElement): HTMLElement[] {
  const children = Array.from(block.children) as HTMLElement[];
  if (children.length <= 1) return [block];

  const chunks: HTMLElement[] = [];
  let currentChunk = block.cloneNode(false) as HTMLElement;
  (currentChunk as HTMLElement).innerHTML = '';
  let currentH = 0;

  for (const child of children) {
    const clone = child.cloneNode(true) as HTMLElement;
    // Measure how tall this child is
    const wrapper = block.cloneNode(false) as HTMLElement;
    wrapper.innerHTML = '';
    wrapper.appendChild(clone.cloneNode(true));
    const childH = measureElement(wrapper, measureContainer);

    if (currentH + childH > maxHeight && currentChunk.children.length > 0) {
      chunks.push(currentChunk);
      currentChunk = block.cloneNode(false) as HTMLElement;
      (currentChunk as HTMLElement).innerHTML = '';
      currentH = 0;
    }
    currentChunk.appendChild(clone);
    currentH += childH;
  }
  if (currentChunk.children.length > 0) chunks.push(currentChunk);
  return chunks.length > 0 ? chunks : [block];
}

/**
 * Main export: generates a PDF from a report element.
 *
 * @param reportElement - The root report DOM element (the one with class print-report)
 * @param filename - Output filename
 */
export async function generateReportPDF(reportElement: HTMLElement, filename: string): Promise<void> {
  const html2canvas = (await import('html2canvas-pro')).default;
  const { jsPDF } = await import('jspdf');

  // 1. Create a hidden off-screen container with A4 width
  const offscreen = document.createElement('div');
  offscreen.style.cssText = `
    position: fixed; left: -9999px; top: 0;
    width: ${A4_WIDTH_PX}px;
    background: white;
    font-family: 'Montserrat', sans-serif;
    z-index: -1;
    overflow: hidden;
  `;
  document.body.appendChild(offscreen);

  // Measurement container (same width, for measuring individual blocks)
  const measureDiv = document.createElement('div');
  measureDiv.style.cssText = `
    position: fixed; left: -19999px; top: 0;
    width: ${A4_WIDTH_PX}px;
    background: white;
    font-family: 'Montserrat', sans-serif;
    z-index: -1;
    overflow: hidden;
  `;
  document.body.appendChild(measureDiv);

  try {
    // 2. Clone the report
    const clone = reportElement.cloneNode(true) as HTMLElement;
    clone.style.width = `${A4_WIDTH_PX}px`;
    clone.style.borderRadius = '0';
    clone.style.overflow = 'visible';

    // Force ALL accordions / collapsible regions open in the clone
    clone.querySelectorAll('[data-state]').forEach(el => {
      el.setAttribute('data-state', 'open');
    });
    // Force every region / hidden content area to be fully visible
    clone.querySelectorAll('[role="region"], [data-radix-collapsible-content], [data-radix-accordion-content]').forEach(el => {
      const htmlEl = el as HTMLElement;
      htmlEl.style.cssText += ';display:block!important;height:auto!important;max-height:none!important;overflow:visible!important;opacity:1!important;visibility:visible!important;animation:none!important;transition:none!important;';
    });
    // Also force any element with hidden/animating styles
    clone.querySelectorAll('[hidden], [style*="display: none"], [style*="height: 0"]').forEach(el => {
      const htmlEl = el as HTMLElement;
      htmlEl.removeAttribute('hidden');
      htmlEl.style.cssText += ';display:block!important;height:auto!important;overflow:visible!important;';
    });

    // Remove print:hidden elements
    clone.querySelectorAll('.print\\:hidden, [class*="print:hidden"]').forEach(el => el.remove());

    // Place in measurement container to get computed styles
    offscreen.appendChild(clone);

    // Wait for images and styles to settle
    await new Promise(r => setTimeout(r, 200));

    // 3. Collect all [data-pdf-section] blocks from anywhere in the clone.
    //    We use a deep querySelectorAll so nested accordion items are always found.
    const blocks: HTMLElement[] = [];
    const allSections = clone.querySelectorAll('[data-pdf-section]');
    
    if (allSections.length > 0) {
      allSections.forEach(s => blocks.push(s as HTMLElement));
    } else {
      // Fallback: grab every direct child of the content wrapper
      const topChildren = Array.from(clone.children) as HTMLElement[];
      for (const child of topChildren) {
        if (child.children.length > 0 || child.textContent?.trim()) {
          blocks.push(child);
        }
      }
    }

    // Remove blocks from clone (we'll place them in pages)
    offscreen.removeChild(clone);

    // 4. Measure each block
    const measuredBlocks: BlockInfo[] = [];
    for (const block of blocks) {
      const detached = block.cloneNode(true) as HTMLElement;
      const h = measureElement(detached, measureDiv);
      if (h > CONTENT_HEIGHT) {
        // Split large block
        const subBlocks = splitLargeBlock(detached, CONTENT_HEIGHT, measureDiv);
        for (const sub of subBlocks) {
          const subH = measureElement(sub.cloneNode(true) as HTMLElement, measureDiv);
          measuredBlocks.push({ element: sub, height: subH });
        }
      } else {
        measuredBlocks.push({ element: detached, height: h });
      }
    }

    // 5. Distribute blocks into pages
    const pages: BlockInfo[][] = [];
    let currentPage: BlockInfo[] = [];
    let currentHeight = 0;

    for (const block of measuredBlocks) {
      if (currentHeight + block.height > CONTENT_HEIGHT && currentPage.length > 0) {
        pages.push(currentPage);
        currentPage = [];
        currentHeight = 0;
      }
      currentPage.push(block);
      currentHeight += block.height;
    }
    if (currentPage.length > 0) pages.push(currentPage);

    // 6. Render each page and capture
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();

    for (let i = 0; i < pages.length; i++) {
      const pageDiv = document.createElement('div');
      pageDiv.style.cssText = `
        width: ${A4_WIDTH_PX}px;
        min-height: ${A4_HEIGHT_PX}px;
        background: white;
        padding: ${PAGE_PADDING}px;
        box-sizing: border-box;
        font-family: 'Montserrat', sans-serif;
        overflow: hidden;
      `;

      // First page: no top padding (header goes edge-to-edge)
      if (i === 0) {
        pageDiv.style.padding = '0';
        pageDiv.style.paddingBottom = `${PAGE_PADDING}px`;
      }

      for (const block of pages[i]) {
        const el = block.element.cloneNode(true) as HTMLElement;
        pageDiv.appendChild(el);
      }

      offscreen.appendChild(pageDiv);
      await new Promise(r => setTimeout(r, 100)); // let it render

      const canvas = await html2canvas(pageDiv, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        width: A4_WIDTH_PX,
        windowWidth: A4_WIDTH_PX,
      });

      offscreen.removeChild(pageDiv);

      const imgData = canvas.toDataURL('image/jpeg', 0.92);
      if (i > 0) pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
    }

    pdf.save(filename);
  } finally {
    document.body.removeChild(offscreen);
    document.body.removeChild(measureDiv);
  }
}
