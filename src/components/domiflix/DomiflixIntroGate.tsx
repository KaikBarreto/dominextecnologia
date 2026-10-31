import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import dominexLogo from "@/assets/logo-white-horizontal.png";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { NetflixPlayer } from "@/pages/DomiflixWatch";
import {
  useAcknowledgeDomiflixIntro,
  useDomiflixEpisodeExtras,
  useDomiflixLearningStatus,
  useMarkEpisodeWatched,
  useDomiflixEpisodeMedia,
  getDomiflixContinueUrl,
} from "@/hooks/useDomiflix";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import {
  OVERLAY_PRIORITY,
  useOverlaySlot,
} from "@/contexts/OverlayCoordinatorContext";

export function DomiflixIntroGate() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const {
    data: status,
    isLoading,
    isError,
    refetch,
  } = useDomiflixLearningStatus();
  const lesson = status?.introGate.lesson ?? null;
  const { data: extras = { subtitles: [], resources: [] } } =
    useDomiflixEpisodeExtras(lesson?.episodeId);
  const { data: media } = useDomiflixEpisodeMedia(lesson?.episodeId);
  const markWatched = useMarkEpisodeWatched();
  const acknowledge = useAcknowledgeDomiflixIntro();
  const progressRef = useRef({ current: 0, total: 0 });
  const [videoCompleted, setVideoCompleted] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const usePortraitVideo = isMobile && Boolean(media?.mobile_video_id);
  const gateOpen = isLoading || isError || Boolean(status?.introGate.required);
  const canRender = useOverlaySlot(gateOpen, {
    id: "domiflix-intro-gate",
    priority: OVERLAY_PRIORITY.critical,
  });

  if (!isLoading && !isError && !status?.introGate.required) return null;
  if (!canRender) return null;
  async function ended() {
    if (!lesson || videoCompleted) return;
    const { current, total } = progressRef.current;
    try {
      await markWatched.mutateAsync({
        episodeId: lesson.episodeId,
        titleId: lesson.titleId,
        progressSeconds: Math.max(current, total),
        durationSeconds: total,
        completed: true,
      });
      setVideoCompleted(true);
    } catch {
      toast.error(
        "Não foi possível registrar o vídeo. Confira sua conexão e tente novamente.",
      );
    }
  }
  async function confirm() {
    if (!lesson || !videoCompleted || !understood) return;
    try {
      await acknowledge.mutateAsync(lesson.episodeId);
      const refreshed = await refetch();
      if (refreshed.data) navigate(getDomiflixContinueUrl(refreshed.data), { replace: true });
    } catch {
      toast.error("Não foi possível salvar sua confirmação. Tente novamente.");
    }
  }
  if (isLoading)
    return (
      <div className="fixed inset-0 z-[10000] grid place-items-center bg-[#111] text-white">
        <Loader2 className="h-7 w-7 animate-spin text-red-500" />
        <span className="sr-only">Preparando sua introdução</span>
      </div>
    );
  if (isError || !lesson?.videoId)
    return (
      <div className="fixed inset-0 z-[10000] grid place-items-center bg-[#111] p-6 text-white">
        <div className="max-w-sm text-center">
          <p className="text-lg font-semibold">
            Não conseguimos preparar sua introdução
          </p>
          <p className="mt-2 text-sm text-stone-400">
            Confira sua conexão. O sistema será liberado assim que essa etapa
            carregar.
          </p>
          <Button
            className="mt-5 bg-red-600 text-white hover:bg-red-500"
            onClick={() => refetch()}
          >
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  return (
    <div
      className="fixed inset-0 z-[10000] overflow-y-auto bg-[#111] text-white"
      role="dialog"
      aria-modal="true"
      aria-label="Introdução obrigatória"
    >
      <div className="flex min-h-[100dvh] flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-4 sm:h-[72px] sm:px-7 lg:px-9">
          <img
            src={dominexLogo}
            alt="Dominex"
            className="h-7 w-auto sm:h-8"
          />
          <span className="rounded-sm bg-red-600 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white">
            Primeiro passo
          </span>
        </header>
        <div className="grid flex-1 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_clamp(340px,26vw,430px)]">
          <div className="flex min-h-0 items-center bg-black/30 p-3 sm:p-5 lg:p-7 xl:p-9">
            <div className="w-full overflow-hidden rounded-sm border border-white/10 bg-black shadow-2xl shadow-black/40">
              <NetflixPlayer
                videoId={usePortraitVideo ? media!.mobile_video_id! : lesson.videoId}
                videoType={usePortraitVideo ? media!.mobile_video_type || lesson.videoType : lesson.videoType}
                orientation={usePortraitVideo ? "portrait" : "landscape"}
                titleName={lesson.moduleTitle}
                titleSubLabel="Introdução"
                episodeName={lesson.lessonTitle}
                episodeDescription={lesson.lessonDescription ?? undefined}
                onBack={() => undefined}
                onEnded={ended}
                onProgressUpdate={(current, total) => {
                  progressRef.current = { current, total };
                }}
                subtitles={extras.subtitles}
                locked
              />
            </div>
          </div>
          <section className="border-t border-white/10 bg-[#151515] px-5 py-7 pb-[max(1.75rem,env(safe-area-inset-bottom))] sm:px-7 lg:flex lg:min-h-0 lg:flex-col lg:justify-center lg:overflow-y-auto lg:border-l lg:border-t-0 lg:px-8 lg:py-8">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-500">
              Antes de usar o sistema
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Bem-vindo, {status?.user.firstName}
            </h1>
            <p className="mt-3 text-sm leading-6 text-stone-400">
              Este vídeo explica os combinados importantes da nossa parceria e
              mostra como aproveitar os tutoriais. Assista até o final para
              continuar.
            </p>
            <div className="mt-5 rounded-sm bg-white/[0.045] p-4">
              <div className="flex gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
                <div>
                  <p className="text-sm font-medium">Exibido uma única vez</p>
                  <p className="mt-1 text-xs leading-5 text-stone-500">
                    Se você estiver em teste e depois contratar, esta
                    confirmação continuará válida.
                  </p>
                </div>
              </div>
            </div>
            <label
              className={`mt-5 flex items-start gap-3 rounded-sm border p-4 ${videoCompleted ? "cursor-pointer border-white/15 bg-white/[0.035]" : "cursor-not-allowed border-white/[0.06] opacity-45"}`}
            >
              <Checkbox
                checked={understood}
                disabled={!videoCompleted}
                onCheckedChange={(checked) => setUnderstood(checked === true)}
                className="mt-0.5 border-stone-500 data-[state=checked]:border-red-600 data-[state=checked]:bg-red-600"
              />
              <span className="text-sm leading-5">
                Assisti ao vídeo até o final e entendi os combinados.
              </span>
            </label>
            <Button
              onClick={confirm}
              disabled={!videoCompleted || !understood || acknowledge.isPending}
              className="mt-4 h-12 w-full bg-red-600 font-semibold text-white hover:bg-red-500 disabled:bg-stone-800"
            >
              {acknowledge.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : videoCompleted ? (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              ) : null}
              {videoCompleted
                ? "Confirmar e começar a primeira aula"
                : "Assista até o final para continuar"}
            </Button>
          </section>
        </div>
      </div>
    </div>
  );
}
