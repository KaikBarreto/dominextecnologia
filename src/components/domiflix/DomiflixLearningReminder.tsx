import { AlertTriangle, ArrowRight, BookOpen, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useDismissDomiflixReminder, useDomiflixLearningStatus } from "@/hooks/useDomiflix";
import { getTutorialReminderCopy } from "@/lib/tutorialReminderCopy";
import { cn } from "@/lib/utils";

export function DomiflixLearningReminder() {
  const navigate = useNavigate();
  const { profile, isAdminUser } = useAuth();
  const { data: status, isError } = useDomiflixLearningStatus(!isAdminUser);
  const dismiss = useDismissDomiflixReminder();
  const { data: company } = useQuery({
    queryKey: ["domiflix-reminder-company", profile?.company_id],
    enabled: !!profile?.company_id && !isAdminUser,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("companies").select("subscription_status, subscription_expires_at").eq("id", profile!.company_id!).maybeSingle();
      return data;
    },
  });

  if (!status || isError || status.reminder.severity === "none" || status.reminder.severity === "complete") return null;
  if (company?.subscription_expires_at) {
    const expiration = new Date(company.subscription_expires_at);
    const days = Math.floor((new Date().setHours(0, 0, 0, 0) - expiration.setHours(0, 0, 0, 0)) / 86_400_000);
    if ((company.subscription_status === "testing" && days === 0) || (company.subscription_status === "active" && days > 0 && days <= 1)) return null;
  }

  const critical = status.reminder.severity === "critical";
  const copy = getTutorialReminderCopy(status);
  return (
    <section aria-label="Lembrete da trilha de tutoriais" className={cn("shrink-0 border-b px-3 py-2.5 sm:px-4", critical ? "border-red-500/40 bg-[#241516] text-red-50" : "border-border bg-stone-200 text-stone-950 dark:bg-stone-900 dark:text-stone-100")}>
      <div className="relative mx-auto flex max-w-[1600px] flex-col gap-3 sm:flex-row sm:items-center">
        <div className={cn("hidden h-8 w-8 shrink-0 items-center justify-center rounded-full sm:flex", critical ? "bg-red-500/15 text-red-400" : "bg-stone-950/10 text-red-700 dark:bg-white/10 dark:text-red-400")}>
          {critical ? <AlertTriangle className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}
        </div>
        <div className="min-w-0 pr-11 sm:flex-1 sm:pr-0"><div className="flex min-w-0 flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-2"><p className="min-w-0 text-sm font-semibold leading-snug">{copy.title}</p><span className={cn("shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white", status.user.accountStage === "trial" ? "bg-red-600" : status.user.accountStage === "paid" ? "bg-emerald-600" : "bg-stone-600")}>{status.user.accountStage === "trial" ? "Em teste" : status.user.accountStage === "paid" ? "Contratado" : "Conta"}</span></div><p className={cn("mt-1 text-xs leading-relaxed sm:mt-0 sm:line-clamp-1 sm:leading-normal", critical ? "text-red-100/75" : "text-stone-600 dark:text-stone-400")}>{copy.description}</p></div>
        <Button size="sm" onClick={() => navigate("/domiflix")} className={cn("h-11 w-full shrink-0 justify-between rounded-sm px-4 text-sm font-semibold sm:h-8 sm:w-auto sm:justify-center sm:px-3 sm:text-xs", critical ? "bg-red-600 text-white hover:bg-red-500" : "bg-stone-950 text-white hover:bg-red-700 dark:bg-stone-100 dark:text-stone-950 dark:hover:bg-red-500 dark:hover:text-white")}>
          <span className="hidden sm:inline">{copy.actionLabel}</span><span className="sm:hidden">Continuar tutorial</span><ArrowRight className="ml-1.5 h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" disabled={dismiss.isPending} onClick={() => dismiss.mutate()} className={cn("absolute right-0 top-0 h-10 w-10 shrink-0 sm:static sm:h-8 sm:w-8", critical ? "text-red-100/70 hover:bg-red-500/15 hover:text-white" : "text-stone-500")} aria-label="Lembrar novamente amanhã"><X className="h-4 w-4" /></Button>
      </div>
    </section>
  );
}
