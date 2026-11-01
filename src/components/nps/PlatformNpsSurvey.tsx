import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Check,
  Loader2,
  MessageSquareText,
  Sparkles,
  Star,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { GoogleGIcon } from "@/components/icons/GoogleGIcon";
import { useIsCompact } from "@/hooks/use-mobile";
import { usePlatformNpsSurvey } from "@/hooks/usePlatformNpsSurvey";
import {
  OVERLAY_PRIORITY,
  useOverlaySlot,
} from "@/contexts/OverlayCoordinatorContext";
import { isValidNpsScore, shouldInviteToGoogle } from "@/lib/platformNps";
import { cn } from "@/lib/utils";

type Stage = "enjoyment" | "score" | "feedback" | "google";

function scoreClass(score: number, selected: boolean): string {
  if (score <= 4) {
    return selected
      ? "border-destructive bg-destructive text-white"
      : "border-border bg-background text-foreground hover:border-destructive hover:bg-destructive hover:text-white";
  }
  if (score <= 7) {
    return selected
      ? "border-warning bg-warning text-white"
      : "border-border bg-background text-foreground hover:border-warning hover:bg-warning hover:text-white";
  }
  return selected
    ? "border-success bg-success text-white"
    : "border-border bg-background text-foreground hover:border-success hover:bg-success hover:text-white";
}

function friendlySubmitError(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;
  if (code === "23505")
    return "Sua resposta já foi registrada. Atualize a página para continuar.";
  return "Não foi possível salvar sua resposta. Confira sua conexão e tente novamente.";
}

/**
 * Pesquisa de satisfação da própria Dominex, exibida no login até o usuário
 * responder. Não confundir com o NPS de uma OS, configurado por cada tenant.
 */
export function PlatformNpsSurvey() {
  const isCompact = useIsCompact();
  const {
    survey,
    submit,
    isSubmitting,
    submitError,
    resetSubmitError,
    advance,
  } = usePlatformNpsSurvey(true);
  const [stage, setStage] = useState<Stage>("enjoyment");
  const [isEnjoying, setIsEnjoying] = useState<boolean | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [feedback, setFeedback] = useState("");
  const [reviewUrl, setReviewUrl] = useState<string | null>(null);

  const requestedOpen = Boolean(survey);
  const isActiveOverlay = useOverlaySlot(requestedOpen, {
    id: "platform-nps-survey",
    priority: OVERLAY_PRIORITY.tutorial,
  });
  const visibleOpen = requestedOpen && isActiveOverlay;

  useEffect(() => {
    setStage("enjoyment");
    setIsEnjoying(null);
    setScore(null);
    setFeedback("");
    setReviewUrl(null);
    resetSubmitError();
  }, [survey?.id, resetSubmitError]);

  if (!survey) return null;

  const canSubmit =
    isEnjoying !== null && isValidNpsScore(score) && !isSubmitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    resetSubmitError();
    try {
      const result = await submit({
        surveyId: survey.id,
        isEnjoying,
        score,
        feedback: feedback.trim() || null,
      });

      const serverApprovedInvite =
        result.shouldInviteGoogle &&
        shouldInviteToGoogle(
          {
            google_review_url: result.googleReviewUrl,
            google_review_min_score: null,
          },
          score,
        );
      if (serverApprovedInvite) {
        setReviewUrl(result.googleReviewUrl);
        setStage("google");
        return;
      }

      await advance();
    } catch (error) {
      // A campanha pode ser pausada/encerrada entre a consulta e o envio. O
      // servidor usa P0001 para essas recusas de domínio; reconsultamos a fila
      // em vez de prender a pessoa num modal que já não pode ser respondido.
      if ((error as { code?: string } | null)?.code === "P0001") {
        await advance();
      }
      // Demais falhas ficam mapeadas e recuperáveis dentro do próprio modal.
    }
  };

  const finishGoogleInvite = () => {
    void advance();
  };

  const title = stage === "google" ? "Obrigado por responder!" : survey.title;
  const description =
    stage === "google"
      ? "Sua resposta foi salva com sucesso."
      : survey.description ||
        "Leva menos de um minuto e ajuda a melhorar sua experiência.";
  const currentStep = stage === "enjoyment" ? 1 : stage === "score" ? 2 : 3;

  const surveyIntro = (
    <div className="bg-primary px-5 pb-5 pt-6 text-primary-foreground sm:px-7 sm:pb-6 sm:pt-7">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-primary-foreground/80">
          <Sparkles className="h-3.5 w-3.5" />
          Pesquisa rápida
        </span>
        {stage !== "google" && (
          <span className="text-xs font-semibold tabular-nums text-primary-foreground/80">
            {currentStep} de 3
          </span>
        )}
      </div>
      <h2 className="max-w-lg text-2xl font-bold leading-tight sm:text-[1.75rem]">
        {title}
      </h2>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-primary-foreground/85">
        {description}
      </p>
      {stage !== "google" && (
        <div className="mt-5 grid grid-cols-3 gap-1.5" aria-hidden="true">
          {[1, 2, 3].map((step) => (
            <span
              key={step}
              className={cn(
                "h-1.5 rounded-full transition-colors",
                step <= currentStep
                  ? "bg-primary-foreground"
                  : "bg-primary-foreground/25",
              )}
            />
          ))}
        </div>
      )}
    </div>
  );

  const body =
    stage === "google" ? (
      <div className="flex flex-col items-center gap-4 px-5 py-6 text-center sm:px-7 sm:py-7">
        <GoogleGIcon size={44} className="shrink-0" />
        <div className="flex items-center gap-1" aria-hidden="true">
          {[1, 2, 3, 4, 5].map((item) => (
            <Star key={item} className="h-7 w-7 fill-warning text-warning" />
          ))}
        </div>
        <div className="max-w-sm space-y-1.5">
          <p className="text-lg font-bold text-foreground">
            Avalie a Dominex no Google
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Poderia nos avaliar com 5 estrelas? Leva menos de um minuto e ajuda
            outras empresas a conhecerem a Dominex.
          </p>
        </div>
        <div className="mt-1 flex w-full flex-col gap-2">
          <Button asChild size="lg" className="h-12 w-full text-base">
            <a
              href={reviewUrl || "#"}
              target="_blank"
              rel="noopener noreferrer"
              onClick={finishGoogleInvite}
            >
              <GoogleGIcon size={20} className="shrink-0" />
              Avaliar no Google
            </a>
          </Button>
          <Button type="button" variant="ghost" onClick={finishGoogleInvite}>
            Agora não
          </Button>
        </div>
      </div>
    ) : stage === "enjoyment" ? (
      <section
        className="px-5 py-6 sm:px-7 sm:py-7"
        aria-labelledby="platform-nps-enjoyment"
      >
        <div className="mx-auto max-w-md text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Sua experiência
          </p>
          <h3
            id="platform-nps-enjoyment"
            className="mt-2 text-xl font-bold leading-snug text-foreground sm:text-2xl"
          >
            {survey.enjoyment_question}
          </h3>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4">
            <button
              type="button"
              aria-pressed={isEnjoying === true}
              onClick={() => {
                setIsEnjoying(true);
                setStage("score");
              }}
              className={cn(
                "flex min-h-28 flex-col items-center justify-center gap-2 rounded-2xl border-2 px-3 py-4 text-base font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:min-h-32",
                isEnjoying === true
                  ? "border-success bg-success text-white hover:bg-success hover:text-white"
                  : "border-border bg-background hover:border-success hover:bg-success hover:text-white",
              )}
            >
              <ThumbsUp className="h-7 w-7" />
              <span className="flex items-center gap-1.5">
                Sim {isEnjoying === true && <Check className="h-4 w-4" />}
              </span>
            </button>
            <button
              type="button"
              aria-pressed={isEnjoying === false}
              onClick={() => {
                setIsEnjoying(false);
                setStage("score");
              }}
              className={cn(
                "flex min-h-28 flex-col items-center justify-center gap-2 rounded-2xl border-2 px-3 py-4 text-base font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:min-h-32",
                isEnjoying === false
                  ? "border-destructive bg-destructive text-white hover:bg-destructive hover:text-white"
                  : "border-border bg-background hover:border-destructive hover:bg-destructive hover:text-white",
              )}
            >
              <ThumbsDown className="h-7 w-7" />
              <span className="flex items-center gap-1.5">
                Não {isEnjoying === false && <Check className="h-4 w-4" />}
              </span>
            </button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Toque em uma opção para continuar.
          </p>
        </div>
      </section>
    ) : stage === "score" ? (
      <section
        className="px-5 py-6 sm:px-7 sm:py-7"
        aria-labelledby="platform-nps-score"
      >
        <div className="mx-auto max-w-lg text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Sua recomendação
          </p>
          <h3
            id="platform-nps-score"
            className="mt-2 text-xl font-bold leading-snug text-foreground sm:text-2xl"
          >
            {survey.recommendation_question}
          </h3>
          <p className="mt-2 text-xs text-muted-foreground">Escala de 0 a 10</p>
          <div className="mt-6 flex justify-between text-[11px] font-medium text-muted-foreground sm:text-xs">
            <span>Muito insatisfeito</span>
            <span>Muito satisfeito</span>
          </div>
          <div
            className="mt-2 grid grid-cols-11 gap-1"
            role="group"
            aria-label="Escala de satisfação de 0 a 10"
          >
            {Array.from({ length: 11 }, (_, value) => (
              <button
                key={value}
                type="button"
                aria-label={`Nota ${value}`}
                aria-pressed={score === value}
                onClick={() => {
                  setScore(value);
                  setStage("feedback");
                }}
                className={cn(
                  "h-11 min-w-0 rounded-lg border p-0 text-xs font-bold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-12 sm:text-sm",
                  scoreClass(value, score === value),
                )}
              >
                {value}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setStage("enjoyment")}
            className="mx-auto mt-6 inline-flex min-h-10 items-center gap-2 rounded-md px-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar
          </button>
        </div>
      </section>
    ) : (
      <section
        className="px-5 py-6 sm:px-7 sm:py-7"
        aria-labelledby="platform-nps-feedback-label"
      >
        <div className="mx-auto max-w-lg">
          <div className="text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <MessageSquareText className="h-6 w-6" />
            </span>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Último passo
            </p>
            <label
              id="platform-nps-feedback-label"
              htmlFor="platform-nps-feedback"
              className="mt-2 block text-xl font-bold leading-snug text-foreground sm:text-2xl"
            >
              {survey.feedback_prompt || "Quer contar o motivo? (opcional)"}
            </label>
            <p className="mt-2 text-sm text-muted-foreground">
              Sua sugestão ajuda a decidir as próximas melhorias.
            </p>
          </div>
          <Textarea
            id="platform-nps-feedback"
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            maxLength={1000}
            rows={4}
            placeholder="Escreva aqui, se quiser..."
            className="mt-5 min-h-28 resize-none rounded-xl"
          />
          <p className="mt-1.5 text-right text-[11px] tabular-nums text-muted-foreground">
            {feedback.length}/1000
          </p>

          {submitError && (
            <div
              role="alert"
              className="mt-4 rounded-lg border border-destructive px-3 py-2 text-sm"
            >
              <p className="font-semibold text-destructive">
                Não conseguimos enviar agora
              </p>
              <p className="mt-0.5 text-muted-foreground">
                {friendlySubmitError(submitError)}
              </p>
            </div>
          )}

          <Button
            type="button"
            size="lg"
            className="mt-5 h-12 w-full text-base"
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Enviando resposta...
              </>
            ) : (
              "Enviar resposta"
            )}
          </Button>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            A pesquisa será encerrada assim que sua resposta for salva.
          </p>
          <button
            type="button"
            onClick={() => setStage("score")}
            disabled={isSubmitting}
            className="mx-auto mt-3 flex min-h-10 items-center gap-2 rounded-md px-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar
          </button>
        </div>
      </section>
    );

  const content = (
    <>
      {surveyIntro}
      {body}
    </>
  );

  if (isCompact) {
    return (
      <Drawer
        open={visibleOpen}
        onOpenChange={() => undefined}
        dismissible={false}
      >
        <DrawerContent
          className="flex max-h-[92dvh] flex-col overflow-hidden border-0 p-0"
          onPointerDownOutside={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DrawerHeader className="sr-only">
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>{description}</DrawerDescription>
          </DrawerHeader>
          <div className="min-h-0 flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
            {content}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog
      open={visibleOpen}
      onOpenChange={() => undefined}
      disableMobileDrawer
    >
      <DialogContent
        className="max-h-[90vh] overflow-hidden border-0 p-0 shadow-2xl sm:max-w-xl sm:rounded-3xl [&>button]:hidden"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[90vh] overflow-y-auto">{content}</div>
      </DialogContent>
    </Dialog>
  );
}
