import { usePdvDomiLinkWorkspace } from '@/hooks/usePdvDomiLinkWorkspace';
import { PdvCouponControl } from '@/components/pdv/coupons/PdvCouponControl';
import { confirmedCouponDiscount, couponCartReady } from '@/lib/pdv/cart';
import { PdvPageSkeleton } from '@/components/pdv/loading/PdvPageSkeleton';
import { canCapturePdvCatalogScan } from '@/lib/pdv/catalogKeyboard';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Paperclip, RefreshCw, ShoppingCart } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { PdvAdvancedOptionsDialog, type PdvPendingAttachment } from '@/components/pdv/PdvAdvancedOptionsDialog';
import { PdvCartPanel } from '@/components/pdv/PdvCartPanel';
import { PdvSalePreviewView } from '@/components/pdv/PdvSalePreviewView';
import { PdvPaymentDialog } from '@/components/pdv/PdvPaymentDialog';
import { PdvAppliedVouchersControl } from '@/components/pdv/PdvAppliedVoucherControl';
import { type PdvGridProduct } from '@/components/pdv/PdvProductCard';
import { PdvOrderReceiptButton, usePdvOrderReceiptOpener } from '@/components/pdv/receipt/PdvOrderReceiptButton';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner';
import { useInventoryIdentifiers } from '@/hooks/useInventoryIdentifiers';
import {
  canonicalizePdvDirectSalePayments,
  resolvePdvDirectSaleAttemptV2,
  type PdvDirectSaleAttemptV2,
  type usePdvDirectSaleV2,
} from '@/hooks/usePdvDirectSaleV2';
import { usePdvStageReceiptAuto } from '@/hooks/usePdvStageReceiptAuto';
import { resolvePdvReceiptStagePolicy } from '@/lib/pdv/receipt/stagePolicy';
import { usePdvReceiptSettings } from '@/hooks/usePdvReceiptSettings';
import { useUploadPdvOrderAttachment } from '@/hooks/usePdvSale';
import { useToast } from '@/hooks/use-toast';
import {
  EMPTY_CART,
  addItem,
  clearCart,
  computeTotal,
  computeSubtotal,
  incrementLineQuantity,
  removeItem,
  setCartCustomer,
  setCartFinalAmount,
  setDiscount,
  setLineFinalAmount,
  setLineDiscount,
  setLineQuantity,
  type CartState,
} from '@/lib/pdv/cart';
import { clampStoredValueApplication } from '@/lib/pdv/payment';
import { clampAppliedVouchers, type PdvAppliedVoucher } from '@/lib/pdv/sale-drafts';
import { readDeviceReceiptFormat } from '@/lib/pdv/receipt/devicePreference';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatMoney, getCurrencySymbol, toBcp47 } from '@/lib/format';
import { todayInTz } from '@/lib/timezone';
import type { Customer } from '@/types/database';
import { toPdvCustomerRecord } from '@/lib/pdv/catalogCustomer';
import { processImageFile } from '@/utils/imageConvert';
import { InventoryIdentifierCameraScanner } from '@/components/inventory/identifiers/InventoryIdentifierCameraScanner';
import {
  findPdvGridNeighbor,
  shouldNavigatePdvCatalogFromSearch,
  type PdvGridDirection,
  type PdvGridItemRect,
} from '@/lib/pdv/keyboard';

type DirectSale = ReturnType<typeof usePdvDirectSaleV2>;

interface PdvDirectSaleV2PageProps {
  directSale: DirectSale;
}

interface CompletedSale {
  orderId: string;
  orderNumber: number;
  total: number;
  failedAttachments: PdvPendingAttachment[];
}

function saleSignature(
  cart: CartState,
  terminalId: string | null,
  notes: string,
  transactionDate: string,
  payments: Parameters<DirectSale['complete']['mutateAsync']>[0]['payments'],
) {
  return JSON.stringify({
    terminalId,
    customerId: cart.customerId,
    discount: cart.discount,
    ...(cart.coupon ? { coupon: [cart.coupon.id, cart.coupon.discountCents, cart.coupon.baseSignature] } : {}),
    notes,
    transactionDate,
    payments: canonicalizePdvDirectSalePayments(payments),
    lines: cart.lines.map((line) => [
      line.inventoryId,
      line.quantity,
      line.unitPrice,
      line.discountAmount,
    ]),
  });
}

/**
 * Caminho novo da venda direta. Ele não monta consultas próprias: recebe apenas
 * a projeção allowlisted do hook v2 e devolve a finalização ao wrapper fechado.
 */
export function PdvDirectSaleV2Page({ directSale }: PdvDirectSaleV2PageProps) {
  const { locale, currency, timezone } = useAppLocaleContext();
  const t = MESSAGES[locale].app.pdv.cashier;
  const { toast } = useToast();
  const uploadAttachment = useUploadPdvOrderAttachment();
  const receiptSettings = usePdvReceiptSettings();
  const identifiers = useInventoryIdentifiers();
  const [cart, setCart] = useState<CartState>(EMPTY_CART);
  const [appliedVouchers, setAppliedVouchers] = useState<PdvAppliedVoucher[]>([]);
  const [search, setSearch] = useState('');
  const [catalogMode, setCatalogMode] = useState<'quick' | 'catalog'>(() =>
    typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches ? 'catalog' : 'quick');
  const [additionFeedback, setAdditionFeedback] = useState<{ inventoryId: string; sequence: number }>();
  const [terminalId, setTerminalId] = useState<string | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const maxTransactionDate = todayInTz(timezone);
  const [transactionDate, setTransactionDate] = useState(maxTransactionDate);
  const [attachments, setAttachments] = useState<PdvPendingAttachment[]>([]);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [completedSale, setCompletedSale] = useState<CompletedSale | null>(null);
  const [activeProductIndex, setActiveProductIndex] = useState(0);
  const attemptRef = useRef<PdvDirectSaleAttemptV2 | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const productGridRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const autoReceipt = usePdvStageReceiptAuto();
  const receiptOpener = usePdvOrderReceiptOpener();

  const catalog = directSale.catalog.data;
  useEffect(() => {
    if (!catalog || terminalId) return;
    const terminalWithSession = catalog.terminals.find((terminal) =>
      catalog.sessions.some((session) => session.terminalId === terminal.id));
    setTerminalId(terminalWithSession?.id ?? catalog.terminals[0]?.id ?? null);
  }, [catalog, terminalId]);

  const terminal = catalog?.terminals.find((item) => item.id === terminalId) ?? null;
  const session = catalog?.sessions.find((item) => item.terminalId === terminalId) ?? null;
  const formatCurrency = useCallback(
    (value: number) => formatMoney(value, currency, locale),
    [currency, locale],
  );
  const currencySymbol = useMemo(() => getCurrencySymbol(currency, locale), [currency, locale]);
  const currencyFractionDigits = useMemo(() => {
    try {
      return new Intl.NumberFormat(toBcp47(locale), { style: 'currency', currency })
        .resolvedOptions().maximumFractionDigits;
    } catch {
      return 2;
    }
  }, [currency, locale]);

  const products: PdvGridProduct[] = useMemo(() => {
    if (!catalog || !terminal) return [];
    return catalog.materials.map((material) => {
      const availability = material.availableByStock.find((item) => item.stockId === terminal.stockId);
      return {
        inventoryId: material.id,
        name: material.name,
          sku: material.sku,
        imageUrl: material.imageUrl,
        unitPrice: material.salePrice ?? 0,
        unit: material.unit,
        availableQuantity: availability && !availability.hasConflict ? availability.availableQuantity : 0,
      };
    });
  }, [catalog, terminal]);
  const filteredProducts = useMemo(() => {
    const term = search.trim().toLocaleLowerCase(locale);
    if (!term) return products;
    return products.filter((product) => {
      const material = catalog?.materials.find((item) => item.id === product.inventoryId);
      return [product.name, material?.sku, material?.barcode]
        .some((value) => value?.toLocaleLowerCase(locale).includes(term));
    });
  }, [catalog?.materials, locale, products, search]);
  const visibleProducts = useMemo(
    () => catalogMode === 'quick' && !search.trim() ? filteredProducts.slice(0, 4) : filteredProducts,
    [catalogMode, filteredProducts, search],
  );
  const keyboardProducts = useMemo(
    () => visibleProducts.filter((product) => product.availableQuantity > 0),
    [visibleProducts],
  );
  const activeProductId = keyboardProducts[
    Math.min(activeProductIndex, Math.max(0, keyboardProducts.length - 1))
  ]?.inventoryId ?? null;

  useEffect(() => { setActiveProductIndex(0); }, [search]);
  useEffect(() => {
    if (!activeProductId) return;
    const activeButton = Array.from(
      productGridRef.current?.querySelectorAll<HTMLElement>('[data-pdv-product-id]') ?? [],
    ).find((element) => element.dataset.pdvProductId === activeProductId);
    activeButton?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [activeProductId]);

  const moveProductFocus = useCallback((direction: PdvGridDirection) => {
    if (!activeProductId || !productGridRef.current) return;
    const elements = Array.from(
      productGridRef.current.querySelectorAll<HTMLButtonElement>('[data-pdv-product-id]:not(:disabled)'),
    );
    const rects: PdvGridItemRect[] = elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        id: element.dataset.pdvProductId ?? '',
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    }).filter((rect) => rect.id);
    const nextId = findPdvGridNeighbor(rects, activeProductId, direction);
    const nextIndex = keyboardProducts.findIndex((product) => product.inventoryId === nextId);
    if (nextIndex < 0) return;
    setActiveProductIndex(nextIndex);
    window.requestAnimationFrame(() => {
      elements.find((element) => element.dataset.pdvProductId === nextId)?.focus();
    });
  }, [activeProductId, keyboardProducts]);

  const customers = useMemo<Customer[]>(() => (catalog?.customers ?? []).map(toPdvCustomerRecord), [catalog?.customers]);
  const customerName = customers.find((customer) => customer.id === cart.customerId)?.name ?? null;
  const paymentAccounts = useMemo(() => (catalog?.bankAccounts ?? []).map((account) => ({
    id: account.id,
    name: account.name,
    type: account.type,
    color: account.color,
    institution_code: account.institutionCode,
    institution_name: account.institutionName,
    bank_name: account.bankName,
  })), [catalog?.bankAccounts]);

  const resetAttempt = useCallback(() => { attemptRef.current = null; }, []);
  const updateCart = useCallback((updater: (current: CartState) => CartState) => {
    resetAttempt();
    setCart(updater);
  }, [resetAttempt]);
  const cartTotal = computeTotal(cart);

  useEffect(() => {
    setAppliedVouchers(current => clampAppliedVouchers(current, cartTotal));
  }, [cartTotal]);

  const changeCustomer = useCallback((customerId: string | null) => {
    resetAttempt();
    setAppliedVouchers([]);
    setCart((current) => setCartCustomer(current, customerId));
  }, [resetAttempt]);

  function addProduct(product: PdvGridProduct, quantity = 1) {
    updateCart((current) => {
      const result = addItem(current, { ...product, unitCost: 0 }, quantity);
      if (result.ok === false) {
        toast({
          variant: 'destructive',
          title: result.reason === 'out_of_stock' ? t.toast.outOfStock : t.toast.insufficientStock,
        });
        return current;
      }
      return result.cart;
    });
    setAdditionFeedback(current => ({ inventoryId: product.inventoryId, sequence: (current?.sequence ?? 0) + 1 }));
    setSearch('');
    window.requestAnimationFrame(() => { searchInputRef.current?.focus({ preventScroll: true }); searchInputRef.current?.select(); });
  }

  function handleProductGridKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
        '[data-pdv-product-id]:not(:disabled)',
      );
      const product = keyboardProducts.find(
        (candidate) => candidate.inventoryId === button?.dataset.pdvProductId,
      );
      if (!product) return;
      event.preventDefault();
      addProduct(product);
      return;
    }
    const directions: Partial<Record<string, PdvGridDirection>> = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    moveProductFocus(direction);
  }

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    const directions: Partial<Record<string, PdvGridDirection>> = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    };
    const direction = directions[event.key];
    if (direction && keyboardProducts.length > 0 && shouldNavigatePdvCatalogFromSearch(event.key, search)) {
      event.preventDefault();
      moveProductFocus(direction);
      return;
    }
    if (event.key === 'Enter' && keyboardProducts.length === 0 && search.trim()) {
      event.preventDefault();
      void handleBarcode(search.trim());
      return;
    }
    if (event.key === 'Enter' && keyboardProducts.length > 0) {
      event.preventDefault();
      addProduct(keyboardProducts[Math.min(activeProductIndex, keyboardProducts.length - 1)]);
    }
  }

  async function handleBarcode(code: string) {
    try {
      const resolved = await identifiers.resolve.mutateAsync({ code });
      const fallbackMaterial = resolved ? null : catalog?.materials.find((item) => item.barcode === code || item.sku === code);
      const inventoryId = resolved?.material.id ?? fallbackMaterial?.id;
      const product = products.find((item) => item.inventoryId === inventoryId);
      if (!product) {
        toast({ variant: 'destructive', title: t.toast.barcodeNotFound });
        return;
      }
      addProduct(product, resolved?.unitFactor ?? 1);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: t.toast.barcodeNotFound,
        description: error instanceof Error ? error.message : 'Tente novamente.',
      });
    }
  }
  useBarcodeScanner({ onScan: handleBarcode, enabled: !paymentOpen && !advancedOpen, shouldCaptureTarget: target => canCapturePdvCatalogScan(target, searchInputRef.current) });

  async function handleAttachFiles(files: File[]) {
    setAttachmentBusy(true);
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      const id = crypto.randomUUID();
      const sourcePreviewUrl = URL.createObjectURL(file);
      setAttachments((current) => [...current, {
        id, file, previewUrl: sourcePreviewUrl, status: 'processing', progress: 12,
      }]);
      try {
        const compressed = await processImageFile(file);
        const previewUrl = URL.createObjectURL(compressed);
        setAttachments((current) => current.map((attachment) => attachment.id === id
          ? { ...attachment, file: compressed, previewUrl, status: 'ready', progress: 100 }
          : attachment));
        URL.revokeObjectURL(sourcePreviewUrl);
      } catch {
        setAttachments((current) => current.map((attachment) => attachment.id === id
          ? { ...attachment, status: 'error', progress: 0, errorMessage: t.toast.attachFailed }
          : attachment));
      }
    }
    setAttachmentBusy(false);
  }

  function removeAttachment(id: string) {
    setAttachments((current) => {
      const target = current.find((attachment) => attachment.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return current.filter((attachment) => attachment.id !== id);
    });
  }

  async function uploadSaleAttachments(orderId: string, pending: PdvPendingAttachment[]) {
    const failed: PdvPendingAttachment[] = [];
    for (const attachment of pending) {
      try {
        await uploadAttachment.mutateAsync({
          orderId,
          file: attachment.file,
          clientAttachmentId: attachment.id,
        });
        URL.revokeObjectURL(attachment.previewUrl);
      } catch {
        failed.push({ ...attachment, status: 'error', errorMessage: t.toast.attachFailed });
      }
    }
    setCompletedSale((current) => current?.orderId === orderId
      ? { ...current, failedAttachments: failed }
      : current);
    if (failed.length > 0) {
      toast({
        variant: 'destructive',
        title: 'Venda concluída, mas algumas fotos não foram enviadas',
        description: 'Use “Tentar fotos novamente” no resumo da venda.',
      });
    }
  }

  async function retryFailedAttachments() {
    if (!completedSale || completedSale.failedAttachments.length === 0) return;
    await uploadSaleAttachments(completedSale.orderId, completedSale.failedAttachments);
  }

  async function finalize(payments: Parameters<typeof directSale.complete.mutateAsync>[0]['payments']) {
    if (!catalog || !terminal || !session || !catalog.cashAccount) {
      throw new Error('Abra um caixa v2 neste terminal antes de finalizar a venda.');
    }
    const signature = saleSignature(cart, terminal.id, notes, transactionDate, payments);
    attemptRef.current = resolvePdvDirectSaleAttemptV2(attemptRef.current, signature);
    const attemptId = attemptRef.current.id;
    const receiptAttempt = receiptOpener.guardAttempt(autoReceipt.prepare('sale'));
    let result: Awaited<ReturnType<typeof directSale.complete.mutateAsync>>;
    try {
    result = await directSale.complete.mutateAsync({
      attemptId,
      terminalId: terminal.id,
      cashSessionId: session.id,
      cashAccountId: session.cashAccountId,
      customerId: cart.customerId,
      items: cart.lines.map((line) => ({
        inventoryId: line.inventoryId,
        stockId: terminal.stockId,
        quantity: line.quantity,
        unitPrice: catalog.materials.find((item) => item.id === line.inventoryId)?.salePrice == null
          ? null
          : line.unitPrice,
        discountAmount: line.discountAmount,
      })),
      orderDiscountAmount: cart.discount,
        couponId: cart.coupon?.id ?? null, couponDiscountCents: Math.round(confirmedCouponDiscount(cart) * 100),
      notes,
      transactionDate: transactionDate === maxTransactionDate ? null : transactionDate,
      payments,
    });

    } catch (error) { receiptAttempt.cancel(); if (receiptOpener.isCurrent()) throw error; return; }
    if (!receiptOpener.isCurrent()) { receiptAttempt.cancel(); return; }
    void receiptAttempt.commit(`sale:${result.orderId}`, (format, options) => receiptOpener.open(result.orderId, format, { ...options, documentKind: 'sale' }), result.idempotent);

    const readyAttachments = attachments.filter((attachment) => attachment.status === 'ready');
    setCompletedSale({
      orderId: result.orderId,
      orderNumber: result.orderNumber,
      total: result.total,
      failedAttachments: readyAttachments,
    });
    setPaymentOpen(false);
    setCart(EMPTY_CART);
    setAppliedVouchers([]);
    setNotes('');
    setTransactionDate(maxTransactionDate);
    setAttachments([]);
    directSale.releaseAttempt(attemptId);
    attemptRef.current = null;
    if (readyAttachments.length > 0) {
      await uploadSaleAttachments(result.orderId, readyAttachments);
    }
  }

  const receiptFormat = readDeviceReceiptFormat() ?? resolvePdvReceiptStagePolicy(receiptSettings.data, 'sale').format;

  const hardware = usePdvDomiLinkWorkspace({
    identity: cart, contextKey: JSON.stringify([terminalId, session?.id]),
    blocked: paymentOpen || advancedOpen || directSale.complete.isPending || !catalog,
    getLine: id => cart.lines.find(line => line.inventoryId === id),
    onSetQuantity: (id, value) => updateCart(current => setLineQuantity(current, id, value)),
    onSearchChange: setSearch, searchInputRef,
  });

  if (directSale.catalog.isLoading || !catalog) {
    return (
      <div className="space-y-4">
        <PageHeader title={t.title} subtitle="Carregando catálogo seguro da venda..." icon={ShoppingCart} />
        {directSale.catalog.isLoading && <PdvPageSkeleton variant="sale" catalogMode={catalogMode} label="Carregando catálogo da venda" />}
        {directSale.catalog.isError && (
          <NoticeBanner
            variant="destructive"
            title="Não foi possível carregar a venda"
            action={<Button variant="outline" onClick={() => void directSale.catalog.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Tentar novamente</Button>}
          >
            A venda ficou bloqueada para não usar dados incompletos.
          </NoticeBanner>
        )}
      </div>
    );
  }

  const advancedSummary = [
    notes.trim() ? t.advancedOptions.summaryNotes : null,
    transactionDate !== maxTransactionDate ? transactionDate : null,
    attachments.length > 0 ? `${attachments.length} foto(s)` : null,
  ].filter(Boolean).join(' · ');
  const cartPanelTexts = {
    title: t.cart.title,
    itemsCount: t.cart.itemsCount,
    itemsCountOne: t.cart.itemsCountOne,
    draftHint: 'Atendimento atual',
    empty: t.cart.empty,
    emptyHint: t.cart.emptyHint,
    subtotal: t.cart.subtotal,
    itemDiscounts: t.cart.itemDiscounts,
    discount: t.cart.discount,
    discountPlaceholder: t.cart.discountPlaceholder,
    total: t.cart.total,
    customerLabel: t.cart.customerLabel,
    customerNone: t.cart.customerNone,
    customerPlaceholder: t.cart.customerPlaceholder,
    customerSearchPlaceholder: t.cart.customerSearchPlaceholder,
    customerEmpty: t.cart.customerEmpty,
    customerCreate: t.cart.customerCreate,
    removeLine: t.cart.removeLine,
    clearCart: t.cart.clearCart,
    noPhoto: t.stock.noPhoto,
    openProductPhoto: t.cart.openProductPhoto,
    productPhotoViewerDescription: t.cart.productPhotoViewerDescription,
    quantityEditLabel: t.cart.quantityEditLabel,
    itemDiscount: t.cart.itemDiscount,
    itemDiscountPlaceholder: t.cart.itemDiscountPlaceholder,
    discountEditor: t.cart.discountEditor,
    paymentLabel: t.actions.payment,
    paymentShortcut: t.actions.paymentShortcut,
    finalizeLabel: t.actions.finalize,
    finalizeShortcut: t.actions.finalizeShortcut,
    cashClosedTitle: 'Caixa fechado',
    cashClosedDescription: 'Abra um caixa para concluir a venda.',
    cashClosedAction: t.cashClosedNotice.action,
    notesLabel: t.cart.notesLabel,
    notesPlaceholder: t.cart.notesPlaceholder,
    advancedOptionsTrigger: t.advancedOptions.trigger,
  };
  const requestPayment = () => {
    if (!couponCartReady(cart)) { toast({ title: 'Confira o cupom promocional antes de receber.' }); return; }
    if (attachmentBusy) {
      toast({ variant: 'destructive', title: 'Aguarde a preparação das fotos.' });
      return;
    }
    setPaymentOpen(true);
  };

  const appliedCreditContent = (
    <PdvAppliedVouchersControl
      enabled
      customerId={cart.customerId}
      total={cartTotal}
      values={appliedVouchers}
      formatCurrency={formatCurrency}
      onChange={(value) => {
        resetAttempt();
        setAppliedVouchers(value);
      }}
    />
  );

  return (
    <div className="space-y-4" data-testid="pdv-direct-sale-v2" data-pdv-ui>
      <PageHeader title={t.title} subtitle={t.subtitle} icon={ShoppingCart} />

      {completedSale && (
        <Card className="border-success/40">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="flex items-center gap-2 font-bold text-success"><CheckCircle2 className="h-5 w-5" />Venda #{completedSale.orderNumber} concluída</p>
              <p className="mt-1 text-sm tabular-nums text-muted-foreground">Total {formatCurrency(completedSale.total)}</p>
              {completedSale.failedAttachments.length > 0 && (
                <p className="mt-1 text-sm text-destructive">{completedSale.failedAttachments.length} foto(s) ainda precisam ser enviadas.</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {completedSale.failedAttachments.length > 0 && (
                <Button variant="outline" onClick={() => void retryFailedAttachments()} disabled={uploadAttachment.isPending}>
                  <Paperclip className="mr-2 h-4 w-4" />Tentar fotos novamente
                </Button>
              )}
              <PdvOrderReceiptButton orderId={completedSale.orderId} format={receiptFormat} documentKind="sale" label="Gerar comprovante" />
            </div>

          </CardContent>
        </Card>
      )}

      {!session && (
        <NoticeBanner variant="warning" title="Abra um caixa para concluir a venda">
          Escolha o caixa no painel do PDV antes de receber.
        </NoticeBanner>
      )}

      {catalog.terminals.length > 1 && <Select value={terminalId ?? undefined} onValueChange={value => { setTerminalId(value); setCart(EMPTY_CART); setAppliedVouchers([]); resetAttempt(); }}><SelectTrigger className="w-full sm:w-56"><SelectValue placeholder="Caixa" /></SelectTrigger><SelectContent>{catalog.terminals.map(item => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select>}
      <div data-testid="pdv-direct-sale-v2-layout" className="pdv-preview-sale">
        <PdvSalePreviewView
          mode={catalogMode} onModeChange={setCatalogMode} search={search} onSearchChange={setSearch}
          onSearchKeyDown={handleSearchKeyDown} searchInputRef={searchInputRef} gridRef={productGridRef}
          controlsRef={controlsRef} rowRef={rowRef} onGridKeyDown={handleProductGridKeyDown}
          products={visibleProducts} disabled={directSale.complete.isPending} activeProductId={activeProductId}
          onProductFocus={id => { const index = keyboardProducts.findIndex(product => product.inventoryId === id); if (index >= 0) setActiveProductIndex(index); }}
          onProductSelect={addProduct} formatCurrency={formatCurrency} onExit={() => window.location.assign('/pdv')}
          camera={<><InventoryIdentifierCameraScanner triggerVariant="icon" onScan={code => void handleBarcode(code)} disabled={paymentOpen || advancedOpen || identifiers.resolve.isPending} />{hardware.scannerControl}</>}
          cart={
          <PdvCartPanel
            weighControl={hardware.weighControl}
            cart={cart}
            couponContent={<PdvCouponControl cart={cart} disabled={paymentOpen} onChange={coupon => updateCart(current => ({ ...current, coupon }))} />}
            customers={customers}
            formatCurrency={formatCurrency}
            currencySymbol={currencySymbol}
            locale={locale}
            currencyFractionDigits={currencyFractionDigits}
            onSetDiscountAmount={(value) => updateCart((current) => setDiscount(current, value))}
            onIncrement={(id, delta) => updateCart((current) => incrementLineQuantity(current, id, delta))}
            onSetQuantity={(id, quantity) => updateCart((current) => setLineQuantity(current, id, quantity))}
            onSetLineDiscount={(id, value) => updateCart((current) => setLineDiscount(current, id, value))}
            onSetLineFinalAmount={(id, value, mode) => updateCart((current) => setLineFinalAmount(current, id, value, mode, currencyFractionDigits))}
            onSetCartFinalAmount={(value, mode) => updateCart((current) => setCartFinalAmount(current, value, mode, currencyFractionDigits))}
            onRemove={(id) => updateCart((current) => removeItem(current, id))}
            onCustomerChange={changeCustomer}
            onRequestClearCart={() => updateCart((current) => clearCart(current))}
            onRequestPayment={requestPayment}
            cashClosed={!session}
            onGoToCashPanel={() => { window.location.assign('/pdv'); }}
            onOpenAdvancedOptions={() => setAdvancedOpen(true)}
            advancedOptionsActive={advancedSummary.length > 0}
            advancedOptionsSummary={advancedSummary}
            appliedCreditContent={appliedCreditContent}
            layout="workspace"
            additionFeedback={additionFeedback}
            onConfirmQuantityEdit={() => searchInputRef.current?.focus()}
            texts={cartPanelTexts}
          />
          }
        />
      </div>

      <PdvPaymentDialog
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        texts={t.payment}
        total={cartTotal}
        summaryItems={cart.lines.map(line => ({ id: line.inventoryId, name: line.name, quantity: line.quantity, unit: line.unit ?? undefined, unitPrice: line.unitPrice, total: computeTotal({ lines: [line], discount: 0, customerId: null }), imageUrl: line.imageUrl }))}
        summarySubtotal={computeSubtotal(cart)}
        summaryDiscount={computeSubtotal(cart) - cartTotal}
        itemCount={cart.lines.length}
        customerName={customerName}
        customerId={cart.customerId}
        appliedVouchers={appliedVouchers}
        customerCredit={null}
        accounts={paymentAccounts}
        canUseBankAccounts={paymentAccounts.length > 0}
        hasOpenCashSession={!!session}
        hasCofreAccount={!!catalog.cashAccount}
        onGoToCashPanel={() => { window.location.assign('/pdv'); }}
        onConfirm={finalize}
      />

      <PdvAdvancedOptionsDialog
        open={advancedOpen}
        onOpenChange={setAdvancedOpen}
        texts={t.advancedOptions}
        notes={notes}
        onNotesChange={(value) => { setNotes(value); resetAttempt(); }}
        notesLabel={t.cart.notesLabel}
        notesPlaceholder={t.cart.notesPlaceholder}
        transactionDate={transactionDate}
        onTransactionDateChange={(value) => { setTransactionDate(value); resetAttempt(); }}
        maxDate={maxTransactionDate}
        pendingAttachments={attachments}
        onAttachFiles={(files) => void handleAttachFiles(files)}
        onRemoveAttachment={removeAttachment}
        attaching={attachmentBusy}
      />
    </div>
  );
}
