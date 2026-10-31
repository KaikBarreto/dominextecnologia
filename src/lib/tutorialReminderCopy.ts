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
  const idleDays = status.progress.lastProgressAt
    ? Math.max(0, Math.floor((Date.now() - new Date(status.progress.lastProgressAt).getTime()) / 86_400_000))
    : onboardingDay;
  const hasStarted = status.progress.trackCompleted > 0;
  const basicComplete = status.progress.coreTotal > 0
    && status.progress.coreCompleted >= status.progress.coreTotal;
  const hasRequiredPlanLessons = status.progress.trackTotal > status.progress.coreTotal;

  const title = status.reminder.severity === "critical"
    ? `${firstName}, sua trilha precisa de atenção.`
    : status.reminder.severity === "soft"
      ? `${firstName}, vamos retomar de onde você parou?`
      : basicComplete && hasRequiredPlanLessons
        ? `${firstName}, continue pelos módulos do seu plano.`
        : `${firstName}, comece sua trilha guiada.`;

  const context = hasStarted
    ? `${basicComplete && hasRequiredPlanLessons ? "A formação básica está concluída. " : ""}Você concluiu ${status.progress.trackCompleted} de ${status.progress.trackTotal} aulas da sua trilha${idleDays > 0 ? ` e está há ${idleDays} dia${idleDays === 1 ? "" : "s"} sem avançar` : ""}.`
    : `A próxima aula é “${lesson}”.`;

  return { title, description: `${context} ${detail}`, actionLabel: hasStarted ? "Continuar trilha" : "Começar agora" };
}
