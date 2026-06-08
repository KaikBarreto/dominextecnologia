import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, LogOut, Sparkles, Rocket, CheckCircle2 } from "lucide-react";
import { useTheme } from "next-themes";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import logoWhite from "@/assets/logo-white-horizontal.png";
import logoDark from "@/assets/logo-horizontal-verde.png";

interface TrialExpiredProps {
  expirationDate: string;
}

/**
 * Tela cheia exibida quando o período de teste acaba (e a empresa ainda não
 * comprou). Empurra o cliente pro `/checkout`. Rebrand Dominex do `TrialExpired`
 * do EcoSistema.
 */
export function TrialExpired({ expirationDate }: TrialExpiredProps) {
  const navigate = useNavigate();
  const { resolvedTheme } = useTheme();
  const { signOut } = useAuth();
  const formattedDate = format(parseISO(expirationDate), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });

  const features = [
    "Ordens de Serviço e Agenda",
    "Clientes, Equipamentos e PMOC",
    "Financeiro e Orçamentos",
    "Mapa ao vivo dos técnicos",
  ];

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-3 xl:p-4">
      <Card className="w-full max-w-md mx-auto">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <img src={resolvedTheme === "dark" ? logoWhite : logoDark} alt="Dominex" className="h-12" />
          </div>
          <div className="flex justify-center">
            <div className="rounded-full bg-primary/10 p-3">
              <Clock className="h-10 w-10 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">Seu Teste Encerrou</CardTitle>
          <CardDescription className="text-base">
            O período de teste finalizou em <span className="font-semibold">{formattedDate}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg bg-primary/5 border border-primary/20 p-4 space-y-3">
            <p className="text-sm font-medium flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Continue usando todas as funcionalidades!
            </p>
            <div className="space-y-2">
              {features.map((f) => (
                <div key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                  <span>{f}</span>
                </div>
              ))}
            </div>
          </div>

          <Button
            className="w-full h-auto py-5 flex flex-col items-center gap-1"
            onClick={() => navigate("/checkout")}
          >
            <span className="flex items-center gap-2 text-xl font-bold leading-tight">
              <Rocket className="h-6 w-6" />
              Ativar Assinatura
            </span>
            <span className="text-sm font-normal opacity-90 leading-none">
              Escolha seu plano e continue usando
            </span>
          </Button>

          <Button
            variant="outline"
            className="w-full hover:bg-destructive hover:text-destructive-foreground"
            size="lg"
            onClick={signOut}
          >
            <LogOut className="h-5 w-5 mr-2" />
            Sair
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            Escolha o plano ideal e continue usando o Dominex sem perder seus dados.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
