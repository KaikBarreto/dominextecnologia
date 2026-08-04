/**
 * Helper compartilhado: botão flutuante de download direto de PDF.
 *
 * Injeta o CDN do html2pdf.js e define uma função `downloadPdf()` que captura
 * `targetSelector` (padrão `#pdf-root`) e gera o download sem passar pela
 * caixa de impressão do navegador.
 *
 * Padrão canônico: src/utils/holeriteHtmlGenerator.ts (linhas ~276-292).
 */

const HTML2PDF_CDN =
  'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';

/**
 * Retorna o HTML do botão flutuante + tags <script> de download direto.
 * Deve ser inserido imediatamente antes de `</body>` no documento gerado.
 *
 * @param opts.filename       Nome do arquivo .pdf (será sanitizado).
 * @param opts.label          Texto do botão (deve vir de i18n — nunca hardcode).
 * @param opts.targetSelector Seletor do elemento a capturar. Padrão: '#pdf-root'.
 */
export function pdfDownloadAssets(opts: {
  filename: string;
  label: string;
  targetSelector?: string;
}): string {
  const selector = opts.targetSelector ?? '#pdf-root';
  // Sanitiza o filename: mantém apenas alfanuméricos, hífens e underscores.
  const safeFilename = opts.filename.replace(/[^a-zA-Z0-9-_]/g, '-');
  // Escape do label para não quebrar o atributo HTML inline.
  const safeLabel = opts.label
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  return `
<button
  class="no-print"
  onclick="downloadPdf()"
  style="position:fixed;bottom:24px;right:24px;background:linear-gradient(135deg,#1e293b,#0f172a);color:white;border:none;padding:12px 24px;border-radius:10px;cursor:pointer;font-size:14px;font-weight:600;z-index:100;box-shadow:0 4px 14px rgba(0,0,0,0.3);display:flex;align-items:center;gap:8px"
  onmouseover="this.style.background='linear-gradient(135deg,#334155,#1e293b)'"
  onmouseout="this.style.background='linear-gradient(135deg,#1e293b,#0f172a)'"
>
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
    <polyline points="7 10 12 15 17 10"></polyline>
    <line x1="12" y1="15" x2="12" y2="3"></line>
  </svg>
  ${safeLabel}
</button>
<script src="${HTML2PDF_CDN}"></script>
<script>
  function downloadPdf() {
    var el = document.querySelector('${selector}');
    if (!el || !window.html2pdf) return;
    window.html2pdf().set({
      margin: [10, 10, 10, 10],
      filename: '${safeFilename}.pdf',
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    }).from(el).save();
  }
</script>`;
}
