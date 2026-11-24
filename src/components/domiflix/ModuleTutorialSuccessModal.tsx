import { CheckCircle2, Clock3, Play } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import domiflixLogo from '@/assets/domiflix-logo-horizontal-branco.png';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { useDomiflixLearningStatus } from '@/hooks/useDomiflix';
import { findDomiflixModuleTutorial, normalizeTutorialModuleCodes } from '@/lib/domiflixModuleTutorial';

export function ModuleTutorialSuccessModal({
  open,
  moduleCodes,
  onOpenChange,
}: {
  open: boolean;
  moduleCodes: readonly string[];
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const codes = normalizeTutorialModuleCodes(moduleCodes);
  const learning = useDomiflixLearningStatus(open && codes.length > 0);
  const tutorial = findDomiflixModuleTutorial(learning.data, codes);
  const coverUrl = tutorial?.lesson.bannerUrl || tutorial?.lesson.thumbnailUrl || null;
  const [coverFailed, setCoverFailed] = useState(false);

  useEffect(() => setCoverFailed(false), [coverUrl]);

  useEffect(() => {
    if (open && !learning.isLoading && !tutorial) onOpenChange(false);
  }, [learning.isLoading, onOpenChange, open, tutorial]);

  if (!open || (!learning.isLoading && !tutorial)) return null;

  const moduleName = tutorial?.lesson.moduleName || tutorial?.lesson.moduleTitle || 'Novo módulo';
  const lessonTitle = tutorial?.lesson.lessonTitle || 'Tutorial do módulo';
  const duration = tutorial?.lesson.durationMinutes;

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Módulo adicionado"
      className="sm:max-w-md"
      footer={tutorial ? (
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Agora não</Button>
          <Button
            className="gap-2"
            onClick={() => {
              onOpenChange(false);
              navigate(tutorial.url);
            }}
          >
            <Play className="h-4 w-4 fill-current" />
            Assistir tutorial
          </Button>
        </div>
      ) : undefined}
    >
      {learning.isLoading ? (
        <div className="space-y-3 py-2" role="status" aria-live="polite">
          <div className="aspect-video animate-pulse rounded-md bg-zinc-900" />
          <div className="space-y-2">
            <div className="h-4 w-2/3 animate-pulse rounded-sm bg-muted" />
            <div className="h-3 w-full animate-pulse rounded-sm bg-muted" />
          </div>
          <span className="sr-only">Preparando o tutorial do módulo.</span>
        </div>
      ) : tutorial ? (
        <div className="space-y-3 py-2">
          <div className="relative isolate aspect-[16/10] overflow-hidden rounded-md bg-[#141414] text-white shadow-xl sm:aspect-video">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_20%,rgba(229,9,20,0.42),transparent_42%),linear-gradient(135deg,#2b0709_0%,#141414_58%,#080808_100%)]" />

            {coverUrl && !coverFailed ? (
              <img
                src={coverUrl}
                alt={`Capa de ${tutorial.lesson.moduleTitle}`}
                loading="eager"
                decoding="async"
                onError={() => setCoverFailed(true)}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <img
                src={domiflixLogo}
                alt=""
                aria-hidden="true"
                className="absolute left-1/2 top-1/2 w-[78%] -translate-x-1/2 -translate-y-1/2 opacity-[0.07]"
              />
            )}

            <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/45 to-black/10" />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/45 to-black/25" />

            <div className="relative flex h-full flex-col justify-between p-4 sm:p-5">
              <div className="flex items-start justify-between gap-4">
                <img src={domiflixLogo} alt="Domiflix" className="h-auto w-24 sm:w-28" />
                <span className="inline-flex items-center gap-1.5 rounded-sm bg-black/55 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white backdrop-blur-sm">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#e50914]" aria-hidden="true" />
                  Aula recomendada
                </span>
              </div>

              <div className="max-w-[92%] space-y-2 sm:max-w-[82%]">
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  Módulo liberado
                </div>
                <div>
                  <h3 className="text-xl font-bold leading-tight tracking-tight text-white sm:text-2xl">
                    {moduleName}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-sm leading-snug text-white/75">
                    {lessonTitle}
                  </p>
                </div>
                {duration ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-white/60">
                    <Clock3 className="h-3.5 w-3.5" />
                    {duration} min
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <p className="text-sm leading-relaxed text-muted-foreground">
            Assista à aula para configurar o módulo e começar a usá-lo com segurança.
          </p>
        </div>
      ) : null}
    </ResponsiveModal>
  );
}
