import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, XCircle, Ban } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from '@/components/ui/carousel';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

export interface NfseStats {
  autorizadas: number;
  processando: number;
  rejeitadas: number;
  canceladas: number;
}

interface NfseStatsCardsProps {
  stats: NfseStats;
  loading?: boolean;
}

/** Bolinhas de posição do carrossel (mobile). */
function CarouselDots({ api }: { api: CarouselApi | undefined }) {
  const [selected, setSelected] = useState(0);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!api) return;
    setCount(api.scrollSnapList().length);
    setSelected(api.selectedScrollSnap());
    const onSelect = () => setSelected(api.selectedScrollSnap());
    api.on('select', onSelect);
    return () => {
      api.off('select', onSelect);
    };
  }, [api]);

  if (count <= 1) return null;

  return (
    <div className="flex justify-center gap-1.5 mt-3">
      {Array.from({ length: count }).map((_, i) => (
        <button
          key={i}
          type="button"
          aria-label={`${i + 1}`}
          className={cn(
            'h-1.5 rounded-full transition-all',
            i === selected ? 'w-4 bg-primary' : 'w-1.5 bg-muted-foreground/30',
          )}
          onClick={() => api?.scrollTo(i)}
        />
      ))}
    </div>
  );
}

/**
 * Cards de indicadores da tela de Notas Fiscais.
 *
 * Espelha o tratamento do EcoSistema: cor CHEIA, texto e ícone brancos, ícone
 * num chip um tom mais escuro. Selo dessaturado com contorno tem cara de UI
 * genérica — aqui o número tem que saltar da tela.
 *
 * Vive ACIMA do menu de abas: os mesmos quatro números valem tanto na Visão
 * Geral quanto na listagem, então não faz sentido eles sumirem ao trocar de aba.
 * No mobile viram carrossel com bolinhas (4 cards lado a lado não caberiam).
 */
export function NfseStatsCards({ stats, loading = false }: NfseStatsCardsProps) {
  const isMobile = useIsMobile();
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.nfse;
  const [api, setApi] = useState<CarouselApi>();

  const cards: {
    key: string;
    title: string;
    value: number;
    icon: LucideIcon;
    bgColor: string;
    iconBg: string;
    spin?: boolean;
  }[] = [
    {
      key: 'autorizadas',
      title: t.overview.countAuthorized,
      value: stats.autorizadas,
      icon: CheckCircle2,
      bgColor: 'bg-emerald-500',
      iconBg: 'bg-emerald-600',
    },
    {
      key: 'processando',
      title: t.overview.countProcessing,
      value: stats.processando,
      icon: Loader2,
      bgColor: 'bg-amber-500',
      iconBg: 'bg-amber-600',
      spin: stats.processando > 0,
    },
    {
      key: 'rejeitadas',
      title: t.overview.countRejected,
      value: stats.rejeitadas,
      icon: XCircle,
      bgColor: 'bg-red-500',
      iconBg: 'bg-red-600',
    },
    {
      key: 'canceladas',
      title: t.overview.countCancelled,
      value: stats.canceladas,
      icon: Ban,
      // Cancelada não é erro nem sucesso: cinza-escuro, o mesmo tratamento que
      // o EcoSistema dá aos documentos encerrados.
      bgColor: 'bg-gray-800 dark:bg-gray-900',
      iconBg: 'bg-gray-700 dark:bg-gray-800',
    },
  ];

  /* ─── Os 4 contadores saturados ─── */
  let countersBlock: React.ReactNode;

  if (loading) {
    countersBlock = isMobile ? (
      <Card className="border-0 shadow-lg bg-muted">
        <CardContent className="p-6 flex flex-col items-center justify-center gap-3 min-h-[140px]">
          <Skeleton className="h-10 w-10 rounded-2xl" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-20" />
        </CardContent>
      </Card>
    ) : (
      <div className="grid gap-3 lg:gap-4 grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.key} className="border-0 shadow-lg bg-muted">
            <CardContent className="p-4 lg:p-6">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-8 w-12" />
                </div>
                <Skeleton className="h-8 w-8 rounded-xl" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  } else if (isMobile) {
    countersBlock = (
      <div className="w-full">
        <Carousel opts={{ align: 'start', loop: false }} setApi={setApi} className="w-full">
          <CarouselContent className="-ml-2">
            {cards.map((card) => (
              <CarouselItem key={card.key} className="pl-2 basis-[85%]">
                <Card
                  className={cn(
                    'relative overflow-hidden border-0 shadow-lg text-white',
                    card.bgColor,
                  )}
                >
                  <CardContent className="p-6 flex flex-col items-center justify-center text-center gap-3 min-h-[140px]">
                    <div className={cn('p-3 rounded-2xl', card.iconBg)}>
                      <card.icon
                        className={cn('h-6 w-6 text-white', card.spin && 'animate-spin')}
                      />
                    </div>
                    <p className="text-sm font-medium text-white/90">{card.title}</p>
                    <p className="text-2xl font-bold tracking-tight tabular-nums">{card.value}</p>
                  </CardContent>
                </Card>
              </CarouselItem>
            ))}
          </CarouselContent>
        </Carousel>
        <CarouselDots api={api} />
      </div>
    );
  } else {
    countersBlock = (
      <div className="grid gap-3 lg:gap-4 grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <Card
            key={card.key}
            className={cn('relative overflow-hidden border-0 shadow-lg text-white', card.bgColor)}
          >
            <CardContent className="p-4 lg:p-6">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1 lg:space-y-2 min-w-0">
                  <p className="text-xs lg:text-sm font-medium text-white/80">{card.title}</p>
                  <p className="text-lg lg:text-2xl font-bold tracking-tight tabular-nums">
                    {card.value}
                  </p>
                </div>
                <div className={cn('p-2 rounded-xl shrink-0', card.iconBg)}>
                  <card.icon
                    className={cn('h-4 w-4 text-white', card.spin && 'animate-spin')}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <>{countersBlock}</>
  );
}
