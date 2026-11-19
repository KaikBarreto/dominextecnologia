import type { HTMLAttributes, ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface CrmSettingsListDetailProps {
  listTitle: string;
  count: number;
  /** Ação primária da lista (ex.: "+ Novo"). Fica no cabeçalho da coluna. */
  listAction?: ReactNode;
  /** Linhas da lista. Quem chama monta as linhas pra manter arraste e ordem manual. */
  list: ReactNode;
  /** Mostrado no lugar das linhas quando não há registro. */
  emptyList?: ReactNode;
  listHint?: ReactNode;
  /**
   * No celular a lista e o detalhe não cabem lado a lado: `false` mostra a
   * lista, `true` mostra o detalhe com o botão de voltar. No computador os
   * dois ficam sempre visíveis.
   */
  detailOpen: boolean;
  onBack: () => void;
  backLabel: string;
  children: ReactNode;
  className?: string;
}

/**
 * Lista + detalhes das configurações do CRM, pra uso DENTRO de modal.
 *
 * O `ListDetailLayout` é o primitivo das telas de cadastro: mede a altura
 * contra o `<main>` do shell, gruda no topo, pagina e ordena por nome. Dentro
 * de um modal nada disso serve (não há `<main>`, e funil tem ordem manual por
 * arraste), então aqui fica só a régua visual: coluna de lista à esquerda com
 * título, contagem e ação, e o detalhe à direita.
 */
export function CrmSettingsListDetail({
  listTitle,
  count,
  listAction,
  list,
  emptyList,
  listHint,
  detailOpen,
  onBack,
  backLabel,
  children,
  className,
}: CrmSettingsListDetailProps) {
  return (
    <div className={cn('min-w-0 lg:grid lg:grid-cols-[minmax(13rem,17rem)_minmax(0,1fr)]', className)}>
      <aside
        aria-label={listTitle}
        className={cn('min-w-0 lg:block lg:border-r lg:border-border lg:pr-4', detailOpen && 'hidden')}
      >
        <div className="flex min-h-9 items-center gap-2 border-b border-border/60 pb-3">
          <h3 className="min-w-0 truncate text-sm font-semibold">{listTitle}</h3>
          <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
            {count}
          </span>
          {listAction && <span className="ml-auto shrink-0">{listAction}</span>}
        </div>
        {count === 0 && emptyList ? (
          emptyList
        ) : (
          <div role="list" className="lg:max-h-[30rem] lg:overflow-y-auto">
            {list}
          </div>
        )}
        {listHint && <p className="pt-3 text-xs text-muted-foreground">{listHint}</p>}
      </aside>
      <section className={cn('min-w-0 lg:block lg:pl-5', !detailOpen && 'hidden')}>
        <Button variant="ghost" size="sm" className="-ml-2 mb-3 lg:hidden" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {backLabel}
        </Button>
        {children}
      </section>
    </div>
  );
}

interface CrmSettingsListRowProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title' | 'onSelect'> {
  selected: boolean;
  onSelect: () => void;
  title: string;
  subtitle?: ReactNode;
  /** Conteúdo antes do título, FORA do botão principal (alça de arraste, setas). */
  leading?: ReactNode;
  /** Indicadores à direita do título, dentro do botão principal. */
  trailing?: ReactNode;
}

export function CrmSettingsListRow({
  selected,
  onSelect,
  title,
  subtitle,
  leading,
  trailing,
  className,
  ...rest
}: CrmSettingsListRowProps) {
  return (
    <div
      role="listitem"
      aria-current={selected ? 'true' : undefined}
      onClick={onSelect}
      className={cn(
        'flex w-full cursor-pointer items-center gap-2 border-b border-border/60 px-2 py-2.5 text-left transition-colors last:border-b-0',
        selected ? 'bg-muted' : 'hover:bg-muted/50',
        className,
      )}
      {...rest}
    >
      {leading}
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{title}</span>
          {subtitle && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{subtitle}</span>}
        </span>
        {trailing && <span className="flex shrink-0 items-center gap-1">{trailing}</span>}
      </button>
    </div>
  );
}

interface CrmSettingsDetailEmptyProps {
  icon: ReactNode;
  title: string;
  description?: string;
  children?: ReactNode;
}

/** Estado vazio do painel de detalhe (nada selecionado ou lista sem registros). */
export function CrmSettingsDetailEmpty({ icon, title, description, children }: CrmSettingsDetailEmptyProps) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-1 px-4 py-10 text-center">
      <div className="mb-2 text-muted-foreground">{icon}</div>
      <p className="font-medium">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {children && <div className="mt-4 flex flex-wrap justify-center gap-2">{children}</div>}
    </div>
  );
}

interface CrmDiscardChangesDialogProps {
  /** Ação que a pessoa pediu e que descartaria o que ela digitou. `null` = fechado. */
  pending: (() => void) | null;
  onResolve: () => void;
}

/**
 * Num lista + detalhes, trocar de item é um clique: sem esta confirmação, um
 * clique fora do lugar apagava o que a pessoa vinha editando no detalhe.
 */
export function CrmDiscardChangesDialog({ pending, onResolve }: CrmDiscardChangesDialogProps) {
  return (
    <AlertDialog open={Boolean(pending)} onOpenChange={(next) => { if (!next) onResolve(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Descartar alterações?</AlertDialogTitle>
          <AlertDialogDescription>O que você alterou e ainda não salvou será perdido.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Continuar editando</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90"
            onClick={() => {
              const action = pending;
              onResolve();
              action?.();
            }}
          >
            Descartar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
