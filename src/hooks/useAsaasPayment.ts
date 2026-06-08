import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { BillingCycle } from "@/utils/subscriptionPricing";

/**
 * Hook de pagamento Asaas — fronteira única do front com as edge functions
 * `create-asaas-payment` e `check-asaas-payment`. Componente nunca chama
 * `supabase.functions.invoke` direto.
 *
 * Espelha o `useAsaasPayment` do EcoSistema, adaptado às edge functions do
 * Dominex (que retornam `{ success, error, ... }` no corpo da resposta).
 */

export interface PaymentResult {
  success: boolean;
  payment_id?: string | null;
  status?: string;
  invoice_url?: string;
  bank_slip_url?: string;
  pix_qr_code?: string;
  pix_copy_paste?: string;
  pix_expiration_date?: string;
  identification_field?: string;
  local_payment_id?: string;
  subscription_id?: string;
  is_recurring?: boolean;
  due_date?: string;
  error?: string;
}

export interface CheckPaymentResult {
  status: string;
  is_paid: boolean;
  invoice_url?: string;
}

export interface CardData {
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
}

/**
 * Extrai mensagem amigável do erro de uma edge function. As edge functions do
 * Dominex devolvem `{ success: false, error: "..." }`. O `FunctionsHttpError`
 * do supabase-js guarda o corpo da resposta em `error.context` (Response).
 */
async function extractErrorMessage(error: unknown, data: unknown, fallback: string): Promise<string> {
  // 1) Corpo já parseado (quando o invoke retornou 200 com success:false)
  if (data && typeof data === "object" && "error" in data && (data as { error?: string }).error) {
    return (data as { error: string }).error;
  }
  // 2) FunctionsHttpError → tenta ler o corpo da Response
  const ctx = (error as { context?: Response } | null)?.context;
  if (ctx && typeof ctx === "object" && typeof (ctx as Response).json === "function") {
    try {
      const body = await (ctx as Response).clone().json();
      if (body?.error) return String(body.error);
    } catch {
      /* corpo não-JSON — ignora */
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export function useAsaasPayment() {
  const [isCreating, setIsCreating] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [paymentData, setPaymentData] = useState<PaymentResult | null>(null);
  const pollingRef = useRef<number | null>(null);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const createPixPayment = useCallback(
    async (
      companyId: string,
      amount: number,
      cpfCnpj?: string,
      options?: { recurring?: boolean; billingCycle?: BillingCycle; description?: string; purpose?: string },
    ): Promise<PaymentResult> => {
      setIsCreating(true);
      try {
        const { data, error } = await supabase.functions.invoke("create-asaas-payment", {
          body: {
            company_id: companyId,
            billing_type: "PIX",
            amount,
            description: options?.description,
            cpf_cnpj: cpfCnpj?.replace(/\D/g, ""),
            pix_recurring: options?.recurring ?? true,
            billing_cycle: options?.billingCycle ?? "monthly",
            purpose: options?.purpose,
          },
        });
        if (error) throw new Error(await extractErrorMessage(error, data, "Erro ao gerar PIX."));
        if (!data?.success) throw new Error(data?.error || "Erro ao gerar PIX.");
        setPaymentData(data);
        return data as PaymentResult;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Erro ao gerar PIX.";
        toast.error(message);
        throw err;
      } finally {
        setIsCreating(false);
      }
    },
    [],
  );

  const createBoletoPayment = useCallback(
    async (
      companyId: string,
      amount: number,
      cpfCnpj?: string,
      options?: { billingCycle?: BillingCycle; description?: string; purpose?: string },
    ): Promise<PaymentResult> => {
      setIsCreating(true);
      try {
        const { data, error } = await supabase.functions.invoke("create-asaas-payment", {
          body: {
            company_id: companyId,
            billing_type: "BOLETO",
            amount,
            description: options?.description,
            cpf_cnpj: cpfCnpj?.replace(/\D/g, ""),
            billing_cycle: options?.billingCycle ?? "monthly",
            purpose: options?.purpose,
          },
        });
        if (error) throw new Error(await extractErrorMessage(error, data, "Erro ao gerar boleto."));
        if (!data?.success) throw new Error(data?.error || "Erro ao gerar boleto.");
        setPaymentData(data);
        return data as PaymentResult;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Erro ao gerar boleto.";
        toast.error(message);
        throw err;
      } finally {
        setIsCreating(false);
      }
    },
    [],
  );

  const createCardPayment = useCallback(
    async (
      companyId: string,
      amount: number,
      cardData: CardData,
      cpfCnpj?: string,
      options?: { billingCycle?: BillingCycle; description?: string; purpose?: string },
    ): Promise<PaymentResult> => {
      setIsCreating(true);
      try {
        const { data, error } = await supabase.functions.invoke("create-asaas-payment", {
          body: {
            company_id: companyId,
            billing_type: "CREDIT_CARD",
            amount,
            description: options?.description,
            cpf_cnpj: cpfCnpj?.replace(/\D/g, ""),
            billing_cycle: options?.billingCycle ?? "monthly",
            purpose: options?.purpose,
            card_holder_name: cardData.holderName,
            card_holder_email: cardData.holderEmail,
            card_number: cardData.number,
            card_expiry_month: cardData.expiryMonth,
            card_expiry_year: cardData.expiryYear,
            card_ccv: cardData.ccv,
            card_holder_cpf: cardData.holderCpf,
            card_holder_phone: cardData.holderPhone,
            card_holder_postal_code: cardData.holderPostalCode,
            card_holder_address_number: cardData.holderAddressNumber,
            installment_count: cardData.installmentCount || 1,
          },
        });
        if (error) throw new Error(await extractErrorMessage(error, data, "Erro ao processar o cartão."));
        if (!data?.success) throw new Error(data?.error || "Erro ao processar o cartão.");
        setPaymentData(data);
        return data as PaymentResult;
      } catch (err: unknown) {
        // Cartão: deixa o chamador tratar o erro (mostra na seção certa do form),
        // por isso re-lança SEM toast aqui.
        throw err instanceof Error ? err : new Error("Erro ao processar o cartão.");
      } finally {
        setIsCreating(false);
      }
    },
    [],
  );

  const checkPaymentStatus = useCallback(async (paymentId: string): Promise<CheckPaymentResult> => {
    setIsChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke("check-asaas-payment", {
        body: { payment_id: paymentId },
      });
      if (error) throw new Error(await extractErrorMessage(error, data, "Erro ao verificar pagamento."));
      return data as CheckPaymentResult;
    } finally {
      setIsChecking(false);
    }
  }, []);

  const startPolling = useCallback(
    (paymentId: string, onPaid: () => void, intervalMs = 5000) => {
      if (pollingRef.current) clearInterval(pollingRef.current);

      const poll = async () => {
        try {
          const result = await checkPaymentStatus(paymentId);
          if (result.is_paid) {
            stopPolling();
            onPaid();
          }
        } catch (err) {
          console.error("Polling error:", err);
        }
      };

      poll();
      pollingRef.current = window.setInterval(poll, intervalMs);
    },
    [checkPaymentStatus, stopPolling],
  );

  const reset = useCallback(() => {
    setPaymentData(null);
    stopPolling();
  }, [stopPolling]);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  return {
    isCreating,
    isChecking,
    paymentData,
    createPixPayment,
    createBoletoPayment,
    createCardPayment,
    checkPaymentStatus,
    startPolling,
    stopPolling,
    reset,
  };
}
