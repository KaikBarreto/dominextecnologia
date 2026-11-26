import { PdvCouponControl } from '@/components/pdv/coupons/PdvCouponControl';
import { couponCartReady, confirmedCouponDiscount } from '@/lib/pdv/cart';
import { usePdvPaymentVoucher } from '@/hooks/usePdvPaymentVoucher';
import { useGoodsFiscalAccess } from '@/hooks/useGoodsFiscalAccess';
import { PdvNfceSaleAction } from '@/components/fiscal/goods/PdvNfceSaleAction';
import { canCapturePdvCatalogScan } from '@/lib/pdv/catalogKeyboard';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { ShoppingCart, Search, ShoppingBasket, ArrowLeft, Barcode, Keyboard, RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { PdvReceiptFormat } from '@/lib/pdv/receipt/model';
import { ToastAction } from '@/components/ui/toast';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { EmptyState } from '@/components/mobile/EmptyState';
import { MobilePillTabs, type PillTab } from '@/components/mobile/MobilePillTabs';
import { FilterButton } from '@/components/ui/FilterButton';
import { useMediaBreakpoint } from '@/hooks/use-mobile';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { useAuth } from '@/contexts/AuthContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { fuzzyIncludesAny, cn } from '@/lib/utils';
import { formatDate, formatMoney, formatNumber, getCurrencySymbol, toBcp47 } from '@/lib/format';
import { typography } from '@/lib/typography';
import { todayInTz } from '@/lib/timezone';
import { useToast } from '@/hooks/use-toast';
import { useInventory } from '@/hooks/useInventory';
import { useAccessibleInventoryIds } from '@/hooks/useAccessibleInventoryIds';
import { useStocks } from '@/hooks/useStocks';
import { useMaterialGroups } from '@/hooks/useMaterialGroups';
import { useCustomers } from '@/hooks/useCustomers';
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner';
import { useInventoryIdentifiers } from '@/hooks/useInventoryIdentifiers';
import { useFinancialAccounts } from '@/hooks/useFinancialAccounts';
import { useBankPermissions } from '@/hooks/useBankPermissions';
import { usePdvCashRegister } from '@/hooks/usePdvCashRegister';
import { usePdvSaleDraftWorkspace } from '@/hooks/usePdvSaleDraftWorkspace';
import {
  usePdvSale,
  usePdvCustomerCredit,
  useUploadPdvOrderAttachment,
  type PdvSettleResult,
} from '@/hooks/usePdvSale';
import { processImageFile } from '@/utils/imageConvert';
import {
  EMPTY_CART,
  addItem,
  clearCart,
  incrementLineQuantity,
  removeItem,
  setDiscount,
  setCartFinalAmount,
  setLineFinalAmount,
  setLineDiscount,
  setLineQuantity,
  computeTotal,
  computeSubtotal,
  type CartProduct,
  type CartLine,
  type CartState,
} from '@/lib/pdv/cart';
import { inventoryQuantityStep } from '@/lib/inventoryUnits';
import {
  findPdvGridNeighbor,
  isPdvEditableTarget,
  nextPdvIndex,
  resolvePdvCommandShortcut,
  shouldNavigatePdvCatalogFromSearch,
  type PdvGridDirection,
  type PdvGridItemRect,
} from '@/lib/pdv/keyboard';
import type { PdvGridProduct } from '@/components/pdv/PdvProductCard';
import { PdvSaleWorkspace as PdvSaleEditorLayout } from '@/components/pdv/PdvSaleWorkspace';
import { PdvCartPanel } from '@/components/pdv/PdvCartPanel';
import { PdvSkeleton } from '@/components/pdv/PdvSkeleton';
import { PdvPaymentDialog } from '@/components/pdv/PdvPaymentDialog';
import { PdvAppliedVouchersControl } from '@/components/pdv/PdvAppliedVoucherControl';
import { PdvAdvancedOptionsDialog, type PdvPendingAttachment } from '@/components/pdv/PdvAdvancedOptionsDialog';
import { PdvOrderSwitcher } from '@/components/pdv/PdvOrderSwitcher';
import { PdvDraftSyncNotice } from '@/components/pdv/PdvDraftSyncNotice';
import { transferRecoveredDraftAttachments } from '@/lib/pdv/draft-attachments';
import { PdvShortcutHelpDialog } from '@/components/pdv/PdvShortcutHelpDialog';
import { PdvOrderReceiptButton, usePdvOrderReceiptOpener } from '@/components/pdv/receipt/PdvOrderReceiptButton';
import { PdvDirectSalePostSaleDialog } from '@/components/pdv/direct-sale-v2/PdvDirectSalePostSaleDialog';
import { InventoryIdentifierCameraScanner } from '@/components/inventory/identifiers/InventoryIdentifierCameraScanner';
import {
  parsePdvSaleCashContext,
  resolvePdvSaleCashContext,
} from '@/components/pdv/caixa-v2/pdvSaleContext';
import { derivePdvReturnsAccess, usePdvReturnsFeature } from '@/hooks/usePdvReturns';
import { derivePdvAfterSaleAccess, usePdvAfterSaleFeature } from '@/hooks/usePdvAfterSale';
import { usePdvStageReceiptAuto } from '@/hooks/usePdvStageReceiptAuto';
import { resolvePdvReceiptStagePolicy } from '@/lib/pdv/receipt/stagePolicy';
import { usePdvReceiptSettings } from '@/hooks/usePdvReceiptSettings';
import { readDeviceReceiptFormat } from '@/lib/pdv/receipt/devicePreference';
import { toPdvCustomerRecord } from '@/lib/pdv/catalogCustomer';
import { completeDurablePdvDirectSale, isDurablePdvDirectSaleAttempt, PDV_DIRECT_SALE_REVIEW_MESSAGE, PDV_DIRECT_SALE_SCOPE_MESSAGE } from '@/lib/pdv/directSaleRecovery';
import {
  canonicalizePdvDirectSalePayments,
  PdvDirectSaleV2Error,
  shouldUseLegacyPdvRoute,
  usePdvDirectSaleV2,
  type PdvCompleteDirectSaleV2Result,
} from '@/hooks/usePdvDirectSaleV2';
import type { Customer } from '@/types/database';
import { getAppliedVouchers, clampAppliedVouchers, hasPdvSaleDraftContent, MAX_PDV_SALE_DRAFTS, setPdvSaleDraftCustomer, type PdvAppliedVoucher, type PdvSaleAttempt, type PdvSaleDraft } from '@/lib/pdv/sale-drafts';
import { resolvePdvScannedSelection } from '@/lib/pdv/identifierSelection';
import { clampStoredValueApplication } from '@/lib/pdv/payment';
import {
  clearPdvSaleEditDraft,
  isPdvSaleEditDraft,
  loadPdvSaleEditDraft,
  type PdvSaleEditDraft,
} from '@/lib/pdv/order-edit';

/** Breakpoint onde o carrinho deixa de ser painel fixo e vira folha inferior. */
// Mantém o carrinho em drawer no mesmo limite de 800 px do preview aprovado.
const CART_DRAWER_BREAKPOINT = 801;

/**
 * Teclado numérico na tela é só pro PDV de tablet de balcão (sem teclado
 * físico). No desktop (>=1024, teclado físico sempre presente) ele some —
 * pedido do CEO 2026-10-18. 1024 não é número novo: é o MESMO
 * `MOBILE_BREAKPOINT`/`COMPACT_BREAKPOINT` que o shell já usa pra separar
 * tablet de desktop (`src/hooks/use-mobile.tsx`), então tablet (768-1023,
 * onde o carrinho já é painel fixo) continua com o numpad e só o desktop
 * (>=1024) perde.
 */
const NUMPAD_BREAKPOINT = 1024;

/**
 * Painel do Caixa (onde se abre o caixa). Caminho pt-br escrito literal, mesma
 * convenção do `PDV_SALE_PATH` em `PdvCaixa.tsx`: o registro de rotas é do
 * 🛡️ Plataforma e a lei do i18n de rotas garante que o path pt-br vale em todos
 * os idiomas (o `AppLayout` redireciona pro canônico do idioma do usuário).
 */
const PDV_PANEL_PATH = '/pdv';
const PDV_SALE_PATH = '/pdv/venda';

interface CompletedPdvSale {
  scopeKey: string;
  orderId: string;
  orderNumber: number;
  total: number;
}


/** Atalho de leitura: cabe na faixa existente e deixa a próxima venda pronta. */
export function PdvLastSaleHeader({ completedSale, scopeKey, receiptFormat, canOpenPostSale, onOpenPostSale, children }: {
  completedSale: CompletedPdvSale | null;
  scopeKey: string | null;
  receiptFormat: PdvReceiptFormat;
  canOpenPostSale: boolean;
  onOpenPostSale: () => void;
  children: ReactNode;
}) {
  const { currency, locale } = useAppLocaleContext();
  const fiscalAccess = useGoodsFiscalAccess();
  const [lastSaleMenuOpen, setLastSaleMenuOpen] = useState(false);
  const promptedFiscalSales = useRef(new Set<string>());
  const [fiscalTarget, setFiscalTarget] = useState<{ orderId: string; scopeKey: string } | null>(null);
  useEffect(() => { setLastSaleMenuOpen(false); setFiscalTarget(null); }, [scopeKey, fiscalAccess.scopeId, fiscalAccess.allowed]);
  return <>
      {completedSale && completedSale.scopeKey === scopeKey ? <><div className="flex min-w-0 items-center border-b border-border bg-card pr-2 [&_.pdv-order-switcher]:border-b-0">
        <div className="min-w-0 flex-1">{children}</div>
        <Popover open={lastSaleMenuOpen} onOpenChange={setLastSaleMenuOpen}>
          <PopoverTrigger asChild><Button type="button" variant="ghost" size="sm" className="shrink-0 gap-1 px-2 text-xs" data-testid="pdv-last-sale-trigger" aria-label={`Último pedido #${completedSale.orderNumber}`}><span className="hidden sm:inline">Último pedido</span><span className="sm:hidden">Último</span><strong>#{completedSale.orderNumber}</strong></Button></PopoverTrigger>
          <PopoverContent align="end" aria-label="Ações do último pedido" className="w-72 max-w-[calc(100vw-2rem)] space-y-3">
            <div><p className="font-semibold">Pedido #{completedSale.orderNumber} concluído</p><p className="text-sm tabular-nums text-muted-foreground">{formatMoney(completedSale.total, currency, locale)}</p></div>
            <PdvOrderReceiptButton orderId={completedSale.orderId} format={receiptFormat} documentKind="sale" label="Comprovante" className="w-full" />
            {fiscalAccess.allowed && <Button type="button" variant="outline" className="w-full" onClick={() => { setLastSaleMenuOpen(false); setFiscalTarget({ orderId: completedSale.orderId, scopeKey: completedSale.scopeKey }); }}>NFC-e desta venda</Button>}
            {canOpenPostSale && <Button type="button" variant="outline" className="w-full" onClick={() => { setLastSaleMenuOpen(false); onOpenPostSale(); }}>Abrir pós-venda</Button>}
          </PopoverContent>
        </Popover>
      </div>
      {fiscalAccess.allowed && <PdvNfceSaleAction orderId={completedSale.orderId} confirmed promptAfterPayment={!promptedFiscalSales.current.has(`${completedSale.scopeKey}:${completedSale.orderId}`)} onPromptShown={() => promptedFiscalSales.current.add(`${completedSale.scopeKey}:${completedSale.orderId}`)} contextKey={completedSale.scopeKey}
        detailsOpen={fiscalTarget?.orderId === completedSale.orderId && fiscalTarget.scopeKey === scopeKey}
        onDetailsOpenChange={open => setFiscalTarget(open ? {orderId:completedSale.orderId,scopeKey:completedSale.scopeKey} : null)} />}
      </> : children}
  </>;
}

/** `3 * <código>` digitado antes do código (manual) ou antes da rajada do leitor. */
function extractMultiplierPrefix(raw: string): { multiplier: number; term: string } {
  const match = raw.match(/^\s*(\d+)\s*[*×]\s*(.*)$/);
  if (!match) return { multiplier: 1, term: raw };
  const multiplier = parseInt(match[1], 10);
  return { multiplier: multiplier > 0 ? multiplier : 1, term: match[2] };
}

/**
 * Assinatura do conteúdo comercial, incluindo observação e data. A tentativa
 * persistida v2 precisa corresponder ao conteúdo enviado; após resultado
 * incerto, alterações exigem conferir o pedido antes de permitir outro envio.
 */
function cartSignature(
  cart: CartState,
  stockId: string | null,
  sessionId: string | null,
  notes: string,
  transactionDate: string,
  replacesOrderId: string | null,
): string {
  return JSON.stringify({
    stock: stockId,
    session: sessionId,
    discount: cart.discount,
    ...(cart.coupon ? { coupon: [cart.coupon.id, cart.coupon.discountCents, cart.coupon.baseSignature] } : {}),
    customer: cart.customerId,
    notes,
    transactionDate,
    replacesOrderId,
    lines: cart.lines.map((line) => [
      line.inventoryId,
      line.quantity,
      line.unitPrice,
      line.unitCost,
      line.discountAmount,
    ]),
  });
}

/** Códigos de aviso que a tela sabe traduzir (`avisos[]` da RPC). */
const KNOWN_SALE_WARNINGS = [
  'local_nao_e_de_loja',
  'cliente_sem_limite_definido',
  'saldo_negativo',
] as const;

type SaleWarningCode = (typeof KNOWN_SALE_WARNINGS)[number];

/**
 * `avisos` vem misturado de propósito: a RPC manda string pura
 * (`'local_nao_e_de_loja'`) e objeto (`{ motivo: 'saldo_negativo', ... }`).
 * Aviso desconhecido é DESCARTADO da tela mas nunca "engolido" em silêncio: a
 * lista completa vai pro console pra aparecer no suporte.
 */
function extractSaleWarnings(avisos: PdvSettleResult['avisos']): SaleWarningCode[] {
  const out: SaleWarningCode[] = [];
  for (const aviso of avisos ?? []) {
    const code = typeof aviso === 'string' ? aviso : String((aviso as { motivo?: string })?.motivo ?? '');
    if ((KNOWN_SALE_WARNINGS as readonly string[]).indexOf(code) >= 0 && out.indexOf(code as SaleWarningCode) < 0) {
      out.push(code as SaleWarningCode);
    }
  }
  return out;
}

/** Mantém o modelo visual antigo sem permitir uma segunda escrita legada. */
// eslint-disable-next-line react-refresh/only-export-components
export function adaptPdvDirectSaleV2Result(
  result: PdvCompleteDirectSaleV2Result,
  payments: Parameters<ReturnType<typeof usePdvDirectSaleV2>['complete']['mutateAsync']>[0]['payments'],
  itemCount: number,
  receivedAt = new Date().toISOString(),
): PdvSettleResult {
  return {
    order_id: result.orderId,
    numero: result.orderNumber,
    status: 'entregue',
    total: result.total,
    subtotal: result.subtotal,
    desconto: result.discountAmount,
    itens: itemCount,
    pagamentos: payments.map((payment, index) => ({
      payment_id: `v2-${index}`,
      method: payment.method,
      amount: payment.amount,
      change_amount: payment.change_amount ?? 0,
      account_id: payment.account_id ?? null,
      transaction_id: null,
      received_at: receivedAt,
    })),
    estoque: { baixado: true },
    avisos: [],
    idempotente: result.idempotent,
    modo: 'direct',
  };
}

/**
 * Workspace da venda do PDV. Novas vendas usam o contrato v2: pedido, itens,
 * pagamentos e estoque são confirmados em uma única transação do servidor.
 * A tentativa e a chave idempotente são persistidas antes do envio e mantidas
 * para conferência/retry em caso de resposta incerta.
 * Operações históricas continuam separadas da criação de novas vendas.
 */
export default function Pdv() {
  const location = useLocation();
  return <PdvNewSaleGate editRoute={shouldUseLegacyPdvRoute(location.search)} />;
}

function PdvNewSaleGate({ editRoute }: { editRoute: boolean }) {
  const directSale = usePdvDirectSaleV2();

  return (
    <PdvSaleContractGate
      directSale={directSale}
      legacy={<PdvSaleWorkspace directSale={directSale} />}
      editRoute={editRoute}
    />
  );
}

export function PdvSaleContractGate({
  directSale,
  legacy,
  editRoute = false,
}: {
  directSale: ReturnType<typeof usePdvDirectSaleV2>;
  legacy: ReactNode;
  editRoute?: boolean;
}) {
  // Edição/substituição ainda pertence nominalmente ao contrato legado. A
  // exceção só é considerada DEPOIS de a capability responder; estado
  // desconhecido jamais monta nenhum writer.
  if (directSale.contract === 'legacy' && editRoute) {
    return <>{legacy}</>;
  }

  // A substituição atômica existente pertence ao contrato legado. Nunca
  // deixamos uma venda v2 cair nesse writer: reservas, coberturas e recebíveis
  // v2 precisam de uma RPC de substituição igualmente versionada.
  if (directSale.contract === 'v2' && editRoute) {
    return (
      <div className="space-y-4" data-testid="pdv-direct-sale-v2-edit-blocked">
        <PageHeader title="Editar venda" subtitle="Protegendo os dados desta venda" icon={ShoppingCart} />
        <NoticeBanner variant="destructive" title="Esta venda não pode ser editada por esta tela">
          Use as ações de pós-venda para devolver, trocar ou estornar. Nenhuma alteração foi feita.
        </NoticeBanner>
      </div>
    );
  }

  // Novas vendas exigem v2 confirmado. O mesmo workspace visual é preservado,
  // mas uma capability negativa nunca volta ao criador antigo em etapas.
  if (directSale.contract === 'v2') return <>{legacy}</>;

  return (
    <div className="space-y-4" data-testid="pdv-direct-sale-gate-blocked">
      <PageHeader title="Venda de balcão" subtitle="Confirmando a versão segura da venda..." icon={ShoppingCart} />
      {directSale.capability.isLoading ? (
        <PdvSkeleton isMobileCart={false} showNumpad={false} />
      ) : (
        <NoticeBanner
          variant="destructive"
          title="Não foi possível liberar a venda com segurança"
          action={(
            <Button type="button" variant="outline" onClick={() => void directSale.capability.refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Tentar novamente
            </Button>
          )}
        >
          A venda ficou bloqueada para evitar usar uma versão incompleta. Nenhum pedido foi criado.
        </NoticeBanner>
      )}
    </div>
  );
}

function PdvSaleWorkspace({
  directSale,
}: {
  directSale: ReturnType<typeof usePdvDirectSaleV2>;
}) {
  const isV2 = directSale.contract === 'v2';
  const v2Catalog = directSale.catalog.data;
  const navigate = useNavigate();
  const location = useLocation();
  const { locale, currency, timezone } = useAppLocaleContext();
  const {
    user,
    profile,
    roles,
    permissions,
    isAdminOrGestor,
    hasPermissionRecord,
  } = useAuth();
  const t = MESSAGES[locale].app.pdv.cashier;
  const { toast } = useToast();
  const isMobileCart = useMediaBreakpoint(CART_DRAWER_BREAKPOINT);
  // true de 0 até 1023px (mobile + tablet) — numpad só aparece aí, nunca no desktop.
  const showNumpad = useMediaBreakpoint(NUMPAD_BREAKPOINT);

  const { items, stockLevelsLoaded, getQuantityForStock, isLoading: inventoryLoading } = useInventory();
  const { accessibleIds, isLoading: accessibleIdsLoading } = useAccessibleInventoryIds();
  const { stocks, isLoading: stocksLoading } = useStocks();
  const { groups, isLoading: groupsLoading } = useMaterialGroups();
  const { customers: legacyCustomers, isLoading: customersLoading } = useCustomers();
  const { accounts: legacyAccounts, isLoading: accountsLoading } = useFinancialAccounts();
  const { canUseBankAccounts: legacyCanUseBankAccounts } = useBankPermissions();
  // Terminal, sessão aberta e cofre vêm do MESMO hook do painel do Caixa
  // (`/pdv`), pra a venda e o painel nunca discordarem sobre qual caixa está
  // aberto nem sobre qual conta é o cofre.
  const {
    terminals: legacyTerminals,
    session: legacySession,
    cofre: legacyCofre,
    isLoading: cashLoading,
  } = usePdvCashRegister();
  const { createOrder, settleOrder, replaceOrder } = usePdvSale();
  const identifiers = useInventoryIdentifiers();
  const uploadAttachment = useUploadPdvOrderAttachment();
  const receiptSettings = usePdvReceiptSettings();
  const returnsFeature = usePdvReturnsFeature(profile?.company_id);
  const afterSaleFeature = usePdvAfterSaleFeature(profile?.company_id);
  const privilegedAfterSale = isAdminOrGestor() || roles.includes('super_admin');
  const returnsAccess = derivePdvReturnsAccess({
    featureEnabled: returnsFeature.data === true,
    privileged: privilegedAfterSale,
    hasPermissionRecord,
    permissions,
  });
  const afterSaleAccess = derivePdvAfterSaleAccess({
    featureEnabled: afterSaleFeature.data === true,
    privileged: privilegedAfterSale,
    hasPermissionRecord,
    permissions,
  });
  const requestedCashContext = useMemo(
    () => parsePdvSaleCashContext(location.search),
    [location.search],
  );
  const resolvedV2CashContext = useMemo(
    () => resolvePdvSaleCashContext({
      requested: requestedCashContext,
      terminals: v2Catalog?.terminals ?? [],
      sessions: v2Catalog?.sessions ?? [],
    }),
    [requestedCashContext, v2Catalog?.sessions, v2Catalog?.terminals],
  );

  // Carregamento inicial da tela inteira (catálogo + locais + categorias +
  // clientes) — pedido do CEO 2026-10-18: "carregou e depois vieram as fotos,
  // faça o carregamento de tudo ser amigável com skeletons". Enquanto
  // qualquer um ainda não respondeu, a tela mostra `PdvSkeleton` em vez de um
  // grid/resumo pela metade (ou, pior, o `EmptyState` de "nenhum produto"
  // piscando ANTES do catálogo real chegar — carregando não é vazio).
  //
  // `cashLoading`/`accountsLoading` entram aqui porque a tela diz "caixa
  // fechado" e lista contas de recebimento: sem esperar, o operador veria o
  // aviso de caixa fechado piscar com o caixa ABERTO (carregando não é vazio,
  // nem no dinheiro).
  const isLoadingPdv = isV2
    ? directSale.catalog.isLoading || stocksLoading || groupsLoading
    : inventoryLoading ||
      !stockLevelsLoaded ||
      accessibleIdsLoading ||
      stocksLoading ||
      groupsLoading ||
      customersLoading ||
      accountsLoading ||
      cashLoading;

  const pdvStocks = useMemo(() => {
    const storeStocks = stocks.filter((stock) => stock.purpose === 'pdv');
    if (!isV2) return storeStocks;
    const allowedStockIds = new Set((v2Catalog?.terminals ?? []).map((terminal) => terminal.stockId));
    return storeStocks.filter((stock) => allowedStockIds.has(stock.id));
  }, [isV2, stocks, v2Catalog?.terminals]);
  const customers = useMemo<Customer[]>(
    () => isV2
      ? (v2Catalog?.customers ?? []).map(toPdvCustomerRecord)
      : legacyCustomers,
    [isV2, legacyCustomers, v2Catalog?.customers],
  );
  const maxTransactionDate = todayInTz(timezone);
  const draftOwner = useMemo(
    () => {
      if (!user?.id || !profile?.company_id) return null;
      if (isV2 && resolvedV2CashContext.status === 'resolved') return {
          userId: user.id,
          companyId: profile.company_id,
          cashSessionId: resolvedV2CashContext.context.sessionId,
          terminalId: resolvedV2CashContext.context.terminalId,
          stockId: resolvedV2CashContext.context.stockId,
        };
      if (!isV2 && legacySession?.id && legacySession.terminal_id && pdvStocks[0]?.id) return {
        userId: user.id,
        companyId: profile.company_id,
        cashSessionId: legacySession.id,
        terminalId: legacySession.terminal_id,
        stockId: pdvStocks[0].id,
      };
      return null;
    },
    [isV2, legacySession?.id, legacySession?.terminal_id, pdvStocks, profile?.company_id, resolvedV2CashContext, user?.id],
  );
  const {
    workspace: draftWorkspace,
    activeDraft,
    updateDraft,
    persistDraftNow,
    updateActiveDraft,
    createDraft,
    selectDraft,
    deleteDraft,
    setWorkspace: setDraftWorkspace,
    syncIssue,
    draftConflicts = [],
    resolveDraftConflict,
    resolvingDraftId = null,
    localPersistenceIssue = false,
    retrySync,
    lastResolution = null,
  } = usePdvSaleDraftWorkspace({
    owner: draftOwner,
    directSaleV2: isV2,
    transactionDate: maxTransactionDate,
    defaultStockId: resolvedV2CashContext.status === 'resolved'
      ? resolvedV2CashContext.context.stockId
      : pdvStocks[0]?.id ?? null,
  });

  const cart = activeDraft?.cart ?? EMPTY_CART;
  const activeDraftId = activeDraft?.id ?? null;
  const directSaleNeedsReview = Boolean(isV2 && activeDraft?.attempt && (!isDurablePdvDirectSaleAttempt(activeDraft.attempt) || activeDraft.attempt.orderId));
  const liveCartRef = useRef(cart);
  liveCartRef.current = cart;
  const selectedStockId = activeDraft?.stockId
    ?? (resolvedV2CashContext.status === 'resolved'
      ? resolvedV2CashContext.context.stockId
      : pdvStocks[0]?.id ?? null);
  const orderNotes = activeDraft?.notes ?? '';
  const transactionDate = activeDraft?.transactionDate ?? maxTransactionDate;

  const setCart = useCallback((next: SetStateAction<CartState>) => {
    updateActiveDraft((draft) => ({
      ...draft,
      ...(() => {
        const nextCart = typeof next === 'function' ? next(draft.cart) : next;
        liveCartRef.current = nextCart;
        const nextTotal = computeTotal(nextCart);
        const appliedVouchers = clampAppliedVouchers(getAppliedVouchers(draft), nextTotal);
        return { cart: nextCart, appliedVoucher: appliedVouchers[0] ?? null, appliedVouchers };
      })(),
      // Alterar qualquer dado material invalida a tentativa anterior deste
      // pedido, mas não toca nas tentativas dos outros rascunhos.
      attempt: isV2 ? draft.attempt : null,
    }));
  }, [isV2, updateActiveDraft]);

  const setSelectedStockId = useCallback((stockId: string | null) => {
    updateActiveDraft((draft) => ({ ...draft, stockId, attempt: isV2 ? draft.attempt : null }));
  }, [isV2, updateActiveDraft]);

  const setOrderNotes = useCallback((notes: string) => {
    updateActiveDraft((draft) => ({ ...draft, notes, attempt: isV2 ? draft.attempt : null }));
  }, [isV2, updateActiveDraft]);

  const preferredV2StockId = useMemo(() => {
    if (!isV2 || resolvedV2CashContext.status !== 'resolved') return null;
    return resolvedV2CashContext.context.stockId;
  }, [isV2, resolvedV2CashContext]);

  // O catálogo seguro pode responder depois do rascunho local. Alinhamos
  // apenas rascunho vazio; um carrinho preenchido nunca muda de local sozinho.
  useEffect(() => {
    if (!isV2 || !activeDraft || activeDraft.cart.lines.length > 0 || !preferredV2StockId) return;
    const stockAllowed = (v2Catalog?.terminals ?? []).some(
      (terminal) => terminal.stockId === activeDraft.stockId,
    );
    if (!stockAllowed) setSelectedStockId(preferredV2StockId);
  }, [activeDraft, isV2, preferredV2StockId, setSelectedStockId, v2Catalog?.terminals]);

  const [search, setSearch] = useState('');
  const [catalogMode, setCatalogMode] = useState<'quick' | 'catalog'>(() =>
    typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches ? 'catalog' : 'quick');
  const [activeProductIndex, setActiveProductIndex] = useState(0);
  const [catalogKeyboardActive, setCatalogKeyboardActive] = useState(false);
  const [activeCategory, setActiveCategory] = useState('all');
  const editSourceOrderId = new URLSearchParams(location.search).get('editar');
  const [saleEditDrafts, setSaleEditDrafts] = useState<Record<string, PdvSaleEditDraft>>({});
  const saleEditDraft = activeDraft ? saleEditDrafts[activeDraft.id] ?? null : null;
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const cartAdditionSequenceRef = useRef(0);
  const [cartAdditionFeedback, setCartAdditionFeedback] = useState<{
    draftId: string;
    inventoryId: string;
    sequence: number;
  } | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  // "Opções avançadas" (retrodatar o lançamento + anexar foto, pedido do CEO
  // 2026-10-19) e a observação do pedido, que mora ao lado delas na coluna da
  // direita.
  //
  // `transactionDate` NASCE preenchido com o dia da empresa, não vazio
  // (correção 2026-10-19: campo vazio com placeholder lido como "quebrado" —
  // isto é dinheiro, o operador tem que VER a data que vai ser lançada, não
  // adivinhar por um texto cinza). O servidor só recebe data quando ela é
  // DIFERENTE do dia da empresa (ver `handleFinalizeSale`); igual a hoje
  // continua mandando `null`, caminho feliz intacto.
  const [attachmentsByDraft, setAttachmentsByDraft] = useState<Record<string, PdvPendingAttachment[]>>({});
  const pendingAttachments = activeDraft ? attachmentsByDraft[activeDraft.id] ?? [] : [];
  const handledResolutionRef = useRef<typeof lastResolution>(null);
  useLayoutEffect(() => {
    if (!lastResolution || handledResolutionRef.current === lastResolution) return;
    handledResolutionRef.current = lastResolution;
    if (!lastResolution.localCopyId || lastResolution.localCopyId === lastResolution.id) return;
    const { id, localCopyId } = lastResolution;
    // A identidade vem da resolução confirmada; não associar arquivos pela
    // semelhança de cliente/conteúdo, nem à versão online que substituiu a local.
    setAttachmentsByDraft(current => transferRecoveredDraftAttachments(current, { id, localCopyId }));
  }, [lastResolution]);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [advancedOptionsOpen, setAdvancedOptionsOpen] = useState(false);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const [completedSale, setCompletedSale] = useState<CompletedPdvSale | null>(null);
  const [postSaleOpen, setPostSaleOpen] = useState(false);
  const completedSaleScope = draftOwner ? [draftOwner.companyId, draftOwner.userId, draftOwner.cashSessionId, draftOwner.terminalId, draftOwner.stockId].join(':') : null;
  const completedSaleScopeRef = useRef(completedSaleScope);
  completedSaleScopeRef.current = completedSaleScope;
  // O render mascara o resultado imediatamente; o efeito também descarta seus controles antigos.
  const visibleCompletedSale = completedSale && completedSale.scopeKey === completedSaleScope ? completedSale : null;
  useEffect(() => { setCompletedSale(null); setPostSaleOpen(false); }, [completedSaleScope]);


  const searchInputRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const autoReceipt = usePdvStageReceiptAuto();
  const receiptOpener = usePdvOrderReceiptOpener();
  const receiptFormat = readDeviceReceiptFormat()
    ?? resolvePdvReceiptStagePolicy(receiptSettings.data, 'sale').format;
  const hasPostSaleAccess = (
    returnsAccess.enabled
    && (returnsAccess.canReturn || returnsAccess.canReverse || returnsAccess.canCancelResidual)
  ) || (afterSaleAccess.enabled && afterSaleAccess.canView);

  /**
   * A TENTATIVA DE VENDA em curso. Guarda o pedido já criado e a chave de
   * idempotência, pra o retry reaproveitar os dois. `signature` amarra a
   * tentativa ao carrinho que a originou (ver `cartSignature`).
   */
  const attemptByDraftRef = useRef<Map<string, PdvSaleAttempt>>(new Map());
  const attemptMapScopeRef = useRef(completedSaleScope);
  if (attemptMapScopeRef.current !== completedSaleScope) {
    attemptByDraftRef.current = new Map();
    attemptMapScopeRef.current = completedSaleScope;
  }
  const paymentSnapshotRef = useRef<{
    draftId: string;
    cart: CartState;
    stockId: string | null;
    notes: string;
    transactionDate: string;
    appliedVoucher: PdvAppliedVoucher | null;
    appliedVouchers?: PdvAppliedVoucher[];
    editDraft: PdvSaleEditDraft | null;
    attachments: PdvPendingAttachment[];
  } | null>(null);
  const editDraftHydratedRef = useRef<Set<string>>(new Set());

  // Rascunho é isolado por usuário + empresa e por pedido. Em terminal
  // compartilhado, trocar de conta nunca pode exibir dados da venda anterior.
  useEffect(() => {
    if (!activeDraft || !editSourceOrderId || !user?.id || !profile?.company_id) return;
    const alreadyAssigned = Object.entries(saleEditDrafts).find(
      ([, draft]) => draft.sourceOrderId === editSourceOrderId,
    );
    if (alreadyAssigned) {
      if (alreadyAssigned[0] !== activeDraft.id) selectDraft(alreadyAssigned[0]);
      return;
    }
    const stateDraft = (location.state as { pdvSaleEditDraft?: PdvSaleEditDraft } | null)
      ?.pdvSaleEditDraft;
    const owner = { userId: user.id, companyId: profile.company_id };
    const draft =
      isPdvSaleEditDraft(stateDraft, editSourceOrderId, owner)
        ? stateDraft
        : loadPdvSaleEditDraft(editSourceOrderId, {
            ...owner,
          });
    if (draft) {
      setSaleEditDrafts((current) => ({ ...current, [activeDraft.id]: draft }));
      return;
    }
    toast({ variant: 'destructive', title: t.editDraft.missing });
    navigate(PDV_SALE_PATH, { replace: true });
  }, [activeDraft, editSourceOrderId, location.state, navigate, profile?.company_id, saleEditDrafts, selectDraft, t.editDraft.missing, toast, user?.id]);

  const formatCurrency = (value: number) => formatMoney(value, currency, locale);
  const formatQuantity = (value: number, unit: string) =>
    `${formatNumber(value, locale, { maximumFractionDigits: 3 })} ${unit}`;
  const currencySymbol = useMemo(() => getCurrencySymbol(currency, locale), [currency, locale]);
  const currencyFractionDigits = useMemo(() => {
    try {
      return new Intl.NumberFormat(toBcp47(locale), { style: 'currency', currency })
        .resolvedOptions().maximumFractionDigits;
    } catch {
      return 2;
    }
  }, [currency, locale]);

  function handleTransactionDateChange(value: string) {
    updateActiveDraft((draft) => ({
      ...draft,
      transactionDate: value,
      transactionDateTouched: true,
      attempt: isV2 ? draft.attempt : null,
    }));
  }

  /**
   * Comprime (sempre, `processImageFile` — "otimizada e comprimida", pedido
   * do CEO) cada foto escolhida e guarda como blob local. NÃO sobe nada pro
   * Storage aqui: o pedido do PDV só existe no banco na hora de finalizar, e
   * o caminho do arquivo (`<company_id>/pdv-orders/<order_id>/...`) exige o
   * `order_id` — ver `handleFinalizeSale`.
   */
  async function handleAttachFiles(files: File[]) {
    if (!activeDraft) return;
    const draftId = activeDraft.id;
    setAttachmentBusy(true);
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      const id = crypto.randomUUID();
      const sourcePreviewUrl = URL.createObjectURL(file);
      setAttachmentsByDraft((current) => ({
        ...current,
        [draftId]: [
          ...(current[draftId] ?? []),
          { id, file, previewUrl: sourcePreviewUrl, status: 'processing', progress: 12 },
        ],
      }));
      try {
        const compressed = await processImageFile(file);
        const compressedPreviewUrl = URL.createObjectURL(compressed);
        setAttachmentsByDraft((current) => ({
          ...current,
          [draftId]: (current[draftId] ?? []).map((attachment) =>
            attachment.id === id
              ? { ...attachment, file: compressed, previewUrl: compressedPreviewUrl, status: 'ready', progress: 100 }
              : attachment,
          ),
        }));
        URL.revokeObjectURL(sourcePreviewUrl);
      } catch {
        setAttachmentsByDraft((current) => ({
          ...current,
          [draftId]: (current[draftId] ?? []).map((attachment) =>
            attachment.id === id
              ? { ...attachment, status: 'error', progress: 0, errorMessage: t.toast.attachFailed }
              : attachment,
          ),
        }));
      }
    }
    setAttachmentBusy(false);
  }

  function handleRemoveAttachment(id: string) {
    if (!activeDraft) return;
    const draftId = activeDraft.id;
    setAttachmentsByDraft((current) => {
      const list = current[draftId] ?? [];
      const target = list.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return { ...current, [draftId]: list.filter((p) => p.id !== id) };
    });
  }

  /** Abandona observação, data retroativa e fotos pendentes do rascunho atual. */
  function resetOrderDraftExtras(draftId = activeDraft?.id) {
    if (!draftId) return;
    updateDraft(draftId, (draft) => ({
      ...draft,
      notes: '',
      transactionDate: maxTransactionDate,
      transactionDateTouched: false,
      attempt: isV2 ? draft.attempt : null,
    }));
    setAttachmentsByDraft((current) => {
      (current[draftId] ?? []).forEach((p) => URL.revokeObjectURL(p.previewUrl));
      const { [draftId]: _removed, ...rest } = current;
      return rest;
    });
  }

  function clearSaleEditContext(draftId = activeDraft?.id) {
    if (!draftId) return;
    const editDraft = saleEditDrafts[draftId];
    if (!editDraft) return;
    clearPdvSaleEditDraft(editDraft.sourceOrderId);
    setSaleEditDrafts((current) => {
      const { [draftId]: _removed, ...rest } = current;
      return rest;
    });
    editDraftHydratedRef.current.delete(draftId);
    if (editSourceOrderId === editDraft.sourceOrderId) navigate(PDV_SALE_PATH, { replace: true });
  }

  // Produtos vendáveis, com saldo calculado no local selecionado. Filtra pela
  // RPC get_accessible_inventory_ids ANTES de qualquer soma/exibição — régua
  // do achado B do plano (agregado de tela não pode vazer material de local
  // bloqueado pro usuário).
  const sellableProducts: (PdvGridProduct & {
    groupId: string | null;
    barcode: string | null;
    unitCost: number;
  })[] = useMemo(() => {
    if (isV2) {
      return (v2Catalog?.materials ?? []).map((material) => {
        const availability = material.availableByStock.find(
          (entry) => entry.stockId === selectedStockId,
        );
        return {
          inventoryId: material.id,
          name: material.name,
          sku: material.sku,
          imageUrl: material.imageUrl,
          unitPrice: material.salePrice ?? 0,
          unit: material.unit || 'un',
          // O core v2 congela o custo no servidor. Ele nunca trafega no
          // catálogo do operador nem participa do payload do navegador.
          unitCost: 0,
          availableQuantity: availability && !availability.hasConflict
            ? availability.availableQuantity
            : 0,
          groupId: material.groupId,
          barcode: material.barcode,
        };
      });
    }
    return items
      .filter((item) => item.is_sellable !== false)
      .filter((item) => accessibleIds.has(item.id))
      .map((item) => ({
        inventoryId: item.id,
        name: item.name,
        sku: item.sku,
        imageUrl: item.image_url ?? null,
        unitPrice: item.sale_price ?? 0,
        unit: item.unit || 'un',
        // SNAPSHOT do custo: vai pra `pdv_order_items.unit_cost` e é o que faz
        // o lucro real do caixa. Ler o custo do catálogo depois da venda daria
        // margem retroativa fantasiosa.
        unitCost: item.cost_price ?? 0,
        availableQuantity: selectedStockId ? getQuantityForStock(item.id, selectedStockId) : 0,
        groupId: item.group_id ?? null,
        barcode: item.barcode ?? null,
      })) as (PdvGridProduct & { groupId: string | null; barcode: string | null; unitCost: number })[];
  }, [isV2, v2Catalog?.materials, items, accessibleIds, selectedStockId, getQuantityForStock]);

  // A venda original CONTINUA baixando o estoque enquanto esta tela está
  // aberta. O snapshot usa preço/custo/nome históricos, enquanto foto e saldo
  // vêm do catálogo atual. `max(source.quantity, saldo)` deixa manter a
  // quantidade original mesmo quando ela consumiu as últimas unidades; a RPC
  // restaura a origem antes de baixar a substituta, na mesma transação.
  useEffect(() => {
    if (!activeDraftId || !saleEditDraft || editDraftHydratedRef.current.has(activeDraftId) || isLoadingPdv) return;
    const draftId = activeDraftId;
    const draftStockId =
      saleEditDraft.stockId && pdvStocks.some((stock) => stock.id === saleEditDraft.stockId)
        ? saleEditDraft.stockId
        : (selectedStockId ?? pdvStocks[0]?.id ?? null);
    if (!draftStockId) return;

    updateDraft(draftId, (draft) => ({
      ...draft,
      stockId: draftStockId,
      cart: {
        customerId: saleEditDraft.customerId,
        discount: saleEditDraft.discountAmount,
        lines: saleEditDraft.items.map((source) => {
          const current = items.find((item) => item.id === source.inventoryId);
          return {
            inventoryId: source.inventoryId,
            name: source.description,
            imageUrl: current?.image_url ?? null,
            unitPrice: source.unitPrice,
            unit: source.unit?.trim() || current?.unit || 'un',
            unitCost: source.unitCost,
            discountAmount: source.discountAmount,
            quantity: source.quantity,
            availableQuantity: Math.max(
              source.quantity,
              getQuantityForStock(source.inventoryId, draftStockId),
            ),
          };
        }),
      },
      notes: saleEditDraft.notes,
      transactionDate: saleEditDraft.transactionDate,
      transactionDateTouched: true,
      attempt: isV2 ? draft.attempt : null,
    }));
    editDraftHydratedRef.current.add(draftId);
  }, [
    activeDraftId,
    saleEditDraft,
    isV2,
    isLoadingPdv,
    pdvStocks,
    selectedStockId,
    items,
    getQuantityForStock,
    updateDraft,
  ]);

  // Atualiza o teto quando o saldo do catálogo mudar, sem jamais baixar do que
  // já está no carrinho. A RPC continua sendo a autoridade final de estoque.
  useEffect(() => {
    if (!activeDraftId || !saleEditDraft || !editDraftHydratedRef.current.has(activeDraftId) || !selectedStockId) return;
    const draftId = activeDraftId;
    updateDraft(draftId, (draft) => ({
      ...draft,
      cart: {
        ...draft.cart,
        lines: draft.cart.lines.map((line) => ({
          ...line,
          availableQuantity: Math.max(
            line.quantity,
            getQuantityForStock(line.inventoryId, selectedStockId),
          ),
        })),
      },
    }));
  }, [activeDraftId, saleEditDraft, selectedStockId, items, getQuantityForStock, updateDraft]);

  const categoryFiltered = useMemo(() => {
    if (activeCategory === 'all') return sellableProducts;
    return sellableProducts.filter((p) => p.groupId === activeCategory);
  }, [sellableProducts, activeCategory]);

  const searchFiltered = useMemo(() => {
    const { term } = extractMultiplierPrefix(search);
    if (!term.trim()) return categoryFiltered;
    return categoryFiltered.filter((p) => {
      const groupName = groups.find((group) => group.id === p.groupId)?.name ?? '';
      return fuzzyIncludesAny([p.sku, p.name, p.barcode, groupName], term);
    });
  }, [categoryFiltered, groups, search]);

  // Itens sem saldo não recebem foco de teclado: o botão está desabilitado e
  // não existe ação útil para Enter. O primeiro produto disponível permanece
  // ativo mesmo com a busca vazia, dando ao operador um ponto de partida
  // previsível assim que abre o PDV ou limpa/pesquisa o catálogo.
  const visibleProducts = useMemo(
    () => catalogMode === 'quick' && !search.trim() ? searchFiltered.slice(0, 4) : searchFiltered,
    [catalogMode, search, searchFiltered],
  );
  const keyboardProducts = useMemo(
    () => visibleProducts.filter((product) => product.availableQuantity > 0),
    [visibleProducts],
  );
  const activeProductId = keyboardProducts[
    Math.min(activeProductIndex, Math.max(0, keyboardProducts.length - 1))
  ]?.inventoryId ?? null;

  useEffect(() => {
    setActiveProductIndex(0);
  }, [search, activeCategory, catalogMode]);

  useEffect(() => {
    if (!activeProductId) return;
    const activeButton = Array.from(
      gridRef.current?.querySelectorAll<HTMLElement>('[data-pdv-product-id]') ?? [],
    ).find((element) => element.dataset.pdvProductId === activeProductId);
    activeButton?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeProductId]);

  const moveProductFocus = useCallback((direction: PdvGridDirection) => {
    if (!activeProductId || !gridRef.current) return;
    const elements = Array.from(
      gridRef.current.querySelectorAll<HTMLButtonElement>('[data-pdv-product-id]:not(:disabled)'),
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
    if (!nextId) return;
    const nextIndex = keyboardProducts.findIndex((product) => product.inventoryId === nextId);
    if (nextIndex < 0) return;
    setActiveProductIndex(nextIndex);

    // Quando a seta parte da busca, o foco entra de verdade na grade. Assim
    // Enter/Espaço usam o comportamento nativo do botão e as próximas setas
    // continuam navegando sem depender do campo de pesquisa.
    window.requestAnimationFrame(() => {
      elements.find((element) => element.dataset.pdvProductId === nextId)?.focus();
    });
  }, [activeProductId, keyboardProducts]);

  function handleGridKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const directionByKey: Partial<Record<string, PdvGridDirection>> = {
      ArrowUp: 'up',
      ArrowDown: 'down',
      ArrowLeft: 'left',
      ArrowRight: 'right',
    };
    const direction = directionByKey[event.key];
    if (!direction) return;
    event.preventDefault();
    moveProductFocus(direction);
  }

  const catalogSections = useMemo(() => {
    const byGroup = new Map<string | null, typeof searchFiltered>();
    for (const product of searchFiltered) {
      const current = byGroup.get(product.groupId) ?? [];
      current.push(product);
      byGroup.set(product.groupId, current);
    }
    return [
      ...groups
        .map((group) => ({ id: group.id, label: group.name, items: byGroup.get(group.id) ?? [] }))
        .filter((section) => section.items.length > 0),
      ...(byGroup.get(null)?.length
        ? [{ id: 'uncategorized', label: t.categories.uncategorized, items: byGroup.get(null)! }]
        : []),
    ];
  }, [groups, searchFiltered, t.categories.uncategorized]);

  const categoryTabs: PillTab[] = useMemo(
    () => [
      { value: 'all', label: t.categories.all },
      // `useColorBackground`: pill ativa usa a cor do grupo SATURADA de fundo
      // (igual ao card-herói de conta financeira), nunca o estilo translúcido
      // padrão do MobilePillTabs — que lido no tema claro parece uma pill
      // dessaturada (antipadrão que o CEO cobrou: "verde pálido com texto
      // verde" em vez de "fundo saturado, texto branco").
      ...groups.map((g) => ({
        value: g.id,
        label: g.name,
        accentColor: g.color ?? undefined,
        useColorBackground: true,
        forceWhiteForeground: true,
      })),
    ],
    [groups, t.categories.all],
  );

  // Teto de pills visíveis antes de empilhar o resto atrás do botão "Filtros"
  // (régua do CEO: "cuidado quando tiver muitos pra não acumular"). MEDIDO
  // de verdade no tenant de teste (8 categorias, rótulos de até ~190px como
  // "Consumíveis e Fixação") com Playwright, não chutado — dois baldes
  // porque o espaço some rápido abaixo de 1024:
  // - tablet (768-1023, `showNumpad` true): no pior caso (768px) a fileira
  //   de pills tem ~302px de conteúdo útil (sem a largura do botão
  //   "Filtros", ~94px + gap). 2 pills (Todos + 1 categoria) cabem sem
  //   cortar texto; a 3ª já estoura.
  // - desktop (>=1024, `showNumpad` false): no pior caso (1024px, a largura
  //   mínima do bucket) sobram ~494px. 3 pills cabem sem cortar; a 4ª já
  //   estoura.
  // Larguras maiores dentro de cada bucket só sobram espaço (aceitável —
  // não é ResizeObserver dinâmico de propósito, ver relatório de UI).
  const MAX_VISIBLE_CATEGORY_TABS = showNumpad ? 2 : 3;
  const visibleCategoryTabs = useMemo(() => {
    if (categoryTabs.length <= MAX_VISIBLE_CATEGORY_TABS) return categoryTabs;
    const head = categoryTabs.slice(0, MAX_VISIBLE_CATEGORY_TABS);
    if (head.some((tb) => tb.value === activeCategory)) return head;
    // A pill ativa ficou escondida atrás do "Filtros" — nunca deixa isso
    // acontecer, senão o operador perde a referência do que está filtrando.
    // Bombeia a pill ativa pro fim da fileira visível, no lugar da última.
    const active = categoryTabs.find((tb) => tb.value === activeCategory);
    return active ? [...head.slice(0, MAX_VISIBLE_CATEGORY_TABS - 1), active] : head;
  }, [categoryTabs, activeCategory, MAX_VISIBLE_CATEGORY_TABS]);
  const hiddenCategoryTabs = useMemo(
    () => categoryTabs.filter((tb) => !visibleCategoryTabs.some((v) => v.value === tb.value)),
    [categoryTabs, visibleCategoryTabs],
  );

  function toProduct(p: PdvGridProduct): CartProduct {
    return {
      inventoryId: p.inventoryId,
      name: p.name,
      imageUrl: p.imageUrl,
      unitPrice: p.unitPrice,
      unit: p.unit || 'un',
      unitCost: (p as PdvGridProduct & { unitCost?: number }).unitCost ?? 0,
      availableQuantity: p.availableQuantity,
    };
  }

  function tryAdd(p: PdvGridProduct, quantity: number) {
    if (directSaleNeedsReview) return;
    setCatalogKeyboardActive(false);
    // A resolução de QR/embalagem é assíncrona. O ref é atualizado antes do
    // próximo scan para duas leituras que terminam juntas nunca sobrescreverem
    // a quantidade uma da outra com um snapshot antigo do carrinho.
    const result = addItem(liveCartRef.current, toProduct(p), quantity);
    // `=== false` (não `!result.ok`): sem strictNullChecks neste tsconfig, a
    // negação bare não estreita o discriminated union.
    if (result.ok === false) {
      toast({
        variant: 'destructive',
        title: result.reason === 'out_of_stock' ? t.toast.outOfStock : t.toast.insufficientStock,
      });
      return;
    }
    liveCartRef.current = result.cart;
    setCart(result.cart);
    if (activeDraftId) {
      cartAdditionSequenceRef.current += 1;
      setCartAdditionFeedback({
        draftId: activeDraftId,
        inventoryId: p.inventoryId,
        sequence: cartAdditionSequenceRef.current,
      });
    }
  }

  function handleProductSelect(product: PdvGridProduct) {
    if (directSaleNeedsReview) return;
    tryAdd(product, 1);
    setSearch('');
    setActiveProductIndex(0);
    focusSearch();
  }

  function focusSearch() {
    if (isMobileCart && cartDrawerOpen) return;
    // Depois de adicionar/editar, espera o commit visual do carrinho. Assim o
    // botão clicado nunca recupera o foco no fim do mesmo gesto.
    window.requestAnimationFrame(() => { searchInputRef.current?.focus({ preventScroll: true }); searchInputRef.current?.select(); });
  }

  async function handleBarcodeScan(code: string) {
    if (directSaleNeedsReview) return;
    // A rajada do leitor pode vir depois de um multiplicador digitado à mão
    // ("3 *" + leitura) — o que sobrou no campo ANTES do código escaneado.
    const prefixRaw = search.slice(0, Math.max(0, search.length - code.length));
    const { multiplier } = extractMultiplierPrefix(`${prefixRaw}x`);
    setSearch('');

    try {
      const selection = await resolvePdvScannedSelection({
        code,
        isV2,
        products: sellableProducts,
        resolveIdentifier: (value) => identifiers.resolve.mutateAsync({ code: value }),
      });
      if (!selection) {
        toast({ variant: 'destructive', title: t.toast.barcodeNotFound });
        return;
      }
      tryAdd(selection.product, multiplier * selection.unitFactor);
      focusSearch();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: t.toast.barcodeNotFound,
        description: error instanceof Error ? error.message : 'Tente novamente.',
      });
    }
  }

  useBarcodeScanner({
    shouldCaptureTarget: target => canCapturePdvCatalogScan(target, searchInputRef.current),
    onScan: (code) => { if (document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')) return; void handleBarcodeScan(code); },
    enabled: !confirmClearOpen && !paymentOpen && !advancedOptionsOpen && !shortcutHelpOpen,
  });

  function handleSearchEnter(preferred?: PdvGridProduct) {
    const { multiplier, term } = extractMultiplierPrefix(search);
    const cleanTerm = term.trim();
    if (preferred) {
      tryAdd(preferred, multiplier);
      setSearch(''); setActiveProductIndex(0); focusSearch(); return;
    }
    if (!cleanTerm) return;
    const matches = searchFiltered.length ? searchFiltered : [];
    const direct = sellableProducts.filter((p) => fuzzyIncludesAny([p.sku, p.name, p.barcode], cleanTerm));
    const pool = direct.length ? direct : matches;
    if (pool.length > 0) {
      const active = pool.find((product) => product.inventoryId === activeProductId)
        ?? pool.find((product) => product.availableQuantity > 0)
        ?? pool[0];
      tryAdd(active, multiplier);
      setSearch('');
      setActiveProductIndex(0);
      focusSearch();
    }
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const directionByKey: Partial<Record<string, PdvGridDirection>> = {
      ArrowUp: 'up',
      ArrowDown: 'down',
      ArrowLeft: 'left',
      ArrowRight: 'right',
    };
    const direction = directionByKey[e.key];
    if (
      direction
      && keyboardProducts.length > 0
      && shouldNavigatePdvCatalogFromSearch(e.key, search)
    ) {
      e.preventDefault();
      setCatalogKeyboardActive(true);
      moveProductFocus(direction);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      // Enter com a busca VAZIA e carrinho cheio abre o pagamento (régua de
      // velocidade do plano): o ciclo "bipa, bipa, Enter" fecha a venda sem
      // tirar a mão do teclado.
      if (!search.trim() && canPay) {
        openPayment();
        return;
      }
      handleSearchEnter();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (search) {
        setSearch('');
        setActiveProductIndex(0);
      } else if (cart.lines.length > 0) {
        setConfirmClearOpen(true);
      }
      return;
    }
    // +/- só vira atalho de quantidade quando o campo está vazio (senão
    // quebraria a digitação normal de um código/nome que contenha o caractere).
    if ((e.key === '+' || e.key === '-') && search === '' && cart.lines.length > 0) {
      e.preventDefault();
      const lastLine = cart.lines[cart.lines.length - 1];
      const step = inventoryQuantityStep(lastLine.unit);
      setCart(incrementLineQuantity(cart, lastLine.inventoryId, e.key === '+' ? step : -step));
    }
  }

  const itemCount = cart.lines.length;
  const total = computeTotal(cart);
  const canPay = cart.lines.length > 0 && total > 0 && !directSaleNeedsReview && couponCartReady(cart);

  // No v2, terminal, sessão e conta da gaveta vêm juntos da projeção
  // fechada. O hook legado exclui caixas contract_version=2 de propósito.
  const resolvedV2Context = resolvedV2CashContext.status === 'resolved'
    ? resolvedV2CashContext.context
    : null;
  const v2Terminal = isV2 && resolvedV2Context
    ? (v2Catalog?.terminals.find((terminal) =>
        terminal.id === resolvedV2Context.terminalId
        && terminal.stockId === selectedStockId) ?? null)
    : null;
  const v2Session = isV2 && v2Terminal
    ? (v2Catalog?.sessions.find((candidate) =>
        candidate.id === resolvedV2Context?.sessionId
        && candidate.terminalId === v2Terminal.id) ?? null)
    : null;
  const terminalId = isV2
    ? v2Terminal?.id ?? null
    : legacySession?.terminal_id ?? legacyTerminals[0]?.id ?? null;
  const cashSessionId = isV2 ? v2Session?.id ?? null : legacySession?.id ?? null;
  const hasOpenCashSession = isV2 ? !!v2Session : !!legacySession;
  const hasCofreAccount = isV2
    ? !!v2Session?.cashAccountId && !!v2Catalog?.cashAccount
    : !!legacyCofre?.conta_id;

  /**
   * Contas que podem receber PIX, transferência e cartão. Cartão de CRÉDITO
   * fica fora porque a RPC recusa ("cartão de crédito não recebe venda").
   * A conta do cofre vai pro fim da lista, e nunca é o default: o dinheiro
   * entra lá sozinho, por forma de pagamento, e um PIX apontado pro cofre
   * engordaria o saldo do cofre sem entrar na conferência da gaveta.
   */
  const paymentAccounts = useMemo(
    () => {
      if (isV2) {
        return (v2Catalog?.bankAccounts ?? []).map((account) => ({
          id: account.id,
          name: account.name,
          type: account.type,
          color: account.color ?? '#6B7280',
          institution_code: account.institutionCode,
          institution_name: account.institutionName,
          bank_name: account.bankName,
        }));
      }
      return legacyAccounts
        .filter((acc) => acc.is_active && acc.type !== 'cartao')
        .slice()
        .sort((a, b) => {
          const aCofre = a.id === legacyCofre?.conta_id ? 1 : 0;
          const bCofre = b.id === legacyCofre?.conta_id ? 1 : 0;
          return aCofre - bCofre;
        })
        .map((acc) => ({
          id: acc.id,
          name: acc.name,
          type: acc.type,
          color: acc.color,
          institution_code: acc.institution_code,
          institution_name: acc.institution_name,
          bank_name: acc.bank_name,
        }));
    },
    [isV2, legacyAccounts, legacyCofre?.conta_id, v2Catalog?.bankAccounts],
  );
  const canUseBankAccounts = isV2
    ? (v2Catalog?.bankAccounts.length ?? 0) > 0
    : legacyCanUseBankAccounts;

  // O diálogo sempre lê o snapshot congelado no instante em que foi aberto.
  // Trocar de pedido noutra aba ou por evento de storage enquanto o modal
  // está aberto nunca pode mudar cliente, total ou crédito no meio da cobrança.
  const paymentCart = paymentOpen && paymentSnapshotRef.current
    ? paymentSnapshotRef.current.cart
    : cart;
  const paymentVoucher = usePdvPaymentVoucher({
    open: paymentOpen,
    enabled: isV2,
    scopeKey: completedSaleScope,
    snapshotRef: paymentSnapshotRef,
    drafts: draftWorkspace.drafts,
    conflictingDraftIds: draftConflicts.map(conflict => conflict.id),
    hasAttempt: draftId => attemptByDraftRef.current.has(draftId),
    updateDraft,
  });
  useEffect(() => {
    if (paymentOpen && !paymentVoucher.inScope) {
      setPaymentOpen(false);
      paymentVoucher.reset();
      paymentSnapshotRef.current = null;
    }
  }, [paymentOpen, paymentVoucher]);
  const { credit: customerCredit, isLoading: customerCreditPending, isError: customerCreditError, errorMessage: customerCreditErrorMessage, refetch: retryCustomerCredit } = usePdvCustomerCredit(paymentCart.customerId, paymentOpen);
  const customerName = useMemo(
    () => customers.find((c) => c.id === paymentCart.customerId)?.name ?? null,
    [customers, paymentCart.customerId],
  );
  const orderSwitcherItems = useMemo(
    () => draftWorkspace.drafts.map((draft) => ({
      id: draft.id,
      code: `#${draft.sequence}`,
      customer: customers.find((customer) => customer.id === draft.cart.customerId)?.name ?? '',
      total: computeTotal(draft.cart),
      itemCount: draft.cart.lines.length,
      hasContent: hasPdvSaleDraftContent(draft) || (attachmentsByDraft[draft.id]?.length ?? 0) > 0,
      editing: !!saleEditDrafts[draft.id],
    })),
    [attachmentsByDraft, customers, draftWorkspace.drafts, saleEditDrafts],
  );

  function handleCreateDraft() {
    if (draftWorkspace.drafts.length >= MAX_PDV_SALE_DRAFTS) {
      toast({ title: t.orders.limitReached });
      return;
    }
    setCartAdditionFeedback(null);
    createDraft();
    setPaymentOpen(false);
    paymentSnapshotRef.current = null;
    setTimeout(() => searchInputRef.current?.focus(), 0);
  }

  function handleDeleteDraft(draftId: string) {
    setCartAdditionFeedback(null);
    attemptByDraftRef.current.delete(draftId);
    clearSaleEditContext(draftId);
    setAttachmentsByDraft((current) => {
      (current[draftId] ?? []).forEach((attachment) => URL.revokeObjectURL(attachment.previewUrl));
      const { [draftId]: _removed, ...rest } = current;
      return rest;
    });
    deleteDraft(draftId);
    setTimeout(() => searchInputRef.current?.focus(), 0);
  }

  function openPayment() {
    if (directSaleNeedsReview) {
      toast({ title: 'Confira a última tentativa em Pedidos', description: PDV_DIRECT_SALE_REVIEW_MESSAGE });
      return;
    }
    if (!canPay || !activeDraft) {
      toast({ variant: 'destructive', title: t.payment.issues.sem_itens });
      return;
    }
    paymentSnapshotRef.current = {
      draftId: activeDraft.id,
      cart: {
        ...activeDraft.cart,
        lines: activeDraft.cart.lines.map((line) => ({ ...line })),
      },
      stockId: activeDraft.stockId,
      notes: activeDraft.notes,
      transactionDate: activeDraft.transactionDate,
      appliedVoucher: activeDraft.appliedVoucher ? { ...activeDraft.appliedVoucher } : null,
      appliedVouchers: getAppliedVouchers(activeDraft).map(value => ({ ...value })),
      editDraft: saleEditDrafts[activeDraft.id] ?? null,
      attachments: [...(attachmentsByDraft[activeDraft.id] ?? [])],
    };
    paymentVoucher.capture(paymentSnapshotRef.current, receiptOpener.isCurrent);
    setCartDrawerOpen(false);
    setPaymentOpen(true);
  }

  /**
   * Finaliza a venda. DOIS passos, e o estado da tentativa sobrevive ao erro:
   *
   *  1) cria o pedido (uma vez por tentativa — retry reaproveita o `order_id`,
   *     senão cada erro de digitação queimaria um número de pedido);
   *  2) chama `pdv_settle_order` com a MESMA `client_request_id` da tentativa.
   *     É isso que faz o duplo clique e o retry de rede serem inofensivos: a
   *     segunda chamada devolve o mesmo resumo com `idempotente: true`.
   *
   * Erro sobe pro diálogo, que mostra o texto PT-BR do servidor via
   * `pdvCashErrorMessage` (nunca `getErrorMessage`, que engoliria a mensagem).
  */
  async function handleFinalizeSale(payments: Parameters<typeof settleOrder.mutateAsync>[0]['payments']) {
    const snapshot = paymentSnapshotRef.current;
    if (!snapshot) throw new Error(t.payment.issues.sem_itens);
    const { draftId, cart: paymentCart, stockId, notes, transactionDate: paymentDate } = snapshot;
    const editDraft = snapshot.editDraft;
    const attachments = snapshot.attachments.filter((attachment) => (attachment.status ?? 'ready') === 'ready');
    const saleItems = paymentCart.lines.map((line) => ({
      inventoryId: line.inventoryId,
      description: line.name,
      quantity: line.quantity,
      unit: line.unit?.trim() || 'un',
      unitPrice: line.unitPrice,
      unitCost: line.unitCost,
      discountAmount: line.discountAmount,
    }));

    const receiptAttempt = receiptOpener.guardAttempt(autoReceipt.prepare('sale', !editDraft));
    try {
    let result: PdvSettleResult;
    let preserveConfirmedDraft = false;
    let confirmationNotice: string | null = null;

    if (editDraft) {
      if (isV2) {
        throw new Error('Esta venda usa o contrato novo e não pode ser alterada por esta tela.');
      }
      // ÚNICA escrita financeira do fluxo de edição. Se qualquer validação,
      // estorno, item, pagamento ou baixa de estoque falhar, o PostgreSQL
      // reverte tudo e a venda original continua paga.
      result = await replaceOrder.mutateAsync({
        sourceOrderId: editDraft.sourceOrderId,
        customerId: paymentCart.customerId,
        terminalId,
        stockId,
        cashSessionId,
        discountAmount: paymentCart.discount,
        notes,
        items: saleItems,
        payments,
        clientRequestId: editDraft.clientRequestId,
        transactionDate: paymentDate,
      });

      // Fotos novas não participam do saldo/estoque. Elas sobem depois da
      // substituição atômica; falha de Storage gera aviso, nunca meia venda.
      let attachmentFailed = false;
      for (const pending of attachments) {
        try {
          await uploadAttachment.mutateAsync({ orderId: result.order_id, file: pending.file });
          URL.revokeObjectURL(pending.previewUrl);
          setAttachmentsByDraft((current) => ({
            ...current,
            [draftId]: (current[draftId] ?? []).filter((item) => item.id !== pending.id),
          }));
        } catch {
          attachmentFailed = true;
        }
      }
      if (attachmentFailed) toast({ variant: 'destructive', title: t.toast.attachFailed });
    } else if (isV2) {
      if (!v2Catalog || !v2Terminal || !v2Session || !v2Catalog.cashAccount) {
        throw new Error('Abra um caixa neste terminal antes de finalizar a venda.');
      }
      const signature = JSON.stringify({
        cart: cartSignature(
          paymentCart,
          v2Terminal.stockId,
          v2Session.id,
          notes,
          paymentDate,
          null,
        ),
        payments: canonicalizePdvDirectSalePayments(payments),
      });
      const previousAttempt = attemptByDraftRef.current.get(draftId)
        ?? draftWorkspace.drafts.find((draft) => draft.id === draftId)?.attempt
        ?? null;
      const isScopeCurrent = () => Boolean(completedSaleScope && completedSaleScopeRef.current === completedSaleScope);
      const completed = await completeDurablePdvDirectSale({
        attempt: previousAttempt,
        signature,
        isScopeCurrent,
        persist: async (attempt) => {
          if (!isScopeCurrent()) return { server: 'scope_changed', localSaved: false };
          attemptByDraftRef.current.set(draftId, attempt);
          return persistDraftNow(draftId, draft => ({ ...draft, attempt }));
        },
        // Venda recusada pelo servidor não deixa identidade para conferir:
        // o operador corrige o carrinho ou o pagamento e envia outra tentativa.
        isDefinitiveRejection: error => error instanceof PdvDirectSaleV2Error && error.rejectedByServer,
        release: (attempt) => {
          if (attemptByDraftRef.current.get(draftId)?.clientRequestId === attempt.clientRequestId) attemptByDraftRef.current.delete(draftId);
          return persistDraftNow(draftId, draft => draft.attempt?.clientRequestId === attempt.clientRequestId ? { ...draft, attempt: null } : draft);
        },
        complete: attempt => {
          if (!isScopeCurrent()) throw new Error(PDV_DIRECT_SALE_SCOPE_MESSAGE);
          return directSale.complete.mutateAsync({
            attemptId: attempt.clientRequestId,
            idempotencyKey: attempt.idempotencyKey,
            terminalId: v2Terminal.id,
            cashSessionId: v2Session.id,
            cashAccountId: v2Session.cashAccountId,
            customerId: paymentCart.customerId,
            items: paymentCart.lines.map((line) => ({
              inventoryId: line.inventoryId, stockId: v2Terminal.stockId, quantity: line.quantity,
              unitPrice: line.unitPrice, discountAmount: line.discountAmount,
            })),
            orderDiscountAmount: paymentCart.discount, notes,
            couponId: paymentCart.coupon?.id ?? null, couponDiscountCents: Math.round(confirmedCouponDiscount(paymentCart) * 100),
            transactionDate: paymentDate === maxTransactionDate ? null : paymentDate,
            payments,
          });
        },
        onConfirmed: (attempt, sale) => {
          if (!isScopeCurrent()) return;
          attemptByDraftRef.current.set(draftId, attempt);
          if (completedSaleScope && completedSaleScopeRef.current === completedSaleScope) {
            setPaymentOpen(false);
            paymentSnapshotRef.current = null;
            setCompletedSale({ scopeKey: completedSaleScope, orderId: sale.orderId, orderNumber: sale.orderNumber, total: sale.total });
          }
        },
      });
      if (completedSaleScopeRef.current !== completedSaleScope) { receiptAttempt.cancel(); return; }
      result = adaptPdvDirectSaleV2Result(completed.sale, payments, paymentCart.lines.length);
      preserveConfirmedDraft = completed.persistence.server !== 'saved';
      if (preserveConfirmedDraft) {
        confirmationNotice = completed.persistence.localSaved
          ? 'Pedido já concluído. A confirmação possui backup local e aguarda sincronização na conta. Confira o pedido; não envie outra venda.'
          : 'Pedido já concluído. A confirmação está nesta sessão e aguarda sincronização. Confira o pedido antes de continuar; não envie outra venda.';
      }

      // No v2 o pedido nasce e é concluído atomicamente. Fotos entram depois;
      // falha de Storage não transforma uma venda concluída em meia venda.
      let attachmentFailed = false;
      for (const pending of attachments) {
        try {
          await uploadAttachment.mutateAsync({
            orderId: result.order_id,
            file: pending.file,
            clientAttachmentId: pending.id,
          });
          URL.revokeObjectURL(pending.previewUrl);
        } catch {
          attachmentFailed = true;
        }
      }
      if (attachmentFailed) toast({ variant: 'destructive', title: t.toast.attachFailed });
    } else {
      const signature = cartSignature(
        paymentCart,
        stockId,
        cashSessionId,
        notes,
        paymentDate,
        null,
      );
      let attempt = attemptByDraftRef.current.get(draftId)
        ?? draftWorkspace.drafts.find((draft) => draft.id === draftId)?.attempt
        ?? null;
      if (!attempt || attempt.signature !== signature) {
        attempt = { signature, orderId: null, clientRequestId: crypto.randomUUID() };
        attemptByDraftRef.current.set(draftId, attempt);
        updateDraft(draftId, (draft) => ({ ...draft, attempt }));
      }

      if (!attempt.orderId) {
        attempt.orderId = await createOrder.mutateAsync({
          customerId: paymentCart.customerId,
          terminalId,
          stockId,
          cashSessionId,
          discountAmount: paymentCart.discount,
          notes,
          replacesOrderId: null,
          items: saleItems,
        });
        attemptByDraftRef.current.set(draftId, { ...attempt });
        updateDraft(draftId, (draft) => ({ ...draft, attempt: { ...attempt! } }));
      }
      const createdOrderId = attempt.orderId;
      if (!createdOrderId) throw new Error(t.payment.issues.sem_itens);

      for (const pending of attachments) {
        try {
          await uploadAttachment.mutateAsync({ orderId: createdOrderId, file: pending.file });
        } catch {
          throw new Error(t.toast.attachFailed);
        }
        URL.revokeObjectURL(pending.previewUrl);
        setAttachmentsByDraft((current) => ({
          ...current,
          [draftId]: (current[draftId] ?? []).filter((item) => item.id !== pending.id),
        }));
        // Se a liquidação falhar depois do upload, o retry conserva somente
        // as fotos ainda não enviadas e não duplica anexos já persistidos.
        snapshot.attachments = snapshot.attachments.filter((item) => item.id !== pending.id);
      }

      result = await settleOrder.mutateAsync({
        orderId: createdOrderId,
        payments,
        clientRequestId: attempt.clientRequestId,
        transactionDate: paymentDate === maxTransactionDate ? null : paymentDate,
      });
    }

    if (!receiptOpener.isCurrent() || isV2 && completedSaleScopeRef.current !== completedSaleScope) { receiptAttempt.cancel(); return; }
    if (!editDraft) void receiptAttempt.commit(`sale:${result.order_id}`, (format, options) => receiptOpener.open(result.order_id, format, { ...options, documentKind: 'sale' }), result.idempotente);
    else receiptAttempt.cancel();

    const change = (result.pagamentos ?? []).reduce(
      (sum, pay) => sum + (Number(pay.change_amount) || 0),
      0,
    );

    // Deu certo: a tentativa morre, o carrinho zera e o foco volta pra busca.
    // Balcão é fila — a tela tem que estar pronta pro próximo cliente sem
    // clique extra, então o sucesso é um aviso na tela, não um modal.
    if (!preserveConfirmedDraft) attemptByDraftRef.current.delete(draftId);
    paymentSnapshotRef.current = null;
    setPaymentOpen(false);
    clearSaleEditContext(draftId);
    if (!preserveConfirmedDraft) setAttachmentsByDraft((current) => {
      (current[draftId] ?? []).forEach((attachment) => URL.revokeObjectURL(attachment.previewUrl));
      const { [draftId]: _removed, ...rest } = current;
      return rest;
    });
    // Remove EXATAMENTE o rascunho finalizado. Outro pedido que esteja ativo
    // (por storage event/troca rápida) não é limpo nem recebe o cliente dele.
    if (!preserveConfirmedDraft) deleteDraft(draftId);

    // Pós-venda em TOAST, não em faixa fixa na tela (pedido do CEO 2026-10-26:
    // "esse verde e amarelo tinha que aparecer como toasts").
    //
    // É UM toast só, carregando sucesso + avisos juntos: o `TOAST_LIMIT` do app
    // é 1 (`src/hooks/use-toast.ts`), então um segundo `toast()` disparado na
    // sequência MATA o primeiro — o aviso da RPC comeria o número do pedido e
    // o troco. Por isso o aviso entra como faixa saturada DENTRO do corpo
    // (régua de aviso = `NoticeBanner`, nunca texto âmbar solto).
    const saleNumber = Number(result.numero) || 0;
    const saleTotal = Number(result.total) || 0;
    const saleChange = Math.round(change * 100) / 100;
    const saleWarnings = extractSaleWarnings(result.avisos);
    if (completedSaleScope && completedSaleScopeRef.current === completedSaleScope) {
    setCompletedSale({
      scopeKey: completedSaleScope,
      orderId: result.order_id,
      orderNumber: saleNumber,
      total: saleTotal,
    });
    toast({
      title: t.saleSuccess.title.replace('{number}', String(saleNumber)),
      // `ToastDescription` é um <div> (Radix), então <div>/NoticeBanner aqui
      // dentro é aninhamento válido — não trocar por <span>.
      description: (
        <div className="space-y-1.5">
          <div className="font-semibold tabular-nums text-foreground">
            {t.saleSuccess.total.replace('{value}', formatCurrency(saleTotal))}
            {saleChange > 0
              ? ` · ${t.saleSuccess.change.replace('{value}', formatCurrency(saleChange))}`
              : ''}
          </div>
          {confirmationNotice && <NoticeBanner variant="warning" className="px-2 py-1.5 text-xs">{confirmationNotice}</NoticeBanner>}
          {saleWarnings.map((code) => (
            <NoticeBanner key={code} variant="warning" className="px-2 py-1.5 text-xs">
              {t.saleSuccess.warnings[code]}
            </NoticeBanner>
          ))}
        </div>
      ),
      // Toast some sozinho, e isto é dinheiro: troco e aviso ficam MUITO mais
      // tempo na tela que o padrão (5s) pra o operador conferir sem correr.
      duration: saleChange > 0 || saleWarnings.length > 0 ? 15000 : 8000,
      action: <ToastAction altText={`Abrir comprovante do pedido ${saleNumber}`} onClick={() => {
        if (!receiptOpener.isCurrent() || completedSaleScopeRef.current !== completedSaleScope) return;
        void receiptOpener.open(result.order_id, receiptFormat, { documentKind: 'sale' }).catch(() => {
          if (completedSaleScopeRef.current === completedSaleScope) toast({ title: 'Não foi possível gerar o comprovante', description: 'Tente novamente pelo atalho do último pedido.', variant: 'destructive' });
        });
      }}>Comprovante</ToastAction>,
    });
      setTimeout(() => searchInputRef.current?.focus(), 0);
    }

    } catch (error) { receiptAttempt.cancel(); if (receiptOpener.isCurrent()) throw error; return; }
  }

  // Atalhos operacionais do balcão. Teclas imprimíveis nunca atravessam campos;
  // overlays também suspendem a página (o F9 do pagamento pertence ao diálogo).
  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || e.altKey) return;
      if (document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')) return;
      if (paymentOpen || confirmClearOpen || advancedOptionsOpen || shortcutHelpOpen) return;

      const commandAction = resolvePdvCommandShortcut(e);
      if (commandAction) {
        if (
          (commandAction === 'quantity_up' || commandAction === 'quantity_down')
          && isPdvEditableTarget(e.target)
        ) return;
        e.preventDefault();
        if (commandAction === 'search') {
          searchInputRef.current?.focus();
        } else if (commandAction === 'payment') {
          openPayment();
        } else if (commandAction === 'help') {
          setShortcutHelpOpen(true);
        } else if (cart.lines.length > 0) {
          const lastLine = cart.lines[cart.lines.length - 1];
          const step = inventoryQuantityStep(lastLine.unit);
          setCart(incrementLineQuantity(
            cart,
            lastLine.inventoryId,
            commandAction === 'quantity_up' ? step : -step,
          ));
        }
        return;
      }
      if (e.ctrlKey || e.metaKey) return;

      if (e.key === 'F2') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === 'F3') {
        e.preventDefault();
        const customerTrigger = document.getElementById('pdv-customer');
        customerTrigger?.focus();
        customerTrigger?.click();
      } else if (e.key === 'F4' || e.key === 'F9') {
        e.preventDefault();
        openPayment();
      } else if (e.key === 'F6' || e.key === 'F7') {
        e.preventDefault();
        const currentIndex = draftWorkspace.drafts.findIndex((draft) => draft.id === activeDraftId);
        const nextIndex = nextPdvIndex(
          currentIndex,
          draftWorkspace.drafts.length,
          e.key === 'F7' ? 1 : -1,
        );
        const nextDraft = draftWorkspace.drafts[nextIndex];
        if (nextDraft) selectDraft(nextDraft.id);
      } else if (e.key === 'F8') {
        e.preventDefault();
        if (!e.repeat) handleCreateDraft();
      } else if (e.key === '?' && !isPdvEditableTarget(e.target)) {
        e.preventDefault();
        setShortcutHelpOpen(true);
      }
    }
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  });

  // A altura usa o espaço real abaixo do cabeçalho. Catálogo e materiais do
  // pedido têm rolagem própria; não reservamos mais uma tabela na coluna esquerda.
  const desktopRowRef = useRef<HTMLDivElement>(null);
  const topControlsRef = useRef<HTMLDivElement>(null);

  function handleConfirmClearCart() {
    if (!activeDraftId) return;
    attemptByDraftRef.current.delete(activeDraftId);
    setCartAdditionFeedback(null);
    setCart((prev) => clearCart(prev));
    // Observação, data retroativa e fotos pendentes são deste RASCUNHO de
    // pedido, não do cliente (que `clearCart` preserva de propósito) —
    // cancelar o carrinho abandona o rascunho inteiro.
    resetOrderDraftExtras(activeDraftId);
    clearSaleEditContext(activeDraftId);
    setConfirmClearOpen(false);
    focusSearch();
  }

  function handleRemoveCartLine(inventoryId: string) {
    if (!activeDraftId) return;
    const draftId = activeDraftId;
    const removedIndex = cart.lines.findIndex((line) => line.inventoryId === inventoryId);
    const removedLine: CartLine | undefined = cart.lines[removedIndex];
    if (!removedLine) return;

    setCart((current) => removeItem(current, inventoryId));
    toast({
      title: t.cart.removedLine.replace('{name}', removedLine.name),
      duration: 6000,
      action: (
        <ToastAction
          altText={t.cart.undoRemove}
          onClick={() => {
            updateDraft(draftId, (draft) => {
              if (draft.cart.lines.some((line) => line.inventoryId === inventoryId)) return draft;
              const lines = [...draft.cart.lines];
              lines.splice(Math.min(removedIndex, lines.length), 0, removedLine);
              return { ...draft, cart: { ...draft.cart, lines }, attempt: isV2 ? draft.attempt : null };
            });
          }}
        >
          {t.cart.undoRemove}
        </ToastAction>
      ),
    });
  }

  const advancedOptionsSummary = [
    orderNotes.trim() ? t.advancedOptions.summaryNotes : null,
    transactionDate !== maxTransactionDate
      ? t.advancedOptions.summaryDate.replace(
          '{date}',
          formatDate(transactionDate, locale, timezone),
        )
      : null,
    pendingAttachments.length > 0
      ? (pendingAttachments.length === 1
          ? t.advancedOptions.summaryPhoto
          : t.advancedOptions.summaryPhotos.replace('{count}', String(pendingAttachments.length)))
      : null,
  ].filter(Boolean).join(' · ');

  const orderSwitcherProps = {
    orders: orderSwitcherItems,
    activeId: activeDraftId ?? '',
    formatCurrency,
    texts: t.orders,
    onSelect: (draftId: string) => {
      setPaymentOpen(false);
      paymentSnapshotRef.current = null;
      setCartAdditionFeedback(null);
      selectDraft(draftId);
      setTimeout(() => searchInputRef.current?.focus(), 0);
    },
    onCreate: handleCreateDraft,
    onDelete: handleDeleteDraft,
    orderPreferenceKey: draftOwner ? ['pdv-tab-order', draftOwner.companyId, draftOwner.userId, draftOwner.cashSessionId, draftOwner.terminalId, draftOwner.stockId].join(':') : undefined,
    onReorder: (ids: string[]) => setDraftWorkspace(current => ({
      ...current,
      drafts: [...current.drafts].sort((a, b) => {
        const first = ids.indexOf(a.id), second = ids.indexOf(b.id);
        return (first < 0 ? ids.length : first) - (second < 0 ? ids.length : second);
      }),
    })),
    disabled:
      createOrder.isPending ||
      settleOrder.isPending ||
      replaceOrder.isPending ||
      directSale.complete.isPending,
  };

  const cartPanelProps = {
    layout: 'workspace' as const,
    couponContent: isV2 ? <PdvCouponControl cart={cart} disabled={directSaleNeedsReview || paymentOpen} onChange={coupon => setCart(current => ({ ...current, coupon }))} /> : undefined,
    readOnly: directSaleNeedsReview,
    onCloseOrder: activeDraftId ? () => handleDeleteDraft(activeDraftId) : undefined,
    hasOrderContent: Boolean(activeDraft && (hasPdvSaleDraftContent(activeDraft) || pendingAttachments.length > 0 || saleEditDraft)),
    appliedCreditAmount: getAppliedVouchers(activeDraft).reduce((sum, value) => sum + value.amount, 0),
    orderSwitcher: undefined,
    cart,
    customers,
    formatCurrency,
    currencySymbol,
    locale,
    currencyFractionDigits,
    modePreferenceKey: user?.id && profile?.company_id
      ? `pdv:value-adjustment-mode:${profile.company_id}:${user.id}`
      : undefined,
    onSetDiscountAmount: (discountAmount: number) =>
      setCart((prev) => setDiscount(prev, discountAmount)),
    onIncrement: (id: string, delta: number) => setCart((prev) => incrementLineQuantity(prev, id, delta)),
    onSetQuantity: (id: string, quantity: number) => setCart((prev) => setLineQuantity(prev, id, quantity)),
    onSetLineDiscount: (id: string, discountAmount: number) =>
      setCart((prev) => setLineDiscount(prev, id, discountAmount)),
    onSetLineFinalAmount: (id: string, finalAmount: number, mode: 'price' | 'discount') =>
      setCart((prev) => setLineFinalAmount(prev, id, finalAmount, mode, currencyFractionDigits)),
    onSetCartFinalAmount: (finalAmount: number, mode: 'price' | 'discount') =>
      setCart((prev) => setCartFinalAmount(prev, finalAmount, mode, currencyFractionDigits)),
    onRemove: handleRemoveCartLine,
    onCustomerChange: (id: string | null) => updateActiveDraft((draft) => {
      const next = setPdvSaleDraftCustomer(draft, id);
      liveCartRef.current = next.cart;
      return isV2 ? { ...next, attempt: draft.attempt } : next;
    }),
    onRequestClearCart: () => setConfirmClearOpen(true),
    onRequestPayment: openPayment,
    cashClosed: !hasOpenCashSession,
    onGoToCashPanel: () => navigate(PDV_PANEL_PATH),
    // Enter na edição de quantidade (PdvQuantityStepper) devolve o foco pra
    // busca — mesma régua de velocidade do balcão que já vale pro Enter com
    // 1 resultado de busca.
    onConfirmQuantityEdit: focusSearch,
    onOpenAdvancedOptions: () => setAdvancedOptionsOpen(true),
    advancedOptionsActive: advancedOptionsSummary.length > 0,
    advancedOptionsSummary,
    appliedCreditContent: isV2 && !paymentOpen && activeDraft && activeDraftId ? (
      <PdvAppliedVouchersControl
        key={`${activeDraftId}:${activeDraft.cart.customerId ?? 'sem-cliente'}`}
        enabled
        customerId={activeDraft.cart.customerId}
        total={computeTotal(activeDraft.cart)}
        values={getAppliedVouchers(activeDraft)}
        formatCurrency={formatCurrency}
        onChange={(appliedVouchers) => updateDraft(activeDraftId, (draft) => ({
          ...draft,
          appliedVoucher: appliedVouchers[0] ?? null,
          appliedVouchers,
          attempt: isV2 ? draft.attempt : null,
        }))}
      />
    ) : undefined,
    additionFeedback:
      cartAdditionFeedback?.draftId === activeDraftId
        ? {
            inventoryId: cartAdditionFeedback.inventoryId,
            sequence: cartAdditionFeedback.sequence,
          }
        : undefined,
    texts: {
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
    },
  };

  // Título PRÓPRIO da tela de venda + "← Voltar pro caixa" ACIMA do título
  // (correção 2026-10-19: a tela de venda tinha o MESMO cabeçalho do painel
  // do Caixa, parecendo a mesma tela — "Caixa / Venda de balcão..." nos
  // dois). Molde: `Sale.tsx` da EcoSistema ("← Voltar para o caixa" em link
  // discreto acima do `<h1>`). `navigate(PDV_PANEL_PATH)` explícito, não
  // `history.back()`: quem entrou por link direto não tem pra onde voltar.
  const backToCashPanel = (
    <button
      type="button"
      onClick={() => navigate(PDV_PANEL_PATH)}
      className="-mb-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      {t.backToCashPanel}
    </button>
  );

  if (isV2 && directSale.catalog.isError) {
    return (
      <div className="flex flex-col gap-4" data-testid="pdv-direct-sale-v2-catalog-blocked">
        {backToCashPanel}
        <PageHeader title={t.title} subtitle={t.subtitle} icon={ShoppingCart} />
        <NoticeBanner
          variant="destructive"
          title="Não foi possível carregar a venda com segurança"
          action={(
            <Button type="button" variant="outline" onClick={() => void directSale.catalog.refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Tentar novamente
            </Button>
          )}
        >
          Nenhum pedido foi criado. Atualize os dados para continuar.
        </NoticeBanner>
      </div>
    );
  }

  if (isLoadingPdv) {
    return (
      <div className="flex flex-col gap-4">
        {backToCashPanel}
        <PageHeader title={t.title} subtitle={t.subtitle} icon={ShoppingCart} />
        <PdvSkeleton isMobileCart={isMobileCart} showNumpad={showNumpad} catalogMode={catalogMode} />
      </div>
    );
  }

  if (isV2 && resolvedV2CashContext.status !== 'resolved') {
    const contextMessage = resolvedV2CashContext.status === 'ambiguous'
      ? 'Há mais de um caixa aberto. Volte ao painel e escolha a gaveta antes de iniciar a venda.'
      : resolvedV2CashContext.status === 'invalid'
        ? 'O caixa informado não corresponde ao terminal ou ao estoque. Abra a venda novamente pelo painel do Caixa.'
        : 'Abra um caixa antes de iniciar a venda.';
    return (
      <div className="space-y-6">
        {backToCashPanel}
        <PageHeader title={t.title} subtitle={t.subtitle} icon={ShoppingCart} />
        <NoticeBanner
          variant="destructive"
          title="Não foi possível identificar o caixa desta venda"
          action={(
            <Button type="button" variant="outline" onClick={() => navigate(PDV_PANEL_PATH)}>
              Voltar ao Caixa
            </Button>
          )}
        >
          {contextMessage} Nenhum pedido ou pagamento foi criado.
        </NoticeBanner>
      </div>
    );
  }

  if ((isV2 || stockLevelsLoaded) && pdvStocks.length === 0) {
    return (
      <div className="space-y-6">
        {backToCashPanel}
        <PageHeader title={t.title} subtitle={t.subtitle} icon={ShoppingCart} />
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={<ShoppingBasket className="h-12 w-12" />}
              title={t.noLocation.title}
              description={t.noLocation.description}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  function draftVersionSummary(draft: PdvSaleDraft | null) {
    if (!draft) return null;
    const person = customers.find(customer => customer.id === draft.cart.customerId)?.name ?? 'Sem cliente';
    return {
      title: person,
      details: `${draft.cart.lines.length} materiais · ${formatCurrency(computeTotal(draft.cart))}`,
      notes: draft.notes,
      updatedAt: draft.updatedAt,
    };
  }
  const draftConflictViews = draftConflicts.map(conflict => ({
    id: conflict.id,
    label: `Venda #${conflict.local?.sequence ?? conflict.server?.sequence ?? ''}`,
    local: draftVersionSummary(conflict.local),
    server: draftVersionSummary(conflict.server),
    alternativesCount: conflict.alternatives.length,
    requiresOrderReview: conflict.requiresOrderReview || Boolean(saleEditDrafts[conflict.id]),
    orderId: conflict.orderId ?? saleEditDrafts[conflict.id]?.sourceOrderId ?? null,
  }));
  const workspaceOrderSwitcher = <PdvOrderSwitcher header {...orderSwitcherProps} />;

  return (
    // pb generoso no mobile: dá espaço pra barra fixa do carrinho (acima do bottom
    // nav global, ver offset de 96px abaixo) não cobrir o fim da grade.
    <div className={cn('pdv-preview-sale min-w-0', isMobileCart && 'pb-44')} data-pdv-ui data-testid="pdv-sale-workspace">
      <PdvLastSaleHeader completedSale={completedSale} scopeKey={completedSaleScope} receiptFormat={receiptFormat} canOpenPostSale={isV2 && hasPostSaleAccess} onOpenPostSale={() => setPostSaleOpen(true)}>{workspaceOrderSwitcher}</PdvLastSaleHeader>

      {directSaleNeedsReview && <NoticeBanner variant="warning" title={activeDraft?.attempt?.confirmedSale ? `Pedido #${activeDraft.attempt.confirmedSale.orderNumber} já concluído` : 'Confira a última tentativa antes de reenviar'}>
        <div className="flex flex-wrap items-center justify-between gap-3"><span>{activeDraft?.attempt?.confirmedSale ? 'O pedido já foi confirmado. Confira o pedido antes de iniciar outro atendimento.' : PDV_DIRECT_SALE_REVIEW_MESSAGE}</span><Button type="button" variant="outline" onClick={() => navigate(activeDraft?.attempt?.orderId ? `/pdv/pedidos?pedido=${encodeURIComponent(activeDraft.attempt.orderId)}` : '/pdv/pedidos')}>Conferir Pedidos</Button></div>
      </NoticeBanner>}
      <PdvDraftSyncNotice
        key={draftOwner ? [draftOwner.companyId, draftOwner.userId, draftOwner.cashSessionId, draftOwner.stockId].join(':') : 'unbound'}
        issue={syncIssue ?? null}
        localPersistenceIssue={localPersistenceIssue}
        resolvingDraftId={resolvingDraftId}
        conflicts={draftConflictViews}
        onRetry={() => retrySync?.()}
        onReviewOrder={id => navigate(`/pdv/pedidos?pedido=${encodeURIComponent(id)}`)}
        onResolve={(id, choice) => saleEditDrafts[id] ? Promise.resolve('review_order') : resolveDraftConflict?.(id, choice) ?? Promise.resolve('unavailable')}
      />

      {saleEditDraft && (
        <NoticeBanner
          variant="warning"
          title={t.editDraft.title.replace('{reference}', saleEditDraft.sourceReference)}
        >
          {t.editDraft.description}
        </NoticeBanner>
      )}


      <PdvSaleEditorLayout
        hardwareContextKey={JSON.stringify([profile?.company_id, user?.id, activeDraftId, selectedStockId, resolvedV2CashContext.status === 'resolved' ? resolvedV2CashContext.context.sessionId : null])}
        hardwareBlocked={confirmClearOpen || paymentOpen || advancedOptionsOpen || shortcutHelpOpen || identifiers.resolve.isPending}
        catalog={{
          rowRef: desktopRowRef,
          controlsRef: topControlsRef,
          gridRef: gridRef,
          searchInputRef: searchInputRef,
          mode: catalogMode,
          onModeChange: mode => { setCatalogMode(mode); if (mode === 'quick') setActiveCategory('all'); },
          search: search,
          onSearchChange: setSearch,
          onSearchKeyDown: handleSearchKeyDown,
          onSearchConfirm: handleSearchEnter,
          onGridKeyDown: handleGridKeyDown,
          products: visibleProducts,
          disabled: directSaleNeedsReview || createOrder.isPending || settleOrder.isPending || replaceOrder.isPending || directSale.complete.isPending,
          catalogLoading: isLoadingPdv,
          activeProductId: activeProductId,
          keyboardHighlight: catalogKeyboardActive,
          onProductFocus: id => { const index = keyboardProducts.findIndex(product => product.inventoryId === id); if (index >= 0) setActiveProductIndex(index); setCatalogKeyboardActive(true); },
          onProductSelect: handleProductSelect,
          formatCurrency: formatCurrency,
          onExit: () => navigate(PDV_PANEL_PATH),
          camera: isV2 ? <InventoryIdentifierCameraScanner triggerVariant="icon" onScan={code => { void handleBarcodeScan(code); }} disabled={directSaleNeedsReview || confirmClearOpen || paymentOpen || advancedOptionsOpen || shortcutHelpOpen || identifiers.resolve.isPending} /> : undefined,
          filters: <>
          {pdvStocks.length > 1 && <Select value={selectedStockId ?? undefined} onValueChange={setSelectedStockId} disabled={isV2 && resolvedV2CashContext.status === 'resolved'}><SelectTrigger className="h-10 w-48"><SelectValue placeholder={t.stock.locationLabel} /></SelectTrigger><SelectContent>{pdvStocks.map(stock => <SelectItem key={stock.id} value={stock.id}>{stock.name}</SelectItem>)}</SelectContent></Select>}
          {categoryTabs.map(tab => <button type="button" key={tab.value} className={'chip ' + (activeCategory === tab.value ? 'active' : '')} onClick={() => setActiveCategory(tab.value)}>{tab.label}</button>)}
        </>
        }}
        cart={cartPanelProps}
        mobile={isMobileCart}
        drawerOpen={cartDrawerOpen}
        onDrawerOpenChange={setCartDrawerOpen}
        itemCount={itemCount}
        itemCountLabel={itemCount === 1 ? t.cart.itemsCountOne : t.cart.itemsCount.replace('{count}', String(itemCount))}
        formattedTotal={formatCurrency(total)}
        drawerTitle={t.cart.title}
      />

      <PdvShortcutHelpDialog
        open={shortcutHelpOpen}
        onOpenChange={setShortcutHelpOpen}
        title={t.shortcuts.title}
        description={t.shortcuts.description}
        closeLabel={t.shortcuts.close}
        shortcuts={[
          { keys: ['F2', '⌘/Ctrl F'], label: t.shortcuts.search },
          { keys: ['F3'], label: t.shortcuts.customer },
          { keys: ['F4', '⌘/Ctrl Enter'], label: t.shortcuts.payment },
          { keys: ['F6', 'F7'], label: t.shortcuts.switchOrder },
          { keys: ['F8'], label: t.shortcuts.newOrder },
          { keys: ['F9', '⌘/Ctrl Enter'], label: t.shortcuts.finalize },
          { keys: ['↑', '↓', 'Enter'], label: t.shortcuts.results },
          { keys: ['+', '−', '⌘/Ctrl +/−'], label: t.shortcuts.quantity },
          { keys: ['?', '⌘/Ctrl K'], label: t.shortcuts.help },
        ]}
      />

      <PdvPaymentDialog
        open={paymentOpen && paymentVoucher.inScope}
        onOpenChange={(open) => {
          setPaymentOpen(open);
          if (!open) { paymentVoucher.reset(); paymentSnapshotRef.current = null; }
        }}
        texts={t.payment}
        total={computeTotal(paymentCart)}
        summaryItems={paymentCart.lines.map(line => ({ id: line.inventoryId, name: line.name, quantity: line.quantity, unit: line.unit ?? undefined, unitPrice: line.unitPrice, total: computeTotal({ lines: [line], discount: 0, customerId: null }), imageUrl: line.imageUrl }))}
        summarySubtotal={computeSubtotal(paymentCart)}
        summaryDiscount={computeSubtotal(paymentCart) - computeTotal(paymentCart)}
        itemCount={paymentCart.lines.length}
        customerName={customerName}
        customerId={paymentCart.customerId}
        advancedPaymentsEnabled={isV2}
        appliedVouchers={getAppliedVouchers(paymentOpen ? paymentSnapshotRef.current : activeDraft)}
        embeddedEditorOpen={paymentVoucher.pickerOpen}
        appliedCreditContent={isV2 && paymentOpen && paymentVoucher.inScope && paymentSnapshotRef.current ? (
          <fieldset disabled={!paymentVoucher.canEdit} className="min-w-0">
            <PdvAppliedVouchersControl
              key={`${paymentSnapshotRef.current.draftId}:${paymentSnapshotRef.current.cart.customerId ?? 'sem-cliente'}:${paymentVoucher.canEdit}`}
              enabled
              customerId={paymentSnapshotRef.current.cart.customerId}
              total={computeTotal(paymentSnapshotRef.current.cart)}
              values={getAppliedVouchers(paymentSnapshotRef.current)}
              formatCurrency={formatCurrency}
              onChange={paymentVoucher.onChanges}
              onPickerOpenChange={paymentVoucher.onPickerOpenChange}
            />
          </fieldset>
        ) : undefined}
        customerCredit={customerCredit}
        customerCreditPending={customerCreditPending}
        customerCreditError={customerCreditError}
        customerCreditErrorMessage={customerCreditErrorMessage}
        onRetryCustomerCredit={() => retryCustomerCredit()}
        accounts={paymentAccounts}
        canUseBankAccounts={canUseBankAccounts}
        hasOpenCashSession={hasOpenCashSession}
        hasCofreAccount={hasCofreAccount}
        onGoToCashPanel={() => navigate(PDV_PANEL_PATH)}
        onConfirm={handleFinalizeSale}
      />

      <PdvAdvancedOptionsDialog
        open={advancedOptionsOpen}
        onOpenChange={setAdvancedOptionsOpen}
        texts={t.advancedOptions}
        notes={orderNotes}
        onNotesChange={setOrderNotes}
        notesLabel={t.cart.notesLabel}
        notesPlaceholder={t.cart.notesPlaceholder}
        transactionDate={transactionDate}
        onTransactionDateChange={handleTransactionDateChange}
        maxDate={maxTransactionDate}
        pendingAttachments={pendingAttachments}
        onAttachFiles={handleAttachFiles}
        onRemoveAttachment={handleRemoveAttachment}
        attaching={attachmentBusy}
      />

      {isV2 && visibleCompletedSale && (
        <PdvDirectSalePostSaleDialog
          open={postSaleOpen}
          onOpenChange={setPostSaleOpen}
          orderId={visibleCompletedSale.orderId}
          orderNumber={visibleCompletedSale.orderNumber}
          receiptFormat={receiptFormat}
          returnsAccess={returnsAccess}
          afterSaleAccess={afterSaleAccess}
        />
      )}

      {/* Confirmação de cancelar carrinho (Esc com busca vazia, ou botão de lixeira) */}
      <AlertDialog open={confirmClearOpen} onOpenChange={setConfirmClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.confirmClearCart.title}</AlertDialogTitle>
            <AlertDialogDescription>{t.confirmClearCart.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.confirmClearCart.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmClearCart}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t.confirmClearCart.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
