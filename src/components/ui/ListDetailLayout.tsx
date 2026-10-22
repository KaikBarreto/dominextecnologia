import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowDownUp, ChevronLeft, ChevronRight, PanelLeftClose, PanelLeftOpen, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDataPagination, type PageSizeOption } from '@/hooks/useDataPagination';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatNumber } from '@/lib/format';

export interface ListDetailItem {
  id: string;
  title: string;
  subtitle?: string;
  searchText?: string;
  imageUrl?: string | null;
  imageAlt?: string;
  onImageClick?: () => void;
  leading?: ReactNode;
  trailing?: ReactNode;
}

export interface ListDetailSortOption {
  value: string;
  /** Nome completo do critério (vai no title/tooltip do botão). */
  label: string;
  /** Forma curta mostrada no botão sutil (ex.: "A-Z"). Sem isso, usa `label`. */
  shortLabel?: string;
  compare: (a: ListDetailItem, b: ListDetailItem) => number;
}

interface ListDetailLayoutProps {
  children: ReactNode;
  items: ListDetailItem[];
  selectedId?: string;
  listTitle: string;
  listDescription?: string;
  /**
   * Controles extras do painel da lista (ex.: filtro "Atende como" de Clientes).
   * Ficam DENTRO do cabeçalho da lista, abaixo da busca, pra o filtro viver
   * junto do que ele filtra em vez de solto acima do layout.
   */
  listFilters?: ReactNode;
  /**
   * Critérios de ordenação da coluna da esquerda. Sem isso, a lista oferece
   * Nome (A-Z) e Nome (Z-A). O primeiro da lista é o padrão.
   */
  sortOptions?: ListDetailSortOption[];
  /** Quantos cadastros por página na coluna. Padrão: 25. */
  pageSize?: PageSizeOption;
  /** Chave de sessionStorage pra lembrar página e tamanho (uma por tela). */
  storageKey?: string;
  searchPlaceholder: string;
  emptyLabel: string;
  collapseLabel?: string;
  expandLabel?: string;
  onSelect: (id: string) => void;
  className?: string;
  detailClassName?: string;
}

/** Lê/grava o estado da coluna (busca, ordenação) por tela, sem quebrar em SSR. */
function readStored(storageKey: string | undefined, field: string): string | null {
  if (!storageKey || typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(`${storageKey}:${field}`);
  } catch {
    return null;
  }
}

function writeStored(storageKey: string | undefined, field: string, value: string) {
  if (!storageKey || typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(`${storageKey}:${field}`, value);
  } catch {
    /* modo privado/quota: a coluna só perde a memória, nada quebra. */
  }
}

/**
 * Estrutura master-detail exclusiva do desktop. Em tablet/mobile, somente o
 * detalhe é renderizado visualmente e o fluxo de navegação existente segue
 * intacto, sem comprimir lista e ficha na mesma largura.
 *
 * A coluna da esquerda é uma lista de verdade: busca, filtros do chamador,
 * ordenação e paginação. Paginar não é só estética — a lista chega INTEIRA em
 * memória (os hooks de cliente/equipamento carregam tudo), e um tenant com
 * milhares de cadastros montaria milhares de linhas com <img> num painel que
 * mostra uma dúzia por vez.
 */
export function ListDetailLayout({
  children,
  items,
  selectedId,
  listTitle,
  listDescription,
  listFilters,
  sortOptions,
  pageSize = 25,
  storageKey,
  searchPlaceholder,
  emptyLabel,
  collapseLabel,
  expandLabel,
  onSelect,
  className,
  detailClassName,
}: ListDetailLayoutProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.common.listDetail;
  const tPagination = MESSAGES[locale].app.common.pagination;
  const collapseText = collapseLabel ?? t.collapse;
  const expandText = expandLabel ?? t.expand;
  const zoomPhotoLabel = (name: string) => t.zoomPhoto.replace('{name}', name);
  const [collapsed, setCollapsed] = useState(false);
  // Busca e ordenação ficam em sessionStorage sob a MESMA `storageKey` da tela
  // de lista e da ficha. Abrir um cadastro troca de rota (e remonta o painel):
  // sem isso, o que a pessoa digitou na busca se perdia a cada clique.
  const [search, setSearch] = useState(() => readStored(storageKey, 'search') ?? '');

  const resolvedSortOptions: ListDetailSortOption[] = useMemo(() => {
    if (sortOptions?.length) return sortOptions;
    const byName = (a: ListDetailItem, b: ListDetailItem) =>
      a.title.localeCompare(b.title, locale, { sensitivity: 'base' });
    return [
      { value: 'name-asc', label: t.sortNameAsc, shortLabel: 'A-Z', compare: byName },
      { value: 'name-desc', label: t.sortNameDesc, shortLabel: 'Z-A', compare: (a, b) => byName(b, a) },
    ];
  }, [sortOptions, t.sortNameAsc, t.sortNameDesc, locale]);

  const [sortValue, setSortValue] = useState(
    () => readStored(storageKey, 'sort') ?? resolvedSortOptions[0].value,
  );

  useEffect(() => {
    writeStored(storageKey, 'search', search);
  }, [storageKey, search]);
  useEffect(() => {
    writeStored(storageKey, 'sort', sortValue);
  }, [storageKey, sortValue]);
  const activeSort =
    resolvedSortOptions.find((option) => option.value === sortValue) ?? resolvedSortOptions[0];

  const visibleItems = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');
    const filtered = !normalizedSearch
      ? items
      : items.filter((item) =>
          `${item.title} ${item.subtitle ?? ''} ${item.searchText ?? ''}`
            .toLocaleLowerCase('pt-BR')
            .includes(normalizedSearch),
        );
    // slice() antes de sort(): sort ordena NO LUGAR e o array é do chamador.
    return filtered.slice().sort(activeSort.compare);
  }, [items, search, activeSort]);

  const pagination = useDataPagination(visibleItems, pageSize, storageKey);
  const { setPage, pageSize: activePageSize } = pagination;

  // O cadastro ABERTO nunca pode ficar numa página que a lista não mostra: sem
  // isto, abrir a ficha do item nº 300 deixava a coluna sem nenhuma linha
  // marcada como atual. Só reage à TROCA de cadastro (via ref): reagir à lista
  // inteira puxaria a pessoa de volta pra essa página a cada busca.
  const alignedIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!selectedId || activePageSize === 'all') return;
    if (alignedIdRef.current === selectedId) return;
    const index = visibleItems.findIndex((item) => item.id === selectedId);
    if (index < 0) return;
    alignedIdRef.current = selectedId;
    setPage(Math.floor(index / activePageSize) + 1);
  }, [selectedId, visibleItems, activePageSize, setPage]);

  // Busca ou ordenação nova recomeça da primeira página, senão a lista aparece
  // vazia quando o resultado é menor que a página em que a pessoa estava.
  // Não roda na montagem: lá quem manda é a página do cadastro aberto.
  const primeiraRenderRef = useRef(true);
  useEffect(() => {
    if (primeiraRenderRef.current) {
      primeiraRenderRef.current = false;
      return;
    }
    setPage(1);
  }, [search, sortValue, setPage]);

  // Altura do painel medida de verdade. A classe `max-h-[calc(100dvh-7rem)]`
  // supõe que a lista começa logo abaixo do topo, mas ela nasce depois do
  // cabeçalho da página e das abas: numa tela de 900px o rodapé (onde fica a
  // paginação) caía 174px ABAIXO da dobra e ninguém alcançava. Aqui a altura
  // sai da posição real do elemento e acompanha o scroll (listener em captura
  // porque quem rola é o <main> do shell, não a janela).
  const asideRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = asideRef.current;
    if (!el) return;
    // Quem rola é o <main> do shell, que termina ACIMA do rodapé do sistema
    // (52px). Medir contra window.innerHeight fazia a coluna passar do fim do
    // <main> e a linha de paginação era CORTADA — ela só aparecia quando a
    // busca encurtava a lista. Ver a régua "o scroller de verdade é o <main>".
    const scroller = el.closest('main') ?? document.documentElement;
    const update = () => {
      const top = el.getBoundingClientRect().top;
      const limite = Math.min(window.innerHeight, scroller.getBoundingClientRect().bottom);
      // Altura FIXA, não máxima: assim a coluna não muda de tamanho conforme o
      // resultado da busca e a paginação fica sempre colada embaixo.
      el.style.height = `${Math.max(320, limite - Math.max(top, 16) - 16)}px`;
    };
    update();
    document.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    // ResizeObserver não existe no jsdom (e em navegador muito antigo); sem ele
    // o painel ainda acerta a altura no mount, no scroll e no resize.
    const observer =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    observer?.observe(document.body);
    return () => {
      document.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
      observer?.disconnect();
    };
  }, [collapsed]);

  // Sem a palavra "Mostrando": a coluna tem ~19rem e divide a linha com o
  // seletor de itens por página e as setas.
  const showingText = `${formatNumber(pagination.from, locale)}-${formatNumber(pagination.to, locale)} / ${formatNumber(pagination.totalItems, locale)}`;

  return (
    <div
      className={cn(
        'min-w-0 lg:grid lg:items-start lg:gap-0',
        collapsed
          ? 'lg:grid-cols-[2.5rem_minmax(0,1fr)]'
          : 'lg:grid-cols-[minmax(20rem,24rem)_minmax(0,1fr)]',
        className,
      )}
    >
      {collapsed ? (
        <div className="hidden lg:flex lg:sticky lg:top-4 lg:justify-center">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-10 w-10 bg-background shadow-sm"
            aria-label={expandText}
            title={expandText}
            onClick={() => setCollapsed(false)}
          >
            <PanelLeftOpen className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <aside
          ref={asideRef}
          className="hidden overflow-hidden border-r border-border lg:sticky lg:top-4 lg:flex lg:h-[calc(100dvh-7rem)] lg:min-h-[24rem] lg:flex-col lg:pr-5"
          aria-label={listTitle}
        >
          <div className="border-b border-border/60 pb-3">
            <div className="mb-3 flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-sm font-semibold">{listTitle}</h2>
                {listDescription && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{listDescription}</p>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                aria-label={collapseText}
                title={collapseText}
                onClick={() => setCollapsed(true)}
              >
                <PanelLeftClose className="h-4 w-4" />
              </Button>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={searchPlaceholder}
                className="h-9 pl-9"
              />
            </div>
            {listFilters && <div className="mt-2 min-w-0">{listFilters}</div>}
          </div>

          {/* Contagem + ordenação: linha discreta, sem caixa de seletor. O botão
              alterna para o próximo critério (com dois, é um liga-desliga A-Z). */}
          <div className="flex items-center justify-between gap-2 px-3 py-2.5">
            <span className="min-w-0 truncate text-xs text-muted-foreground">
              {(pagination.totalItems === 1 ? t.records : t.recordsPlural).replace(
                '{count}',
                formatNumber(pagination.totalItems, locale),
              )}
            </span>
            <button
              type="button"
              onClick={() => {
                const index = resolvedSortOptions.findIndex((option) => option.value === activeSort.value);
                setSortValue(resolvedSortOptions[(index + 1) % resolvedSortOptions.length].value);
              }}
              title={`${t.sortLabel}: ${activeSort.label}`}
              aria-label={`${t.sortLabel}: ${activeSort.label}`}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowDownUp className="h-3.5 w-3.5" aria-hidden="true" />
              {activeSort.shortLabel ?? activeSort.label}
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {pagination.paginatedItems.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">{emptyLabel}</p>
            ) : (
              <div role="list">
                {pagination.paginatedItems.map((item) => {
                  const selected = item.id === selectedId;
                  return (
                    <div
                      key={item.id}
                      role="listitem"
                      aria-current={selected ? 'true' : undefined}
                      onClick={() => onSelect(item.id)}
                      className={cn(
                        'flex w-full cursor-pointer items-center gap-3 border-b border-border/60 px-3 py-3 text-left outline-none transition-colors last:border-b-0',
                        selected ? 'bg-muted' : 'hover:bg-muted/50',
                      )}
                    >
                      {item.imageUrl ? (
                        item.onImageClick ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              item.onImageClick?.();
                            }}
                            className="shrink-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                            aria-label={item.imageAlt ?? zoomPhotoLabel(item.title)}
                            title={item.imageAlt ?? zoomPhotoLabel(item.title)}
                          >
                            <img
                              src={item.imageUrl}
                              alt=""
                              className="h-10 w-10 rounded-lg border object-cover transition-opacity hover:opacity-80"
                            />
                          </button>
                        ) : (
                          <img
                            src={item.imageUrl}
                            alt=""
                            className="h-10 w-10 shrink-0 rounded-lg border object-cover"
                          />
                        )
                      ) : item.leading ? (
                        <div className="shrink-0">{item.leading}</div>
                      ) : null}
                      {/* Gatilho real da troca de item: fica no <button> pra
                          responder a teclado (Tab + Enter), e o clique no resto
                          da linha chega aqui pelo handler do container. */}
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onSelect(item.id);
                        }}
                        className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                      >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{item.title}</span>
                        {item.subtitle && (
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                            {item.subtitle}
                          </span>
                        )}
                      </span>
                      {item.trailing && <span className="shrink-0">{item.trailing}</span>}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-1 border-t border-border/60 py-2">
            <Select
              value={String(pagination.pageSize)}
              onValueChange={(value) =>
                pagination.setPageSize(value === 'all' ? 'all' : (Number(value) as PageSizeOption))
              }
            >
              <SelectTrigger className="h-7 w-[4.5rem] shrink-0 px-2 text-xs" aria-label={tPagination.perPage}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['10', '25', '50', '100'] as const).map((size) => (
                  <SelectItem key={size} value={size} className="text-xs">{size}</SelectItem>
                ))}
                <SelectItem value="all" className="text-xs">{tPagination.all}</SelectItem>
              </SelectContent>
            </Select>
            <span className="min-w-0 truncate text-center text-xs text-muted-foreground">{showingText}</span>
            <div className="flex shrink-0 items-center gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={!pagination.canGoPrev}
                aria-label={tPagination.previous}
                title={tPagination.previous}
                onClick={() => setPage(pagination.page - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={!pagination.canGoNext}
                aria-label={tPagination.next}
                title={tPagination.next}
                onClick={() => setPage(pagination.page + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </aside>
      )}

      {/* <div>, não <main>: o shell (AppLayout) já tem o único <main> do
          documento, e aninhar outro quebra o HTML e confunde quem procura
          "main" na página (leitor de tela, pipeline de print do guia). */}
      <div className={cn('min-w-0 lg:pl-5', detailClassName)}>{children}</div>
    </div>
  );
}
