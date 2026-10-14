import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { addMonths, differenceInDays } from "date-fns";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useIsDark } from "@/hooks/useIsDark";
import { Check, ArrowRight, Clock, AlertTriangle, CheckCircle2, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckoutLayout } from "@/components/checkout/CheckoutLayout";
import { cpfCnpjMask } from "@/utils/masks";
import {
  calculateYearlyPrice,
  calculateMonthlyEquivalent,
  getEffectiveSubscriptionValue,
  hasActiveCustomPrice,
  type BillingCycle,
} from "@/utils/subscriptionPricing";
import type { CardData, PaymentResult } from "@/hooks/useAsaasPayment";
import { useAsaasPayment } from "@/hooks/useAsaasPayment";
import logoWhite from "@/assets/logo-white-horizontal.png";
import logoBlack from "@/assets/logo-black-horizontal.png";
import { useWhiteLabel } from "@/hooks/useWhiteLabel";
import { PriceAmount } from "@/components/ui/PriceAmount";
import { hasSubscriptionActivationAdvanced } from "@/lib/subscriptionActivation";
import { useSubscriptionUpgradeCheckout } from "@/hooks/useSubscriptionUpgradeCheckout";

type PaymentMethod = "pix" | "boleto" | "card" | null;

// Erros amigáveis do cartão são mapeados pra seção do form (card/holder/address)
// só por heurística de palavra-chave — espelha o detectErrorSection do EcoSistema.
function detectCardErrorSection(message: string): "card" | "holder" | "address" | null {
  const m = message.toLowerCase();
  if (m.includes("cep") || m.includes("endereço") || m.includes("postal") || m.includes("número")) return "address";
  if (m.includes("cpf") || m.includes("e-mail") || m.includes("email") || m.includes("telefone") || m.includes("titular")) return "holder";
  if (m.includes("cartão") || m.includes("cartao") || m.includes("cvv") || m.includes("validade") || m.includes("número do cartão")) return "card";
  return "card";
}

// As feature lists vivem aqui (subscription_plans.included_modules está vazio no
// Dominex; os planos prontos descrevem o que está incluso de forma estática).
const PLAN_FEATURES: Record<string, string[]> = {
  excecao: [
    "Ordens de Serviço e Rastreamento",
    "Agenda e Tarefas",
    "Clientes",
    "Equipamentos",
    "Sem Orçamentos, Portal do Cliente e Financeiro",
  ],
  start: [
    "Ordens de Serviço",
    "Agenda",
    "Dashboard",
    "Orçamentos",
    "Serviços",
    "Mapa ao Vivo",
    "Clientes",
    "Equipamentos",
    "Estoque",
    "Portal do Cliente",
    "Financeiro Básico",
  ],
  avancado: [
    "Tudo do Start",
    "Gestão de Contratos e PMOC",
    "Funcionários / RH",
    "Ponto Eletrônico",
    "Financeiro Avançado (DRE)",
    "Contas a Pagar e Receber",
  ],
  master: [
    "Tudo do Avançado",
    "Gestão de Contratos e PMOC",
    "CRM Completo",
    "Emissão de Notas Fiscais",
    "Precificação Avançada (BDI)",
    "Portal do Cliente",
    "White Label",
  ],
};

interface SubscriptionPlan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price: number;
  max_users: number;
  is_active: boolean;
}

export default function Checkout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const isRenewal = searchParams.get("mode") === "renewal";
  const isUpgrade = searchParams.get("mode") === "upgrade";
  const changeRequestId = isUpgrade ? searchParams.get("change") : null;
  const {
    data: upgradeQuote,
    isLoading: upgradeQuoteLoading,
    isError: upgradeQuoteError,
    getStatus: getUpgradeStatus,
  } = useSubscriptionUpgradeCheckout(changeRequestId);
  // Plano TRAVADO pelo link de venda (?bloqueado=1 vindo do cadastro): o cliente
  // não escolhe nem troca de plano — cobra exatamente o plano/valor que o link
  // já gravou na empresa. Fecha a brecha de pagar o preço de um plano mais barato.
  const isPlanLocked = searchParams.get("bloqueado") === "1";
  const isDark = useIsDark();
  const { profile } = useAuth();
  // Mesma regra do painel de pagamento: white-label da empresa do checkout
  // (resolvido pelo company_id do usuário logado, nunca global). Ativo =
  // esconde a marca Dominex; isLoading mantém o default Dominex.
  const { enabled: whiteLabelEnabled, logoUrl: whiteLabelLogoUrl, isLoading: whiteLabelLoading } = useWhiteLabel();
  const hideDominexLogo = !whiteLabelLoading && whiteLabelEnabled;
  const {
    createPixPayment,
    createBoletoPayment,
    createCardPayment,
    createSavedCardPayment,
    cancelPayment,
    startPolling,
    stopPolling,
  } = useAsaasPayment();

  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");
  const [showCheckout, setShowCheckout] = useState(false);
  const [cpfCnpj, setCpfCnpj] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(null);
  const [paymentData, setPaymentData] = useState<PaymentResult | null>(null);
  const [isCreatingPayment, setIsCreatingPayment] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [pixRecurring, setPixRecurring] = useState(true);
  const [cardErrorMessage, setCardErrorMessage] = useState<string | null>(null);
  const [cardErrorSection, setCardErrorSection] = useState<"card" | "holder" | "address" | null>(null);
  const [savedCardErrorMessage, setSavedCardErrorMessage] = useState<string | null>(null);
  const activatedRef = useRef(false);

  const { data: companyData, isLoading: companyLoading } = useQuery({
    queryKey: ["checkout-company", profile?.company_id],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data: prof } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", user.id)
        .single();
      if (!prof?.company_id) throw new Error("No company");
      const { data: company } = await supabase
        .from("companies")
        .select("*")
        .eq("id", prof.company_id)
        .single();
      return { ...company, _userEmail: user.email };
    },
  });

  const { data: plans = [], isLoading: plansLoading } = useQuery({
    queryKey: ["subscription-plans", "checkout"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscription_plans")
        .select("id, code, name, description, price, max_users, is_active")
        .eq("is_active", true)
        .order("price");
      if (error) throw error;
      return (data || []).map((p) => ({ ...p, price: Number(p.price) })) as SubscriptionPlan[];
    },
  });

  // Empresa de plano PERSONALIZADO: o plano não é comprável pelo catálogo
  // (price R$ 0, card filtrado da lista). A cobrança usa o valor PRÓPRIO da
  // empresa (subscription_value / custom_price) e os recursos exibidos são os
  // módulos à la carte contratados (company_modules), não PLAN_FEATURES.
  const isCustomPlanCompany = companyData?.subscription_plan === "personalizado";

  // Nomes dos módulos contratados (só pra empresa personalizado — alimenta a
  // lista de recursos do resumo de pagamento).
  const { data: customModuleNames = [] } = useQuery({
    queryKey: ["checkout-custom-modules", companyData?.id],
    enabled: !!companyData?.id && (
      isCustomPlanCompany ||
      upgradeQuote?.target_plan_code === "personalizado" ||
      (isRenewal && companyData?.pending_plan_code === "personalizado")
    ),
    queryFn: async () => {
      const { data: cm, error: cmError } = await supabase
        .from("company_modules")
        .select("module_code")
        .eq("company_id", companyData!.id);
      if (cmError) throw cmError;
      const codes = isUpgrade && upgradeQuote
        ? upgradeQuote.target_modules
        : isRenewal && Array.isArray(companyData?.pending_modules)
        ? companyData.pending_modules.filter((code): code is string => typeof code === "string")
        : (cm ?? []).map((m) => m.module_code);
      if (codes.length === 0) return [] as string[];
      const { data: mods, error: modsError } = await supabase
        .from("subscription_modules")
        .select("code, name")
        .in("code", codes);
      if (modsError) throw modsError;
      return (mods ?? []).map((m) => m.name as string);
    },
  });

  // Upgrade: a cotação server-side já trava plano, módulos, ciclo e valor.
  useEffect(() => {
    if (!isUpgrade || !upgradeQuote || plans.length === 0 || showCheckout) return;
    if (upgradeQuote.company_id !== companyData?.id) return;
    setSelectedPlan(upgradeQuote.target_plan_code);
    setBillingCycle(upgradeQuote.target_billing_cycle);
    setShowCheckout(true);
  }, [isUpgrade, upgradeQuote, plans, showCheckout, companyData?.id]);

  // Pré-preenche CPF/CNPJ a partir do cadastro da empresa
  useEffect(() => {
    if (companyData?.cnpj && !cpfCnpj) {
      setCpfCnpj(cpfCnpjMask(companyData.cnpj));
    }
  }, [companyData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Renovação: auto-seleciona o plano atual da empresa e pula pro pagamento
  useEffect(() => {
    if (isRenewal && companyData && plans.length > 0 && !showCheckout) {
      const renewalPlanCode = companyData.pending_plan_code || companyData.subscription_plan;
      const matched = plans.find((p) => p.code === renewalPlanCode);
      if (matched) {
        setSelectedPlan(renewalPlanCode);
        setBillingCycle(
          (companyData.pending_billing_cycle as BillingCycle) ||
            (companyData.billing_cycle as BillingCycle) ||
            "monthly",
        );
        setShowCheckout(true);
      }
    }
  }, [isRenewal, companyData, plans, showCheckout]);

  // Plano personalizado (1ª venda via link, pending_payment ou trial expirado):
  // não há card no catálogo pra escolher — pula a etapa de seleção e vai direto
  // pro pagamento com o plano/ciclo da própria empresa (mesma mecânica da renovação).
  useEffect(() => {
    if (!isRenewal && !isUpgrade && isCustomPlanCompany && plans.length > 0 && !showCheckout) {
      const matched = plans.find((p) => p.code === "personalizado");
      if (matched) {
        setSelectedPlan("personalizado");
        setBillingCycle((companyData?.billing_cycle as BillingCycle) || "monthly");
        setShowCheckout(true);
      }
    }
  }, [isRenewal, isUpgrade, isCustomPlanCompany, companyData, plans, showCheckout]);

  // Plano TRAVADO pelo link (?bloqueado=1): auto-seleciona o plano da PRÓPRIA
  // empresa (que o self-register já gravou a partir do link) e pula a etapa de
  // seleção, indo direto ao pagamento. Não há como o cliente trocar por um plano
  // mais barato. Vale pra qualquer plano (start/avancado/master/personalizado).
  useEffect(() => {
    if (isPlanLocked && !isRenewal && !isUpgrade && companyData && plans.length > 0 && !showCheckout) {
      const currentPlanCode = companyData.subscription_plan;
      const matched = plans.find((p) => p.code === currentPlanCode);
      if (matched) {
        setSelectedPlan(currentPlanCode);
        setBillingCycle((companyData.billing_cycle as BillingCycle) || "monthly");
        setShowCheckout(true);
      }
    }
  }, [isPlanLocked, isRenewal, isUpgrade, companyData, plans, showCheckout]);

  useEffect(() => () => stopPolling(), [stopPolling]);

  useEffect(() => {
    if (isUpgrade && upgradeQuote?.status === "applied") setPaymentSuccess(true);
  }, [isUpgrade, upgradeQuote?.status]);

  const trialDaysLeft = companyData?.subscription_expires_at
    ? differenceInDays(new Date(companyData.subscription_expires_at), new Date())
    : null;
  const trialExpired = trialDaysLeft !== null && trialDaysLeft <= 0;

  const waitsForAutomaticCheckout = isRenewal ||
    (isUpgrade && !upgradeQuoteError && !!upgradeQuote) ||
    (!isUpgrade && (isCustomPlanCompany || isPlanLocked));
  if (companyLoading || upgradeQuoteLoading || (waitsForAutomaticCheckout && (!showCheckout || !selectedPlan))) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-4xl space-y-8">
          <div className="flex flex-col items-center gap-4">
            <Skeleton className="h-10 w-40" />
            <Skeleton className="h-8 w-64" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-64 rounded-lg" />)}
          </div>
        </div>
      </div>
    );
  }

  if (isUpgrade && (!changeRequestId || upgradeQuoteError || !upgradeQuote || upgradeQuote.company_id !== companyData?.id)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Não foi possível abrir este upgrade</CardTitle>
            <CardDescription>A cotação pode ter expirado ou não pertence a esta empresa.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => navigate("/assinatura")}>Voltar para minha assinatura</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isUpgrade && upgradeQuote && ["expired", "cancelled", "failed", "reversed"].includes(upgradeQuote.status)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Cotação indisponível</CardTitle>
            <CardDescription>Volte para sua assinatura e calcule novamente o upgrade.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => navigate("/assinatura")}>Recalcular upgrade</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentPlan = plans.find((p) => p.code === selectedPlan);
  const effectiveCompanyValue = companyData ? getEffectiveSubscriptionValue(companyData) : 0;
  const planPrice = currentPlan?.price || 0;

  // Renovação, plano personalizado E plano TRAVADO cobram o valor EFETIVO da
  // empresa (custom_price se houver promoção ativa, senão subscription_value) —
  // NUNCA o preço de catálogo (personalizado tem price R$ 0 no catálogo). No
  // plano travado, o valor foi definido pelo link e gravado na empresa, então é
  // ele que vale (impede pagar o preço de outro plano mais barato).
  const pendingRenewalPrice = isRenewal
    ? Number(companyData?.pending_subscription_value) || 0
    : 0;
  const renewalPrice = (!isUpgrade && (isRenewal || isCustomPlanCompany || isPlanLocked))
    ? (pendingRenewalPrice || effectiveCompanyValue || planPrice)
    : null;
  const basePrice = renewalPrice ?? planPrice;

  const yearlyPrice = calculateYearlyPrice(basePrice);

  // B9 (revisado 2026-06-08): anual à vista (pix/boleto) = -20%;
  // cartão = SEMPRE cobrança mensal recorrente (mensal cheio, sem desconto,
  // sem parcelamento) — o ciclo anual não se aplica ao cartão.
  const getEffectiveFinalPrice = (method: PaymentMethod): number => {
    if (isUpgrade && upgradeQuote) return upgradeQuote.amount_due;
    if (method === "card") return basePrice; // mensal recorrente
    if (billingCycle !== "yearly") return basePrice;
    return yearlyPrice;
  };
  const finalPrice = getEffectiveFinalPrice(paymentMethod);
  const savedCardAvailable = isUpgrade &&
    !upgradeQuote?.resets_billing_anchor &&
    companyData?.payment_method === "credit_card" &&
    typeof companyData?.asaas_subscription_id === "string" &&
    companyData.asaas_subscription_id.startsWith("sub_") &&
    /^\d{4}$/.test(companyData?.subscription_card_last4 ?? "");

  // Personalizado: recursos = módulos contratados; demais planos = lista estática.
  const targetIsCustom = isUpgrade
    ? upgradeQuote?.target_plan_code === "personalizado"
    : isRenewal
    ? selectedPlan === "personalizado"
    : isCustomPlanCompany;
  const planFeatures = targetIsCustom
    ? customModuleNames
    : (currentPlan ? (PLAN_FEATURES[currentPlan.code] ?? []) : []);
  const maxUsers = isUpgrade && upgradeQuote
    ? upgradeQuote.target_max_users
    : isRenewal && Number(companyData?.pending_max_users) > 0
    ? Number(companyData?.pending_max_users)
    : (isRenewal || isCustomPlanCompany)
    ? (companyData?.max_users || currentPlan?.max_users || 5)
    : (currentPlan?.max_users || 5);

  // Próximo vencimento após este pagamento
  const baseDate = companyData?.subscription_expires_at
    ? new Date(companyData.subscription_expires_at)
    : new Date();
  const nextDueDate = isUpgrade && upgradeQuote
    ? upgradeQuote.next_renewal_at
    : addMonths(baseDate, billingCycle === "yearly" ? 12 : 1).toISOString();

  // Promoção temporária (custom_price)
  const hasCustomPrice = companyData
    ? hasActiveCustomPrice(companyData) && pendingRenewalPrice <= 0
    : false;
  const remainingPromoMonths = hasCustomPrice
    ? (companyData!.custom_price_months! - (companyData!.custom_price_payments_made || 0))
    : 0;
  const customPriceEndDate = hasCustomPrice
    ? addMonths(new Date(), remainingPromoMonths).toISOString()
    : null;

  const activateAndRedirect = async (_paymentId: string | null) => {
    if (activatedRef.current) return;
    activatedRef.current = true;
    try {
      if (isUpgrade) {
        let applied = false;
        for (let attempt = 0; attempt < 24; attempt += 1) {
          const status = await getUpgradeStatus();
          if (status?.status === "applied") {
            applied = true;
            break;
          }
          if (["failed", "cancelled", "expired", "reversed"].includes(status?.status ?? "")) {
            throw new Error("O pagamento foi confirmado, mas o upgrade precisa de revisão.");
          }
          await new Promise((resolve) => window.setTimeout(resolve, 2_000));
        }
        if (!applied) {
          throw new Error("O pagamento foi confirmado, mas o upgrade ainda está sendo aplicado.");
        }
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["my-company"] }),
          queryClient.invalidateQueries({ queryKey: ["company-modules"] }),
          queryClient.invalidateQueries({ queryKey: ["company-modules-info"] }),
          queryClient.invalidateQueries({ queryKey: ["subscription-upgrade-checkout", changeRequestId] }),
        ]);
        setPaymentSuccess(true);
        setTimeout(() => { window.location.href = "/assinatura"; }, 3000);
        return;
      }

      // `activate-subscription` e `confirm-sale-payment` são operações exclusivas
      // do painel master. O checkout do tenant não pode chamá-las nem fingir que
      // deram certo: a fonte da verdade é o webhook autenticado da Asaas.
      const before = {
        subscription_status: companyData?.subscription_status ?? null,
        subscription_expires_at: companyData?.subscription_expires_at ?? null,
      };
      let activated = false;

      for (let attempt = 0; attempt < 24; attempt += 1) {
        const { data, error } = await supabase
          .from('companies')
          .select('subscription_status, subscription_expires_at')
          .eq('id', companyData!.id)
          .single();

        if (!error && hasSubscriptionActivationAdvanced(before, data)) {
          activated = true;
          break;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 2_000));
      }

      if (!activated) {
        throw new Error('O pagamento foi confirmado, mas a liberação ainda não foi concluída.');
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['subscription-gate-status', companyData!.id] }),
        queryClient.invalidateQueries({ queryKey: ['protected-route-company-status', companyData!.id] }),
        queryClient.invalidateQueries({ queryKey: ['checkout-company', companyData!.id] }),
      ]);
      setPaymentSuccess(true);
      setTimeout(() => { window.location.href = "/dashboard"; }, 3000);
    } catch (err) {
      activatedRef.current = false;
      console.error("Subscription activation wait error:", err);
      toast.error(
        "Pagamento confirmado. A liberação está demorando mais que o normal; aguarde um instante e tente entrar novamente.",
      );
    }
  };

  const handleCreatePayment = async (method: PaymentMethod, cardData?: CardData & { totalAmount?: number }) => {
    if (!companyData?.id || !currentPlan) return;
    setIsCreatingPayment(true);
    setPaymentMethod(method);
    setCardErrorMessage(null);
    setCardErrorSection(null);
    setSavedCardErrorMessage(null);

    const amount = getEffectiveFinalPrice(method);
    const description = isUpgrade
      ? `Upgrade Dominex - ${currentPlan.name}`
      : `Assinatura Dominex - ${currentPlan.name}`;
    const purpose = isUpgrade ? "upgrade" : isRenewal ? "renewal" : undefined;
    // Primeira venda: o cliente ESCOLHE o plano aqui, então enviamos o
    // `plan_code` selecionado pra validação server-side bater contra o preço
    // desse plano (e não contra o plano antigo guardado na empresa). Na
    // renovação não enviamos — a validação usa o valor efetivo da empresa.
    const planCode = (isRenewal || isUpgrade) ? undefined : (selectedPlan ?? undefined);
    const changeRequestIdForPayment = isUpgrade ? (changeRequestId ?? undefined) : undefined;

    try {
      if (method === "pix") {
        const data = await createPixPayment(companyData.id, amount, cpfCnpj, {
          recurring: isUpgrade ? false : pixRecurring,
          billingCycle,
          description,
          purpose,
          planCode,
          changeRequestId: changeRequestIdForPayment,
        });
        setPaymentData(data);
        if (data.payment_id) startPolling(data.payment_id, () => activateAndRedirect(data.payment_id ?? null));
      } else if (method === "boleto") {
        const data = await createBoletoPayment(companyData.id, amount, cpfCnpj, {
          billingCycle,
          description,
          purpose,
          planCode,
          changeRequestId: changeRequestIdForPayment,
        });
        setPaymentData(data);
        if (data.payment_id) startPolling(data.payment_id, () => activateAndRedirect(data.payment_id ?? null));
      } else if (method === "card" && cardData) {
        // Venda/renovação no cartão mantém recorrência mensal. No upgrade a
        // mesma UI envia cobrança avulsa e a edge usa o ciclo da cotação.
        const data = await createCardPayment(companyData.id, amount, cardData, cpfCnpj, {
          billingCycle: "monthly",
          description,
          purpose,
          planCode,
          changeRequestId: changeRequestIdForPayment,
        });
        setPaymentData(data);
        if (data.status === "CONFIRMED") {
          await activateAndRedirect(data.payment_id ?? null);
        } else if (data.payment_id) {
          startPolling(data.payment_id, () => activateAndRedirect(data.payment_id ?? null));
        } else {
          // Cartão recorrente sem payment.id ainda (webhook confirma depois).
          // Status ACTIVE/PENDING → consideramos ativado e seguimos.
          await activateAndRedirect(null);
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro ao processar o pagamento. Verifique seus dados e tente novamente.";
      if (method === "card") {
        setCardErrorMessage(message);
        setCardErrorSection(detectCardErrorSection(message));
        toast.error(message);
      } else {
        setPaymentMethod(null);
      }
    } finally {
      setIsCreatingPayment(false);
    }
  };

  const handleSavedCardPayment = async () => {
    if (!companyData?.id || !currentPlan || !changeRequestId || !upgradeQuote || !savedCardAvailable) return;
    setIsCreatingPayment(true);
    setSavedCardErrorMessage(null);
    setCardErrorMessage(null);
    setCardErrorSection(null);

    try {
      const data = await createSavedCardPayment(companyData.id, upgradeQuote.amount_due, {
        billingCycle: upgradeQuote.target_billing_cycle,
        description: `Upgrade Dominex - ${currentPlan.name}`,
        purpose: "upgrade",
        changeRequestId,
      });
      const status = data.status?.toUpperCase() ?? "PENDING";
      if (["REFUSED", "DECLINED", "FAILED", "CANCELLED", "CHARGEBACK"].includes(status)) {
        throw new Error(
          "O cartão cadastrado não aprovou esta cobrança. Escolha outra forma de pagamento ou informe outro cartão.",
        );
      }
      setPaymentMethod("card");
      setPaymentData(data);
      if (status === "CONFIRMED" || status === "RECEIVED") {
        await activateAndRedirect(data.payment_id ?? null);
      } else if (data.payment_id) {
        startPolling(data.payment_id, () => activateAndRedirect(data.payment_id ?? null));
      } else {
        throw new Error("A cobrança foi criada, mas ainda não foi possível confirmar o pagamento.");
      }
    } catch (err: unknown) {
      const message = err instanceof Error
        ? err.message
        : "Não foi possível cobrar o cartão cadastrado. Escolha outra forma de pagamento.";
      setSavedCardErrorMessage(message);
      toast.error(message);
    } finally {
      setIsCreatingPayment(false);
    }
  };

  // "Voltar" da tela de PIX/boleto/cartão: limpa o estado e, se uma cobrança já
  // tinha sido gerada na Asaas (PIX e boleto nascem como cobrança REAL), pede o
  // cancelamento dela — senão ela fica pendente e órfã na conta pra sempre.
  //
  // O cancelamento é DISPARADO E ESQUECIDO, sempre DEPOIS de limpar o estado: a
  // troca de forma de pagamento não pode travar nem esperar a Asaas. Se falhar, o
  // pior caso é a órfã que já acontece hoje (melhora sem regressão).
  //
  // Guarda de corrida: se o pagamento já confirmou (polling/retorno do cartão),
  // não pedimos cancelamento. Essa checagem é só UX — a proteção de verdade é o
  // servidor, que reconsulta o status na Asaas antes de cancelar e recusa cobrança
  // paga.
  const handleClearPayment = () => {
    const pendingPaymentId = paymentData?.payment_id ?? null;
    const looksPaid = paymentSuccess ||
      paymentData?.status === "CONFIRMED" ||
      paymentData?.status === "RECEIVED" ||
      activatedRef.current;

    setPaymentMethod(null);
    setPaymentData(null);
    setPixRecurring(true);
    setCardErrorMessage(null);
    setCardErrorSection(null);
    setSavedCardErrorMessage(null);
    stopPolling();

    if (pendingPaymentId && !looksPaid) {
      void cancelPayment(pendingPaymentId);
    }
  };

  const handlePixRecurringChange = (value: boolean) => {
    setPixRecurring(value);
    // Regenera o PIX com a nova preferência de recorrência (igual EcoSistema).
    setPaymentData(null);
    stopPolling();
    void handleCreatePayment("pix");
  };

  // ====== Tela de pagamento ======
  if (showCheckout && currentPlan) {
    const sourcePlanName = isUpgrade && upgradeQuote
      ? plans.find((plan) => plan.code === upgradeQuote.source_plan_code)?.name
        ?? upgradeQuote.source_plan_code
      : null;
    const upgradeRecurringPrice = isUpgrade && upgradeQuote
      ? (upgradeQuote.target_billing_cycle === "yearly"
        ? upgradeQuote.target_period_value
        : upgradeQuote.target_monthly_value)
      : null;
    const proratedTargetValue = isUpgrade && upgradeQuote
      ? (upgradeQuote.resets_billing_anchor
        ? upgradeQuote.target_period_value
        : Math.round(upgradeQuote.target_period_value * upgradeQuote.remaining_ratio * 100) / 100)
      : null;
    return (
      <motion.div
        key="checkout-payment"
        initial={{ opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        <CheckoutLayout
          checkoutMode={isUpgrade ? "upgrade" : isRenewal ? "renewal" : "sale"}
          planName={isUpgrade ? (upgradeQuote?.target_label || `Upgrade para ${currentPlan.name}`) : isRenewal ? `${currentPlan.name} (Renovação)` : currentPlan.name}
          planPrice={basePrice}
          finalPrice={finalPrice}
          billingCycle={billingCycle}
          features={planFeatures}
          maxUsers={maxUsers}
          cpfCnpj={cpfCnpj}
          onCpfCnpjChange={setCpfCnpj}
          paymentMethod={paymentMethod}
          paymentData={paymentData}
          isCreatingPayment={isCreatingPayment}
          onPaymentMethodSelect={setPaymentMethod}
          onCreatePayment={handleCreatePayment}
          onClearPayment={handleClearPayment}
          paymentSuccess={paymentSuccess}
          nextDueDate={nextDueDate}
          companyName={companyData?.name}
          companyPhone={companyData?.phone || ""}
          companyAddress={companyData?.address || ""}
          userEmail={companyData?._userEmail || ""}
          pixRecurring={isUpgrade ? false : pixRecurring}
          onPixRecurringChange={isUpgrade ? undefined : handlePixRecurringChange}
          allowCardInstallments={false}
          allowCardPayment={!isUpgrade || !upgradeQuote?.resets_billing_anchor}
          cardErrorMessage={cardErrorMessage}
          cardErrorSection={cardErrorSection}
          savedCardLast4={savedCardAvailable ? companyData?.subscription_card_last4 : null}
          savedCardBrand={savedCardAvailable ? companyData?.subscription_card_brand : null}
          savedCardErrorMessage={savedCardErrorMessage}
          onPayWithSavedCard={savedCardAvailable ? handleSavedCardPayment : undefined}
          hasCustomPrice={!isUpgrade && hasCustomPrice}
          originalPrice={hasCustomPrice ? (companyData?.subscription_value || planPrice) : undefined}
          customPriceEndDate={customPriceEndDate}
          customPriceOriginal={hasCustomPrice ? (companyData?.subscription_value || planPrice) : null}
          pendingSubscriptionValue={isUpgrade ? null : companyData?.pending_subscription_value}
          currentSubscriptionValue={isUpgrade ? null : companyData?.subscription_value}
          currentPlanName={sourcePlanName}
          recurringPrice={upgradeRecurringPrice}
          prorationCredit={upgradeQuote?.credit_amount}
          prorationTargetValue={proratedTargetValue}
        />
      </motion.div>
    );
  }

  // ====== Seleção de plano ======
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-4xl space-y-8">
        {/* Stepper */}
        <div className="flex items-center justify-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">1</div>
            <span className="text-sm font-medium hidden sm:inline">Escolha o plano</span>
          </div>
          <div className="w-12 h-px bg-border" />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-sm font-bold">2</div>
            <span className="text-sm text-muted-foreground hidden sm:inline">Pagamento</span>
          </div>
        </div>

        <div className="text-center space-y-3">
          {hideDominexLogo ? (
            // White-label ativo: nunca exibir a marca Dominex aqui. Logo da
            // empresa quando houver; senão, nada (sem imagem quebrada/espaço).
            whiteLabelLogoUrl ? (
              <img
                src={whiteLabelLogoUrl}
                alt="Logo"
                className="h-10 mx-auto max-w-[220px] object-contain"
              />
            ) : null
          ) : (
            <img
              src={isDark ? logoWhite : logoBlack}
              alt="Dominex"
              className="h-10 mx-auto"
            />
          )}
          <h1 className="text-2xl font-bold">Ative sua Assinatura</h1>

          {trialExpired ? (
            <div className="inline-flex items-center gap-2 bg-destructive text-destructive-foreground px-4 py-2 rounded-lg">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm font-medium">Seu período de teste expirou. Ative agora para continuar usando.</span>
            </div>
          ) : trialDaysLeft !== null && trialDaysLeft <= 7 ? (
            <div className="inline-flex items-center gap-2 bg-background border border-orange-400 text-orange-500 dark:text-orange-400 px-4 py-2 rounded-lg">
              <Clock className="h-4 w-4" />
              <span className="text-sm font-medium">
                Seu teste expira em {trialDaysLeft} dia{trialDaysLeft !== 1 ? "s" : ""}. Escolha o plano ideal para continuar.
              </span>
            </div>
          ) : (
            <p className="text-muted-foreground">Escolha o plano ideal para o seu negócio.</p>
          )}
        </div>

        {/* Toggle mensal/anual */}
        <div className="flex items-center justify-center gap-4">
          <span className={cn("text-sm font-medium", billingCycle === "monthly" && "text-primary")}>Mensal</span>
          <Switch checked={billingCycle === "yearly"} onCheckedChange={(c) => setBillingCycle(c ? "yearly" : "monthly")} />
          <span className={cn("text-sm font-medium", billingCycle === "yearly" && "text-primary")}>Anual</span>
          <Badge className={cn("bg-emerald-500 text-white transition-opacity ml-5", billingCycle === "yearly" ? "opacity-100" : "opacity-0 pointer-events-none")}>-20%</Badge>
        </div>
        {billingCycle === "yearly" && (
          <p className="text-xs text-center text-muted-foreground -mt-2">
            Desconto de 20% válido para pagamentos à vista (Pix ou Boleto)
          </p>
        )}

        {plansLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-80 rounded-lg" />)}
          </div>
        ) : (
          <motion.div
            className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            {/* 'personalizado' (R$ 0) não é comprável aqui: ele só nasce de link
                de afiliado ou do painel admin. A renovação continua achando o
                plano pelo plans.find (array completo). */}
            {plans.filter((p) => p.code !== 'personalizado').map((plan, index, visiblePlans) => {
              const isSelected = selectedPlan === plan.code;
              const yp = calculateYearlyPrice(plan.price);
              const me = calculateMonthlyEquivalent(yp);
              const isPopular = visiblePlans.length >= 3 ? index === Math.floor(visiblePlans.length / 2) : index === visiblePlans.length - 1;
              const displayPrice = billingCycle === "monthly" ? plan.price : me;
              const features = PLAN_FEATURES[plan.code] ?? [];

              return (
                <motion.div
                  key={plan.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.1 }}
                  className={cn(isPopular && "md:-mt-4 md:mb-[-16px]")}
                >
                  <Card
                    className={cn(
                      "cursor-pointer transition-all relative overflow-hidden h-full flex flex-col",
                      "hover:shadow-xl hover:-translate-y-1",
                      isPopular && "border-primary shadow-lg ring-1 ring-primary/20",
                      isSelected && "ring-2 ring-primary border-primary shadow-xl",
                      !isPopular && !isSelected && "border-border",
                    )}
                    onClick={() => setSelectedPlan(plan.code)}
                  >
                    {isPopular && <div className="absolute top-0 left-0 right-0 h-1 bg-primary" />}
                    {isPopular && (
                      <div className="flex justify-center pt-4 pb-0">
                        <Badge className="bg-primary text-primary-foreground text-xs px-3 py-1">⭐ Mais Popular</Badge>
                      </div>
                    )}

                    <CardHeader className={cn("text-center pb-2", isPopular ? "pt-3" : "pt-6")}>
                      <CardTitle className="text-xl font-bold">{plan.name}</CardTitle>
                      <CardDescription className="text-xs min-h-[2rem]">{plan.description}</CardDescription>
                    </CardHeader>

                    <CardContent className="flex flex-col flex-1 gap-5">
                      <div className="text-center">
                        <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium mb-1">
                          {billingCycle === "yearly" ? "equivalente a" : "a partir de"}
                        </p>
                        <div className="flex items-baseline justify-center">
                          <PriceAmount
                            value={displayPrice}
                            suffix="/mês"
                            className={cn("font-extrabold tracking-tight", isPopular ? "text-5xl text-primary" : "text-4xl")}
                          />
                        </div>
                        {billingCycle === "yearly" && (
                          <div className="mt-1 space-y-0.5">
                            <p className="text-xs text-muted-foreground line-through">R$ {plan.price.toFixed(0)}/mês</p>
                            <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                              Total: R$ {yp.toFixed(0)}/ano · Economize 20%
                            </p>
                          </div>
                        )}
                      </div>

                      <Button
                        variant={isSelected ? "default" : "outline"}
                        className={cn("w-full font-semibold", isSelected && "bg-primary hover:bg-primary/90")}
                        onClick={(e) => { e.stopPropagation(); setSelectedPlan(plan.code); }}
                      >
                        {isSelected ? <><Check className="h-4 w-4 mr-1" /> Selecionado</> : "Selecionar Plano"}
                      </Button>

                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-px bg-border" />
                        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-medium">Recursos</span>
                        <div className="flex-1 h-px bg-border" />
                      </div>

                      <div className="space-y-2.5 flex-1">
                        {features.map((f, index) => {
                          const isLimitation = plan.code === 'excecao' && index === features.length - 1;
                          const FeatureIcon = isLimitation ? X : CheckCircle2;
                          return (
                            <div key={f} className="flex items-center gap-2.5 text-sm">
                              <FeatureIcon className={cn("h-4 w-4 shrink-0", isLimitation ? "text-rose-500" : "text-emerald-500")} />
                              <span className={cn(isLimitation && "text-muted-foreground")}>{f}</span>
                            </div>
                          );
                        })}
                        <div className="flex items-center gap-2.5 text-sm">
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                          <span className="font-medium">{plan.max_users} usuário{plan.max_users > 1 ? "s" : ""}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </motion.div>
        )}

        <motion.div
          className="flex flex-col items-center gap-3"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <Button
            size="lg"
            disabled={!selectedPlan}
            onClick={() => setShowCheckout(true)}
            className="gap-2 px-8 transition-all duration-300"
          >
            {selectedPlan && currentPlan ? (
              <>
                Assinar por R$ {(billingCycle === "yearly" ? calculateYearlyPrice(planPrice) : planPrice).toFixed(0)}/{billingCycle === "yearly" ? "ano" : "mês"}
                <ArrowRight className="h-4 w-4" />
              </>
            ) : (
              <>
                Continuar para Pagamento
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
          <Button
            variant="ghost"
            onClick={() => navigate("/dashboard")}
            className="text-muted-foreground text-sm hover:bg-destructive hover:text-white"
          >
            Voltar ao sistema
          </Button>
        </motion.div>
      </div>
    </div>
  );
}
