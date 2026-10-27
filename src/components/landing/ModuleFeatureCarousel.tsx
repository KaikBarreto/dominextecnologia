import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { ArrowLeft, ArrowRight, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useLocale } from '@/lib/i18n';

export interface ModuleFeatureCarouselItem {
  icon: LucideIcon;
  title: string;
  description: string;
}

export interface ModuleFeatureCarouselProps {
  features: ModuleFeatureCarouselItem[];
  heading: string;
  subheading: string;
  footer?: ReactNode;
  controlSlot?: ReactNode;
  sectionId?: string;
}

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function interpolate(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.split(`{${key}}`).join(String(value)),
    template,
  );
}

export default function ModuleFeatureCarousel({
  features,
  heading,
  subheading,
  footer,
  controlSlot,
  sectionId = 'recursos-modulo',
}: ModuleFeatureCarouselProps) {
  const { messages } = useLocale();
  const copy = messages.pageChrome.featureCarousel;
  const viewportRef = useRef<HTMLUListElement>(null);
  const itemRefs = useRef<Array<HTMLLIElement | null>>([]);
  const scrollFrameRef = useRef<number>();
  const [visibleCount, setVisibleCount] = useState(1);
  const [currentPage, setCurrentPage] = useState(0);

  const pageCount = useMemo(
    () => Math.max(1, Math.ceil(features.length / visibleCount)),
    [features.length, visibleCount],
  );

  const measureVisibleCards = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    if (viewport.clientWidth >= 1024) {
      setVisibleCount(3);
    } else if (viewport.clientWidth >= 640) {
      setVisibleCount(2);
    } else {
      setVisibleCount(1);
    }
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    measureVisibleCards();
    const observer = new ResizeObserver(measureVisibleCards);
    observer.observe(viewport);

    return () => observer.disconnect();
  }, [measureVisibleCards]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, pageCount - 1));
  }, [pageCount]);

  useEffect(
    () => () => {
      if (scrollFrameRef.current !== undefined) {
        cancelAnimationFrame(scrollFrameRef.current);
      }
    },
    [],
  );

  const goToPage = useCallback(
    (requestedPage: number) => {
      const viewport = viewportRef.current;
      if (!viewport || features.length === 0) return;

      const nextPage = Math.max(0, Math.min(requestedPage, pageCount - 1));
      const targetIndex = Math.min(nextPage * visibleCount, features.length - 1);
      const target = itemRefs.current[targetIndex];
      if (!target) return;

      viewport.scrollTo({
        left: Math.max(0, target.offsetLeft),
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      });
      setCurrentPage(nextPage);
    },
    [features.length, pageCount, visibleCount],
  );

  const syncPageWithScroll = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport || features.length === 0) return;

    if (scrollFrameRef.current !== undefined) {
      cancelAnimationFrame(scrollFrameRef.current);
    }

    scrollFrameRef.current = requestAnimationFrame(() => {
      const scrollPosition = viewport.scrollLeft;
      let closestIndex = 0;
      let closestDistance = Number.POSITIVE_INFINITY;

      itemRefs.current.forEach((item, index) => {
        if (!item) return;
        const distance = Math.abs(item.offsetLeft - scrollPosition);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = index;
        }
      });

      setCurrentPage(
        Math.min(pageCount - 1, Math.round(closestIndex / visibleCount)),
      );
    });
  }, [features.length, pageCount, visibleCount]);

  const handleKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      goToPage(currentPage - 1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      goToPage(currentPage + 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      goToPage(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      goToPage(pageCount - 1);
    }
  };

  const hasMultiplePages = pageCount > 1;
  const highlightedIndex = Math.min(currentPage * visibleCount, features.length - 1);

  return (
    <section
      id={sectionId}
      aria-labelledby={`${sectionId}-title`}
      className="overflow-hidden bg-[#f4f2ec] py-20 text-slate-950 dark:bg-[#0b100d] dark:text-white sm:py-24 lg:py-28"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <header className="grid gap-8 border-b border-slate-950/15 pb-10 dark:border-white/15 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)] lg:items-end lg:gap-16">
          <div>
            <p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-primary">
              {copy.eyebrow}
            </p>
            <h2
              id={`${sectionId}-title`}
              className="max-w-3xl text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl"
            >
              {heading}
            </h2>
          </div>

          <div className="space-y-6">
            <p className="max-w-xl text-base leading-relaxed text-slate-600 dark:text-white/55 sm:text-lg">
              {subheading}
            </p>
            {controlSlot}
          </div>
        </header>

        {features.length > 0 ? (
          <div className="relative mt-10 sm:mt-12">
            <div
              role="region"
              aria-roledescription="carrossel"
              aria-label={heading}
            >
              <ul
                id={`${sectionId}-carousel`}
                ref={viewportRef}
                tabIndex={0}
                className="relative flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 outline-none [scrollbar-color:rgba(15,23,42,0.28)_transparent] focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-4 focus-visible:ring-offset-[#f4f2ec] sm:gap-6"
                onKeyDown={handleKeyDown}
                onScroll={syncPageWithScroll}
              >
                {features.map((feature, index) => {
                  const Icon = feature.icon;
                  const isHighlighted = index === highlightedIndex;

                  return (
                    <li
                      key={`${feature.title}-${index}`}
                      ref={(node) => {
                        itemRefs.current[index] = node;
                      }}
                      className={cn(
                        'flex min-h-[310px] w-full shrink-0 snap-start flex-col border p-6 sm:w-[calc((100%_-_1.5rem)/2)] sm:p-7 lg:w-[calc((100%_-_3rem)/3)] lg:p-8',
                        'rounded-lg transition-colors duration-300 motion-reduce:transition-none',
                        isHighlighted
                          ? 'border-slate-950 bg-slate-950 text-white'
                          : 'border-slate-950/15 bg-white text-slate-950 dark:border-white/10 dark:bg-white/[0.03] dark:text-white',
                      )}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <span
                          className={cn(
                            'flex h-11 w-11 items-center justify-center border',
                            isHighlighted
                              ? 'border-white/20 text-emerald-400'
                              : 'border-slate-950/15 text-primary dark:border-white/15',
                          )}
                          aria-hidden="true"
                        >
                          <Icon className="h-5 w-5" strokeWidth={1.8} />
                        </span>
                        <span
                          className={cn(
                            'font-mono text-sm font-semibold tabular-nums',
                            isHighlighted ? 'text-white/45' : 'text-slate-400 dark:text-white/35',
                          )}
                          aria-hidden="true"
                        >
                          {String(index + 1).padStart(2, '0')}
                        </span>
                      </div>

                      <div className="mt-auto pt-14">
                        <h3 className="text-xl font-bold tracking-tight sm:text-2xl">
                          {feature.title}
                        </h3>
                        <p
                          className={cn(
                            'mt-4 text-sm leading-7 sm:text-base',
                            isHighlighted ? 'text-white/65' : 'text-slate-600 dark:text-white/55',
                          )}
                        >
                          {feature.description}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="mt-7 flex flex-wrap items-center justify-between gap-5">
              <div className="flex items-center gap-2" aria-label={copy.pageChooser}>
                {Array.from({ length: pageCount }, (_, page) => (
                  <button
                    key={page}
                    type="button"
                    aria-label={interpolate(copy.goToPage, { page: page + 1, total: pageCount })}
                    aria-current={currentPage === page ? 'true' : undefined}
                    onClick={() => goToPage(page)}
                    className={cn(
                      'h-2.5 rounded-full transition-[width,background-color] motion-reduce:transition-none',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-4 focus-visible:ring-offset-[#f4f2ec]',
                      currentPage === page
                        ? 'w-8 bg-primary'
                        : 'w-2.5 bg-slate-950/20 hover:bg-slate-950/40 dark:bg-white/20 dark:hover:bg-white/40',
                    )}
                  />
                ))}
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  aria-label={copy.previous}
                  aria-controls={`${sectionId}-carousel`}
                  disabled={!hasMultiplePages || currentPage === 0}
                  onClick={() => goToPage(currentPage - 1)}
                  className="inline-flex h-11 w-11 items-center justify-center border border-slate-950/20 bg-transparent text-slate-950 transition-colors hover:border-slate-950 hover:bg-slate-950 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-4 focus-visible:ring-offset-[#f4f2ec] disabled:cursor-not-allowed disabled:opacity-30 dark:border-white/20 dark:text-white dark:hover:bg-white dark:hover:text-black motion-reduce:transition-none"
                >
                  <ArrowLeft className="h-5 w-5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label={copy.next}
                  aria-controls={`${sectionId}-carousel`}
                  disabled={!hasMultiplePages || currentPage === pageCount - 1}
                  onClick={() => goToPage(currentPage + 1)}
                  className="inline-flex h-11 w-11 items-center justify-center border border-slate-950 bg-slate-950 text-white transition-colors hover:bg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 focus-visible:ring-offset-[#f4f2ec] disabled:cursor-not-allowed disabled:opacity-30 dark:border-white dark:bg-white dark:text-black dark:hover:bg-primary dark:hover:text-white motion-reduce:transition-none"
                >
                  <ArrowRight className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
            </div>

            <p id={`${sectionId}-carousel-status`} className="sr-only" aria-live="polite" aria-atomic="true">
              {interpolate(copy.status, {
                page: currentPage + 1,
                total: pageCount,
                from: currentPage * visibleCount + 1,
                to: Math.min((currentPage + 1) * visibleCount, features.length),
                count: features.length,
              })}
            </p>
          </div>
        ) : (
          <p className="mt-10 border-l-2 border-emerald-600 pl-5 text-slate-600">
            {copy.empty}
          </p>
        )}

        {footer && (
          <div className="mt-10 flex justify-center border-t border-slate-950/15 pt-8 dark:border-white/15">
            {footer}
          </div>
        )}
      </div>
    </section>
  );
}
