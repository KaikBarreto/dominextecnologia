import { ArrowRight, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

export function DomiflixModuleOffer({
  moduleCode,
  moduleName,
  modulePrice,
  accountStage,
}: {
  moduleCode: string;
  moduleName: string;
  modulePrice: number | null;
  accountStage: "trial" | "paid" | "neutral";
}) {
  const navigate = useNavigate();
  const formattedPrice = modulePrice == null
    ? null
    : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(modulePrice);

  return (
    <div className="mt-6 border-l-2 border-red-600 bg-white/[0.035] px-4 py-4 sm:flex sm:items-center sm:justify-between sm:gap-6">
      <div>
        <p className="text-sm font-semibold text-white">Conheça agora. Ative quando fizer sentido.</p>
        <p className="mt-1 text-sm leading-6 text-stone-400">
          Esta aula está liberada, mas a função {moduleName} ainda não faz parte do seu plano.
          {formattedPrice && accountStage === "paid" ? ` A partir de ${formattedPrice}/mês, com o valor exato confirmado antes da contratação.` : " Escolha o módulo ao montar sua assinatura."}
        </p>
      </div>
      <Button
        onClick={() => navigate(accountStage === "paid" ? `/billing?addModule=${encodeURIComponent(moduleCode)}` : "/billing")}
        className="mt-4 h-11 shrink-0 rounded-sm bg-red-600 px-4 font-semibold text-white hover:bg-red-500 sm:mt-0"
      >
        {accountStage === "paid" ? <Plus className="mr-2 h-4 w-4" /> : <ArrowRight className="mr-2 h-4 w-4" />}
        {accountStage === "paid" ? "Adicionar ao meu plano" : "Escolher meu plano"}
      </Button>
    </div>
  );
}
