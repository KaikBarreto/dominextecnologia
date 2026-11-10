import type { DomiflixLearningStatus } from "@/hooks/useDomiflix";

const COPY = {
  trial: [
    "aproveite seu período de teste para aprender o fluxo certo desde o começo.",
    "seu teste rende mais quando você aplica cada aula no sistema.",
    "avance na trilha durante o teste e valide o sistema com segurança.",
  ],
  paid: [
    "sua assinatura já está ativa; transforme o sistema em rotina com a próxima aula.",
    "você já contratou o sistema. Agora falta dominar o próximo passo da operação.",
    "continue a implantação pela trilha e aproveite melhor o que já está no seu plano.",
  ],
  neutral: [
    "continue a trilha para aprender o próximo passo da sua operação.",
    "uma aula curta agora evita dúvidas no uso do sistema depois.",
    "retome de onde parou e avance na implantação do sistema.",
  ],
} as const;

function daySeed(day: number, name: string, lesson: string) {
  return Math.abs([...`${day}:${name}:${lesson}`].reduce((sum, char) => sum + char.charCodeAt(0), 0));
}
export function getTutorialReminderCopy(status: DomiflixLearningStatus) {
  const { firstName, accountStage, onboardingDay } = status.user;
  const lesson = status.nextLesson?.lessonTitle ?? "próxima aula";
  const variants = COPY[accountStage];
  const detail = variants[daySeed(onboardingDay, firstName, lesson) % variants.length];
  const lastProgressTime = status.progress.lastProgressAt
    ? new Date(status.progress.lastProgressAt).getTime()
    : Number.NaN;
  const idleDays = Number.isFinite(lastProgressTime)
    ? Math.max(0, Math.floor((Date.now() - lastProgressTime) / 86_400_000))
    : onboardingDay;
  const hasStarted = status.progress.trackCompleted > 0;
  const basicComplete = status.progress.coreTotal > 0
    && status.progress.coreCompleted >= status.progress.coreTotal;
  const hasRequiredPlanLessons = status.progress.trackTotal > status.progress.coreTotal;
  const remaining = Math.max(0, status.progress.trackTotal - status.progress.trackCompleted);
  const critical = status.reminder.severity === "critical";

  let title: string;
  let context: string;
  let actionLabel: string;

  if (critical && !hasStarted) {
    title = `${firstName}, sua trilha ainda não começou.`;
    context = `Já se passaram ${onboardingDay} dias do seu onboarding. Comece pela aula “${lesson}”.`;
    actionLabel = "Começar agora";
  } else if (critical) {
    title = `${firstName}, sua trilha está parada há ${idleDays} dia${idleDays === 1 ? "" : "s"}.`;
    context = `Você concluiu ${status.progress.trackCompleted} de ${status.progress.trackTotal} aulas. Faltam ${remaining}; retome por “${lesson}”.`;
    actionLabel = "Retomar agora";
  } else if (hasStarted && remaining === 1) {
    title = `${firstName}, falta só uma aula para concluir sua trilha.`;
    context = `Finalize “${lesson}” e complete os tutoriais da formação básica e dos módulos do seu plano.`;
    actionLabel = "Concluir trilha";
  } else if (basicComplete && hasRequiredPlanLessons) {
    title = `${firstName}, agora continue pelos módulos do seu plano.`;
    context = `A formação básica está concluída. Sua próxima aula é “${lesson}”.`;
    actionLabel = "Continuar trilha";
  } else if (hasStarted) {
    title = `${firstName}, continue de onde parou.`;
    context = `Você já concluiu ${status.progress.trackPercent}% da sua trilha. A próxima aula é “${lesson}”.`;
    actionLabel = "Continuar trilha";
  } else {
    title = `${firstName}, comece sua trilha guiada.`;
    context = `A primeira aula é “${lesson}”.`;
    actionLabel = "Começar agora";
  }

  return { title, description: `${context} ${detail}`, actionLabel };
}
