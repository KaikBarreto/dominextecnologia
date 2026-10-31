import { useMemo, useRef, useState } from 'react';
import { ArrowLeft, PackagePlus, Plus, ShieldAlert, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/DatePicker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LabeledSwitch } from '@/components/ui/labeled-switch';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { NumericInput } from '@/components/ui/numeric-input';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { InventoryMaterialSelect } from '@/components/inventory/InventoryMaterialSelect';
import { SupplierFormDialog } from '@/components/inventory/SupplierFormDialog';
import { PdvPurchaseSwitcher } from '@/components/pdv/PdvPurchaseSwitcher';
import { useAuth } from '@/contexts/AuthContext';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { useCanRegisterDirectMaterialPurchase } from '@/hooks/useCanRegisterDirectMaterialPurchase';
import { useDirectMaterialPurchase } from '@/hooks/useDirectMaterialPurchase';
import { useFinancialAccounts } from '@/hooks/useFinancialAccounts';
import { useFinancialCategories } from '@/hooks/useFinancialCategories';
import { useInventory } from '@/hooks/useInventory';
import { usePdvPurchaseDraftWorkspace } from '@/hooks/usePdvPurchaseDraftWorkspace';
import { useStocks } from '@/hooks/useStocks';
import { useSuppliers } from '@/hooks/useSuppliers';
import { usePartyLabels } from '@/hooks/usePartyLabels';
import { PartyLabelBadge } from '@/components/customers/PartyLabelBadge';
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
  type PdvPurchaseDraft,
  type PdvPurchasePaymentStatus,
} from '@/lib/pdv/purchase-drafts';
import { getPdvPurchaseWorkspaceMessages } from '@/lib/pdv/purchase-workspace-messages';
import { todayInTz } from '@/lib/timezone';
import { typography } from '@/lib/typography';
import { cn } from '@/lib/utils';

const purchaseCode = (sequence: number) => `PC-${String(sequence).padStart(3, '0')}`;
const NO_SUPPLIER_VALUE = '_none';

export default function PdvPurchase() {
  const navigate = useNavigate();
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
  const { byId: labelById } = usePartyLabels();
  const { items: inventory } = useInventory();
  const { accounts } = useFinancialAccounts();
  const { categories } = useFinancialCategories();
  const { registerPurchase } = useDirectMaterialPurchase();
  const submittingDraftIdRef = useRef<string | null>(null);
  const materialTriggerRefs = useRef(new Map<string, HTMLButtonElement>());
  const quantityInputRefs = useRef(new Map<string, HTMLInputElement>());
  const unitPriceInputRefs = useRef(new Map<string, HTMLInputElement>());
  const finalizeActionRef = useRef<HTMLButtonElement>(null);
  const [submittingDraftId, setSubmittingDraftId] = useState<string | null>(null);
  const [supplierCreateDraftId, setSupplierCreateDraftId] = useState<string | null>(null);
  const [draftToFinalize, setDraftToFinalize] = useState<PdvPurchaseDraft | null>(null);

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
    stockId: defaultStock?.id ?? '',
    accountId: eligibleAccounts[0]?.id ?? '',
    categoryId: defaultCategory?.id ?? '',
  }), [today, defaultStock?.id, eligibleAccounts, defaultCategory?.id]);
  const owner = useMemo(() => user?.id && profile?.company_id
    ? { userId: user.id, companyId: profile.company_id }
    : null, [user?.id, profile?.company_id]);
  const { workspace, activeDraft, updateDraft, createDraft, selectDraft, deleteDraft, syncIssue } =
    usePdvPurchaseDraftWorkspace({ owner, defaults });

  const formatCurrency = (value: number) => formatMoney(value, currency, locale);
  const supplierOptions = useMemo(
    () => [
      { value: NO_SUPPLIER_VALUE, label: t.fields.supplierNone },
      ...suppliers.map((supplier) => ({
        value: supplier.id,
        label: supplier.name,
        suffix: <PartyLabelBadge label={labelById(supplier.label_id)} />,
        selectedSuffix: <PartyLabelBadge label={labelById(supplier.label_id)} compact />,
        keywords: labelById(supplier.label_id)?.name ? [labelById(supplier.label_id)!.name] : undefined,
      })),
    ],
    [suppliers, t.fields.supplierNone, labelById],
  );
  const accountOptions = useMemo(
    () => eligibleAccounts.map((account) => ({ value: account.id, label: account.name })),
    [eligibleAccounts],
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
    updateDraft(draftId, (draft) => ({ ...draft, ...patch }));
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

    if (!draft.supplierId) return t.validation.supplier;
    if (!draft.stockId) return t.validation.stock;
    if (!draft.purchaseDate) return t.validation.purchaseDate;
    if (invalidItem || total <= 0) return t.validation.items;
    if (duplicateMaterial) return t.validation.duplicateMaterial;
    if (!draft.categoryId) return t.validation.category;
    if (!draft.accountId) return t.validation.account;
    if (draft.paymentStatus === 'paid' && !draft.paidDate) return t.validation.paidDate;
    if (draft.paymentStatus === 'paid' && !draft.paymentMethod) return t.validation.paymentMethod;
    if (draft.paymentStatus === 'pending' && !draft.dueDate) return t.validation.dueDate;
    return '';
  };

  const focusMaterialSearch = (itemId?: string) => {
    window.requestAnimationFrame(() => {
      const trigger = itemId
        ? materialTriggerRefs.current.get(itemId)
        : materialTriggerRefs.current.values().next().value;
      trigger?.focus();
      trigger?.click();
    });
  };

  const addMaterialRowAndFocus = (draft: PdvPurchaseDraft) => {
    const existingBlank = draft.items.find(isBlankItem);
    if (existingBlank) {
      focusMaterialSearch(existingBlank.id);
      return;
    }
    const item = createPdvPurchaseItem();
    updateDraft(draft.id, (current) => ({ ...current, items: [...current.items, item] }));
    focusMaterialSearch(item.id);
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
    try {
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
        description: draft.description.trim() || null,
        notes: draft.notes.trim() || null,
      });
      setDraftToFinalize(null);
      deleteDraft(submittedDraftId);
      window.setTimeout(() => focusMaterialSearch(), 50);
    } catch {
      // O hook já mostra o erro; o rascunho e a chave idempotente ficam intactos para retry.
    } finally {
      if (submittingDraftIdRef.current === submittedDraftId) submittingDraftIdRef.current = null;
      setSubmittingDraftId((current) => current === submittedDraftId ? null : current);
    }
  };

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

  return (
    <div className="flex w-full flex-col gap-4">
      <header className="flex items-center gap-4 border-b border-border pb-3">
        <div className="flex min-w-0 flex-1 items-center">
          <Button type="button" variant="ghost" size="icon" onClick={() => navigate(localizeAppPath('/pdv', locale))} aria-label={tw.back}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h1 className={cn(typography.pageTitle, 'truncate')}>{tw.title}</h1>
            <p className="truncate text-sm text-muted-foreground">{tw.subtitle}</p>
          </div>
        </div>
        <div className="hidden w-[30rem] shrink-0 xl:block">
          <PdvPurchaseSwitcher {...purchaseSwitcherProps} header />
        </div>
      </header>

      <div className="xl:hidden">
        <PdvPurchaseSwitcher {...purchaseSwitcherProps} />
      </div>

      {syncIssue && (
        <NoticeBanner variant={syncIssue === 'conflict' ? 'warning' : 'info'}>
          {syncIssue === 'conflict' ? tw.syncConflict : tw.syncUnavailable}
        </NoticeBanner>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.75fr)]">
        <div className="space-y-5">
          <Card>
            <CardHeader><CardTitle className="text-base">{t.title}</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor={`purchase-description-${draftId}`}>{t.fields.description}</Label>
                <Input id={`purchase-description-${draftId}`} value={activeDraft.description} disabled={busy} onChange={(event) => patchDraft(draftId, { description: event.target.value })} placeholder={t.fields.descriptionPlaceholder} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`purchase-supplier-${draftId}`}>{t.fields.supplier} *</Label>
                <div className="flex h-10 overflow-hidden rounded-md border border-input bg-background ring-offset-background focus-within:border-ring focus-within:ring-1 focus-within:ring-ring">
                  <SearchableSelect
                    id={`purchase-supplier-${draftId}`}
                    options={supplierOptions}
                    value={activeDraft.supplierId}
                    disabled={busy}
                    onValueChange={(supplierId) => patchDraft(draftId, {
                      supplierId: supplierId === NO_SUPPLIER_VALUE ? '' : supplierId,
                    })}
                    placeholder={t.fields.supplierPlaceholder}
                    searchPlaceholder={t.fields.supplierSearch}
                    emptyMessage={t.fields.supplierEmpty}
                    indicatorClassName="self-center"
                    className="h-10 min-w-0 flex-1 rounded-none border-0 bg-transparent px-3 shadow-none hover:bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={busy}
                    onClick={() => setSupplierCreateDraftId(draftId)}
                    className="h-10 w-10 shrink-0 rounded-none border-l border-background/15 bg-foreground text-background hover:bg-foreground/90 hover:text-background focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-background"
                    aria-label={supplierFormTexts.titleNew}
                    title={supplierFormTexts.titleNew}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{t.fields.stock} *</Label>
                <Select value={activeDraft.stockId} disabled={busy} onValueChange={(stockId) => patchDraft(draftId, { stockId })}>
                  <SelectTrigger><SelectValue placeholder={t.fields.stockPlaceholder} /></SelectTrigger>
                  <SelectContent>{stocks.map((stock) => <SelectItem key={stock.id} value={stock.id}>{stock.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t.fields.purchaseDate} *</Label>
                <DatePicker
                  value={activeDraft.purchaseDate}
                  disabled={busy}
                  max={today}
                  onValueChange={(purchaseDate) => updateDraft(draftId, (draft) => ({
                    ...draft,
                    paidDate: draft.paidDate === draft.purchaseDate ? purchaseDate : draft.paidDate,
                    purchaseDate,
                    purchaseDateTouched: true,
                  }))}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <div><CardTitle className="text-base">{t.items.title}</CardTitle><p className="text-xs text-muted-foreground">{t.items.hint}</p></div>
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => addMaterialRowAndFocus(activeDraft)}>
                <Plus className="h-4 w-4" /> {t.items.add}
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {activeDraft.items.map((item, index) => {
                const inventoryItem = inventory.find((candidate) => candidate.id === item.inventoryId);
                const lineTotal = parsePdvPurchaseNumber(item.quantityText) * parsePdvPurchaseNumber(item.unitPriceText);
                return (
                  <div key={item.id} className="grid gap-3 rounded-xl border bg-muted/15 p-3 md:grid-cols-[minmax(0,1fr)_120px_150px_40px] md:items-end">
                    <div className="space-y-1.5">
                      <Label>{t.items.material} {index + 1}</Label>
                      <InventoryMaterialSelect
                        stockId={activeDraft.stockId || null}
                        value={item.inventoryId}
                        disabled={busy}
                        triggerRef={(node) => {
                          if (node) materialTriggerRefs.current.set(item.id, node);
                          else materialTriggerRefs.current.delete(item.id);
                        }}
                        focusSearchOnOpen
                        onEmptyEnter={isBlankItem(item) ? () => requestFinalize(activeDraft) : undefined}
                        onValueChange={(inventoryId) => {
                          updateItem(draftId, item.id, { inventoryId });
                          window.requestAnimationFrame(() => quantityInputRefs.current.get(item.id)?.focus());
                        }}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t.items.quantity}</Label>
                      <div className="flex items-center gap-2">
                        <NumericInput
                          ref={(node) => {
                            if (node) quantityInputRefs.current.set(item.id, node);
                            else quantityInputRefs.current.delete(item.id);
                          }}
                          decimal
                          maxDecimals={4}
                          value={item.quantityText}
                          disabled={busy}
                          onValueChange={(quantityText) => updateItem(draftId, item.id, { quantityText })}
                          onKeyDown={(event) => {
                            if (event.key !== 'Enter') return;
                            event.preventDefault();
                            unitPriceInputRefs.current.get(item.id)?.focus();
                          }}
                          placeholder="0"
                        />
                        <span className="min-w-7 shrink-0 text-sm font-medium text-muted-foreground">
                          {inventoryItem?.unit?.trim() || 'un'}
                        </span>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t.items.unitPrice}</Label>
                      <NumericInput
                        ref={(node) => {
                          if (node) unitPriceInputRefs.current.set(item.id, node);
                          else unitPriceInputRefs.current.delete(item.id);
                        }}
                        decimal
                        maxDecimals={2}
                        value={item.unitPriceText}
                        disabled={busy}
                        onValueChange={(unitPriceText) => updateItem(draftId, item.id, { unitPriceText })}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter') return;
                          event.preventDefault();
                          if (
                            item.inventoryId
                            && parsePdvPurchaseNumber(item.quantityText) > 0
                            && parsePdvPurchaseNumber(item.unitPriceText) >= 0
                          ) addMaterialRowAndFocus(activeDraft);
                        }}
                        placeholder="0,00"
                      />
                      <p className="text-[11px] text-muted-foreground">{t.items.subtotal}: {formatCurrency(lineTotal)}</p>
                    </div>
                    <Button type="button" variant="destructive-ghost" size="icon" disabled={busy || activeDraft.items.length === 1} onClick={() => updateDraft(draftId, (draft) => ({ ...draft, items: draft.items.filter((candidate) => candidate.id !== item.id) }))} aria-label={t.items.remove}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                );
              })}
              <div className="flex items-center justify-between rounded-xl bg-foreground px-4 py-3 text-background"><span className="font-medium">{t.items.total}</span><span className="text-xl font-black tabular-nums">{formatCurrency(total)}</span></div>
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-5 xl:sticky xl:top-4">
          <Card className="overflow-hidden">
            <CardHeader><CardTitle className="text-base">{tw.financialTitle}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5"><Label>{t.fields.category} *</Label><SearchableSelect options={categoryOptions} value={activeDraft.categoryId} disabled={busy} onValueChange={(categoryId) => patchDraft(draftId, { categoryId })} placeholder={t.fields.categoryPlaceholder} searchPlaceholder={tf.categorySearchPlaceholder} emptyMessage={t.fields.categoryEmpty} /></div>
              <div className="space-y-1.5"><Label>{t.fields.account} *</Label><SearchableSelect options={accountOptions} value={activeDraft.accountId} disabled={busy} onValueChange={(accountId) => patchDraft(draftId, { accountId })} placeholder={t.fields.accountPlaceholder} searchPlaceholder={tf.accountSearchPlaceholder} emptyMessage={t.fields.accountEmpty} /></div>
              {eligibleAccounts.length === 0 && <NoticeBanner variant="warning" title={t.noAccount.title}>{t.noAccount.description}</NoticeBanner>}
              <div className="flex flex-col items-start gap-1.5"><Label>{t.fields.paymentStatus}</Label><LabeledSwitch value={activeDraft.paymentStatus} disabled={busy} onChange={(paymentStatus) => patchDraft(draftId, { paymentStatus: paymentStatus as PdvPurchasePaymentStatus })} off={{ value: 'pending', label: t.status.pending }} on={{ value: 'paid', label: t.status.paid }} aria-label={t.fields.paymentStatus} /></div>
              {activeDraft.paymentStatus === 'paid' ? (
                <>
                  <div className="space-y-1.5"><Label>{t.fields.paymentMethod} *</Label><Select value={activeDraft.paymentMethod} disabled={busy} onValueChange={(paymentMethod) => patchDraft(draftId, { paymentMethod })}><SelectTrigger><SelectValue placeholder={tf.paymentMethodPlaceholder} /></SelectTrigger><SelectContent><SelectItem value="dinheiro">{tf.paymentMethods.dinheiro}</SelectItem><SelectItem value="pix">{tf.paymentMethods.pix}</SelectItem><SelectItem value="cartao_debito">{tf.paymentMethods.cartao_debito}</SelectItem><SelectItem value="transferencia">{tf.paymentMethods.transferencia}</SelectItem><SelectItem value="boleto">{tf.paymentMethods.boleto}</SelectItem><SelectItem value="cheque">{tf.paymentMethods.cheque}</SelectItem></SelectContent></Select></div>
                  <div className="space-y-1.5"><Label>{t.fields.paidDate} *</Label><DatePicker value={activeDraft.paidDate} disabled={busy} max={today} onValueChange={(paidDate) => patchDraft(draftId, { paidDate, paidDateTouched: true })} /></div>
                </>
              ) : <div className="space-y-1.5"><Label>{t.fields.dueDate} *</Label><DatePicker value={activeDraft.dueDate} disabled={busy} onValueChange={(dueDate) => patchDraft(draftId, { dueDate })} /></div>}
              <div className="space-y-1.5"><Label htmlFor={`purchase-notes-${draftId}`}>{t.fields.notes}</Label><Textarea id={`purchase-notes-${draftId}`} rows={4} value={activeDraft.notes} disabled={busy} onChange={(event) => patchDraft(draftId, { notes: event.target.value })} placeholder={t.fields.notesPlaceholder} /></div>
              <Button type="button" size="lg" className="w-full gap-2" disabled={busy || eligibleAccounts.length === 0} onClick={() => requestFinalize(activeDraft)}>
                <PackagePlus className="h-5 w-5" /> {submittingDraftId === draftId ? tw.finalizing : tw.finalize}
              </Button>
            </CardContent>
          </Card>
        </aside>
      </div>

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
    </div>
  );
}
