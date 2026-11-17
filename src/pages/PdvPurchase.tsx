import { useInventoryIdentifiers } from '@/hooks/useInventoryIdentifiers';
import { usePdvDomiLinkWorkspace } from '@/hooks/usePdvDomiLinkWorkspace';
import { PageHeader } from '@/components/layout/PageHeader';
import { PdvPageSkeleton } from '@/components/pdv/loading/PdvPageSkeleton';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, ChevronDown, Loader2, Maximize2, Minimize2, Minus, Package, Plus, ShieldAlert, ShoppingCart, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
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
import { Card, CardContent } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/DatePicker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LabeledSwitch } from '@/components/ui/labeled-switch';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { NumericInput } from '@/components/ui/numeric-input';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { SupplierFormDialog } from '@/components/inventory/SupplierFormDialog';
import { PdvPartySelect } from '@/components/pdv/PdvPartySelect';
import { PdvSupplierProfileButton } from '@/components/pdv/PdvSupplierProfileButton';
import { PdvOrderSwitcher } from '@/components/pdv/PdvOrderSwitcher';
import { PdvDraftSyncNotice } from '@/components/pdv/PdvDraftSyncNotice';
import { PdvCartWorkspaceHeader, PdvCartWorkspaceTotals, PdvCartWorkspaceFooter } from '@/components/pdv/PdvCartWorkspaceParts';
import { PdvSalePreviewView } from '@/components/pdv/PdvSalePreviewView';
import type { PdvGridProduct } from '@/components/pdv/PdvProductCard';
import { PdvMoneyInput } from '@/components/pdv/caixa/PdvMoneyInput';
import { PdvInlineValueEditor } from '@/components/pdv/PdvInlineValueEditor';
import { SignedImg } from '@/components/ui/SignedImg';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useMediaBreakpoint } from '@/hooks/use-mobile';
import { usePdvCheckoutLayoutPreference } from '@/hooks/usePdvCheckoutLayoutPreference';
import { useAccessibleInventoryIds } from '@/hooks/useAccessibleInventoryIds';
import { PdvShortcutHelpDialog } from '@/components/pdv/PdvShortcutHelpDialog';
import { useAuth } from '@/contexts/AuthContext';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { useCanRegisterDirectMaterialPurchase } from '@/hooks/useCanRegisterDirectMaterialPurchase';
import { useDirectMaterialPurchase, usePdvPurchaseCashContext } from '@/hooks/useDirectMaterialPurchase';
import { useFinancialAccounts } from '@/hooks/useFinancialAccounts';
import { useFinancialCategories } from '@/hooks/useFinancialCategories';
import { useInventory } from '@/hooks/useInventory';
import { usePdvPurchaseDraftWorkspace } from '@/hooks/usePdvPurchaseDraftWorkspace';
import { useStocks } from '@/hooks/useStocks';
import { useSuppliers } from '@/hooks/useSuppliers';
import { usePartyLabels } from '@/hooks/usePartyLabels';
import { usePdvSupplierCredit } from '@/hooks/usePdvSupplierCredit';
import { PartyLabelBadges } from '@/components/customers/PartyLabelBadge';
import { useToast } from '@/hooks/use-toast';
import { formatMoney } from '@/lib/format';
import { localizeAppPath } from '@/lib/i18n/appRouteSlugs';
import { MESSAGES } from '@/lib/i18n/messages';
import {
  createPdvPurchaseItem,
  hasPdvPurchaseDraftContent,
  MAX_PDV_PURCHASE_DRAFTS,
  parsePdvPurchaseNumber,
  pdvPurchaseDraftTotal,
  setPdvPurchaseDraftFinalAmount,
  setPdvPurchaseItemFinalAmount,
  type PdvPurchaseDraft,
  type PdvPurchasePaymentStatus,
} from '@/lib/pdv/purchase-drafts';
import { getPdvPurchaseWorkspaceMessages } from '@/lib/pdv/purchase-workspace-messages';
import { findPdvGridNeighbor, isPdvEditableTarget, nextPdvIndex, shouldNavigatePdvCatalogFromSearch, type PdvGridDirection } from '@/lib/pdv/keyboard';
import { todayInTz } from '@/lib/timezone';
import { cn } from '@/lib/utils';
import { parsePdvPurchaseCashContext } from '@/components/pdv/caixa-v2/pdvPurchaseContext';

import '@/components/pdv/pdv-preview-purchase.css';
import '@/components/pdv/PdvCheckoutPreview.css';

const purchaseCode = (sequence: number) => `PC-${String(sequence).padStart(3, '0')}`;
const NO_SUPPLIER_VALUE = '_none';

export default function PdvPurchase() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile } = useAuth();
  const { locale, currency, timezone } = useAppLocaleContext();
  const { toast } = useToast();
  const t = MESSAGES[locale].app.inventory.directPurchase;
  const supplierFormTexts = MESSAGES[locale].app.inventory.supplierForm;
  const tf = MESSAGES[locale].app.finance.transactionForm;
  const tw = getPdvPurchaseWorkspaceMessages(locale);
  const canRegister = useCanRegisterDirectMaterialPurchase();
  const { stocks, defaultStock } = useStocks();
  const { suppliers } = useSuppliers();
  const { labelsFor } = usePartyLabels();
  const { items: inventory, getQuantityForStock, isLoading: inventoryLoading } = useInventory();
  const { accessibleIds, isLoading: loadingAccessibleInventory } = useAccessibleInventoryIds();
  const { accounts } = useFinancialAccounts();
  const { categories } = useFinancialCategories();
  const { registerPurchase } = useDirectMaterialPurchase();
  const parsedCashContext = useMemo(
    () => parsePdvPurchaseCashContext(location.search),
    [location.search],
  );
  const requestedCashContext = parsedCashContext.kind === 'present' ? parsedCashContext.context : null;
  const cashContextQuery = usePdvPurchaseCashContext(requestedCashContext);
  const cashMode = parsedCashContext.kind !== 'absent';
  const confirmedCashContext = parsedCashContext.kind === 'present' ? cashContextQuery.data ?? null : null;
  const submittingDraftIdRef = useRef<string | null>(null);
  const [editingItemValueId, setEditingItemValueId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const cartItemsRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');
  const [catalogMode, setCatalogMode] = useState<'quick' | 'catalog'>('quick');
  const [activeCategory, setActiveCategory] = useState('all');
  const [activeProductId, setActiveProductId] = useState<string | null>(null);
  const [keyboardHighlight, setKeyboardHighlight] = useState(false);
  const [financialOpen, setFinancialOpen] = useState(false);
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const [closeDraftOpen, setCloseDraftOpen] = useState(false);
  const [lastAddedItem, setLastAddedItem] = useState<string | null>(null);
  const [compositionHeight, setCompositionHeight] = useState<number | undefined>();
  const mobileCart = useMediaBreakpoint(801);
  const { expanded, setExpanded } = usePdvCheckoutLayoutPreference();
  const quantityInputRefs = useRef(new Map<string, HTMLInputElement>());
  const finalizeActionRef = useRef<HTMLButtonElement>(null);
  const supplierTriggerRef = useRef<HTMLButtonElement>(null);
  const [submittingDraftId, setSubmittingDraftId] = useState<string | null>(null);
  const [supplierCreateDraftId, setSupplierCreateDraftId] = useState<string | null>(null);
  const [supplierProfileOpen, setSupplierProfileOpen] = useState(false);
  const [draftToFinalize, setDraftToFinalize] = useState<PdvPurchaseDraft | null>(null);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);

  const today = todayInTz(timezone);
  const eligibleAccounts = useMemo(
    () => accounts.filter((account) => account.is_active && account.type !== 'cartao'),
    [accounts],
  );
  const expenseCategories = useMemo(
    () => categories.filter((category) => category.is_active && category.type === 'saida'),
    [categories],
  );
  const defaultCategory = useMemo(
    () => expenseCategories.find((category) => category.dre_group === 'cmv' && /materia/i.test(category.name))
      ?? expenseCategories[0]
      ?? null,
    [expenseCategories],
  );
  const defaults = useMemo(() => ({
    purchaseDate: today,
    stockId: confirmedCashContext?.stockId ?? (cashMode ? '' : defaultStock?.id ?? ''),
    accountId: confirmedCashContext?.cashAccountId ?? eligibleAccounts[0]?.id ?? '',
    categoryId: defaultCategory?.id ?? '',
  }), [today, confirmedCashContext?.stockId, confirmedCashContext?.cashAccountId, cashMode, defaultStock?.id, eligibleAccounts, defaultCategory?.id]);
  const owner = useMemo(() => user?.id && profile?.company_id && defaults.stockId && (!cashMode || confirmedCashContext)
    ? { userId: user.id, companyId: profile.company_id, stockId: defaults.stockId }
    : null, [user?.id, profile?.company_id, defaults.stockId, cashMode, confirmedCashContext]);
  const { workspace, activeDraft, updateDraft, createDraft, selectDraft, deleteDraft, syncIssue, draftConflicts = [], resolveDraftConflict, resolvingDraftId = null, localPersistenceIssue = false, retrySync } =
    usePdvPurchaseDraftWorkspace({ owner, defaults, cashContext: confirmedCashContext });
  const supplierCredit = usePdvSupplierCredit(activeDraft?.supplierId);

  const formatCurrency = (value: number) => formatMoney(value, currency, locale);
  const supplierOptions = useMemo(
    () => [
      { value: NO_SUPPLIER_VALUE, label: t.fields.supplierNone },
      ...suppliers.map((supplier) => { const labels = labelsFor('supplier', supplier.id); return {
        value: supplier.id,
        label: supplier.name,
        sublabel: supplier.cpf_cnpj || supplier.email || supplier.phone || undefined,
        suffix: <PartyLabelBadges labels={labels} mode="summary" />,
        selectedSuffix: <PartyLabelBadges labels={labels} mode="compact" />,
        keywords: [supplier.cpf_cnpj, supplier.email, supplier.phone, supplier.address, supplier.contact_name, ...labels.map((label) => label.name)].filter((value): value is string => Boolean(value)),
      }; }),
    ],
    [suppliers, t.fields.supplierNone, labelsFor],
  );
  const accountOptions = useMemo(
    () => eligibleAccounts.map((account) => ({ value: account.id, label: account.name })),
    [eligibleAccounts],
  );
  const supplierCreditAccountId = useMemo(
    () => eligibleAccounts.find((account) => account.id !== confirmedCashContext?.cashAccountId)?.id ?? '',
    [eligibleAccounts, confirmedCashContext?.cashAccountId],
  );
  const categoryOptions = useMemo(
    () => expenseCategories.map((category) => ({ value: category.id, label: category.name })),
    [expenseCategories],
  );
  const supplierNames = useMemo(
    () => new Map(suppliers.map((supplier) => [supplier.id, supplier.name])),
    [suppliers],
  );
  const switcherOrders = workspace.drafts.map((draft) => ({
    id: draft.id,
    code: purchaseCode(draft.sequence),
    supplier: supplierNames.get(draft.supplierId) ?? '',
    total: pdvPurchaseDraftTotal(draft),
    itemCount: draft.items.filter((item) => item.inventoryId).length,
    hasContent: hasPdvPurchaseDraftContent(draft),
  }));

  const patchDraft = (draftId: string, patch: Partial<PdvPurchaseDraft>) => {
    updateDraft(draftId, (draft) => ({ ...draft, ...patch,
      ...((patch.supplierId !== undefined && patch.supplierId !== draft.supplierId) || patch.paymentStatus === 'pending' || patch.paymentMethod === 'saldo_fornecedor' ? { supplierCreditAmount: 0 } : {}),
    }));
  };

  const updateItem = (
    draftId: string,
    itemId: string,
    patch: Partial<PdvPurchaseDraft['items'][number]>,
  ) => {
    updateDraft(draftId, (draft) => ({
      ...draft,
      items: draft.items.map((item) => item.id === itemId ? { ...item, ...patch } : item),
    }));
  };

  const isBlankItem = (item: PdvPurchaseDraft['items'][number]) =>
    !item.inventoryId && !item.quantityText.trim() && !item.unitPriceText.trim();

  const purchaseItems = (draft: PdvPurchaseDraft) =>
    draft.items.filter((item) => !isBlankItem(item));

  const validationMessageFor = (draft: PdvPurchaseDraft) => {
    const itemDrafts = purchaseItems(draft);
    const parsedItems = itemDrafts.map((item) => ({
      inventory_id: item.inventoryId,
      quantity: parsePdvPurchaseNumber(item.quantityText),
      unit_price: parsePdvPurchaseNumber(item.unitPriceText),
    }));
    const total = pdvPurchaseDraftTotal(draft);
    const duplicateMaterial = parsedItems.some((item, index) =>
      Boolean(item.inventory_id)
      && parsedItems.findIndex((candidate) => candidate.inventory_id === item.inventory_id) !== index,
    );
    const invalidItem = itemDrafts.length === 0 || parsedItems.some((item) =>
      !item.inventory_id || item.quantity <= 0 || item.unit_price < 0,
    );

    if (cashMode && !confirmedCashContext) return 'O caixa desta compra não está mais disponível.';
    if (confirmedCashContext && draft.stockId !== confirmedCashContext.stockId) return 'O local da compra não corresponde ao caixa selecionado.';
    if (confirmedCashContext && draft.paymentStatus === 'paid' && draft.paymentMethod === 'dinheiro'
      && draft.accountId !== confirmedCashContext.cashAccountId) return 'Pagamento em dinheiro deve usar a conta deste caixa.';
    if (confirmedCashContext && !(draft.paymentStatus === 'paid' && draft.paymentMethod === 'dinheiro')
      && draft.accountId === confirmedCashContext.cashAccountId) return 'Escolha outra conta para pagamentos que não saem em dinheiro deste caixa.';
    if (confirmedCashContext && draft.paymentStatus === 'paid' && draft.paymentMethod === 'dinheiro'
      && (draft.purchaseDate !== today || draft.paidDate !== today)) return 'Compra paga com o dinheiro do caixa deve usar a data de hoje.';
    if (!draft.supplierId) return t.validation.supplier;
    if (!draft.stockId) return t.validation.stock;
    if (!draft.purchaseDate) return t.validation.purchaseDate;
    if (invalidItem || total <= 0) return t.validation.items;
    if (duplicateMaterial) return t.validation.duplicateMaterial;
    if (!draft.categoryId) return t.validation.category;
    if (!draft.accountId) {
      return draft.paymentStatus === 'paid' && draft.paymentMethod === 'saldo_fornecedor'
        ? 'Escolha a conta onde esta compra será registrada no financeiro.'
        : t.validation.account;
    }
    if (draft.paymentStatus === 'paid' && !draft.paidDate) return t.validation.paidDate;
    if (draft.paymentStatus === 'paid' && !draft.paymentMethod) return t.validation.paymentMethod;
    if (draft.paymentStatus === 'paid' && draft.paymentMethod === 'saldo_fornecedor') {
      if (supplierCredit.isLoading) return 'Aguarde a consulta do saldo do fornecedor.';
      if (supplierCredit.isError) return 'Não foi possível confirmar o saldo do fornecedor.';
      if ((supplierCredit.data ?? 0) < total) return 'O saldo do fornecedor não cobre o total desta compra.';
    }
    if ((draft.supplierCreditAmount ?? 0) > 0) {
      if (draft.paymentStatus !== 'paid' || !Number.isFinite(draft.supplierCreditAmount)
        || (draft.supplierCreditAmount ?? 0) > total) return 'Revise o valor do saldo aplicado nesta compra.';
      if (!supplierCredit.isSuccess) return 'Consulte o saldo do fornecedor antes de finalizar.';
      if ((draft.supplierCreditAmount ?? 0) > (supplierCredit.data ?? 0)) return 'O saldo do fornecedor não cobre o valor aplicado.';
    }
    if (draft.paymentStatus === 'pending' && !draft.dueDate) return t.validation.dueDate;
    return '';
  };

  const focusMaterialSearch = () => {
    window.requestAnimationFrame(() => { searchInputRef.current?.focus({ preventScroll: true }); searchInputRef.current?.select(); });
  };

  const requestFinalize = (draft: PdvPurchaseDraft) => {
    const validationMessage = validationMessageFor(draft);
    if (validationMessage) {
      toast({ title: t.validation.title, description: validationMessage, variant: 'destructive' });
      return;
    }
    // Congela o rascunho escolhido: trocar rapidamente de aba enquanto o
    // alerta abre nunca pode finalizar a compra vizinha.
    setDraftToFinalize({ ...draft, items: draft.items.map((item) => ({ ...item })) });
  };

  const submit = async (draft: PdvPurchaseDraft) => {
    if (submittingDraftIdRef.current || registerPurchase.isPending) return;
    const parsedItems = purchaseItems(draft).map((item) => ({
      inventory_id: item.inventoryId,
      quantity: parsePdvPurchaseNumber(item.quantityText),
      unit_price: parsePdvPurchaseNumber(item.unitPriceText),
    }));
    const validationMessage = validationMessageFor(draft);
    if (validationMessage) {
      toast({ title: t.validation.title, description: validationMessage, variant: 'destructive' });
      return;
    }

    const submittedDraftId = draft.id;
    submittingDraftIdRef.current = submittedDraftId;
    setSubmittingDraftId(submittedDraftId);
    let mutationStarted = false;
    try {
      let submittedCashContext = requestedCashContext;
      if (cashMode) {
        if (parsedCashContext.kind !== 'present') throw new Error('O endereço desta compra não identifica um caixa válido.');
        const refreshed = await cashContextQuery.refetch();
        if (refreshed.error || !refreshed.data) throw new Error('Este caixa foi fechado ou não está mais disponível. Volte ao Caixa e tente novamente.');
        submittedCashContext = {
          sessionId: refreshed.data.sessionId,
          terminalId: refreshed.data.terminalId,
          stockId: refreshed.data.stockId,
        };
      }
      mutationStarted = true;
      await registerPurchase.mutateAsync({
        clientRequestId: draft.clientRequestId,
        stockId: draft.stockId,
        supplierId: draft.supplierId,
        items: parsedItems,
        purchaseDate: draft.purchaseDate,
        accountId: draft.accountId,
        categoryId: draft.categoryId,
        isPaid: draft.paymentStatus === 'paid',
        paidDate: draft.paymentStatus === 'paid' ? draft.paidDate : null,
        dueDate: draft.paymentStatus === 'pending' ? draft.dueDate : null,
        paymentMethod: draft.paymentStatus === 'paid' ? draft.paymentMethod : null,
        supplierCreditAmount: draft.paymentStatus === 'paid' ? draft.supplierCreditAmount ?? 0 : 0,
        description: draft.description.trim() || null,
        notes: draft.notes.trim() || null,
        cashContext: submittedCashContext,
      });
      setDraftToFinalize(null);
      deleteDraft(submittedDraftId);
      window.setTimeout(() => focusMaterialSearch(), 50);
    } catch (error) {
      if (cashMode && !mutationStarted && error instanceof Error) {
        toast({ title: 'Não foi possível confirmar o caixa', description: error.message, variant: 'destructive' });
      }
      // O rascunho e a chave idempotente ficam intactos para retry.
    } finally {
      if (submittingDraftIdRef.current === submittedDraftId) submittingDraftIdRef.current = null;
      setSubmittingDraftId((current) => current === submittedDraftId ? null : current);
    }
  };

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (supplierProfileOpen) return;
      if (event.defaultPrevented || event.altKey) return;

      const command = event.ctrlKey || event.metaKey;
      const commandKey = event.key.toLowerCase();
      if (command && commandKey === 'k') {
        event.preventDefault();
        if (!draftToFinalize && !supplierCreateDraftId && !financialOpen) setShortcutHelpOpen(true);
        return;
      }
      if (command && commandKey === 'f') {
        event.preventDefault();
        if (!shortcutHelpOpen && !draftToFinalize && !supplierCreateDraftId && !financialOpen) focusMaterialSearch();
        return;
      }
      if (command && event.key === 'Enter') {
        event.preventDefault();
        if (!shortcutHelpOpen && !draftToFinalize && !supplierCreateDraftId && activeDraft) {
          setFinancialOpen(true);
        }
        return;
      }
      if (command) return;
      if (['F4', 'F9'].includes(event.key.toUpperCase()) && !shortcutHelpOpen && !draftToFinalize && !supplierCreateDraftId && !financialOpen && activeDraft) { event.preventDefault(); setFinancialOpen(true); return; }
      if (isPdvEditableTarget(event.target)) return;

      const helpKey = event.key === '?' || (event.code === 'Slash' && event.shiftKey);
      if (helpKey) {
        event.preventDefault();
        if (!draftToFinalize && !supplierCreateDraftId && !financialOpen) setShortcutHelpOpen(true);
        return;
      }
      if (shortcutHelpOpen || draftToFinalize || supplierCreateDraftId || financialOpen || !activeDraft) return;
      if (registerPurchase.isPending || submittingDraftId != null) return;

      const key = event.key.toUpperCase();
      if (key === 'F2') {
        event.preventDefault();
        focusMaterialSearch();
      } else if (key === 'F3') {
        event.preventDefault();
        supplierTriggerRef.current?.focus();
        supplierTriggerRef.current?.click();
      } else if (key === 'F6' || key === 'F7') {
        event.preventDefault();
        const currentIndex = workspace.drafts.findIndex((draft) => draft.id === activeDraft.id);
        const nextIndex = nextPdvIndex(currentIndex, workspace.drafts.length, key === 'F7' ? 1 : -1);
        const target = workspace.drafts[nextIndex];
        if (target) selectDraft(target.id);
      } else if (key === 'F8') {
        event.preventDefault();
        if (workspace.drafts.length >= MAX_PDV_PURCHASE_DRAFTS) {
          toast({ title: tw.limitReached });
        } else {
          createDraft();
        }
      } else if (key === 'F9') {
        event.preventDefault();
        setFinancialOpen(true);
      }
    };

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, [
    activeDraft,
    createDraft,
    draftToFinalize,
    financialOpen,
    selectDraft,
    shortcutHelpOpen,
    supplierCreateDraftId,
    supplierProfileOpen,
    registerPurchase.isPending,
    submittingDraftId,
    toast,
    tw.limitReached,
    workspace.drafts,
  ]);

  const catalog = useMemo(() => loadingAccessibleInventory ? [] : inventory
    .filter(item => accessibleIds.has(item.id) && !item.archived_at)
    .filter(item => activeCategory === 'all' || item.category === activeCategory)
    .filter(item => `${item.sku ?? ''} ${item.barcode ?? ''} ${item.name} ${item.category ?? ''}`.toLocaleLowerCase('pt-BR').includes(search.trim().toLocaleLowerCase('pt-BR')))
    .map(item => ({ inventoryId: item.id, name: item.name, sku: item.sku, imageUrl: item.image_url,
      unit: item.unit, unitPrice: Number(item.cost_price ?? 0), availableQuantity: getQuantityForStock(item.id, activeDraft?.stockId) })),
  [inventory, accessibleIds, loadingAccessibleInventory, activeCategory, search, getQuantityForStock, activeDraft?.stockId]);
  const visibleProducts = catalogMode === 'quick' && !search.trim() ? catalog.slice(0, 4) : catalog;
  const categoriesInCatalog = [...new Set(inventory.filter(item => accessibleIds.has(item.id)).map(item => item.category).filter(Boolean))];
  useEffect(() => { setActiveProductId(null); setKeyboardHighlight(false); }, [search, catalogMode, activeCategory]);
  useEffect(() => {
    if (!lastAddedItem) return;
    window.requestAnimationFrame(() => cartItemsRef.current?.querySelector(`[data-purchase-inventory-id="${lastAddedItem}"]`)?.scrollIntoView({ block: 'nearest' }));
  }, [lastAddedItem, activeDraft?.items]);
  useEffect(() => {
    if (mobileCart) { setCompositionHeight(undefined); return; }
    const measure = () => { const row = rowRef.current; if (!row) return; const bottom = row.closest('main')?.getBoundingClientRect().bottom ?? window.innerHeight; setCompositionHeight(Math.max(400, bottom - row.getBoundingClientRect().top - 16)); };
    const frame = window.requestAnimationFrame(measure), main = rowRef.current?.closest('main');
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    if (main) observer?.observe(main);
    window.addEventListener('resize', measure);
    return () => { window.cancelAnimationFrame(frame); observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, [mobileCart, activeDraft?.id, confirmedCashContext?.sessionId, syncIssue, localPersistenceIssue, draftConflicts.length]);
  const addProduct = (product: PdvGridProduct, quantity = 1) => {
    if (!activeDraft || registerPurchase.isPending || submittingDraftId != null) return;
    updateDraft(activeDraft.id, draft => {
      const existing = draft.items.find(item => item.inventoryId === product.inventoryId);
      if (existing) { return { ...draft, items: draft.items.map(item => item.id === existing.id ? { ...item, quantityText: String(parsePdvPurchaseNumber(item.quantityText) + quantity) } : item) }; }
      const blank = draft.items.find(isBlankItem), added = { ...(blank ?? createPdvPurchaseItem()), inventoryId: product.inventoryId, quantityText: String(quantity), unitPriceText: String(product.unitPrice) };
      return { ...draft, items: blank ? draft.items.map(item => item.id === blank.id ? added : item) : [...draft.items, added] };
    });
    setLastAddedItem(product.inventoryId); setSearch(''); setKeyboardHighlight(false); focusMaterialSearch();
  };
  const navigateCatalog = (direction: PdvGridDirection) => {
    const elements = [...(gridRef.current?.querySelectorAll<HTMLButtonElement>('[data-pdv-product-id]:not(:disabled)') ?? [])];
    const current = activeProductId ?? elements[0]?.dataset.pdvProductId;
    if (!current) return;
    const next = findPdvGridNeighbor(elements.map(element => ({ id: element.dataset.pdvProductId!, ...element.getBoundingClientRect().toJSON() })), current, direction);
    if (!next) return;
    setActiveProductId(next); setKeyboardHighlight(true);
    window.requestAnimationFrame(() => elements.find(element => element.dataset.pdvProductId === next)?.focus());
  };
  const catalogKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    const direction = ({ ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' } as const)[event.key];
    if (direction && (!(event.target instanceof HTMLInputElement) || shouldNavigatePdvCatalogFromSearch(event.key, search))) { event.preventDefault(); navigateCatalog(direction); }
    else if (event.key === 'Enter' && event.target === searchInputRef.current) { event.preventDefault(); const product = visibleProducts.find(item => item.inventoryId === activeProductId) ?? visibleProducts[0]; if (product && search.trim()) addProduct(product); else if (search.trim()) void addIdentifier(search.trim()); }
  };

  const identifierLookup = useInventoryIdentifiers(null, canRegister);
  const latestSearch = useRef(search);
  latestSearch.current = search;
  const hardware = usePdvDomiLinkWorkspace({
    identity: activeDraft,
    contextKey: JSON.stringify([owner?.companyId, owner?.userId, activeDraft?.id, confirmedCashContext?.sessionId, activeDraft?.stockId]),
    blocked: financialOpen || closeDraftOpen || shortcutHelpOpen || registerPurchase.isPending || submittingDraftId != null || !activeDraft || !canRegister || (cashMode && !confirmedCashContext),
    getLine: id => {
      const item = activeDraft?.items.find(candidate => candidate.id === id);
      const material = inventory.find(candidate => candidate.id === item?.inventoryId);
      return item && material ? { inventoryId: item.id, name: material.name, unit: material.unit, availableQuantity: Number.MAX_SAFE_INTEGER } : undefined;
    },
    onSetQuantity: (id, value) => { if (activeDraft) updateItem(activeDraft.id, id, { quantityText: String(value) }); },
    onSearchChange: setSearch, searchInputRef,
  });

  async function addIdentifier(code: string) {
    if (!activeDraft || financialOpen || registerPurchase.isPending || submittingDraftId != null) return;
    const isCurrent = hardware.capture(false);
    try {
      const resolved = await identifierLookup.resolve.mutateAsync({ code });
      if (!isCurrent() || latestSearch.current.trim() !== code) return;
      const material = resolved && inventory.find(item => item.id === resolved.material.id && accessibleIds.has(item.id) && !item.archived_at);
      if (!resolved || !material) throw new Error('Material não encontrado neste estoque.');
      addProduct({ inventoryId: material.id, name: material.name, sku: material.sku, imageUrl: material.image_url,
        unit: material.unit, unitPrice: Number(material.cost_price ?? 0), availableQuantity: getQuantityForStock(material.id, activeDraft.stockId) }, resolved.unitFactor);
    } catch (error) {
      if (isCurrent()) toast({ title: 'Código não incluído', description: error instanceof Error ? error.message : 'Confira o código e tente novamente.', variant: 'destructive' });
    }
  }

  if (cashMode && parsedCashContext.kind === 'invalid') {
    return <CashPurchaseContextError onBack={() => navigate(localizeAppPath('/pdv', locale))} onRetry={null} />;
  }
  if (cashMode && cashContextQuery.isLoading) {
    return <div className="space-y-4 p-4"><PageHeader title="Nova compra" subtitle="Confirmando o caixa desta compra…" icon={ShoppingCart} /><PdvPageSkeleton variant="sale" catalogMode={catalogMode} label="Confirmando o caixa desta compra" /></div>;
  }
  if (cashMode && (cashContextQuery.isError || !confirmedCashContext)) {
    return <CashPurchaseContextError onBack={() => navigate(localizeAppPath('/pdv', locale))} onRetry={() => void cashContextQuery.refetch()} />;
  }
  if (!activeDraft) return null;

  if (!canRegister) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-4 sm:p-6">
        <Button type="button" variant="ghost" className="w-fit gap-2" onClick={() => navigate(localizeAppPath('/pdv', locale))}>
          <ArrowLeft className="h-4 w-4" /> {tw.back}
        </Button>
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <ShieldAlert className="h-10 w-10 text-warning" />
            <h1 className="text-xl font-bold">{tw.noAccessTitle}</h1>
            <p className="max-w-md text-sm text-muted-foreground">{tw.noAccessDescription}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const draftId = activeDraft.id;
  const total = pdvPurchaseDraftTotal(activeDraft);
  const busy = registerPurchase.isPending || submittingDraftId != null;
  const purchaseSwitcherProps = {
    orders: switcherOrders,
    activeId: workspace.activeId,
    formatCurrency,
    texts: tw,
    onSelect: selectDraft,
    onCreate: () => {
      if (workspace.drafts.length >= MAX_PDV_PURCHASE_DRAFTS) {
        toast({ title: tw.limitReached });
        return;
      }
      createDraft();
    },
    onDelete: deleteDraft,
    disabled: busy,
  };

  const selectedSupplier = supplierNames.get(activeDraft.supplierId) ?? '';
  const selectedItems = activeDraft.items.filter(item => Boolean(item.inventoryId));
  const openFinancialReview = () => { setCartDrawerOpen(false); setFinancialOpen(true); };
  const supplierSelector = (id: string) => <div className="flex w-full min-w-0 items-start gap-1"><PdvPartySelect id={id} triggerRef={id.startsWith('purchase-review-') ? undefined : supplierTriggerRef} options={supplierOptions} value={activeDraft.supplierId || NO_SUPPLIER_VALUE} label="Fornecedor" placeholder={t.fields.supplierPlaceholder} searchLabel="Buscar fornecedor" searchPlaceholder={t.fields.supplierSearch} listLabel="Fornecedores" emptyMessage={t.fields.supplierEmpty} createLabel={supplierFormTexts.titleNew} disabled={busy} onValueChange={supplierId => patchDraft(draftId, { supplierId: supplierId === NO_SUPPLIER_VALUE ? '' : supplierId })} onCreate={() => setSupplierCreateDraftId(draftId)} /><PdvSupplierProfileButton supplier={suppliers.find(supplier => supplier.id === activeDraft.supplierId)} disabled={busy} onOpenChange={setSupplierProfileOpen} /></div>;
  const purchaseCart = <div className="flex h-full min-h-0 flex-col" data-testid="pdv-purchase-cart">
    <PdvCartWorkspaceHeader title="Compra atual" closeLabel="Fechar compra atual" disabled={busy} onClose={() => { if (hasPdvPurchaseDraftContent(activeDraft)) setCloseDraftOpen(true); else deleteDraft(draftId); }} personSelector={supplierSelector(`purchase-supplier-${draftId}`)} />
    <div className="cartlistcaption"><span>{selectedItems.length} {selectedItems.length === 1 ? 'material' : 'materiais'}</span><span className="text-[10px] text-muted-foreground">Custo de compra</span></div>
    <div className="cartbody" ref={cartItemsRef}>
      {selectedItems.map(item => { const material = inventory.find(candidate => candidate.id === item.inventoryId), quantity = parsePdvPurchaseNumber(item.quantityText), unitPrice = parsePdvPurchaseNumber(item.unitPriceText), editingItemValue = editingItemValueId === item.id; return <div className="cartitem" key={item.id} data-purchase-item-id={item.id} data-purchase-inventory-id={item.inventoryId}>
        <div className={cn('row', editingItemValue && 'flex-wrap')}><div className="cartthumbnail">{material?.image_url ? <SignedImg src={material.image_url} alt="" className="h-full w-full object-contain" fallbackLabel="" /> : <Package />}</div><div className="grow"><strong>{material?.sku && <span className="productcode">{material.sku} · </span>}{material?.name ?? 'Material'}</strong><small className="purchase-item-unit">{material?.unit ?? 'un'}</small></div><div className={cn(editingItemValue && 'w-full min-w-0 pt-1')}><PdvInlineValueEditor label={`valor de ${material?.name ?? 'material'}`} value={quantity * unitPrice} baseAmount={quantity * unitPrice} formatCurrency={formatCurrency} adjustmentPolicy="price" disabled={busy || quantity <= 0} onApply={value => updateDraft(draftId, draft => setPdvPurchaseItemFinalAmount(draft, item.id, value))} onEditingChange={editing => setEditingItemValueId(editing ? item.id : null)} className="amount font-bold" /></div></div>
        <div className="row between itemcontrols"><div className="qty"><button type="button" disabled={busy || quantity <= 0} aria-label={`Diminuir ${material?.name ?? 'quantidade'}`} onClick={() => updateItem(draftId, item.id, { quantityText: String(Math.max(0, quantity - 1)) })}><Minus /></button><NumericInput ref={node => { if (node) quantityInputRefs.current.set(item.id, node); else quantityInputRefs.current.delete(item.id); }} value={item.quantityText} decimal maxDecimals={4} disabled={busy} onValueChange={quantityText => updateItem(draftId, item.id, { quantityText })} aria-label={`Quantidade de ${material?.name ?? 'material'}`} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); focusMaterialSearch(); } }} /><button type="button" disabled={busy} aria-label={`Aumentar ${material?.name ?? 'quantidade'}`} onClick={() => updateItem(draftId, item.id, { quantityText: String(quantity + 1) })}><Plus /></button></div><label className="purchase-unit-price"><span>Custo unitário</span><PdvMoneyInput id={`purchase-unit-cost-${item.id}`} value={unitPrice} disabled={busy} selectOnFocus onChange={value => updateItem(draftId, item.id, { unitPriceText: String(value) })} onEnter={focusMaterialSearch} /></label>{hardware.weighControl?.(item.id)}<button type="button" className="iconbtn negative removeitem" disabled={busy} aria-label={`${t.items.remove}: ${material?.name ?? 'material'}`} onClick={() => updateDraft(draftId, draft => { const remaining = draft.items.filter(candidate => candidate.id !== item.id); return { ...draft, items: remaining.length ? remaining : [createPdvPurchaseItem()] }; })}><Trash2 /></button></div>
      </div>; })}
      {!selectedItems.length && <div className="empty"><Package className="mx-auto mb-3 h-8 w-8" />Escolha os materiais que chegaram à loja.</div>}
    </div>
    <PdvCartWorkspaceTotals subtotalLabel="Subtotal" subtotal={formatCurrency(total)} totalLabel="Total da compra" total={<PdvInlineValueEditor label="total da compra" value={total} baseAmount={total} formatCurrency={formatCurrency} adjustmentPolicy="price" disabled={busy || !selectedItems.length} onApply={value => updateDraft(draftId, draft => setPdvPurchaseDraftFinalAmount(draft, value))} className="font-bold" />} amountLabel="Valor da compra" amount={formatCurrency(total)} afterTotal={activeDraft.supplierId && (supplierCredit.data ?? 0) > 0 ? <button type="button" className="benefitbtn" onClick={openFinancialReview}><span>Saldo do fornecedor</span><span>{formatCurrency(supplierCredit.data ?? 0)}<ChevronDown /></span></button> : null} />
    <PdvCartWorkspaceFooter><button type="button" className="btn primary" disabled={busy || !selectedItems.length || total <= 0 || eligibleAccounts.length === 0} onClick={openFinancialReview}><ArrowRight />{busy ? tw.finalizing : 'Conferir compra'}</button><button type="button" className="btn ghost" disabled={busy} onClick={openFinancialReview}><SlidersHorizontal />Fornecedor, data e pagamento</button><small>F9 para conferir · O estoque muda só ao confirmar.</small></PdvCartWorkspaceFooter>
  </div>;

  return (
    <div className={cn('pdv-preview-sale min-w-0', mobileCart && 'pb-44')} data-pdv-ui data-testid="pdv-purchase-workspace">
      <PdvOrderSwitcher orders={switcherOrders.map(order => ({ ...order, customer: order.supplier }))} activeId={workspace.activeId} formatCurrency={formatCurrency} operationLabel="Compra" header texts={{ ...tw, number: tw.code, customer: tw.supplier, unnamedCustomer: tw.unnamedSupplier, newOrder: tw.shortcuts.newOrder, deleteLabel: 'Fechar compra', deleteTitle: 'Fechar compra?', keepOrder: 'Continuar editando', confirmDelete: 'Fechar compra', editBadge: 'Compra', deleteDescription: 'Esta compra ainda não foi registrada. Fechar descarta os materiais e os dados deste atendimento.' }} onSelect={selectDraft} onCreate={purchaseSwitcherProps.onCreate} onDelete={deleteDraft} disabled={busy} orderPreferenceKey={owner ? `pdv:purchase-tab-order:${owner.companyId}:${owner.userId}:${confirmedCashContext?.sessionId ?? 'avulso'}:${owner.stockId}` : undefined} />
      <PdvDraftSyncNotice
        key={owner ? [owner.companyId, owner.userId, owner.stockId, confirmedCashContext?.sessionId ?? 'avulso'].join(':') : 'unbound'}
        issue={syncIssue ?? null}
        localPersistenceIssue={localPersistenceIssue}
        resolvingDraftId={resolvingDraftId}
        conflicts={draftConflicts.map(conflict => {
          const summary = (draft: PdvPurchaseDraft | null) => draft ? ({
            title: supplierNames.get(draft.supplierId) || 'Sem fornecedor',
            details: `${draft.items.filter(item => item.inventoryId).length} materiais · ${formatCurrency(pdvPurchaseDraftTotal(draft))}`,
            notes: draft.notes, updatedAt: draft.updatedAt,
          }) : null;
          return { id: conflict.id, label: purchaseCode(conflict.local?.sequence ?? conflict.server?.sequence ?? 0), local: summary(conflict.local), server: summary(conflict.server), alternativesCount: conflict.alternatives.length, requiresOrderReview: conflict.requiresOrderReview, orderId: conflict.orderId };
        })}
        onRetry={() => retrySync?.()}
        onResolve={(id, choice) => resolveDraftConflict?.(id, choice) ?? Promise.resolve('unavailable')}
      />
      <PdvSalePreviewView camera={hardware.scannerControl} title="Nova compra" exitLabel="Sair da compra" footerHint="↑ ↓ ← → navegar · Enter incluir · / buscar · F9 conferir compra" mode={catalogMode} onModeChange={setCatalogMode} search={search} onSearchChange={setSearch} onSearchKeyDown={catalogKeyDown} searchInputRef={searchInputRef} gridRef={gridRef} controlsRef={controlsRef} rowRef={rowRef} onGridKeyDown={catalogKeyDown} products={visibleProducts} activeProductId={activeProductId ?? visibleProducts[0]?.inventoryId ?? null} keyboardHighlight={keyboardHighlight} onProductFocus={id => { setActiveProductId(id); setKeyboardHighlight(true); }} onProductSelect={addProduct} formatCurrency={formatCurrency} onExit={() => navigate(localizeAppPath('/pdv', locale))} allowUnavailableProducts disabled={busy} catalogLoading={inventoryLoading || loadingAccessibleInventory} style={compositionHeight ? { height: compositionHeight } : undefined} filters={<><button type="button" className={cn('chip', activeCategory === 'all' && 'active')} onClick={() => setActiveCategory('all')}>Todos</button>{categoriesInCatalog.map(category => <button type="button" key={category} className={cn('chip', activeCategory === category && 'active')} onClick={() => setActiveCategory(category)}>{category}</button>)}</>} cart={!mobileCart ? purchaseCart : null} />
      {mobileCart && <>{createPortal(<button type="button" className="fixed inset-x-0 z-40 flex items-center justify-between gap-3 rounded-t-xl border-t border-border bg-primary px-4 py-3 text-primary-foreground shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background" style={{ bottom: 'calc(104px + env(safe-area-inset-bottom))' }} onClick={() => setCartDrawerOpen(true)}><span className="flex items-center gap-2 text-sm font-semibold"><ShoppingCart className="h-4 w-4" />{selectedItems.length} {selectedItems.length === 1 ? 'material' : 'materiais'}</span><strong className="text-lg tabular-nums">{formatCurrency(total)}</strong></button>, document.body)}<Drawer open={cartDrawerOpen} onOpenChange={setCartDrawerOpen}><DrawerContent className="pdv-preview-sale flex max-h-[85dvh] flex-col"><DrawerHeader className="sr-only"><DrawerTitle>Compra atual</DrawerTitle></DrawerHeader>{purchaseCart}</DrawerContent></Drawer></>}
      <ResponsiveModal open={financialOpen} onOpenChange={setFinancialOpen} title="Conferir compra" fullScreen={expanded} className={cn("pdv-checkout-dialog pdv-purchase-review sm:max-w-[1000px]", expanded && "paymentfullscreen")} bodyClassName={expanded ? "pdv-checkout-body" : undefined} headerActions={<Button type="button" variant="ghost" size="sm" onClick={() => setExpanded(false)}><Minimize2 className="h-4 w-4" />Reduzir</Button>} footer={<div className="flex gap-3"><Button type="button" className="h-[52px] font-bold sm:h-14" variant="cancel-ghost" disabled={busy} onClick={() => setFinancialOpen(false)}>Cancelar</Button><Button type="button" className="h-[52px] flex-1 font-bold sm:h-14" disabled={busy || eligibleAccounts.length === 0} onClick={() => { const message = validationMessageFor(activeDraft); if (message) { toast({ title: t.validation.title, description: message, variant: 'destructive' }); return; } setFinancialOpen(false); requestFinalize(activeDraft); }}>Registrar compra</Button></div>}>
        <div className={cn("grid gap-6 lg:grid-cols-[minmax(0,.9fr)_minmax(0,1.3fr)]", expanded && "paymentfullbody")}><aside className="paymentleftsummary min-w-0 space-y-5"><div className="flex items-center justify-between gap-3"><h3 className={expanded ? 'text-xl font-bold' : 'font-bold'}>{selectedSupplier || 'Selecione o fornecedor'}</h3>{!expanded && <Button type="button" size="sm" variant="ghost" onClick={() => setExpanded(true)}><Maximize2 className="h-4 w-4" />Ampliar</Button>}</div>{supplierSelector(`purchase-review-supplier-${draftId}`)}<div className="divide-y">{selectedItems.map(item => { const material = inventory.find(candidate => candidate.id === item.inventoryId); return <div key={item.id} className="flex items-center gap-3 py-3"><SignedImg src={material?.image_url} alt="" className="h-10 w-10 shrink-0 object-contain" fallbackLabel="" /><div className="min-w-0 flex-1"><strong className="text-xs">{material?.name}</strong><small className="block text-xs text-muted-foreground">{item.quantityText} {material?.unit} × {formatCurrency(parsePdvPurchaseNumber(item.unitPriceText))}</small></div><strong className="whitespace-nowrap text-xs tabular-nums">{formatCurrency(parsePdvPurchaseNumber(item.quantityText) * parsePdvPurchaseNumber(item.unitPriceText))}</strong></div>; })}</div><div className="flex items-center justify-between gap-4 border-y py-4"><strong>Total da compra</strong><strong className="whitespace-nowrap text-2xl tabular-nums">{formatCurrency(total)}</strong></div><div className="space-y-1.5"><Label htmlFor={`purchase-description-${draftId}`}>{t.fields.description}</Label><Input id={`purchase-description-${draftId}`} value={activeDraft.description} disabled={busy} onChange={event => patchDraft(draftId, { description: event.target.value })} placeholder={t.fields.descriptionPlaceholder} /></div><div className="space-y-1.5"><Label>{t.fields.stock}</Label><Select value={activeDraft.stockId} disabled={busy || cashMode} onValueChange={stockId => patchDraft(draftId, { stockId })}><SelectTrigger><SelectValue placeholder={t.fields.stockPlaceholder} /></SelectTrigger><SelectContent>{stocks.map(stock => <SelectItem key={stock.id} value={stock.id}>{stock.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1.5"><Label>{t.fields.purchaseDate}</Label><DatePicker value={activeDraft.purchaseDate} disabled={busy} max={today} onValueChange={purchaseDate => updateDraft(draftId, draft => ({ ...draft, paidDate: draft.paidDate === draft.purchaseDate ? purchaseDate : draft.paidDate, purchaseDate, purchaseDateTouched: true }))} /></div>{confirmedCashContext && <p className="text-xs text-muted-foreground">{confirmedCashContext.terminalName} · dinheiro registrado somente neste caixa.</p>}</aside><section className="paymentright min-w-0 space-y-4">
              <div className="space-y-1.5"><Label>{t.fields.category} *</Label><SearchableSelect options={categoryOptions} value={activeDraft.categoryId} disabled={busy} onValueChange={(categoryId) => patchDraft(draftId, { categoryId })} placeholder={t.fields.categoryPlaceholder} searchPlaceholder={tf.categorySearchPlaceholder} emptyMessage={t.fields.categoryEmpty} /></div>
              <div className="space-y-1.5">
                <Label>{activeDraft.paymentStatus === 'paid' && activeDraft.paymentMethod === 'saldo_fornecedor' ? 'Conta do registro financeiro' : t.fields.account} *</Label>
                <SearchableSelect options={accountOptions} value={activeDraft.accountId} disabled={busy} onValueChange={(accountId) => patchDraft(draftId, { accountId })} placeholder={t.fields.accountPlaceholder} searchPlaceholder={tf.accountSearchPlaceholder} emptyMessage={t.fields.accountEmpty} />
                {activeDraft.paymentStatus === 'paid' && activeDraft.paymentMethod === 'saldo_fornecedor' && (
                  <p className="text-xs text-muted-foreground">Mantém o histórico da compra no financeiro; a quitação usa o saldo do fornecedor.</p>
                )}
              </div>
              {eligibleAccounts.length === 0 && <NoticeBanner variant="warning" title={t.noAccount.title}>{t.noAccount.description}</NoticeBanner>}
              <div className="flex flex-col items-start gap-1.5"><Label>{t.fields.paymentStatus}</Label><LabeledSwitch value={activeDraft.paymentStatus} disabled={busy} onChange={(paymentStatus) => patchDraft(draftId, { paymentStatus: paymentStatus as PdvPurchasePaymentStatus })} off={{ value: 'pending', label: t.status.pending }} on={{ value: 'paid', label: t.status.paid }} aria-label={t.fields.paymentStatus} /></div>
              {activeDraft.paymentStatus === 'paid' ? (
                <>
                  <div className="space-y-1.5"><Label>{t.fields.paymentMethod} *</Label><Select value={activeDraft.paymentMethod} disabled={busy} onValueChange={(paymentMethod) => patchDraft(draftId, { paymentMethod, ...(paymentMethod === 'dinheiro' && confirmedCashContext ? { accountId: confirmedCashContext.cashAccountId } : {}), ...(paymentMethod === 'saldo_fornecedor' ? { paidDate: activeDraft.purchaseDate, accountId: supplierCreditAccountId || activeDraft.accountId || eligibleAccounts[0]?.id || '' } : {}) })}><SelectTrigger><SelectValue placeholder={tf.paymentMethodPlaceholder} /></SelectTrigger><SelectContent><SelectItem value="dinheiro">{tf.paymentMethods.dinheiro}</SelectItem><SelectItem value="pix">{tf.paymentMethods.pix}</SelectItem><SelectItem value="cartao_debito">{tf.paymentMethods.cartao_debito}</SelectItem><SelectItem value="transferencia">{tf.paymentMethods.transferencia}</SelectItem><SelectItem value="boleto">{tf.paymentMethods.boleto}</SelectItem><SelectItem value="cheque">{tf.paymentMethods.cheque}</SelectItem>{(supplierCredit.data ?? 0) > 0 && <SelectItem value="saldo_fornecedor">Saldo do fornecedor</SelectItem>}</SelectContent></Select></div>
                  {supplierCredit.isLoading && activeDraft.supplierId && (
                    <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Consultando saldo do fornecedor…
                    </p>
                  )}
                  {supplierCredit.isError && activeDraft.supplierId && (
                    <NoticeBanner
                      variant="destructive"
                      title="Saldo do fornecedor indisponível"
                      action={(
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="border-destructive-foreground/40 bg-transparent text-destructive-foreground hover:bg-destructive-foreground/10 hover:text-destructive-foreground"
                          onClick={() => void supplierCredit.refetch()}
                        >
                          Tentar novamente
                        </Button>
                      )}
                    >
                      Use outra forma de pagamento ou tente consultar de novo.
                    </NoticeBanner>
                  )}
                  {activeDraft.paymentMethod !== 'saldo_fornecedor' && supplierCredit.isSuccess && (supplierCredit.data ?? 0) > 0 && (
                    <div className="space-y-2 border-t pt-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Label htmlFor="purchase-supplier-credit">Saldo do fornecedor</Label>
                        <span className="text-xs text-muted-foreground">Disponível: {formatCurrency(supplierCredit.data ?? 0)}</span>
                      </div>
                      {(activeDraft.supplierCreditAmount ?? 0) > 0 ? <>
                        <PdvMoneyInput id="purchase-supplier-credit" value={activeDraft.supplierCreditAmount ?? 0} disabled={busy} selectOnFocus onChange={supplierCreditAmount => patchDraft(draftId, { supplierCreditAmount })} />
                        <p className="text-xs text-muted-foreground">Complemento na forma escolhida: <strong className="text-foreground">{formatCurrency(Math.max(0, pdvPurchaseDraftTotal(activeDraft) - (activeDraft.supplierCreditAmount ?? 0)))}</strong></p>
                        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => patchDraft(draftId, { supplierCreditAmount: 0 })}>Remover saldo aplicado</Button>
                      </> : <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => patchDraft(draftId, { supplierCreditAmount: Math.min(supplierCredit.data ?? 0, pdvPurchaseDraftTotal(activeDraft)) })}>Usar saldo do fornecedor</Button>}
                    </div>
                  )}
                  {activeDraft.paymentMethod === 'saldo_fornecedor' && supplierCredit.isSuccess && (
                    <NoticeBanner variant="info" title={`Saldo disponível: ${formatCurrency(supplierCredit.data ?? 0)}`}>
                      O saldo quita a compra. A conta escolhida mantém o registro no financeiro.
                    </NoticeBanner>
                  )}
                  <div className="space-y-1.5"><Label>{t.fields.paidDate} *</Label><DatePicker value={activeDraft.paidDate} disabled={busy} max={today} onValueChange={(paidDate) => patchDraft(draftId, { paidDate, paidDateTouched: true })} /></div>
                </>
              ) : <div className="space-y-1.5"><Label>{t.fields.dueDate} *</Label><DatePicker value={activeDraft.dueDate} disabled={busy} onValueChange={(dueDate) => patchDraft(draftId, { dueDate })} /></div>}
              <div className="space-y-1.5"><Label htmlFor={`purchase-notes-${draftId}`}>{t.fields.notes}</Label><Textarea id={`purchase-notes-${draftId}`} rows={4} value={activeDraft.notes} disabled={busy} onChange={(event) => patchDraft(draftId, { notes: event.target.value })} placeholder={t.fields.notesPlaceholder} /></div>
</section></div>
      </ResponsiveModal>
      <AlertDialog open={closeDraftOpen} onOpenChange={setCloseDraftOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Fechar compra?</AlertDialogTitle><AlertDialogDescription>Esta compra ainda não foi registrada. Fechar descarta os materiais e os dados deste atendimento.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Continuar editando</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { deleteDraft(draftId); setCloseDraftOpen(false); }}>Fechar compra</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>

      <SupplierFormDialog
        open={supplierCreateDraftId != null}
        onOpenChange={(open) => {
          if (!open) setSupplierCreateDraftId(null);
        }}
        onCreated={(supplier) => {
          const targetDraftId = supplierCreateDraftId;
          if (targetDraftId) patchDraft(targetDraftId, { supplierId: supplier.id });
          setSupplierCreateDraftId(null);
        }}
      />

      <AlertDialog
        open={draftToFinalize != null}
        onOpenChange={(open) => {
          if (!open && !busy) setDraftToFinalize(null);
        }}
      >
        <AlertDialogContent
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            window.requestAnimationFrame(() => finalizeActionRef.current?.focus());
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{tw.finalizeTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {tw.finalizeDescription
                .replace('{code}', draftToFinalize ? purchaseCode(draftToFinalize.sequence) : '')
                .replace('{value}', draftToFinalize ? formatCurrency(pdvPurchaseDraftTotal(draftToFinalize)) : '')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{tw.keepEditing}</AlertDialogCancel>
            <Button
              ref={finalizeActionRef}
              type="button"
              disabled={busy || !draftToFinalize}
              onClick={() => {
                if (draftToFinalize) void submit(draftToFinalize);
              }}
            >
              {busy ? tw.finalizing : tw.finalize}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PdvShortcutHelpDialog
        open={shortcutHelpOpen}
        onOpenChange={setShortcutHelpOpen}
        title={tw.shortcuts.title}
        description={tw.shortcuts.description}
        closeLabel={tw.shortcuts.close}
        shortcuts={[
          { keys: ['F2'], label: tw.shortcuts.material },
          { keys: ['F3'], label: tw.shortcuts.supplier },
          { keys: ['F6', 'F7'], label: tw.shortcuts.switchOrder },
          { keys: ['F8'], label: tw.shortcuts.newOrder },
          { keys: ['F9'], label: tw.shortcuts.finalize },
          { keys: ['Enter'], label: tw.shortcuts.flow },
          { keys: ['⌘/Ctrl', 'F'], label: tw.shortcuts.marketSearch },
          { keys: ['⌘/Ctrl', 'Enter'], label: tw.shortcuts.marketFinalize },
          { keys: ['⌘/Ctrl', 'K'], label: tw.shortcuts.marketHelp },
          { keys: ['?'], label: tw.shortcuts.help },
        ]}
      />
    </div>
  );
}

function CashPurchaseContextError({ onBack, onRetry }: { onBack: () => void; onRetry: (() => void) | null }) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-4 sm:p-6">
      <Button type="button" variant="ghost" className="w-fit gap-2" onClick={onBack}>
        <ArrowLeft className="h-4 w-4" /> Voltar ao Caixa
      </Button>
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <ShieldAlert className="h-10 w-10 text-destructive" />
          <h1 className="text-xl font-bold">Este caixa não está disponível</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            Volte ao Caixa e abra a compra novamente. Nenhum material ou lançamento foi registrado.
          </p>
          {onRetry && <Button type="button" variant="outline" onClick={onRetry}>Tentar novamente</Button>}
        </CardContent>
      </Card>
    </div>
  );
}
