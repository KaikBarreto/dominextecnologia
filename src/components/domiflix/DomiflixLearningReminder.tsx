import { AlertTriangle, ArrowRight, BookOpen, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { getDomiflixContinueUrl, useDismissDomiflixReminder, useDomiflixLearningStatus } from "@/hooks/useDomiflix";
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
    <section aria-label="Lembrete da trilha de tutoriais" className={cn("shrink-0 border-b px-3 py-2.5 text-white sm:px-4", critical ? "border-[#991B1B] bg-[#B91C1C]" : "border-[#C8141D] bg-[#E11D2E]")}>
      <div className="relative mx-auto flex max-w-[1600px] flex-col gap-3 sm:flex-row sm:items-center">
        <div className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-white sm:flex">
          {critical ? <AlertTriangle className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}
        </div>
        <div className="min-w-0 pr-11 sm:flex-1 sm:pr-0"><div className="flex min-w-0 flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-2"><p className="min-w-0 text-sm font-semibold leading-snug">{copy.title}</p><span className={cn("shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white", status.user.accountStage === "trial" ? "bg-red-600" : status.user.accountStage === "paid" ? "bg-emerald-600" : "bg-stone-600")}>{status.user.accountStage === "trial" ? "Em teste" : status.user.accountStage === "paid" ? "Contratado" : "Conta"}</span></div><p className="mt-1 text-xs leading-relaxed text-white/80 sm:mt-0 sm:line-clamp-1 sm:leading-normal">{copy.description}</p></div>
        <Button size="sm" onClick={() => navigate(getDomiflixContinueUrl(status))} className="h-11 w-full shrink-0 justify-between rounded-sm bg-white px-4 text-sm font-semibold text-red-700 hover:bg-white/90 sm:h-8 sm:w-auto sm:justify-center sm:px-3 sm:text-xs">
          <span className="hidden sm:inline">{copy.actionLabel}</span><span className="sm:hidden">Continuar tutorial</span><ArrowRight className="ml-1.5 h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" disabled={dismiss.isPending} onClick={() => dismiss.mutate()} className="absolute right-0 top-0 h-10 w-10 shrink-0 text-white/75 hover:bg-white/10 hover:text-white sm:static sm:h-8 sm:w-8" aria-label="Lembrar novamente amanhã"><X className="h-4 w-4" /></Button>
      </div>
    </section>
  );
}
