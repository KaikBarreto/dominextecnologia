/**
 * Abre um Blob PDF em nova aba, com UX de "voltar" e "baixar".
 *
 * Por quê: o visualizador de PDF nativo do navegador/mobile abre o blob, mas
 * em PWA standalone (e em vários browsers mobile) o usuário fica "preso" sem um
 * jeito claro de voltar pra tela anterior, e o botão "Salvar" do viewer usa o
 * UUID do blob como nome de arquivo. Este wrapper resolve os dois:
 *  - Desktop: iframe full-screen + botão flutuante "Baixar PDF" (com o nome
 *    bonito via `<a download>`).
 *  - Mobile: header sticky com "✕ Voltar" + título + botão "Baixar PDF" maior.
 *
 * Quando aplica: qualquer relatório/comprovante PDF que a gente queira deixar
 * navegável no mobile (ex.: Movimentações Financeiras).
 *
 * Aceita um `targetWindow` opcional: a chamada deve abrir `window.open('','_blank')`
 * AINDA dentro do gesto de clique do usuário (workaround de popup-blocker) e
 * passar a janela aqui depois que o blob estiver pronto.
 */

const sanitizeFilename = (s: string): string =>
  s.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/\s+/g, ' ').trim();

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function isMobileUA(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

export function openPdfInTab(
  blob: Blob,
  filenameNoExt: string,
  targetWindow?: Window | null,
): void {
  const safeName = sanitizeFilename(filenameNoExt) || 'relatorio';
  const fullName = `${safeName}.pdf`;
  const blobUrl = URL.createObjectURL(blob);

  // Pega a janela alvo: se foi pré-aberta no clique do user (popup-blocker
  // workaround) usa essa; senão tenta abrir uma nova.
  let tab: Window | null = null;
  if (targetWindow && !targetWindow.closed) {
    tab = targetWindow;
  } else {
    tab = window.open('', '_blank');
  }

  const mobile = isMobileUA();

  // Desktop: wrapper minimal (iframe + botão "Baixar PDF" discreto).
  if (tab && !mobile) {
    try {
      const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(fullName)}</title>
  <link rel="icon" href="data:," />
  <style>
    html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; background: #525659; }
    iframe { width: 100%; height: 100%; border: 0; display: block; }
    .dl-btn-desktop {
      position: fixed; right: 16px; bottom: 16px;
      background: rgba(22, 163, 74, 0.92); color: white; text-decoration: none;
      padding: 8px 14px; border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-weight: 500; font-size: 12.5px; letter-spacing: 0.1px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.28);
      display: inline-flex; align-items: center; gap: 6px;
      transition: background 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
      z-index: 999; opacity: 0.85;
    }
    .dl-btn-desktop:hover {
      background: rgba(21, 128, 61, 1); opacity: 1;
      transform: translateY(-1px); box-shadow: 0 6px 16px rgba(0,0,0,0.35);
    }
    .dl-btn-desktop svg { width: 14px; height: 14px; }
  </style>
</head>
<body>
  <iframe src="${blobUrl}" name="${escapeHtml(fullName)}" title="${escapeHtml(fullName)}"></iframe>
  <a class="dl-btn-desktop" href="${blobUrl}" download="${escapeHtml(fullName)}" title="Baixar como ${escapeHtml(fullName)}">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
    Baixar PDF
  </a>
</body>
</html>`;
      tab.document.open();
      tab.document.write(html);
      tab.document.close();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10 * 60_000);
      return;
    } catch (err) {
      console.warn('[openPdfInTab] wrapper desktop falhou, caindo pro blob direto:', err);
      try { tab.location.href = blobUrl; } catch { /* ignore */ }
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10 * 60_000);
      return;
    }
  }

  // Mobile: wrapper completo com header "✕ Voltar" + título + botão "Baixar PDF".
  if (tab) {
    try {
      const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(fullName)}</title>
  <link rel="icon" href="data:," />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <style>
    html, body { margin: 0; padding: 0; height: 100%; background: #525659; overflow: hidden; }
    #top-bar {
      position: fixed; top: 0; left: 0; right: 0; z-index: 20;
      display: flex; align-items: center; gap: 12px;
      padding: 12px max(16px, env(safe-area-inset-right, 16px)) 12px max(16px, env(safe-area-inset-left, 16px));
      padding-top: calc(12px + env(safe-area-inset-top, 0px));
      background: #fff; border-bottom: 1px solid #e5e7eb; box-sizing: border-box;
    }
    #top-bar h1 {
      flex: 1; margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 15px; font-weight: 600; color: #111827;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    #close-btn {
      flex: none; width: 36px; height: 36px; border: 0; border-radius: 10px;
      background: #f3f4f6; color: #374151; font-size: 20px; font-weight: 500;
      cursor: pointer; display: flex; align-items: center; justify-content: center;
      padding: 0; line-height: 1;
    }
    #close-btn:active { background: #e5e7eb; transform: scale(0.96); }
    #pdf-wrapper { position: fixed; top: 60px; left: 0; right: 0; bottom: 0; background: #525659; }
    iframe { width: 100%; height: 100%; border: 0; display: block; }
    .dl-btn {
      position: fixed; right: 16px; bottom: calc(16px + env(safe-area-inset-bottom, 0px));
      background: linear-gradient(135deg, #16a34a 0%, #15803d 100%);
      color: white; text-decoration: none;
      padding: 11px 18px; border-radius: 10px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-weight: 600; font-size: 13px; letter-spacing: 0.2px;
      box-shadow: 0 6px 16px rgba(0,0,0,0.35);
      display: inline-flex; align-items: center; gap: 8px;
      transition: transform 0.15s ease, box-shadow 0.15s ease; z-index: 999;
    }
    .dl-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 20px rgba(0,0,0,0.4); }
    .dl-btn svg { width: 16px; height: 16px; }
  </style>
</head>
<body>
  <div id="top-bar">
    <button id="close-btn" type="button" aria-label="Voltar">✕</button>
    <h1>${escapeHtml(fullName)}</h1>
  </div>
  <div id="pdf-wrapper">
    <iframe src="${blobUrl}" name="${escapeHtml(fullName)}" title="${escapeHtml(fullName)}"></iframe>
  </div>
  <a class="dl-btn" href="${blobUrl}" download="${escapeHtml(fullName)}" title="Baixar como ${escapeHtml(fullName)}">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
    Baixar PDF
  </a>
  <script>
    document.getElementById('close-btn').addEventListener('click', function () {
      // window.close() funciona em janela aberta via window.open. Em PWA
      // standalone, fecha a aba/view. Fallback: history.back().
      try { window.close(); } catch (e) {}
      setTimeout(function () { if (!window.closed) window.history.back(); }, 100);
    });
  </script>
</body>
</html>`;
      tab.document.open();
      tab.document.write(html);
      tab.document.close();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10 * 60_000);
      return;
    } catch (err) {
      console.warn('[openPdfInTab] wrapper mobile falhou, abrindo blob direto:', err);
      try { tab.location.href = blobUrl; } catch { /* ignore */ }
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10 * 60_000);
      return;
    }
  }

  // Popup bloqueado → cai num <a download> programático que ao menos
  // garante o salvamento com o nome correto.
  try {
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = fullName;
    a.target = '_blank';
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch (e) {
    console.warn('[openPdfInTab] anchor fallback falhou:', e);
  }
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
}
