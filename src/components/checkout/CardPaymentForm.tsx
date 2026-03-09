import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Loader2, CreditCard, User, MapPin, AlertTriangle } from "lucide-react";
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
}

const INTEREST_RATE = 0.0299;

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
    installmentCount: 1,
  });

  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const handleChange = (field: string, value: string) => {
    let maskedValue = value;

    if (field === "holderCpf") {
      maskedValue = applyCpfMask(value);
    } else if (field === "holderPhone") {
      maskedValue = applyPhoneMask(value);
    } else if (field === "holderPostalCode") {
      maskedValue = applyCepMask(value);
    } else if (field === "number") {
      maskedValue = value
        .replace(/\D/g, "")
        .replace(/(\d{4})(?=\d)/g, "$1 ")
        .trim()
        .slice(0, 19);
    } else if (field === "ccv") {
      maskedValue = value.replace(/\D/g, "").slice(0, 4);
    }

    setFormData((prev) => ({ ...prev, [field]: maskedValue }));
  };

  const getCalculatedAmount = () => {
    const installments = formData.installmentCount;
    if (installments === 1) return amount;
    return amount * Math.pow(1 + INTEREST_RATE, installments);
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
      toast.error("Preencha todos os campos corretamente");
      return false;
    }
    return true;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    onSubmit({
      ...formData,
      totalAmount: getCalculatedAmount(),
    });
  };

  const currentTotalAmount = getCalculatedAmount();
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 15 }, (_, i) => currentYear + i);
  const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0"));

  const installmentOptions = Array.from({ length: 12 }, (_, i) => {
    const count = i + 1;
    if (count === 1) {
      return { value: count, label: `1x de R$ ${amount.toFixed(2).replace(".", ",")} (sem juros)` };
    }
    const total = amount * Math.pow(1 + INTEREST_RATE, count);
    const perInstallment = total / count;
    return { value: count, label: `${count}x de R$ ${perInstallment.toFixed(2).replace(".", ",")}` };
  });

  return (
    <form onSubmit={handleSubmit} className="space-y-5" autoComplete="on">
      <Button type="button" variant="outline" size="sm" onClick={onBack} className="mb-2">
        <ArrowLeft className="h-4 w-4 mr-2" />
        Voltar
      </Button>

      {/* Card Data */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <CreditCard className="h-4 w-4 text-muted-foreground" />
          <span>Dados do cartão</span>
        </div>
        <Separator />

        <div>
          <Input
            placeholder="Número do cartão"
            value={formData.number}
            onChange={(e) => handleChange("number", e.target.value)}
            className={cn(validationErrors.number && "border-destructive")}
            inputMode="numeric"
          />
        </div>

        <div>
          <Input
            placeholder="Nome impresso no cartão"
            value={formData.holderName}
            onChange={(e) => handleChange("holderName", e.target.value.toUpperCase())}
            className={cn(validationErrors.holderName && "border-destructive")}
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Select value={formData.expiryMonth} onValueChange={(v) => handleChange("expiryMonth", v)}>
            <SelectTrigger className={cn(validationErrors.expiryMonth && "border-destructive")}>
              <SelectValue placeholder="Mês" />
            </SelectTrigger>
            <SelectContent>
              {months.map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={formData.expiryYear} onValueChange={(v) => handleChange("expiryYear", v)}>
            <SelectTrigger className={cn(validationErrors.expiryYear && "border-destructive")}>
              <SelectValue placeholder="Ano" />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            placeholder="CVV"
            value={formData.ccv}
            onChange={(e) => handleChange("ccv", e.target.value)}
            className={cn(validationErrors.ccv && "border-destructive")}
            inputMode="numeric"
            maxLength={4}
          />
        </div>

        <div>
          <Select value={String(formData.installmentCount)} onValueChange={(v) => setFormData(prev => ({ ...prev, installmentCount: Number(v) }))}>
            <SelectTrigger>
              <SelectValue placeholder="Parcelas" />
            </SelectTrigger>
            <SelectContent>
              {installmentOptions.map((opt) => (
                <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Holder Data */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <User className="h-4 w-4 text-muted-foreground" />
          <span>Dados do titular</span>
        </div>
        <Separator />

        <Input
          placeholder="CPF do titular"
          value={formData.holderCpf}
          onChange={(e) => handleChange("holderCpf", e.target.value)}
          className={cn(validationErrors.holderCpf && "border-destructive")}
        />

        <Input
          placeholder="E-mail"
          type="email"
          value={formData.holderEmail}
          onChange={(e) => handleChange("holderEmail", e.target.value)}
          className={cn(validationErrors.holderEmail && "border-destructive")}
        />

        <Input
          placeholder="Telefone"
          value={formData.holderPhone}
          onChange={(e) => handleChange("holderPhone", e.target.value)}
          className={cn(validationErrors.holderPhone && "border-destructive")}
        />
      </div>

      {/* Address */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          <span>Endereço de cobrança</span>
        </div>
        <Separator />

        <div className="grid grid-cols-2 gap-2">
          <Input
            placeholder="CEP"
            value={formData.holderPostalCode}
            onChange={(e) => handleChange("holderPostalCode", e.target.value)}
            className={cn(validationErrors.holderPostalCode && "border-destructive")}
          />
          <Input
            placeholder="Número"
            value={formData.holderAddressNumber}
            onChange={(e) => handleChange("holderAddressNumber", e.target.value)}
            className={cn(validationErrors.holderAddressNumber && "border-destructive")}
          />
        </div>
      </div>

      {/* Summary */}
      <div className="p-4 rounded-lg bg-muted/50 border space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Valor</span>
          <span>R$ {amount.toFixed(2).replace(".", ",")}</span>
        </div>
        {formData.installmentCount > 1 && (
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Juros ({formData.installmentCount}x)</span>
            <span>R$ {(currentTotalAmount - amount).toFixed(2).replace(".", ",")}</span>
          </div>
        )}
        <Separator />
        <div className="flex justify-between font-bold">
          <span>Total</span>
          <span>R$ {currentTotalAmount.toFixed(2).replace(".", ",")}</span>
        </div>
      </div>

      <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Processando...
          </>
        ) : (
          `Pagar R$ ${currentTotalAmount.toFixed(2).replace(".", ",")}`
        )}
      </Button>
    </form>
  );
}
