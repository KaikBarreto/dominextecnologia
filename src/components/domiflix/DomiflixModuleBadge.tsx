import { Check, FlaskConical, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function DomiflixModuleBadge({
  group,
  includedInPlan,
  accountStage = "neutral",
  className,
}: {
  group: "core" | "plan";
  includedInPlan: boolean;
  accountStage?: "trial" | "paid" | "neutral";
  className?: string;
}) {
  if (group === "core") {
    return (
      <span className={cn("inline-flex items-center rounded-sm bg-stone-700 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white", className)}>
        Formação básica
      </span>
    );
  }

  if (accountStage === "trial" && !includedInPlan) {
    return (
      <span className={cn("inline-flex items-center gap-1.5 rounded-sm bg-blue-600 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white", className)}>
        <FlaskConical className="h-3 w-3 stroke-[3] text-white" />
        Liberado no teste
      </span>
    );
  }

  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white",
      includedInPlan ? "bg-emerald-600" : "bg-red-600",
      className,
    )}>
      {includedInPlan ? <Check className="h-3 w-3 stroke-[3] text-white" /> : <X className="h-3 w-3 stroke-[3] text-white" />}
      {includedInPlan ? "Tem no seu plano" : "Não tem no seu plano"}
    </span>
  );
}
