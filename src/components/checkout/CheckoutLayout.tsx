import { Shield, Lock, QrCode, FileText, CreditCard as CreditCardIcon, Loader2, Check, ArrowLeft, Calendar, XCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { cpfCnpjMask } from "@/utils/masks";
import { useState } from "react";
import { motion } from "framer-motion";
import logoWhite from "@/assets/logo-white-horizontal.png";
import logoDark from "@/assets/logo-horizontal-verde.png";
import { PixPaymentView } from "./PixPaymentView";
import { BoletoPaymentView } from "./BoletoPaymentView";
import { CardPaymentForm } from "./CardPaymentForm";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { useTheme } from "next-themes";

type PaymentMethod = "pix" | "boleto" | "card" | null;

interface PaymentData {
  payment_id?: string;
  pix_qr_code?: string;
  pix_copy_paste?: string;
  pix_expiration_date?: string;
  invoice_url?: string;
  bank_slip_url?: string;
  identification_field?: string;
  due_date?: string;
  status?: string;
}

interface CheckoutLayoutProps {
  planName: string;
  planPrice: number;
  finalPrice: number;
  billingCycle: "monthly" | "yearly";
  features: string[];
  maxUsers: number;
  cpfCnpj: string;
  onCpfCnpjChange: (value: string) => void;
  paymentMethod: PaymentMethod;
  paymentData: PaymentData | null;
  isCreatingPayment: boolean;
  onPaymentMethodSelect: (method: PaymentMethod) => void;
  onCreatePayment: (method: PaymentMethod, cardData?: any) => void;
  onClearPayment: () => void;
  paymentSuccess?: boolean;
  nextDueDate?: string | null;
  companyName?: string;
  userEmail?: string;
  isLoading?: boolean;
}

// Simple CPF/CNPJ validation
const validateCPF = (cpf: string): boolean => {
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11 || /^(\d)\1+$/.test(digits)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(digits[i]) * (10 - i);
  let check = (sum * 10) % 11;
  if (check === 10) check = 0;
  if (check !== parseInt(digits[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(digits[i]) * (11 - i);
  check = (sum * 10) % 11;
  if (check === 10) check = 0;
  return check === parseInt(digits[10]);
};

const validateCNPJ = (cnpj: string): boolean => {
  const digits = cnpj.replace(/\D/g, "");
  if (digits.length !== 14 || /^(\d)\1+$/.test(digits)) return false;
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += parseInt(digits[i]) * weights1[i];
  let check = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (check !== parseInt(digits[12])) return false;
  sum = 0;
  for (let i = 0; i < 13; i++) sum += parseInt(digits[i]) * weights2[i];
  check = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  return check === parseInt(digits[13]);
};

export function CheckoutLayout({
  planName,
  planPrice,
  finalPrice,
  billingCycle,
  features,
  maxUsers,
  cpfCnpj,
  onCpfCnpjChange,
  paymentMethod,
  paymentData,
  isCreatingPayment,
  onPaymentMethodSelect,
  onCreatePayment,
  onClearPayment,
  paymentSuccess,
  nextDueDate,
  companyName,
  userEmail,
  isLoading,
}: CheckoutLayoutProps) {
  const navigate = useNavigate();
  const { resolvedTheme } = useTheme();
  const cpfCnpjClean = cpfCnpj.replace(/\D/g, "");
  const isCpfCnpjValid = cpfCnpjClean.length === 11 
    ? validateCPF(cpfCnpjClean) 
    : cpfCnpjClean.length === 14 
      ? validateCNPJ(cpfCnpjClean) 
      : false;

  const cpfCnpjError = cpfCnpjClean.length >= 11 && !isCpfCnpjValid 
    ? (cpfCnpjClean.length <= 11 ? "CPF inválido" : "CNPJ inválido")
    : null;

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <div className="flex-1 flex flex-col lg:flex-row">
          <div className="lg:w-[45%] bg-gray-950 p-6 lg:p-12 flex flex-col justify-center">
            <div className="max-w-md mx-auto w-full space-y-6">
              <Skeleton className="h-10 w-32 bg-white/10" />
              <Skeleton className="h-6 w-24 bg-white/10" />
              <Skeleton className="h-8 w-48 bg-white/10" />
              <Skeleton className="h-12 w-40 bg-white/10" />
              <div className="space-y-3">
                {[1,2,3].map(i => <Skeleton key={i} className="h-5 w-full bg-white/10" />)}
              </div>
            </div>
          </div>
          <div className="lg:w-[55%] bg-background p-6 lg:p-12 flex flex-col justify-center">
            <div className="max-w-lg mx-auto w-full space-y-6">
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-10 w-full" />
              <div className="grid grid-cols-3 gap-3">
                {[1,2,3].map(i => <Skeleton key={i} className="h-20" />)}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 flex flex-col lg:flex-row">
        {/* Left - Dark summary */}
        <motion.div 
          className="lg:w-[45%] bg-gray-950 text-white p-6 lg:p-12 flex flex-col justify-center"
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="max-w-md mx-auto w-full space-y-8">
            <div className="flex items-center gap-3">
              <img src={logoWhite} alt="Dominex" className="h-10" />
            </div>
            <button
              onClick={() => navigate("/checkout")}
              className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors text-sm -mt-4"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Voltar</span>
            </button>

            <div className="space-y-6">
              {companyName && (
                <p className="text-lg font-bold text-white">{companyName}</p>
              )}
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-widest">Resumo da assinatura</p>
                <h2 className="text-2xl font-bold mt-1">{planName}</h2>
              </div>

              <div className="space-y-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold">
                    R$ {finalPrice.toFixed(2).replace(".", ",")}
                  </span>
                  <span className="text-gray-400">/{billingCycle === "yearly" ? "ano" : "mês"}</span>
                </div>
                {billingCycle === "yearly" && (
                  <p className="text-sm text-emerald-400">
                    Equivale a R$ {(finalPrice / 12).toFixed(2).replace(".", ",")}/mês · 20% de desconto
                  </p>
                )}
              </div>

              <div className="space-y-3">
                {nextDueDate && (
                  <div className="flex items-center gap-2.5 text-sm bg-white/5 rounded-lg px-3 py-2.5">
                    <Calendar className="h-4 w-4 text-emerald-400 shrink-0" />
                    <span>Próximo vencimento: <span className="font-semibold">{format(new Date(nextDueDate), "dd/MM/yyyy")}</span></span>
                  </div>
                )}
              </div>

              <div className="border-t border-white/10" />

              <div className="space-y-3">
                <p className="text-xs text-gray-400 uppercase tracking-widest">O que está incluso</p>
                <div className="flex items-center gap-3 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span>{maxUsers} usuário{maxUsers > 1 ? "s" : ""}</span>
                </div>
                {features.map((feature, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Right - Payment */}
        <motion.div 
          className="lg:w-[55%] bg-background p-6 lg:p-12 flex flex-col justify-center"
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
        >
          <div className="max-w-lg mx-auto w-full space-y-6">
            {paymentSuccess ? (
              <div className="text-center py-12 space-y-6">
                <div className="w-20 h-20 mx-auto rounded-full bg-emerald-500 flex items-center justify-center animate-in zoom-in-50 duration-500">
                  <Check className="h-10 w-10 text-white" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-bold">Pagamento Confirmado!</h3>
                  <p className="text-muted-foreground">Sua assinatura foi ativada com sucesso.</p>
                </div>
                <p className="text-sm text-muted-foreground">Redirecionando para o sistema...</p>
                <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
              </div>
            ) : (
              <>
                <div>
                  <h2 className="text-xl font-semibold">Pagamento</h2>
                  <p className="text-sm text-muted-foreground mt-0.5">Preencha seus dados para finalizar</p>
                </div>

                {!paymentMethod && (
                  <div className="space-y-5">
                    <div>
                      <Label className="text-sm font-semibold text-foreground">CPF ou CNPJ *</Label>
                      <Input
                        value={cpfCnpj}
                        onChange={(e) => onCpfCnpjChange(cpfCnpjMask(e.target.value))}
                        placeholder="000.000.000-00 ou 00.000.000/0000-00"
                        maxLength={18}
                        className={cn("mt-1", cpfCnpjError && "border-destructive")}
                      />
                      {cpfCnpjError ? (
                        <p className="text-xs text-destructive mt-1">{cpfCnpjError}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground mt-1">Necessário para emissão da cobrança</p>
                      )}
                    </div>

                    <div className="space-y-3">
                      <Label className="text-base font-semibold text-foreground">Forma de pagamento</Label>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <Button
                          variant="outline"
                          className={cn(
                            "group relative flex flex-row sm:flex-col items-center gap-3 sm:gap-2 h-auto py-3 sm:py-4 px-4 sm:px-2 justify-start sm:justify-center transition-all duration-200",
                            "hover:bg-blue-500 hover:border-blue-500 hover:text-white hover:shadow-lg border-primary/30",
                            !isCpfCnpjValid && "opacity-50 cursor-not-allowed"
                          )}
                          disabled={!isCpfCnpjValid || isCreatingPayment}
                          onClick={() => onPaymentMethodSelect("card")}
                        >
                          <CreditCardIcon className="h-6 w-6" />
                          <div className="flex flex-col items-start sm:items-center">
                            <span className="text-sm font-bold">Cartão de Crédito</span>
                            <span className="text-xs text-muted-foreground group-hover:text-white/80 transition-colors">Em até 12x</span>
                          </div>
                          <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none hidden sm:inline-flex">
                            RECOMENDADO
                          </span>
                        </Button>

                        <Button
                          variant="outline"
                          className={cn(
                            "group flex flex-row sm:flex-col items-center gap-3 sm:gap-2 h-auto py-3 sm:py-4 px-4 sm:px-2 justify-start sm:justify-center transition-all duration-200",
                            "hover:bg-emerald-500 hover:border-emerald-500 hover:text-white hover:shadow-lg",
                            !isCpfCnpjValid && "opacity-50 cursor-not-allowed"
                          )}
                          disabled={!isCpfCnpjValid || isCreatingPayment}
                          onClick={() => onCreatePayment("pix")}
                        >
                          {isCreatingPayment && paymentMethod === "pix" ? <Loader2 className="h-6 w-6 animate-spin" /> : <QrCode className="h-6 w-6" />}
                          <div className="flex flex-col items-start sm:items-center">
                            <span className="text-sm font-bold">PIX</span>
                            <span className="text-xs text-muted-foreground group-hover:text-white/80 transition-colors">Instantâneo</span>
                          </div>
                        </Button>

                        <Button
                          variant="outline"
                          className={cn(
                            "group flex flex-row sm:flex-col items-center gap-3 sm:gap-2 h-auto py-3 sm:py-4 px-4 sm:px-2 justify-start sm:justify-center transition-all duration-200",
                            "hover:bg-orange-500 hover:border-orange-500 hover:text-white hover:shadow-lg",
                            !isCpfCnpjValid && "opacity-50 cursor-not-allowed"
                          )}
                          disabled={!isCpfCnpjValid || isCreatingPayment}
                          onClick={() => onCreatePayment("boleto")}
                        >
                          {isCreatingPayment && paymentMethod === "boleto" ? <Loader2 className="h-6 w-6 animate-spin" /> : <FileText className="h-6 w-6" />}
                          <div className="flex flex-col items-start sm:items-center">
                            <span className="text-sm font-bold">Boleto</span>
                            <span className="text-xs text-muted-foreground group-hover:text-white/80 transition-colors">1-2 dias úteis</span>
                          </div>
                        </Button>
                      </div>
                      {!isCpfCnpjValid && cpfCnpj.length > 0 && !cpfCnpjError && (
                        <p className="text-xs text-muted-foreground">Preencha o CPF ou CNPJ completo para continuar</p>
                      )}
                    </div>
                  </div>
                )}

                {paymentMethod === "pix" && !paymentData && isCreatingPayment && (
                  <div className="flex flex-col items-center justify-center py-12 gap-4">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    <p className="text-muted-foreground">Gerando QR Code PIX...</p>
                  </div>
                )}

                {paymentMethod === "pix" && paymentData && (
                  <PixPaymentView
                    pixQrCode={paymentData.pix_qr_code}
                    pixCopyPaste={paymentData.pix_copy_paste}
                    pixExpirationDate={paymentData.pix_expiration_date}
                    isLoading={isCreatingPayment}
                    onBack={onClearPayment}
                  />
                )}

                {paymentMethod === "boleto" && !paymentData && isCreatingPayment && (
                  <div className="flex flex-col items-center justify-center py-12 gap-4">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    <p className="text-muted-foreground">Gerando boleto...</p>
                  </div>
                )}

                {paymentMethod === "boleto" && paymentData && (
                  <BoletoPaymentView
                    invoiceUrl={paymentData.invoice_url}
                    bankSlipUrl={paymentData.bank_slip_url}
                    identificationField={paymentData.identification_field}
                    dueDate={paymentData.due_date}
                    isLoading={false}
                    onBack={onClearPayment}
                  />
                )}

                {paymentMethod === "card" && !paymentData && (
                  <CardPaymentForm
                    amount={finalPrice}
                    isLoading={isCreatingPayment}
                    onSubmit={(cardData) => onCreatePayment("card", cardData)}
                    onBack={onClearPayment}
                  />
                )}

                {paymentMethod === "card" && paymentData && (
                  <div className="text-center py-8 space-y-4">
                    <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/20 flex items-center justify-center">
                      <Check className="h-8 w-8 text-emerald-500" />
                    </div>
                    <h3 className="text-xl font-semibold">Pagamento Processado!</h3>
                    <p className="text-muted-foreground">Aguarde, você será redirecionado...</p>
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
                  </div>
                )}
              </>
            )}
          </div>
        </motion.div>
      </div>

      {/* Footer */}
      <footer className="bg-gray-950 text-gray-400 border-t border-white/10">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex flex-wrap items-center justify-center gap-4 mb-4">
            <div className="flex items-center gap-2 text-xs">
              <Shield className="h-4 w-4 text-emerald-400" />
              <span>Pagamento Seguro</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Lock className="h-4 w-4 text-emerald-400" />
              <span>Criptografia SSL</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Shield className="h-4 w-4 text-emerald-400" />
              <span>Dados Protegidos</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <XCircle className="h-4 w-4 text-emerald-400" />
              <span>Cancele Quando Quiser</span>
            </div>
          </div>
          <div className="text-center text-[10px] text-gray-500">
            © {new Date().getFullYear()} Dominex · Todos os direitos reservados
          </div>
        </div>
      </footer>
    </div>
  );
}
