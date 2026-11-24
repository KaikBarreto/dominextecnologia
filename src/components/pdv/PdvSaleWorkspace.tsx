import { createPortal } from 'react-dom';
import { ShoppingCart } from 'lucide-react';
import { useLayoutEffect, useState, type ComponentProps, type ReactNode } from 'react';
import { usePdvDomiLinkWorkspace } from '@/hooks/usePdvDomiLinkWorkspace';
import { PdvSalePreviewView } from './PdvSalePreviewView';
import { PdvCartPanel } from './PdvCartPanel';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from '@/components/ui/drawer';

type CatalogProps = Omit<ComponentProps<typeof PdvSalePreviewView>, 'cart'>;
/** Composição única da venda e do orçamento: catálogo, carrinho e recebimento mobile. */
export function PdvSaleWorkspace({ catalog, cart, mobile, drawerOpen, onDrawerOpenChange,
  itemCount, itemCountLabel, formattedTotal, drawerTitle, header, hardwareContextKey, hardwareBlocked = false,
}: { catalog: CatalogProps; cart: ComponentProps<typeof PdvCartPanel>; mobile: boolean;
  drawerOpen: boolean; onDrawerOpenChange: (open: boolean) => void; itemCount: number;
  itemCountLabel: string; formattedTotal: string; drawerTitle: string; header?: ReactNode; hardwareContextKey?: string; hardwareBlocked?: boolean;
}) {
  const hardware = usePdvDomiLinkWorkspace({
    identity: cart.cart, contextKey: hardwareContextKey,
    blocked: hardwareBlocked || !!cart.readOnly || !!catalog.disabled,
    quantityReadOnly: cart.quantityReadOnly,
    getLine: id => cart.cart.lines.find(line => line.inventoryId === id),
    onSetQuantity: cart.onSetQuantity, onSearchChange: catalog.onSearchChange,
    searchInputRef: catalog.searchInputRef,
  });
  const scanner = hardware.scannerControl;
  const enhancedCart = { ...cart, weighControl: hardware.weighControl };
  const [height, setHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (mobile) { setHeight(null); return; }
    const row = catalog.rowRef.current;
    if (!row) return;
    const measure = () => {
      const available = Math.floor((window.visualViewport?.height ?? window.innerHeight) - row.getBoundingClientRect().top - 52 - 24);
      // Telas baixas também precisam limitar o carrinho: voltar à altura
      // natural empurra o recebimento para fora da área visível.
      setHeight(available > 0 ? available : null);
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(row);
    if (row.parentElement) observer?.observe(row.parentElement);
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); window.visualViewport?.removeEventListener('resize', measure); };
  }, [mobile, catalog.rowRef]);
  return <>
    {header}
    <PdvSalePreviewView {...catalog} camera={<>{catalog.camera}{scanner}</>} style={catalog.style ?? (height != null ? { height } : undefined)} cart={!mobile ? <PdvCartPanel {...enhancedCart} /> : null} />
    {mobile && <>
      {createPortal(<button type="button" onClick={() => onDrawerOpenChange(true)} className="fixed inset-x-0 z-40 flex items-center justify-between gap-3 rounded-t-xl border-t border-border bg-primary px-4 py-3 text-primary-foreground shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background" style={{ bottom: 'calc(104px + env(safe-area-inset-bottom))' }}>
        <span className="flex items-center gap-2 text-sm font-semibold"><ShoppingCart className="h-4 w-4" /><span key={itemCount} className="animate-in zoom-in-90 duration-200">{itemCountLabel}</span></span>
        <span key={formattedTotal} className="animate-in zoom-in-90 duration-200 text-lg font-extrabold tabular-nums">{formattedTotal}</span>
      </button>, document.body)}
      <Drawer open={drawerOpen} onOpenChange={onDrawerOpenChange}><DrawerContent className="pdv-preview-sale flex max-h-[85dvh] flex-col"><DrawerHeader className="sr-only"><DrawerTitle>{drawerTitle}</DrawerTitle><DrawerDescription>Confira os materiais, o cliente e o total para concluir o atendimento.</DrawerDescription></DrawerHeader><PdvCartPanel {...enhancedCart} className="flex-1 overflow-hidden" /></DrawerContent></Drawer>
    </>}
  </>;
}
