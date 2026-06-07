import { useState, useEffect, type ReactNode } from 'react';
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from '@/components/ui/carousel';
import { cn } from '@/lib/utils';

/**
 * Carrossel horizontal de fotos — uma foto grande por vez, arrasta pro lado.
 * "Espiada" da próxima na borda deixa claro que dá pra arrastar (basis-[85%]).
 * Toque na foto abre o visualizador em tela cheia via onOpen(index).
 *
 * `renderImage` é um render-prop: cada consumidor passa o próprio componente de
 * imagem (ex.: SignedImg no ServiceOrderViewDialog, ReportImage no OSReport),
 * o que mantém o resolvedor de signed URL / skeleton / fallback de cada contexto
 * sem este componente conhecer detalhes de storage.
 *
 * renderOverlay opcional desenha algo sobre cada foto (ex.: Badge do tipo).
 * Com 1 foto só, mostra a foto grande sem carrossel/dots.
 *
 * IMPORTANTE: este carrossel mostra UMA foto por vez. Em contextos print/PDF
 * (ex.: OSReport) ele NÃO substitui o grid — o consumidor deve manter um grid
 * com todas as fotos visível no print e esconder o carrossel via classes
 * `md:hidden print:hidden`. Aqui é só a versão mobile-tela.
 */
export function PhotoCarousel({
  urls,
  onOpen,
  renderImage,
  renderOverlay,
}: {
  urls: string[];
  onOpen: (index: number) => void;
  /** Componente de imagem do consumidor. Recebe url, alt e className. */
  renderImage: (url: string, alt: string, className: string) => ReactNode;
  renderOverlay?: (index: number) => ReactNode;
}) {
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!api) return;
    setCurrent(api.selectedScrollSnap());
    const onSelect = () => setCurrent(api.selectedScrollSnap());
    api.on('select', onSelect);
    return () => {
      api.off('select', onSelect);
    };
  }, [api]);

  const renderPhoto = (url: string, index: number) => (
    <button
      type="button"
      onClick={() => onOpen(index)}
      aria-label={`Ampliar foto ${index + 1} de ${urls.length}`}
      className="relative block w-full aspect-[4/3] rounded-lg overflow-hidden bg-muted hover:opacity-90 active:opacity-80 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {renderImage(url, `Foto ${index + 1}`, 'w-full h-full object-cover')}
      {renderOverlay?.(index)}
    </button>
  );

  // Uma foto só: sem carrossel nem dots.
  if (urls.length < 2) {
    return urls.length === 1 ? <>{renderPhoto(urls[0], 0)}</> : null;
  }

  return (
    <div className="space-y-2">
      <Carousel setApi={setApi} opts={{ align: 'start' }}>
        <CarouselContent className="-ml-2">
          {urls.map((url, index) => (
            <CarouselItem key={index} className="pl-2 basis-[85%]">
              {renderPhoto(url, index)}
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
      <div className="flex items-center justify-center gap-1.5" aria-hidden="true">
        {urls.map((_, index) => (
          <span
            key={index}
            className={cn(
              'h-1.5 rounded-full transition-all',
              index === current ? 'w-4 bg-primary' : 'w-1.5 bg-muted-foreground/30',
            )}
          />
        ))}
      </div>
    </div>
  );
}
