/** O leitor do catálogo não deve transformar edição de quantidade/cliente em inclusão. */
export function canCapturePdvCatalogScan(target: EventTarget | null, search: HTMLInputElement | null): boolean {
  const dialog = [...document.querySelectorAll<HTMLElement>('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')].at(-1);
  if (dialog && (!search || !dialog.contains(search))) return false;
  if (!(target instanceof HTMLElement)) return true;
  if (target.closest('input, textarea, select, [contenteditable="true"], [role="combobox"]')) return target === search;
  return true;
}


const PDV_KEYBOARD_CONTROL = 'input, textarea, select, button, a[href], summary, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="combobox"], [role="textbox"], [role="searchbox"], [role="spinbutton"], [role="slider"], [role="checkbox"], [role="radio"], [role="switch"], [role="menu"], [role="menubar"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="listbox"], [role="option"], [role="tablist"], [role="tab"], [role="tree"], [role="treeitem"], [tabindex]:not([tabindex="-1"])';

/** Setas da página só pertencem ao catálogo quando nenhum controle está sendo operado. */
export function canNavigatePdvCatalogFromPage(target: EventTarget | null, catalog: HTMLElement | null): boolean {
  const neutral = (element: EventTarget | null) => element instanceof Element
    && !(element instanceof HTMLElement && element.isContentEditable)
    && !element.closest(PDV_KEYBOARD_CONTROL);
  if (!neutral(target) || !neutral(document.activeElement)) return false;
  return ![...document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"], dialog[open], [role="menu"], [role="menubar"], [role="listbox"], [role="tree"]')]
    .some(overlay => overlay !== catalog
      // O orçamento pode usar um diálogo fullscreen como sua própria tela.
      // Só ele é permitido: um modal filho ou portal externo continua suspendendo a grade.
      && !(catalog && overlay.matches('[role="dialog"], [role="alertdialog"], dialog')
        && overlay.contains(catalog) && target instanceof Node && overlay.contains(target))
      && !overlay.closest('[hidden], [inert], [aria-hidden="true"], [data-state="closed"]')
      && window.getComputedStyle(overlay).display !== 'none'
      && window.getComputedStyle(overlay).visibility !== 'hidden');
}
