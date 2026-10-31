import { useEffect, useMemo, useState } from 'react';
import { PackagePlus, Plus, Trash2 } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { NumericInput } from '@/components/ui/numeric-input';
import { DatePicker } from '@/components/ui/DatePicker';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { LabeledSwitch } from '@/components/ui/labeled-switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { InventoryMaterialSelect } from './InventoryMaterialSelect';
import { useStocks } from '@/hooks/useStocks';
import { useSuppliers } from '@/hooks/useSuppliers';
import { useInventory } from '@/hooks/useInventory';
import { useFinancialAccounts } from '@/hooks/useFinancialAccounts';
import { useFinancialCategories } from '@/hooks/useFinancialCategories';
import { useDirectMaterialPurchase } from '@/hooks/useDirectMaterialPurchase';
import { useToast } from '@/hooks/use-toast';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { todayInTz } from '@/lib/timezone';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatMoney } from '@/lib/format';
import { usePartyLabels } from '@/hooks/usePartyLabels';
import { PartyLabelBadge } from '@/components/customers/PartyLabelBadge';

interface DirectMaterialPurchaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ItemDraft {
  key: string;
  inventoryId: string;
  quantityText: string;
  unitPriceText: string;
}

type PaymentStatus = 'pending' | 'paid';

const newKey = () => (
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `purchase-${Date.now()}-${Math.random().toString(36).slice(2)}`
);

const newRow = (): ItemDraft => ({
  key: newKey(),
  inventoryId: '',
  quantityText: '',
  unitPriceText: '',
});

/** NumericInput normaliza o separador para vírgula durante a digitação. */
const numberFromText = (value: string): number => {
  const parsed = Number((value || '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

export function DirectMaterialPurchaseDialog({
  open,
  onOpenChange,
}: DirectMaterialPurchaseDialogProps) {
  const { locale, currency, timezone } = useAppLocaleContext();
  const t = MESSAGES[locale].app.inventory.directPurchase;
  const tf = MESSAGES[locale].app.finance.transactionForm;
  const { toast } = useToast();
  const { stocks, defaultStock } = useStocks();
  const { suppliers } = useSuppliers();
  const { byId: labelById } = usePartyLabels();
  const { items: inventory } = useInventory();
  const { accounts } = useFinancialAccounts();
  const { categories } = useFinancialCategories();
  const { registerPurchase } = useDirectMaterialPurchase();

  const today = todayInTz(timezone);
  const [requestId, setRequestId] = useState(newKey);
  const [description, setDescription] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [stockId, setStockId] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(today);
  const [rows, setRows] = useState<ItemDraft[]>([newRow()]);
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('paid');
  const [paidDate, setPaidDate] = useState(today);
  const [dueDate, setDueDate] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [notes, setNotes] = useState('');

  const eligibleAccounts = useMemo(
    () => accounts.filter((account) => account.is_active && account.type !== 'cartao'),
    [accounts],
  );
  const expenseCategories = useMemo(
    () => categories.filter((category) => category.is_active && category.type === 'saida'),
    [categories],
  );

  const supplierOptions = useMemo(
    () => suppliers.map((supplier) => ({
      value: supplier.id,
      label: supplier.name,
      suffix: <PartyLabelBadge label={labelById(supplier.label_id)} />,
      selectedSuffix: <PartyLabelBadge label={labelById(supplier.label_id)} compact />,
      keywords: labelById(supplier.label_id)?.name ? [labelById(supplier.label_id)!.name] : undefined,
    })),
    [suppliers, labelById],
  );
  const accountOptions = useMemo(
    () => eligibleAccounts.map((account) => ({ value: account.id, label: account.name })),
    [eligibleAccounts],
  );
  const categoryOptions = useMemo(
    () => expenseCategories.map((category) => ({ value: category.id, label: category.name })),
    [expenseCategories],
  );

  // Defaults só preenchem campo ainda vazio. Nunca trocam uma escolha do usuário
  // quando as queries refazem em segundo plano.
  useEffect(() => {
    if (!open) return;
    if (!stockId && defaultStock) setStockId(defaultStock.id);
    if (!accountId && eligibleAccounts[0]) setAccountId(eligibleAccounts[0].id);
    if (!categoryId && expenseCategories.length > 0) {
      const materialCategory = expenseCategories.find((category) =>
        category.dre_group === 'cmv' && /materia/i.test(category.name),
      );
      setCategoryId((materialCategory ?? expenseCategories[0]).id);
    }
  }, [open, stockId, defaultStock, accountId, eligibleAccounts, categoryId, expenseCategories]);

  const reset = () => {
    const now = todayInTz(timezone);
    setRequestId(newKey());
    setDescription('');
    setSupplierId('');
    setStockId(defaultStock?.id ?? '');
    setPurchaseDate(now);
    setRows([newRow()]);
    setCategoryId('');
    setAccountId(eligibleAccounts[0]?.id ?? '');
    setPaymentStatus('paid');
    setPaidDate(now);
    setDueDate('');
    setPaymentMethod('');
    setNotes('');
  };

  const handleOpenChange = (next: boolean) => {
    if (!next && !registerPurchase.isPending) reset();
    onOpenChange(next);
  };

  const updateRow = (key: string, patch: Partial<ItemDraft>) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const parsedItems = rows.map((row) => ({
    inventory_id: row.inventoryId,
    quantity: numberFromText(row.quantityText),
    unit_price: numberFromText(row.unitPriceText),
  }));
  const total = parsedItems.reduce(
    (sum, item) => sum + item.quantity * item.unit_price,
    0,
  );

  const submit = async () => {
    const duplicateMaterial = parsedItems.some((item, index) =>
      !!item.inventory_id
      && parsedItems.findIndex((candidate) => candidate.inventory_id === item.inventory_id) !== index,
    );
    const invalidItem = parsedItems.some((item) =>
      !item.inventory_id || item.quantity <= 0 || item.unit_price < 0,
    );

    let validationMessage = '';
    if (!supplierId) validationMessage = t.validation.supplier;
    else if (!stockId) validationMessage = t.validation.stock;
    else if (!purchaseDate) validationMessage = t.validation.purchaseDate;
    else if (invalidItem || total <= 0) validationMessage = t.validation.items;
    else if (duplicateMaterial) validationMessage = t.validation.duplicateMaterial;
    else if (!categoryId) validationMessage = t.validation.category;
    else if (!accountId) validationMessage = t.validation.account;
    else if (paymentStatus === 'paid' && !paidDate) validationMessage = t.validation.paidDate;
    else if (paymentStatus === 'paid' && !paymentMethod) validationMessage = t.validation.paymentMethod;
    else if (paymentStatus === 'pending' && !dueDate) validationMessage = t.validation.dueDate;

    if (validationMessage) {
      toast({ title: t.validation.title, description: validationMessage, variant: 'destructive' });
      return;
    }

    await registerPurchase.mutateAsync({
      clientRequestId: requestId,
      stockId,
      supplierId,
      items: parsedItems,
      purchaseDate,
      accountId,
      categoryId,
      isPaid: paymentStatus === 'paid',
      paidDate: paymentStatus === 'paid' ? paidDate : null,
      dueDate: paymentStatus === 'pending' ? dueDate : null,
      paymentMethod: paymentStatus === 'paid' ? paymentMethod : null,
      description: description.trim() || null,
      notes: notes.trim() || null,
    });
    reset();
    onOpenChange(false);
  };

  const footer = (
    <div className="flex justify-end gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={registerPurchase.isPending}
        onClick={() => handleOpenChange(false)}
      >
        {t.cancel}
      </Button>
      <Button
        type="button"
        className="gap-1.5"
        disabled={registerPurchase.isPending}
        onClick={() => void submit()}
      >
        <PackagePlus className="h-4 w-4" />
        {registerPurchase.isPending ? t.saving : t.confirm}
      </Button>
    </div>
  );

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={handleOpenChange}
      title={t.title}
      description={t.description}
      className="sm:max-w-[820px]"
      footer={footer}
    >
      <div className="space-y-5 py-1">
        <section className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="direct-purchase-description">{t.fields.description}</Label>
            <Input
              id="direct-purchase-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t.fields.descriptionPlaceholder}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t.fields.supplier} *</Label>
            <SearchableSelect
              options={supplierOptions}
              value={supplierId}
              onValueChange={setSupplierId}
              placeholder={t.fields.supplierPlaceholder}
              searchPlaceholder={t.fields.supplierSearch}
              emptyMessage={t.fields.supplierEmpty}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t.fields.stock} *</Label>
            <Select value={stockId} onValueChange={setStockId}>
              <SelectTrigger><SelectValue placeholder={t.fields.stockPlaceholder} /></SelectTrigger>
              <SelectContent>
                {stocks.map((stock) => (
                  <SelectItem key={stock.id} value={stock.id}>{stock.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t.fields.purchaseDate} *</Label>
            <DatePicker value={purchaseDate} onValueChange={setPurchaseDate} max={today} />
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">{t.items.title}</h3>
              <p className="text-xs text-muted-foreground">{t.items.hint}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setRows((current) => [...current, newRow()])}
            >
              <Plus className="h-4 w-4" /> {t.items.add}
            </Button>
          </div>

          <div className="space-y-2">
            {rows.map((row, index) => {
              const item = inventory.find((candidate) => candidate.id === row.inventoryId);
              const lineTotal = numberFromText(row.quantityText) * numberFromText(row.unitPriceText);
              return (
                <div key={row.key} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-[minmax(0,1fr)_120px_150px_40px] sm:items-end">
                  <div className="space-y-1.5">
                    <Label>{t.items.material} {index + 1}</Label>
                    <InventoryMaterialSelect
                      stockId={stockId || null}
                      value={row.inventoryId}
                      onValueChange={(inventoryId) => updateRow(row.key, { inventoryId })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t.items.quantity}</Label>
                    <NumericInput
                      decimal
                      maxDecimals={4}
                      value={row.quantityText}
                      onValueChange={(quantityText) => updateRow(row.key, { quantityText })}
                      placeholder="0"
                    />
                    {item?.unit && <p className="text-[11px] text-muted-foreground">{item.unit}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t.items.unitPrice}</Label>
                    <NumericInput
                      decimal
                      maxDecimals={2}
                      value={row.unitPriceText}
                      onValueChange={(unitPriceText) => updateRow(row.key, { unitPriceText })}
                      placeholder="0,00"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      {t.items.subtotal}: {formatMoney(lineTotal, currency, locale)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="destructive-ghost"
                    size="icon"
                    disabled={rows.length === 1}
                    onClick={() => setRows((current) => current.filter((candidate) => candidate.key !== row.key))}
                    aria-label={t.items.remove}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2">
            <span className="text-sm font-medium">{t.items.total}</span>
            <span className="text-lg font-bold">{formatMoney(total, currency, locale)}</span>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>{t.fields.category} *</Label>
            <SearchableSelect
              options={categoryOptions}
              value={categoryId}
              onValueChange={setCategoryId}
              placeholder={t.fields.categoryPlaceholder}
              searchPlaceholder={tf.categorySearchPlaceholder}
              emptyMessage={t.fields.categoryEmpty}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t.fields.account} *</Label>
            <SearchableSelect
              options={accountOptions}
              value={accountId}
              onValueChange={setAccountId}
              placeholder={t.fields.accountPlaceholder}
              searchPlaceholder={tf.accountSearchPlaceholder}
              emptyMessage={t.fields.accountEmpty}
            />
          </div>

          {eligibleAccounts.length === 0 && (
            <NoticeBanner variant="warning" className="sm:col-span-2" title={t.noAccount.title}>
              {t.noAccount.description}
            </NoticeBanner>
          )}

          <div className="flex flex-col items-start gap-1.5 sm:col-span-2">
            <Label>{t.fields.paymentStatus}</Label>
            <LabeledSwitch
              value={paymentStatus}
              onChange={(value) => setPaymentStatus(value as PaymentStatus)}
              off={{ value: 'pending', label: t.status.pending }}
              on={{ value: 'paid', label: t.status.paid }}
              aria-label={t.fields.paymentStatus}
            />
          </div>

          {paymentStatus === 'paid' ? (
            <>
              <div className="space-y-1.5">
                <Label>{t.fields.paymentMethod} *</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger><SelectValue placeholder={tf.paymentMethodPlaceholder} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dinheiro">{tf.paymentMethods.dinheiro}</SelectItem>
                    <SelectItem value="pix">{tf.paymentMethods.pix}</SelectItem>
                    <SelectItem value="cartao_debito">{tf.paymentMethods.cartao_debito}</SelectItem>
                    <SelectItem value="transferencia">{tf.paymentMethods.transferencia}</SelectItem>
                    <SelectItem value="boleto">{tf.paymentMethods.boleto}</SelectItem>
                    <SelectItem value="cheque">{tf.paymentMethods.cheque}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t.fields.paidDate} *</Label>
                <DatePicker value={paidDate} onValueChange={setPaidDate} max={today} />
              </div>
            </>
          ) : (
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{t.fields.dueDate} *</Label>
              <DatePicker value={dueDate} onValueChange={setDueDate} />
            </div>
          )}

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="direct-purchase-notes">{t.fields.notes}</Label>
            <Textarea
              id="direct-purchase-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder={t.fields.notesPlaceholder}
              rows={3}
            />
          </div>
        </section>
      </div>
    </ResponsiveModal>
  );
}
