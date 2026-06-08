import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ArrowLeft, Loader2, CreditCard, User, MapPin, ChevronDown, Check, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface CardPaymentFormProps {
  amount: number;
  isLoading: boolean;
  onSubmit: (cardData: {
    holderName: string;
    holderEmail: string;
    number: string;
    expiryMonth: string;
    expiryYear: string;
    ccv: string;
    holderCpf: string;
    holderPhone: string;
    holderPostalCode: string;
    holderAddressNumber: string;
    installmentCount?: number;
    totalAmount: number;
  }) => void;
  onBack: () => void;
  errorMessage?: string | null;
  errorSection?: "card" | "holder" | "address" | null;
  /** Permite parcelar (anual no cartão até 12x). Mensal = 1x fixo. */
  allowInstallments?: boolean;
  initialData?: {
    holderEmail?: string;
    holderPhone?: string;
    holderPostalCode?: string;
    holderAddressNumber?: string;
  };
}

const applyCpfMask = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
};

const applyPhoneMask = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 10) {
    return digits
      .replace(/(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  }
  return digits
    .replace(/(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2");
};

const applyCepMask = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  return digits.replace(/(\d{5})(\d)/, "$1-$2");
};

export function CardPaymentForm({
  amount,
  isLoading,
  onSubmit,
  onBack,
  errorMessage,
  errorSection,
  allowInstallments = false,
  initialData,
}: CardPaymentFormProps) {
  const [formData, setFormData] = useState({
    holderName: "",
    holderEmail: "",
    number: "",
    expiryMonth: "",
    expiryYear: "",
    ccv: "",
    holderCpf: "",
    holderPhone: "",
    holderPostalCode: "",
    holderAddressNumber: "",
    installmentCount: allowInstallments ? 12 : 1,
  });

  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(["card"]));

  const toggleSection = (section: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  const openSectionIfClosed = (section: string) => {
    setOpenSections((prev) => {
      if (prev.has(section)) return prev;
      const next = new Set(prev);
      next.add(section);
      return next;
    });
  };

  useEffect(() => {
    if (initialData) {
      setFormData((prev) => ({
        ...prev,
        holderEmail: initialData.holderEmail || prev.holderEmail,
        holderPhone: initialData.holderPhone ? applyPhoneMask(initialData.holderPhone) : prev.holderPhone,
        holderPostalCode: initialData.holderPostalCode ? applyCepMask(initialData.holderPostalCode) : prev.holderPostalCode,
        holderAddressNumber: initialData.holderAddressNumber || prev.holderAddressNumber,
      }));
    }
  }, [initialData]);

  const isCardSectionComplete = useCallback(
    () =>
      formData.number.replace(/\s/g, "").length >= 13 &&
      formData.holderName.length >= 2 &&
      formData.expiryMonth !== "" &&
      formData.expiryYear !== "" &&
      formData.ccv.length >= 3,
    [formData.number, formData.holderName, formData.expiryMonth, formData.expiryYear, formData.ccv],
  );

  const isHolderSectionComplete = useCallback(
    () =>
      formData.holderCpf.replace(/\D/g, "").length === 11 &&
      /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(formData.holderEmail) &&
      formData.holderPhone.replace(/\D/g, "").length >= 10,
    [formData.holderCpf, formData.holderEmail, formData.holderPhone],
  );

  const isAddressSectionComplete = useCallback(
    () =>
      formData.holderPostalCode.replace(/\D/g, "").length === 8 &&
      formData.holderAddressNumber.length >= 1,
    [formData.holderPostalCode, formData.holderAddressNumber],
  );

  // Abre a próxima seção quando a atual completa
  useEffect(() => {
    if (isCardSectionComplete()) openSectionIfClosed("holder");
  }, [isCardSectionComplete]);

  useEffect(() => {
    if (isHolderSectionComplete()) openSectionIfClosed("address");
  }, [isHolderSectionComplete]);

  // Abre a seção com erro quando o pagamento falha
  useEffect(() => {
    if (errorSection) setOpenSections(new Set([errorSection]));
  }, [errorSection, errorMessage]);

  const handleChange = (field: string, value: string) => {
    let maskedValue = value;
    if (field === "holderCpf") maskedValue = applyCpfMask(value);
    else if (field === "holderPhone") maskedValue = applyPhoneMask(value);
    else if (field === "holderPostalCode") maskedValue = applyCepMask(value);
    else if (field === "number") {
      maskedValue = value
        .replace(/\D/g, "")
        .replace(/(\d{4})(?=\d)/g, "$1 ")
        .trim()
        .slice(0, 19);
    } else if (field === "ccv") maskedValue = value.replace(/\D/g, "").slice(0, 4);

    setFormData((prev) => ({ ...prev, [field]: maskedValue }));
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (formData.number.replace(/\s/g, "").length < 13) errors.number = "Número do cartão inválido";
    if (formData.holderName.length < 2) errors.holderName = "Nome no cartão é obrigatório";
    if (!formData.expiryMonth) errors.expiryMonth = "Selecione o mês";
    if (!formData.expiryYear) errors.expiryYear = "Selecione o ano";
    if (formData.ccv.length < 3) errors.ccv = "CVV inválido";
    if (formData.holderCpf.replace(/\D/g, "").length !== 11) errors.holderCpf = "CPF inválido";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(formData.holderEmail)) errors.holderEmail = "E-mail inválido";
    if (formData.holderPhone.replace(/\D/g, "").length < 10) errors.holderPhone = "Telefone inválido";
    if (formData.holderPostalCode.replace(/\D/g, "").length !== 8) errors.holderPostalCode = "CEP inválido";
    if (!formData.holderAddressNumber.trim()) errors.holderAddressNumber = "Número é obrigatório";

    setValidationErrors(errors);

    if (Object.keys(errors).length > 0) {
      const first = Object.keys(errors)[0];
      if (["number", "holderName", "expiryMonth", "expiryYear", "ccv"].includes(first)) {
        setOpenSections(new Set(["card"]));
      } else if (["holderCpf", "holderEmail", "holderPhone"].includes(first)) {
        setOpenSections(new Set(["holder"]));
      } else {
        setOpenSections(new Set(["address"]));
      }
      toast.error("Preencha todos os campos corretamente");
      return false;
    }
    return true;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    onSubmit({ ...formData, totalAmount: amount });
  };

  const cardComplete = isCardSectionComplete();
  const holderComplete = isHolderSectionComplete();
  const addressComplete = isAddressSectionComplete();

  const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));
  const years = Array.from({ length: 15 }, (_, i) => String(new Date().getFullYear() + i).slice(-2));

  // Parcelas: anual no cartão pode parcelar até 12x SEM juros (mensal×12).
  const installmentOptions = allowInstallments
    ? Array.from({ length: 12 }, (_, i) => {
        const count = i + 1;
        const perInstallment = amount / count;
        return {
          value: count,
          label: `${count}x de R$ ${perInstallment.toFixed(2).replace(".", ",")}${count === 1 ? " (à vista)" : " sem juros"}`,
        };
      })
    : [];

  return (
    <form onSubmit={handleSubmit} className="space-y-5 sm:space-y-4" autoComplete="on">
      <Button type="button" variant="outline" size="sm" onClick={onBack} className="mb-2">
        <ArrowLeft className="h-4 w-4 mr-2" />
        Voltar
      </Button>

      {/* Banner de erro */}
      {errorMessage && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive text-white text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-white" />
          <div className="flex flex-col gap-0.5">
            <span className="font-medium">{errorMessage}</span>
            {errorSection && (
              <span className="text-white/80 text-xs">
                {errorSection === "card" && "Verifique os dados do cartão acima."}
                {errorSection === "holder" && "Verifique os dados do titular acima."}
                {errorSection === "address" && "Verifique o endereço de cobrança acima."}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Seção: dados do cartão */}
      <Collapsible open={openSections.has("card")} onOpenChange={() => toggleSection("card")}>
        <CollapsibleTrigger className="w-full">
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              {cardComplete ? (
                <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                  <Check className="h-3 w-3 text-primary-foreground" />
                </div>
              ) : (
                <CreditCard className="h-4 w-4 text-muted-foreground" />
              )}
              <span className={cn("text-sm font-semibold uppercase tracking-wider", cardComplete ? "text-primary" : "text-foreground")}>
                Dados do cartão
              </span>
            </div>
            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", openSections.has("card") && "rotate-180")} />
          </div>
        </CollapsibleTrigger>
        <Separator />
        <CollapsibleContent className="space-y-2 pt-3 px-1 pb-1 data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up overflow-hidden">
          <Input
            id="cc-number"
            name="cc-number"
            autoComplete="cc-number"
            inputMode="numeric"
            placeholder="Número do cartão"
            value={formData.number}
            onChange={(e) => { handleChange("number", e.target.value); setValidationErrors((p) => ({ ...p, number: "" })); }}
            className={cn(validationErrors.number && "border-destructive")}
          />

          <div className="grid grid-cols-[1fr_1fr_80px] gap-2">
            <Select value={formData.expiryMonth} onValueChange={(v) => handleChange("expiryMonth", v)}>
              <SelectTrigger className={cn(validationErrors.expiryMonth && "border-destructive")}>
                <SelectValue placeholder="MM" />
              </SelectTrigger>
              <SelectContent>
                {months.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={formData.expiryYear} onValueChange={(v) => handleChange("expiryYear", v)}>
              <SelectTrigger className={cn(validationErrors.expiryYear && "border-destructive")}>
                <SelectValue placeholder="AA" />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input
              id="cc-csc"
              name="cc-csc"
              autoComplete="cc-csc"
              inputMode="numeric"
              placeholder="CVV"
              maxLength={4}
              value={formData.ccv}
              onChange={(e) => { handleChange("ccv", e.target.value); setValidationErrors((p) => ({ ...p, ccv: "" })); }}
              className={cn(validationErrors.ccv && "border-destructive")}
            />
          </div>

          <Input
            id="cc-name"
            name="cc-name"
            autoComplete="cc-name"
            placeholder="Nome no cartão"
            value={formData.holderName}
            onChange={(e) => { handleChange("holderName", e.target.value.toUpperCase()); setValidationErrors((p) => ({ ...p, holderName: "" })); }}
            className={cn(validationErrors.holderName && "border-destructive")}
          />

          {allowInstallments && (
            <Select
              value={String(formData.installmentCount)}
              onValueChange={(v) => setFormData((prev) => ({ ...prev, installmentCount: Number(v) }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Parcelas" />
              </SelectTrigger>
              <SelectContent>
                {installmentOptions.map((opt) => (
                  <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* Seção: dados do titular */}
      <Collapsible open={openSections.has("holder")} onOpenChange={() => toggleSection("holder")}>
        <CollapsibleTrigger className="w-full">
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              {holderComplete ? (
                <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                  <Check className="h-3 w-3 text-primary-foreground" />
                </div>
              ) : (
                <User className="h-4 w-4 text-muted-foreground" />
              )}
              <span className={cn("text-sm font-semibold uppercase tracking-wider", holderComplete ? "text-primary" : "text-foreground")}>
                Dados do titular
              </span>
            </div>
            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", openSections.has("holder") && "rotate-180")} />
          </div>
        </CollapsibleTrigger>
        <Separator />
        <CollapsibleContent className="space-y-2 pt-3 px-1 pb-1 data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up overflow-hidden">
          <Input
            id="cpf"
            name="cpf"
            inputMode="numeric"
            placeholder="CPF do titular"
            value={formData.holderCpf}
            onChange={(e) => { handleChange("holderCpf", e.target.value); setValidationErrors((p) => ({ ...p, holderCpf: "" })); }}
            className={cn(validationErrors.holderCpf && "border-destructive")}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="Email"
              value={formData.holderEmail}
              onChange={(e) => { handleChange("holderEmail", e.target.value); setValidationErrors((p) => ({ ...p, holderEmail: "" })); }}
              className={cn(validationErrors.holderEmail && "border-destructive")}
            />
            <Input
              id="tel"
              name="tel"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              placeholder="Telefone"
              value={formData.holderPhone}
              onChange={(e) => { handleChange("holderPhone", e.target.value); setValidationErrors((p) => ({ ...p, holderPhone: "" })); }}
              className={cn(validationErrors.holderPhone && "border-destructive")}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Seção: endereço de cobrança */}
      <Collapsible open={openSections.has("address")} onOpenChange={() => toggleSection("address")}>
        <CollapsibleTrigger className="w-full">
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              {addressComplete ? (
                <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                  <Check className="h-3 w-3 text-primary-foreground" />
                </div>
              ) : (
                <MapPin className="h-4 w-4 text-muted-foreground" />
              )}
              <span className={cn("text-sm font-semibold uppercase tracking-wider", addressComplete ? "text-primary" : "text-foreground")}>
                Endereço de cobrança
              </span>
            </div>
            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", openSections.has("address") && "rotate-180")} />
          </div>
        </CollapsibleTrigger>
        <Separator />
        <CollapsibleContent className="space-y-2 pt-3 px-1 pb-1 data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up overflow-hidden">
          <div className="grid grid-cols-2 gap-2">
            <Input
              id="postal-code"
              name="postal-code"
              autoComplete="postal-code"
              inputMode="numeric"
              placeholder="CEP"
              maxLength={9}
              value={formData.holderPostalCode}
              onChange={(e) => { handleChange("holderPostalCode", e.target.value); setValidationErrors((p) => ({ ...p, holderPostalCode: "" })); }}
              className={cn("font-mono", validationErrors.holderPostalCode && "border-destructive")}
            />
            <Input
              id="address-number"
              name="address-line2"
              autoComplete="address-line2"
              placeholder="Número"
              value={formData.holderAddressNumber}
              onChange={(e) => { handleChange("holderAddressNumber", e.target.value); setValidationErrors((p) => ({ ...p, holderAddressNumber: "" })); }}
              className={cn(validationErrors.holderAddressNumber && "border-destructive")}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>

      <p className="text-xs text-muted-foreground/70 text-center">
        Ao confirmar, seu cartão será cobrado automaticamente todo {allowInstallments ? "ano" : "mês"} no valor da assinatura. Você pode cancelar a qualquer momento na tela de Assinatura.
      </p>

      <Button type="submit" className="w-full h-14 text-base font-bold" disabled={isLoading}>
        {isLoading ? (
          <>
            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
            Processando...
          </>
        ) : (
          `Pagar R$ ${amount.toFixed(2).replace(".", ",")} e ativar recorrência`
        )}
      </Button>
    </form>
  );
}
