import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useIsMobile } from '@/hooks/use-mobile';
import { useCustomers } from '@/hooks/useCustomers';
import { useQuotes, type QuoteInput, type QuoteItem, type Quote } from '@/hooks/useQuotes';
import { QuoteItemsTable } from './QuoteItemsTable';
import { SearchableSelect } from '@/components/ui/SearchableSelect';

interface QuoteFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quote?: Quote | null;
}

export function QuoteFormDialog({ open, onOpenChange, quote }: QuoteFormDialogProps) {
  const isMobile = useIsMobile();
  const { customers } = useCustomers();
  const { createQuote, updateQuote } = useQuotes();

  const [customerId, setCustomerId] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [discountType, setDiscountType] = useState('valor');
  const [discountValue, setDiscountValue] = useState(0);
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('');
  const [items, setItems] = useState<QuoteItem[]>([]);

  useEffect(() => {
    if (quote) {
      setCustomerId(quote.customer_id);
      setValidUntil(quote.valid_until ?? '');
      setDiscountType(quote.discount_type ?? 'valor');
      setDiscountValue(quote.discount_value ?? 0);
      setNotes(quote.notes ?? '');
      setTerms(quote.terms ?? '');
      setItems(quote.quote_items ?? []);
    } else {
      setCustomerId('');
      setValidUntil('');
      setDiscountType('valor');
      setDiscountValue(0);
      setNotes('');
      setTerms('');
      setItems([]);
    }
  }, [quote, open]);

  const subtotal = items.reduce((s, i) => s + (i.quantity * i.unit_price), 0);
  const discountAmount = discountType === 'percentual'
    ? subtotal * (discountValue / 100)
    : discountValue;
  const totalValue = Math.max(0, subtotal - discountAmount);

  const customerOptions = useMemo(
    () => (customers ?? []).map(c => ({ value: c.id, label: c.name })),
    [customers]
  );

  const handleSubmit = () => {
    if (!customerId || items.length === 0) return;

    const payload: QuoteInput = {
      customer_id: customerId,
      valid_until: validUntil || undefined,
      discount_type: discountType,
      discount_value: discountValue,
      subtotal,
      discount_amount: discountAmount,
      total_value: totalValue,
      notes: notes || undefined,
      terms: terms || undefined,
      items,
    };

    if (quote) {
      updateQuote.mutate({ ...payload, id: quote.id }, { onSuccess: () => onOpenChange(false) });
    } else {
      createQuote.mutate(payload, { onSuccess: () => onOpenChange(false) });
    }
  };

  const content = (
    <div className="space-y-5 p-1 max-h-[70vh] overflow-y-auto">
      <div className="space-y-2">
        <Label>Cliente *</Label>
        <SearchableSelect
          options={customerOptions}
          value={customerId}
          onValueChange={setCustomerId}
          placeholder="Selecione o cliente"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Válido até</Label>
          <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Desconto</Label>
          <div className="flex gap-2">
            <Select value={discountType} onValueChange={setDiscountType}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="valor">R$</SelectItem>
                <SelectItem value="percentual">%</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="number"
              value={discountValue || ''}
              onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)}
              min={0}
              step="0.01"
            />
          </div>
        </div>
      </div>

      <QuoteItemsTable items={items} onChange={setItems} />

      <div className="flex flex-col items-end gap-1 text-sm border-t pt-3">
        {discountAmount > 0 && (
          <span className="text-muted-foreground">
            Desconto: <span className="font-medium text-destructive">- R$ {discountAmount.toFixed(2)}</span>
          </span>
        )}
        <span className="text-foreground font-bold text-base">
          Total: R$ {totalValue.toFixed(2)}
        </span>
      </div>

      <div className="space-y-2">
        <Label>Observações</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observações internas" rows={2} />
      </div>

      <div className="space-y-2">
        <Label>Condições / Termos</Label>
        <Textarea value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="Condições de pagamento, garantia, etc." rows={2} />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
        <Button
          onClick={handleSubmit}
          disabled={!customerId || items.length === 0 || createQuote.isPending || updateQuote.isPending}
        >
          {quote ? 'Salvar Alterações' : 'Criar Orçamento'}
        </Button>
      </div>
    </div>
  );

  const title = quote ? `Editar Orçamento #${quote.quote_number}` : 'Novo Orçamento';

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[90vh]">
          <DrawerHeader><DrawerTitle>{title}</DrawerTitle></DrawerHeader>
          <div className="px-4 pb-4">{content}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
}
