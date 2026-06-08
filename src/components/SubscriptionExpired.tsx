import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, LogOut, CreditCard } from "lucide-react";
import { useTheme } from "next-themes";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatBRL } from "@/utils/currency";
import { getEffectiveSubscriptionValue } from "@/utils/subscriptionPricing";
import logoWhite from "@/assets/logo-white-horizontal.png";
import logoDark from "@/assets/logo-horizontal-verde.png";

interface SubscriptionExpiredProps {
  expirationDate: string;
}

/**
 * Tela cheia exibida quando a assinatura paga venceu (passou a carência).
 * Empurra o cliente pra renovação (`/checkout?mode=renewal`). Rebrand Dominex
 * do `SubscriptionExpired` do EcoSistema.
 */
export function SubscriptionExpired({ expirationDate }: SubscriptionExpiredProps) {
  const navigate = useNavigate();
  const { resolvedTheme } = useTheme();
  const { signOut } = useAuth();
  const formattedDate = format(parseISO(expirationDate), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });

  const { data: companyData, isLoading } = useQuery({
    queryKey: ["subscription-expired-company"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("user_id", user.id)
        .single();
      if (!profile?.company_id) return null;
      const { data: company } = await supabase
        .from("companies")
        .select("id, subscription_value, pending_subscription_value, custom_price, custom_price_months, custom_price_payments_made, name, subscription_plan")
        .eq("id", profile.company_id)
        .single();

      let planValue = Number(company?.subscription_value) || 0;
      if (!planValue && company?.subscription_plan) {
        const { data: plan } = await supabase
          .from("subscription_plans")
          .select("price")
          .eq("code", company.subscription_plan)
          .single();
        planValue = Number(plan?.price) || 0;
      }
      return { ...company, calculatedValue: planValue };
    },
  });

  const effectiveValue = companyData ? getEffectiveSubscriptionValue(companyData) : 0;
  const subscriptionValue = effectiveValue || companyData?.calculatedValue || 0;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-background to-muted p-3 xl:p-4">
      <Card className="w-full max-w-md mx-auto">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <img src={resolvedTheme === "dark" ? logoWhite : logoDark} alt="Dominex" className="h-12" />
          </div>
          <div className="flex justify-center">
            <div className="rounded-full bg-destructive p-3">
              <AlertCircle className="h-10 w-10 text-destructive-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold text-destructive">Assinatura Vencida</CardTitle>
          <CardDescription className="text-base">
            Seu sistema venceu em <span className="font-semibold">{formattedDate}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg bg-muted p-4 text-center">
            <p className="text-sm text-muted-foreground">
              Para continuar utilizando o Dominex, renove sua assinatura agora.
            </p>
          </div>

          {subscriptionValue > 0 ? (
            <Button
              className="w-full h-auto py-5 flex flex-col items-center gap-1"
              onClick={() => navigate("/checkout?mode=renewal")}
              disabled={isLoading}
            >
              <span className="flex items-center gap-2 text-xl font-bold leading-tight">
                <CreditCard className="h-6 w-6" />
                Pagar agora
              </span>
              <span className="text-2xl font-extrabold tracking-tight leading-none">
                R$ {formatBRL(subscriptionValue)}
              </span>
            </Button>
          ) : (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-4 text-center">
              <p className="text-sm text-amber-700 dark:text-amber-400">
                O valor da sua assinatura ainda não foi definido. Entre em contato com o suporte para regularizar.
              </p>
            </div>
          )}

          <Button
            variant="outline"
            className="w-full hover:bg-destructive hover:text-destructive-foreground"
            size="lg"
            onClick={signOut}
          >
            <LogOut className="h-5 w-5 mr-2" />
            Sair
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
