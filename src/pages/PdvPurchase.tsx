import { useMemo, useRef, useState } from 'react';
import { ArrowLeft, PackagePlus, Plus, ShieldAlert, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
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

const purchaseCode = (sequence: number) => `PC-${String(sequence).padStart(3, '0')}`;

export default function PdvPurchase() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const { locale, currency, timezone } = useAppLocaleContext();
  const { toast } = useToast();
  const t = MESSAGES[locale].app.inventory.directPurchase;
  const tf = MESSAGES[locale].app.finance.transactionForm;
  const tw = getPdvPurchaseWorkspaceMessages(locale);
  const canRegister = useCanRegisterDirectMaterialPurchase();
  const { stocks, defaultStock } = useStocks();
  const { suppliers } = useSuppliers();
  const { items: inventory } = useInventory();
  const { accounts } = useFinancialAccounts();
  const { categories } = useFinancialCategories();
  const { registerPurchase } = useDirectMaterialPurchase();
  const submittingDraftIdRef = useRef<string | null>(null);
  const [submittingDraftId, setSubmittingDraftId] = useState<string | null>(null);

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
    () => suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name })),
    [suppliers],
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

  const submit = async (draft: PdvPurchaseDraft) => {
    if (submittingDraftIdRef.current || registerPurchase.isPending) return;
    const parsedItems = draft.items.map((item) => ({
      inventory_id: item.inventoryId,
      quantity: parsePdvPurchaseNumber(item.quantityText),
      unit_price: parsePdvPurchaseNumber(item.unitPriceText),
    }));
    const total = pdvPurchaseDraftTotal(draft);
    const duplicateMaterial = parsedItems.some((item, index) =>
      Boolean(item.inventory_id)
      && parsedItems.findIndex((candidate) => candidate.inventory_id === item.inventory_id) !== index,
    );
    const invalidItem = parsedItems.some((item) =>
      !item.inventory_id || item.quantity <= 0 || item.unit_price < 0,
    );

    let validationMessage = '';
    if (!draft.supplierId) validationMessage = t.validation.supplier;
    else if (!draft.stockId) validationMessage = t.validation.stock;
    else if (!draft.purchaseDate) validationMessage = t.validation.purchaseDate;
    else if (invalidItem || total <= 0) validationMessage = t.validation.items;
    else if (duplicateMaterial) validationMessage = t.validation.duplicateMaterial;
    else if (!draft.categoryId) validationMessage = t.validation.category;
    else if (!draft.accountId) validationMessage = t.validation.account;
    else if (draft.paymentStatus === 'paid' && !draft.paidDate) validationMessage = t.validation.paidDate;
    else if (draft.paymentStatus === 'paid' && !draft.paymentMethod) validationMessage = t.validation.paymentMethod;
    else if (draft.paymentStatus === 'pending' && !draft.dueDate) validationMessage = t.validation.dueDate;
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
      deleteDraft(submittedDraftId);
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
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 p-3 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Button type="button" variant="ghost" className="-ml-3 mb-1 gap-2" onClick={() => navigate(localizeAppPath('/pdv', locale))}>
            <ArrowLeft className="h-4 w-4" /> {tw.back}
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">{tw.title}</h1>
          <p className="text-sm text-muted-foreground">{tw.subtitle}</p>
        </div>
        <div className="rounded-lg bg-primary/10 px-4 py-2 text-right">
          <p className="text-xs font-medium text-muted-foreground">{t.items.total}</p>
          <p className="text-2xl font-black tabular-nums text-primary">{formatCurrency(total)}</p>
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
                <Label>{t.fields.supplier} *</Label>
                <SearchableSelect options={supplierOptions} value={activeDraft.supplierId} disabled={busy} onValueChange={(supplierId) => patchDraft(draftId, { supplierId })} placeholder={t.fields.supplierPlaceholder} searchPlaceholder={t.fields.supplierSearch} emptyMessage={t.fields.supplierEmpty} />
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
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => updateDraft(draftId, (draft) => ({ ...draft, items: [...draft.items, createPdvPurchaseItem()] }))}>
                <Plus className="h-4 w-4" /> {t.items.add}
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {activeDraft.items.map((item, index) => {
                const inventoryItem = inventory.find((candidate) => candidate.id === item.inventoryId);
                const lineTotal = parsePdvPurchaseNumber(item.quantityText) * parsePdvPurchaseNumber(item.unitPriceText);
                return (
                  <div key={item.id} className="grid gap-3 rounded-xl border bg-muted/15 p-3 md:grid-cols-[minmax(0,1fr)_120px_150px_40px] md:items-end">
                    <div className="space-y-1.5"><Label>{t.items.material} {index + 1}</Label><InventoryMaterialSelect stockId={activeDraft.stockId || null} value={item.inventoryId} disabled={busy} onValueChange={(inventoryId) => updateItem(draftId, item.id, { inventoryId })} /></div>
                    <div className="space-y-1.5"><Label>{t.items.quantity}</Label><NumericInput decimal maxDecimals={4} value={item.quantityText} disabled={busy} onValueChange={(quantityText) => updateItem(draftId, item.id, { quantityText })} placeholder="0" />{inventoryItem?.unit && <p className="text-[11px] text-muted-foreground">{inventoryItem.unit}</p>}</div>
                    <div className="space-y-1.5"><Label>{t.items.unitPrice}</Label><NumericInput decimal maxDecimals={2} value={item.unitPriceText} disabled={busy} onValueChange={(unitPriceText) => updateItem(draftId, item.id, { unitPriceText })} placeholder="0,00" /><p className="text-[11px] text-muted-foreground">{t.items.subtotal}: {formatCurrency(lineTotal)}</p></div>
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
            <div className="hidden xl:block">
              <PdvPurchaseSwitcher {...purchaseSwitcherProps} embedded />
            </div>
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
              <Button type="button" size="lg" className="w-full gap-2" disabled={busy || eligibleAccounts.length === 0} onClick={() => void submit(activeDraft)}>
                <PackagePlus className="h-5 w-5" /> {submittingDraftId === draftId ? tw.finalizing : tw.finalize}
              </Button>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
