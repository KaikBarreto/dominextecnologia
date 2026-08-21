import { useEffect, useRef, useState } from 'react';
import { useVersionUpdate } from '@/hooks/useVersionUpdate';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer';
import { useIsMobile } from '@/hooks/use-mobile';
import { Sparkles, X, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { getVersionTopics } from '@/lib/versionTopics';

export const VersionUpdateNotification = () => {
  const { showUpdateNotification, currentVersion, dismissNotification } = useVersionUpdate();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const hasShownToast = useRef(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Tópicos curtos do que mudou nesta versão (derivados do changelog) —
  // mostrados no toast/drawer pra o cliente saber do que se trata.
  const topics = getVersionTopics(currentVersion);
  const MAX_TOPICS = 4;

  // Mobile: abre o drawer (bottom-sheet) quando uma nova versão é detectada.
  useEffect(() => {
    if (isMobile && showUpdateNotification) {
      setDrawerOpen(true);
    }
  }, [isMobile, showUpdateNotification]);

  // Desktop: mantém o toast (top-center, ~10s).
  useEffect(() => {
    if (isMobile) return;
    if (showUpdateNotification && !hasShownToast.current) {
      hasShownToast.current = true;

      toast.custom((t) => (
        <div className="w-[360px] max-w-[92vw] overflow-hidden rounded-lg bg-zinc-900 text-zinc-100 shadow-2xl">
          {/* Header escuro com gradiente sutil */}
          <div className="relative flex items-center gap-3 bg-gradient-to-br from-zinc-800 to-zinc-900 px-5 py-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
              <Sparkles className="h-[18px] w-[18px] text-zinc-100" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                Novidades
              </p>
              <p className="text-sm font-semibold text-white">Sistema atualizado</p>
            </div>
            <button
              type="button"
              aria-label="Fechar"
              onClick={() => {
                toast.dismiss(t);
                dismissNotification();
              }}
              className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Corpo */}
          <div className="space-y-3 px-5 py-4">
            <div className="space-y-1">
              <p className="text-base font-semibold text-white">
                <span className="inline-flex items-center rounded-md bg-white/10 px-2 py-0.5 font-mono text-sm ring-1 ring-white/10">
                  v{currentVersion}
                </span>{' '}
                já está no ar
              </p>
              <p className="text-sm text-zinc-400">Confira o que mudou nesta atualização.</p>
            </div>
            {topics.length > 0 && (
              <ul className="space-y-1.5">
                {topics.slice(0, MAX_TOPICS).map((topic, i) => (
                  <li key={i} className="flex gap-2 text-sm text-zinc-300">
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-zinc-500" />
                    <span className="leading-snug">{topic}</span>
                  </li>
                ))}
                {topics.length > MAX_TOPICS && (
                  <li className="pl-3 text-xs text-zinc-500">
                    +{topics.length - MAX_TOPICS} novidade(s)
                  </li>
                )}
              </ul>
            )}
            <Button
              className="w-full justify-center gap-1.5 bg-white text-zinc-900 hover:bg-zinc-200"
              onClick={() => {
                navigate('/changelog');
                toast.dismiss(t);
                dismissNotification();
              }}
            >
              Ver novidades
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ), {
        duration: 10000,
        position: 'top-center',
        // Remove o traço/barra de progresso do topo (toast-with-progress
        // global do Sonner). Sobra só o card escuro limpo.
        className: 'no-toast-progress',
      });
    }
  }, [isMobile, showUpdateNotification, currentVersion, dismissNotification, navigate]);

  if (!isMobile) {
    return null;
  }

  // Quando o drawer fecha (botão, X, arrastar pra baixo, clique fora),
  // marca a notificação como vista pra não reaparecer.
  const handleOpenChange = (open: boolean) => {
    setDrawerOpen(open);
    if (!open) {
      dismissNotification();
    }
  };

  return (
    <Drawer open={drawerOpen} onOpenChange={handleOpenChange}>
      <DrawerContent className="border-0 bg-zinc-900 text-zinc-100 [&>div:first-child]:bg-white/5">
        {/* Header escuro com gradiente sutil */}
        <div className="relative bg-gradient-to-br from-zinc-800 to-zinc-900 px-5 pb-5 pt-3">
          <button
            type="button"
            aria-label="Fechar"
            onClick={() => handleOpenChange(false)}
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
          <DrawerHeader className="items-start px-0 pb-0 text-left">
            <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
              <Sparkles className="h-5 w-5 text-zinc-100" />
            </span>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
              Novidades
            </p>
            <DrawerTitle className="text-lg font-semibold text-white">
              Sistema atualizado
            </DrawerTitle>
            <DrawerDescription className="text-zinc-400">
              A versão{' '}
              <span className="inline-flex items-center rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-xs text-zinc-100 ring-1 ring-white/10">
                v{currentVersion}
              </span>{' '}
              já está no ar. Confira o que mudou nesta atualização.
            </DrawerDescription>
          </DrawerHeader>
        </div>

        {/* Tópicos do que mudou nesta versão */}
        {topics.length > 0 && (
          <div className="px-5 pt-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
              O que mudou
            </p>
            <ul className="space-y-2">
              {topics.slice(0, MAX_TOPICS).map((topic, i) => (
                <li key={i} className="flex gap-2.5 text-sm text-zinc-300">
                  <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-600" />
                  <span className="leading-snug">{topic}</span>
                </li>
              ))}
              {topics.length > MAX_TOPICS && (
                <li className="pl-4 text-xs text-zinc-500">
                  +{topics.length - MAX_TOPICS} novidade(s)
                </li>
              )}
            </ul>
          </div>
        )}

        {/* Ações */}
        <div className="space-y-2.5 px-5 pb-8 pt-4">
          <Button
            size="lg"
            className="w-full justify-center gap-1.5 bg-white text-zinc-900 hover:bg-zinc-200"
            onClick={() => {
              navigate('/changelog');
              handleOpenChange(false);
            }}
          >
            Ver novidades
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button
            size="lg"
            variant="ghost"
            className="w-full justify-center text-zinc-400 hover:bg-red-600 hover:text-white"
            onClick={() => handleOpenChange(false)}
          >
            Fechar
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
};
