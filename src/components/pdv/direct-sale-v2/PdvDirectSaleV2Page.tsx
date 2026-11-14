import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Barcode, CheckCircle2, Paperclip, RefreshCw, Search, ShoppingCart } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { PdvAdvancedOptionsDialog, type PdvPendingAttachment } from '@/components/pdv/PdvAdvancedOptionsDialog';
import { PdvCartItemsTable } from '@/components/pdv/PdvCartItemsTable';
import { PdvCartPanel } from '@/components/pdv/PdvCartPanel';
import { PdvCartSummary } from '@/components/pdv/PdvCartSummary';
import { PdvPaymentDialog } from '@/components/pdv/PdvPaymentDialog';
import { PdvProductCard, type PdvGridProduct } from '@/components/pdv/PdvProductCard';
import { PdvOrderReceiptButton } from '@/components/pdv/receipt/PdvOrderReceiptButton';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner';
import {
  canonicalizePdvDirectSalePayments,
  resolvePdvDirectSaleAttemptV2,
  type PdvDirectSaleAttemptV2,
  type usePdvDirectSaleV2,
} from '@/hooks/usePdvDirectSaleV2';
import { usePdvReceiptSettings } from '@/hooks/usePdvReceiptSettings';
import { useUploadPdvOrderAttachment } from '@/hooks/usePdvSale';
import { useToast } from '@/hooks/use-toast';
import {
  EMPTY_CART,
  addItem,
  clearCart,
  computeTotal,
  incrementLineQuantity,
  removeItem,
  setCartCustomer,
  setDiscount,
  setLineDiscount,
  setLineQuantity,
  type CartState,
} from '@/lib/pdv/cart';
import { readDeviceReceiptFormat } from '@/lib/pdv/receipt/devicePreference';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatMoney, getCurrencySymbol, toBcp47 } from '@/lib/format';
import { todayInTz } from '@/lib/timezone';
import type { Customer } from '@/types/database';
import { processImageFile } from '@/utils/imageConvert';

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
  const [cart, setCart] = useState<CartState>(EMPTY_CART);
  const [search, setSearch] = useState('');
  const [terminalId, setTerminalId] = useState<string | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const maxTransactionDate = todayInTz(timezone);
  const [transactionDate, setTransactionDate] = useState(maxTransactionDate);
  const [attachments, setAttachments] = useState<PdvPendingAttachment[]>([]);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [completedSale, setCompletedSale] = useState<CompletedSale | null>(null);
  const attemptRef = useRef<PdvDirectSaleAttemptV2 | null>(null);
  const autoReceiptRef = useRef<HTMLDivElement>(null);
  const autoReceiptDoneRef = useRef<string | null>(null);

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

  const customers = useMemo<Customer[]>(() => (catalog?.customers ?? []).map((customer) => ({
    id: customer.id,
    name: customer.name,
    customer_type: 'pf',
    created_at: '',
    updated_at: '',
  })), [catalog?.customers]);
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

  function addProduct(product: PdvGridProduct, quantity = 1) {
    const result = addItem(cart, { ...product, unitCost: 0 }, quantity);
    if (result.ok === false) {
      toast({
        variant: 'destructive',
        title: result.reason === 'out_of_stock' ? t.toast.outOfStock : t.toast.insufficientStock,
      });
      return;
    }
    resetAttempt();
    setCart(result.cart);
    setSearch('');
  }

  function handleBarcode(code: string) {
    const material = catalog?.materials.find((item) => item.barcode === code);
    const product = products.find((item) => item.inventoryId === material?.id);
    if (!product) {
      toast({ variant: 'destructive', title: t.toast.barcodeNotFound });
      return;
    }
    addProduct(product);
  }
  useBarcodeScanner({ onScan: handleBarcode, enabled: !paymentOpen && !advancedOpen });

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
    const result = await directSale.complete.mutateAsync({
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
      notes,
      transactionDate: transactionDate === maxTransactionDate ? null : transactionDate,
      payments,
    });

    const readyAttachments = attachments.filter((attachment) => attachment.status === 'ready');
    setCompletedSale({
      orderId: result.orderId,
      orderNumber: result.orderNumber,
      total: result.total,
      failedAttachments: readyAttachments,
    });
    setPaymentOpen(false);
    setCart(EMPTY_CART);
    setNotes('');
    setTransactionDate(maxTransactionDate);
    setAttachments([]);
    directSale.releaseAttempt(attemptId);
    attemptRef.current = null;
    if (readyAttachments.length > 0) {
      await uploadSaleAttachments(result.orderId, readyAttachments);
    }
  }

  const receiptFormat = readDeviceReceiptFormat() ?? receiptSettings.data?.defaultFormat ?? '80mm';
  useEffect(() => {
    if (!completedSale || !receiptSettings.data?.autoPrint) return;
    if (autoReceiptDoneRef.current === completedSale.orderId) return;
    autoReceiptDoneRef.current = completedSale.orderId;
    const timer = window.setTimeout(() => {
      autoReceiptRef.current?.querySelectorAll<HTMLButtonElement>('button').forEach((button) => button.click());
    }, 0);
    return () => window.clearTimeout(timer);
  }, [completedSale, receiptSettings.data?.autoPrint]);

  if (directSale.catalog.isLoading || !catalog) {
    return (
      <div className="space-y-4">
        <PageHeader title={t.title} subtitle="Carregando catálogo seguro da venda..." icon={ShoppingCart} />
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
    draftHint: t.cart.draftHint,
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
    cashClosedTitle: t.cashClosedNotice.title,
    cashClosedDescription: t.cashClosedNotice.description,
    cashClosedAction: t.cashClosedNotice.action,
    notesLabel: t.cart.notesLabel,
    notesPlaceholder: t.cart.notesPlaceholder,
    advancedOptionsTrigger: t.advancedOptions.trigger,
  };
  const cartItemsTexts = {
    title: t.cart.title,
    itemsCount: t.cart.itemsCount,
    itemsCountOne: t.cart.itemsCountOne,
    empty: t.cart.empty,
    emptyHint: t.cart.emptyHint,
    removeLine: t.cart.removeLine,
    clearCart: t.cart.clearCart,
    noPhoto: t.stock.noPhoto,
    openProductPhoto: t.cart.openProductPhoto,
    productPhotoViewerDescription: t.cart.productPhotoViewerDescription,
    columnProduct: t.cart.columnProduct,
    columnQuantity: t.cart.columnQuantity,
    quantityEditLabel: t.cart.quantityEditLabel,
    discountLabel: t.cart.itemDiscount,
    discountPlaceholder: t.cart.itemDiscountPlaceholder,
    columnUnitPrice: t.cart.columnUnitPrice,
    columnLineTotal: t.cart.columnLineTotal,
  };

  const requestPayment = () => {
    if (attachmentBusy) {
      toast({ variant: 'destructive', title: 'Aguarde a preparação das fotos.' });
      return;
    }
    setPaymentOpen(true);
  };

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
              <PdvOrderReceiptButton orderId={completedSale.orderId} format={receiptFormat} label="Gerar comprovante" />
            </div>
            {receiptSettings.data?.autoPrint && (
              <div ref={autoReceiptRef} className="sr-only" aria-hidden="true">
                {Array.from({ length: receiptSettings.data.copies }, (_, index) => (
                  <PdvOrderReceiptButton key={index} orderId={completedSale.orderId} format={receiptFormat} label="Impressão automática" />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!session && (
        <NoticeBanner variant="warning" title="Caixa v2 fechado neste terminal">
          Abra o caixa no painel do PDV antes de receber a venda.
        </NoticeBanner>
      )}

      <div data-testid="pdv-direct-sale-v2-layout" className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_22rem] md:items-start">
        <section className="min-w-0 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <Barcode className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t.search.placeholder}
                className="h-12 pl-10"
                type="search"
                inputMode="search"
              />
              <Search className="sr-only" />
            </div>
            {catalog.terminals.length > 1 && (
              <Select
                value={terminalId ?? undefined}
                onValueChange={(value) => {
                  setTerminalId(value);
                  setCart(EMPTY_CART);
                  resetAttempt();
                }}
              >
                <SelectTrigger className="h-12 w-full sm:w-64"><SelectValue placeholder="Terminal" /></SelectTrigger>
                <SelectContent>{catalog.terminals.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
              </Select>
            )}
          </div>

          <div className="grid max-h-[46vh] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3 xl:grid-cols-4">
            {filteredProducts.map((product) => (
              <PdvProductCard
                key={product.inventoryId}
                product={product}
                formatCurrency={formatCurrency}
                outOfStockLabel={t.stock.outOfStock}
                availableLabel={t.stock.available}
                noPhotoLabel={t.stock.noPhoto}
                onSelect={addProduct}
              />
            ))}
          </div>
          {filteredProducts.length === 0 && (
            <NoticeBanner variant="info">Nenhum material disponível para este terminal.</NoticeBanner>
          )}

          <PdvCartItemsTable
            cart={cart}
            formatCurrency={formatCurrency}
            onIncrement={(id, delta) => updateCart((current) => incrementLineQuantity(current, id, delta))}
            onSetQuantity={(id, quantity) => updateCart((current) => setLineQuantity(current, id, quantity))}
            onSetLineDiscount={(id, value) => updateCart((current) => setLineDiscount(current, id, value))}
            onRemove={(id) => updateCart((current) => removeItem(current, id))}
            onRequestClearCart={() => updateCart((current) => clearCart(current))}
            texts={cartItemsTexts}
            className="hidden max-h-80 md:flex"
          />
        </section>

        <Card className="min-w-0 overflow-hidden md:hidden">
          <PdvCartPanel
            cart={cart}
            customers={customers}
            formatCurrency={formatCurrency}
            currencySymbol={currencySymbol}
            locale={locale}
            currencyFractionDigits={currencyFractionDigits}
            onSetDiscountAmount={(value) => updateCart((current) => setDiscount(current, value))}
            onIncrement={(id, delta) => updateCart((current) => incrementLineQuantity(current, id, delta))}
            onSetQuantity={(id, quantity) => updateCart((current) => setLineQuantity(current, id, quantity))}
            onSetLineDiscount={(id, value) => updateCart((current) => setLineDiscount(current, id, value))}
            onRemove={(id) => updateCart((current) => removeItem(current, id))}
            onCustomerChange={(id) => updateCart((current) => setCartCustomer(current, id))}
            onRequestClearCart={() => updateCart((current) => clearCart(current))}
            onRequestPayment={requestPayment}
            cashClosed={!session}
            onGoToCashPanel={() => { window.location.assign('/pdv'); }}
            onOpenAdvancedOptions={() => setAdvancedOpen(true)}
            advancedOptionsActive={advancedSummary.length > 0}
            advancedOptionsSummary={advancedSummary}
            texts={cartPanelTexts}
          />
        </Card>

        <Card className="sticky top-4 hidden min-w-0 overflow-hidden md:block">
          <PdvCartSummary
            cart={cart}
            customers={customers}
            formatCurrency={formatCurrency}
            currencySymbol={currencySymbol}
            locale={locale}
            currencyFractionDigits={currencyFractionDigits}
            onSetDiscountAmount={(value) => updateCart((current) => setDiscount(current, value))}
            onCustomerChange={(id) => updateCart((current) => setCartCustomer(current, id))}
            onRequestPayment={requestPayment}
            cashClosed={!session}
            onGoToCashPanel={() => { window.location.assign('/pdv'); }}
            onOpenAdvancedOptions={() => setAdvancedOpen(true)}
            advancedOptionsActive={advancedSummary.length > 0}
            advancedOptionsSummary={advancedSummary}
            texts={cartPanelTexts}
          />
        </Card>
      </div>

      <PdvPaymentDialog
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
        texts={t.payment}
        total={computeTotal(cart)}
        itemCount={cart.lines.length}
        customerName={customerName}
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
