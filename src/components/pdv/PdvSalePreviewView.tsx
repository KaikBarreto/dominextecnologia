import { PdvCatalogSkeleton } from '@/components/pdv/loading/PdvPageSkeleton';
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from 'react';
import { canNavigatePdvCatalogFromPage } from '@/lib/pdv/catalogKeyboard';
import { findPdvGridNeighbor, type PdvGridDirection } from '@/lib/pdv/keyboard';
import { LogOut, Plus, Search } from 'lucide-react';
import { SignedImg } from '@/components/ui/SignedImg';
import { PdvProductCode, PdvProductPlaceholder } from './PdvProductIdentity';
import type { PdvGridProduct } from './PdvProductCard';
import './pdv-preview-sale.css';

/** Mesma composição do preview aprovado, agora com eventos e dados do workspace real. */
export function PdvSalePreviewView({
  mode, onModeChange, search, onSearchChange, onSearchKeyDown, searchInputRef,
  gridRef, controlsRef, rowRef, onGridKeyDown, products, onSearchConfirm,
  onProductFocus, onProductSelect, formatCurrency, onExit, camera, filters,
  cart, style, title = 'Nova venda', allowUnavailableProducts = false, disabled = false, catalogLoading = false, exitLabel = 'Sair da venda', footerHint = '↑ ↓ ← → navegar · Enter incluir · / buscar · F4 receber',
}: {
  mode: 'quick' | 'catalog'; onModeChange: (mode: 'quick' | 'catalog') => void;
  search: string; onSearchChange: (value: string) => void;
  onSearchKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  searchInputRef: RefObject<HTMLInputElement>; gridRef: RefObject<HTMLDivElement>;
  controlsRef: RefObject<HTMLDivElement>; rowRef: RefObject<HTMLDivElement>;
  onGridKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  products: readonly PdvGridProduct[]; activeProductId: string | null;
  keyboardHighlight?: boolean;
  /** A busca pode preservar regras específicas, como 2*SKU na venda. */
  onSearchConfirm?: (product: PdvGridProduct) => void;
  onProductFocus: (id: string) => void; onProductSelect: (product: PdvGridProduct) => void;
  formatCurrency: (amount: number) => string; onExit: () => void;
  camera?: ReactNode; filters?: ReactNode; cart: ReactNode; style?: CSSProperties; title?: string;
  allowUnavailableProducts?: boolean; disabled?: boolean; catalogLoading?: boolean; exitLabel?: string; footerHint?: string;
}) {
  const listId = useId();
  const composing = useRef(false);
  const initialFocusAttempted = useRef(false);
  useLayoutEffect(() => {
    if (initialFocusAttempted.current || catalogLoading || disabled) return;
    const frame = window.requestAnimationFrame(() => {
      initialFocusAttempted.current = true;
      if (window.innerWidth < 768) return;
      const input = searchInputRef.current;
      if (!input) return;
      const coveringDialog = [...document.querySelectorAll<HTMLElement>('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')]
        .some(dialog => !dialog.contains(input));
      if (coveringDialog) return;
      const active = document.activeElement;
      if (active && active !== document.body && active !== document.documentElement && active !== input) {
        // O botão de entrada da tela pode ceder o foco. Edição iniciada no
        // carrinho, cliente ou outro formulário deve continuar onde está.
        if (rowRef.current?.contains(active) || !(active instanceof HTMLButtonElement) || active.matches('[role="combobox"]')) return;
      }
      input.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [catalogLoading, disabled, rowRef, searchInputRef]);
  const enabledProducts = disabled || catalogLoading ? [] : products.filter(product => allowUnavailableProducts || product.availableQuantity > 0);
  const selectionKey = `${mode}\0${search}\0${enabledProducts.map(product => product.inventoryId).join('\0')}`;
  const hasSearch = search.trim().length > 0;
  const firstResult = hasSearch ? enabledProducts[0]?.inventoryId ?? null : null;
  const [selection, setSelection] = useState<{ key: string; id: string | null; source: 'auto' | 'keyboard' | 'pointer' }>({ key: '', id: null, source: 'auto' });
  const selectedId = selection.key === selectionKey && enabledProducts.some(product => product.inventoryId === selection.id)
    ? selection.id : firstResult;
  const notifySelection = useRef(onProductFocus);
  notifySelection.current = onProductFocus;
  useLayoutEffect(() => {
    const first = hasSearch ? enabledProducts[0]?.inventoryId ?? null : null;
    setSelection({ key: selectionKey, id: first, source: 'auto' });
    if (first) notifySelection.current(first);
    // A identidade da lista inclui os produtos habilitados; callbacks dos controladores
    // não devem reiniciar a seleção a cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionKey]);
  const optionId = (id: string) => `${listId}-${encodeURIComponent(id)}`;
  function choose(id: string, source: 'keyboard' | 'pointer' = 'keyboard') {
    setSelection({ key: selectionKey, id, source });
    onProductFocus(id);
    gridRef.current?.querySelector<HTMLElement>(`[id="${optionId(id)}"]`)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }
  function leavePointer(id: string) {
    setSelection(current => current.key === selectionKey && current.id === id && current.source === 'pointer'
      ? { key: selectionKey, id: firstResult, source: 'auto' } : current);
  }
  function focusSearch() {
    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus({ preventScroll: true });
      searchInputRef.current?.select();
    });
  }
  function include(product: PdvGridProduct, fromSearch = false) {
    if (!enabledProducts.some(candidate => candidate.inventoryId === product.inventoryId)) return;
    setSelection({ key: selectionKey, id: firstResult, source: 'auto' });
    if (fromSearch && onSearchConfirm) onSearchConfirm(product); else onProductSelect(product);
    focusSearch();
  }
  function keyDown(event: ReactKeyboardEvent<HTMLInputElement | HTMLDivElement> | KeyboardEvent, origin: 'search' | 'grid' | 'page') {
    const fromSearch = origin === 'search';
    const nativeEvent = 'nativeEvent' in event ? event.nativeEvent : event;
    if (event.defaultPrevented) return;
    if (composing.current || nativeEvent.isComposing || nativeEvent.keyCode === 229) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const coveringDialog = [...document.querySelectorAll<HTMLElement>('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')].at(-1);
    if (coveringDialog && !coveringDialog.contains(event.target instanceof Node ? event.target : null)) return;
    if (event.key === 'Enter' && event.repeat) { event.preventDefault(); event.stopPropagation(); return; }
    const direction = ({ ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' } as Record<string, PdvGridDirection>)[event.key];
    // Esquerda/direita continuam editando o texto da busca. Com campo vazio,
    // essas setas também navegam, como as da grade.
    if (direction && !(fromSearch && search && (direction === 'left' || direction === 'right'))) {
      event.preventDefault(); event.stopPropagation();
      if (!enabledProducts.length) return;
      if (!selectedId) {
        const initial = enabledProducts[direction === 'up' || direction === 'left' ? enabledProducts.length - 1 : 0];
        choose(initial.inventoryId);
        (fromSearch ? searchInputRef.current : gridRef.current)?.focus({ preventScroll: true });
        return;
      }
      const buttons = [...(gridRef.current?.querySelectorAll<HTMLButtonElement>('[data-pdv-product-id]:not(:disabled)') ?? [])];
      const rects = buttons.map(button => { const rect = button.getBoundingClientRect(); return { id: button.dataset.pdvProductId!, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }; });
      const geometric = findPdvGridNeighbor(rects, selectedId, direction);
      const index = enabledProducts.findIndex(product => product.inventoryId === selectedId);
      const next = geometric && geometric !== selectedId ? geometric : enabledProducts[(index + (direction === 'up' || direction === 'left' ? -1 : 1) + enabledProducts.length) % enabledProducts.length]?.inventoryId;
      if (next) choose(next);
      (fromSearch ? searchInputRef.current : gridRef.current)?.focus({ preventScroll: true });
      return;
    }
    if (direction && fromSearch) return;
    if (event.key === 'Enter' || !fromSearch && event.key === ' ') {
      event.preventDefault(); event.stopPropagation();
      // Sem pesquisa, apenas navegação explícita por setas autoriza o Enter.
      // Hover destaca o material, mas não transforma Enter acidental em inclusão.
      const explicitSelection = selection.key === selectionKey && selection.source === 'keyboard';
      if ((origin === 'page' || fromSearch && !hasSearch) && !explicitSelection) return;
      const product = enabledProducts.find(candidate => candidate.inventoryId === selectedId);
      if (product) include(product, true);
      else if (!disabled && !catalogLoading && fromSearch && hasSearch) onSearchKeyDown(event as ReactKeyboardEvent<HTMLInputElement>);
      return;
    }
    if (fromSearch) onSearchKeyDown(event as ReactKeyboardEvent<HTMLInputElement>); else if (origin === 'grid') onGridKeyDown(event as ReactKeyboardEvent<HTMLDivElement>);
  }
  const pageKeyDown = useRef<(event: KeyboardEvent) => void>(() => {});
  pageKeyDown.current = event => {
    if (event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229 || composing.current
      || event.ctrlKey || event.metaKey || event.altKey) return;
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(event.key)) return;
    if (disabled || catalogLoading || !enabledProducts.length) return;
    if (!rowRef.current?.isConnected || rowRef.current.closest('[hidden], [inert], [aria-hidden="true"]')) return;
    if (!canNavigatePdvCatalogFromPage(event.target, gridRef.current)) return;
    keyDown(event, 'page');
  };
  useEffect(() => {
    const listener = (event: KeyboardEvent) => pageKeyDown.current(event);
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, []);
  return <div className="sale" ref={rowRef} style={style}>
    <section className={'catalog ' + (mode === 'quick' ? 'quick' : '')}>
      <div ref={controlsRef}>
        <div className="cataloghead row between"><div><h1>{title}</h1><small>Busque, leia o código ou escolha um material.</small></div><button type="button" className="iconbtn negative" onClick={onExit} aria-label={exitLabel}><LogOut /></button></div>
        <div className="catalogswitch" role="tablist" aria-label="Modo de busca dos materiais"><button type="button" role="tab" aria-selected={mode === 'quick'} className={mode === 'quick' ? 'active' : ''} onClick={() => onModeChange('quick')}>Busca rápida</button><button type="button" role="tab" aria-selected={mode === 'catalog'} className={mode === 'catalog' ? 'active' : ''} onClick={() => onModeChange('catalog')}>Catálogo</button></div>
        <div className="row"><label className="search grow"><Search /><input ref={searchInputRef} id="product-search" type="search" name="pdv-busca-produto" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} data-1p-ignore data-lpignore="true" data-form-type="other" role="combobox" aria-autocomplete="list" aria-haspopup="listbox" aria-expanded={!catalogLoading && products.length > 0} aria-controls={listId} aria-activedescendant={selectedId ? optionId(selectedId) : undefined} aria-label="Buscar material por nome ou código" placeholder="Buscar nome ou código do material" value={search} onChange={event => onSearchChange(event.target.value)} onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }} onKeyDown={event => keyDown(event, 'search')} /><kbd>/</kbd></label>{camera}</div>
        {mode === 'catalog' && <div className="chips">{filters}</div>}
        {mode === 'quick' && <p className="quickcaption">Materiais disponíveis e resultados da busca</p>}
      </div>
      <div className={'products outline-none ' + (mode === 'quick' ? 'quickproducts' : '')} id={listId} role="listbox" aria-busy={catalogLoading} aria-label="Materiais disponíveis" aria-activedescendant={selectedId ? optionId(selectedId) : undefined} ref={gridRef} tabIndex={-1} onKeyDown={event => keyDown(event, 'grid')}>
        {catalogLoading ? <div className="col-span-full"><PdvCatalogSkeleton mode={mode} /></div> : products.map(product => <button type="button" key={product.inventoryId} className={'product ' + (mode === 'quick' ? 'productrow' : '') + (selectedId === product.inventoryId ? ' keyboard-active' : '')} data-pdv-product-id={product.inventoryId} id={optionId(product.inventoryId)} role="option" aria-selected={selectedId === product.inventoryId} aria-label={'Adicionar ' + [product.sku, product.name].filter(Boolean).join(' ')} disabled={disabled || catalogLoading || (!allowUnavailableProducts && product.availableQuantity <= 0)} tabIndex={-1} onFocus={() => { if (selectedId !== product.inventoryId) choose(product.inventoryId); }} onPointerMove={() => { if (selectedId !== product.inventoryId && enabledProducts.some(candidate => candidate.inventoryId === product.inventoryId)) choose(product.inventoryId, 'pointer'); }} onPointerLeave={() => leavePointer(product.inventoryId)} onMouseDown={event => event.preventDefault()} onClick={() => include(product)}>
          {mode === 'quick' ? <><div className="quickphoto pdv-product-thumbnail">{product.imageUrl ? <SignedImg src={product.imageUrl} alt="" className="max-h-full max-w-full object-contain" fallbackLabel="" /> : <PdvProductPlaceholder label="Sem foto" />}</div><div className="grow"><strong>{product.sku && <PdvProductCode code={product.sku} />}{product.name}</strong><small>{product.availableQuantity === Number.MAX_SAFE_INTEGER ? 'Disponível' : product.availableQuantity.toLocaleString('pt-BR') + ' ' + (product.unit || 'un') + ' disponíveis'}</small></div><strong className="amount">{formatCurrency(product.unitPrice)}</strong><span className="quickadd"><Plus /></span></> : <><div className="productart pdv-product-thumbnail">{product.imageUrl ? <SignedImg src={product.imageUrl} alt="" className="h-full w-full object-contain" /> : <PdvProductPlaceholder label="Sem foto" />}</div><div className="productinfo"><strong>{product.sku && <PdvProductCode code={product.sku} />}{product.name}</strong><small>Por {product.unit || 'un'}</small><div className="row between"><strong className="productprice amount">{formatCurrency(product.unitPrice)}</strong><span className="stock">{product.availableQuantity === Number.MAX_SAFE_INTEGER ? 'Disponível' : product.availableQuantity.toLocaleString('pt-BR') + ' ' + (product.unit || 'un')}</span></div></div></>}
        </button>)}
        {!catalogLoading && !products.length && <div className="empty">Nenhum material encontrado.</div>}
      </div>
      <p className="catalogfoot">{footerHint}</p>
    </section>
    <aside className="cart">{cart}</aside>
  </div>;
}
