import { useMemo, useState, useEffect } from 'react';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon';
import { EmptyState } from '@/components/mobile/EmptyState';
import { Loader2, Copy, Check, CheckCircle2, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useCustomers } from '@/hooks/useCustomers';
import {
  useTenantCharges,
  buildCheckoutUrl,
  type TenantChargeBillingType,
  type CreateChargeResult,
} from '@/hooks/useTenantCharges';
import { buildWhatsAppLink } from '@/utils/shareLinks';
import { formatBRL } from '@/utils/currency';

interface ChargeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Quando informado, o select de cliente começa pré-preenchido com este ID. */
  presetCustomerId?: string;
  /** Quando true, o select de cliente fica travado (não editável) para manter
   *  o contexto do cliente que está sendo visualizado. */
  lockCustomer?: boolean;
}

type Method = 'PIX' | 'BOLETO' | 'BOTH';

// O método "ambos" (Pix e boleto) mapeia para o `UNDEFINED` do Asaas — o cliente
// escolhe a forma no checkout. Pix/Boleto puros travam a forma na cobrança.
function methodToBillingType(method: Method): TenantChargeBillingType {
  if (method === 'PIX') return 'PIX';
  if (method === 'BOLETO') return 'BOLETO';
  return 'UNDEFINED';
}

/** Data de hoje em ISO (yyyy-mm-dd) no fuso local, sem virar o dia por UTC. */
function todayISO(): string {
  const d = new Date();
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}

export function ChargeDialog({ open, onOpenChange, presetCustomerId, lockCustomer }: ChargeDialogProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.charges.cobrar;
  const { toast } = useToast();

  const { customers } = useCustomers();
  const { create } = useTenantCharges();

  // Estado do formulário
  const [customerId, setCustomerId] = useState(presetCustomerId ?? '');
  const [amount, setAmount] = useState(0); // em reais (número), máscara de centavos
  const [dueDate, setDueDate] = useState(todayISO());
  const [description, setDescription] = useState('');
  const [method, setMethod] = useState<Method>('BOTH');

  // Resultado (link gerado) — resultado normalizado da mutation
  const [result, setResult] = useState<CreateChargeResult | null>(null);
  const [copied, setCopied] = useState(false);

  // Helper derivado do resultado normalizado
  const isOrphan = result?.orphan === true;

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === customerId) ?? null,
    [customers, customerId],
  );

  // Sincroniza o cliente pré-selecionado quando o dialog abre com novo preset.
  useEffect(() => {
    if (open && presetCustomerId) {
      setCustomerId(presetCustomerId);
    }
  }, [open, presetCustomerId]);

  const resetForm = () => {
    setCustomerId(presetCustomerId ?? '');
    setAmount(0);
    setDueDate(todayISO());
    setDescription('');
    setMethod('BOTH');
    setResult(null);
    setCopied(false);
  };

  // URL exibida no bloco de resultado — checkout próprio no caso normal,
  // invoice_url do Asaas no caso órfão.
  const displayUrl = (() => {
    if (!result) return '';
    if (result.orphan === true) return result.invoiceUrl;
    if (result.orphan === false) {
      const { charge } = result;
      return charge.checkout_url || (charge.public_short_code ? buildCheckoutUrl(charge.public_short_code) : '');
    }
    return '';
  })();

  const handleClose = (next: boolean) => {
    if (!next) resetForm();
    onOpenChange(next);
  };

  // Máscara de dinheiro (centavos): digita só dígitos, formata em reais.
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    setAmount(parseInt(raw || '0', 10) / 100);
  };
  const amountDisplay = amount
    ? amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '';

  const handleSubmit = async () => {
    if (!customerId) {
      toast({ variant: 'destructive', title: t.validation.customerRequired });
      return;
    }
    if (!amount || amount <= 0) {
      toast({ variant: 'destructive', title: t.validation.valueRequired });
      return;
    }
    if (!dueDate) {
      toast({ variant: 'destructive', title: t.validation.dueDateRequired });
      return;
    }
    try {
      const chargeResult = await create.mutateAsync({
        customer_id: customerId,
        value: amount,
        due_date: dueDate,
        billing_type: methodToBillingType(method),
        description: description.trim() || undefined,
      });
      setResult(chargeResult);
      toast({ title: t.success.title, description: t.success.description });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: t.dialogTitle,
        description: err instanceof Error ? err.message : t.error,
      });
    }
  };

  const handleCopy = async () => {
    if (!displayUrl) return;
    try {
      await navigator.clipboard.writeText(displayUrl);
      setCopied(true);
      toast({ title: t.success.copied });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API indisponível (contexto não-seguro, permissão negada) —
      // avisa o usuário para copiar manualmente.
      toast({ variant: 'destructive', title: t.copyFallback });
    }
  };

  const handleSendWhatsapp = () => {
    if (!result) return;
    // No caso órfão não há `charge`, usamos o `amount` do formulário (estado local).
    const chargeValue = result.orphan || !('charge' in result) ? amount : result.charge.value;
    const valueLabel = formatBRL(chargeValue);
    const descPart = description.trim() ? ` (${description.trim()})` : '';
    const message = `${t.whatsappMessage
      .replace('{value}', valueLabel)
      .replace('{description}', descPart)}\n${displayUrl}`;
    const phone = selectedCustomer?.celular || selectedCustomer?.phone || '';
    const link = buildWhatsAppLink(phone, message);
    // Sem telefone válido: abre o WhatsApp Web sem destinatário com o texto pronto.
    window.open(link ?? `https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={handleClose}
      title={t.dialogTitle}
      description={t.dialogDescription}
    >
      <div className="space-y-4 px-4 pb-4 sm:px-1">
        {!result ? (
          <>
            {/* Estado "sem clientes": orienta o usuário, não mostra select vazio */}
            {customers.length === 0 ? (
              <div className="py-2">
                <EmptyState
                  icon={<Users className="h-full w-full" />}
                  title={t.noCustomers.title}
                  description={t.noCustomers.description}
                />
              </div>
            ) : (
            <>
            {/* Cliente */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">{t.fields.customer}</Label>
              {lockCustomer && presetCustomerId ? (
                // Travado: exibe o nome do cliente sem permitir troca.
                <div className="flex h-10 w-full items-center rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground">
                  {customers.find((c) => c.id === presetCustomerId)?.name ?? presetCustomerId}
                </div>
              ) : (
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t.fields.customerPlaceholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Valor (máscara de dinheiro, NÃO NumericInput) */}
            <div className="space-y-2">
              <Label htmlFor="charge-amount" className="text-sm font-medium">
                {t.fields.value}
              </Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  R$
                </span>
                <Input
                  id="charge-amount"
                  className="pl-9"
                  inputMode="numeric"
                  placeholder={t.fields.valuePlaceholder}
                  value={amountDisplay}
                  onChange={handleAmountChange}
                />
              </div>
            </div>

            {/* Vencimento */}
            <div className="space-y-2">
              <Label htmlFor="charge-due" className="text-sm font-medium">
                {t.fields.dueDate}
              </Label>
              <Input
                id="charge-due"
                type="date"
                value={dueDate}
                min={todayISO()}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>

            {/* Método */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">{t.fields.method}</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as Method)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BOTH">{t.methods.both}</SelectItem>
                  <SelectItem value="PIX">{t.methods.pix}</SelectItem>
                  <SelectItem value="BOLETO">{t.methods.boleto}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Descrição */}
            <div className="space-y-2">
              <Label htmlFor="charge-desc" className="text-sm font-medium">
                {t.fields.description}
              </Label>
              <Textarea
                id="charge-desc"
                rows={2}
                placeholder={t.fields.descriptionPlaceholder}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => handleClose(false)} disabled={create.isPending}>
                {t.cancel}
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={create.isPending || !customerId || !amount || amount <= 0}
              >
                {create.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t.submitting}
                  </>
                ) : (
                  t.submit
                )}
              </Button>
            </div>
            </>
            )}
          </>
        ) : (
          /* ── Sucesso: link + copiar + WhatsApp ─────────────────────────── */
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-emerald-600">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <p className="text-sm font-semibold">{t.success.title}</p>
            </div>

            {/* Aviso discreto no caso órfão (207): sem checkout próprio, usar invoice_url do Asaas */}
            {isOrphan && result ? (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                {result.orphan && result.warning ? result.warning : t.orphan.notice}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">{t.success.description}</p>
            )}

            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {isOrphan ? t.orphan.linkLabel : t.success.linkLabel}
              </Label>
              <div className="flex items-center gap-2">
                <Input readOnly value={displayUrl} className="text-sm" />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleCopy}
                  aria-label={t.success.copy}
                  className="shrink-0"
                >
                  {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <Button
                type="button"
                onClick={handleSendWhatsapp}
                className="bg-[#25D366] hover:bg-[#1fb955] text-white"
              >
                <WhatsAppIcon className="mr-2 h-4 w-4" />
                {t.success.sendWhatsapp}
              </Button>
              <Button type="button" variant="outline" onClick={resetForm}>
                {t.success.newCharge}
              </Button>
              <Button type="button" variant="ghost" onClick={() => handleClose(false)}>
                {t.success.close}
              </Button>
            </div>
          </div>
        )}
      </div>
    </ResponsiveModal>
  );
}
