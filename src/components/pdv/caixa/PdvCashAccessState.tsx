import { useState } from 'react';
import { Banknote, CircleAlert, RefreshCw, Settings2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';

type PdvCashAccessStateKind = 'unavailable' | 'setup';

interface PdvCashAccessStateProps {
  kind: PdvCashAccessStateKind;
  description: string;
  onRetry: () => void | Promise<unknown>;
  actionLabel?: string;
  onAction?: () => void | Promise<unknown>;
  actionPendingLabel?: string;
}

const CONTENT: Record<PdvCashAccessStateKind, {
  title: string;
  reassurance: string;
}> = {
  unavailable: {
    title: 'Não conseguimos abrir o caixa agora',
    reassurance: 'Suas vendas e movimentações não foram alteradas.',
  },
  setup: {
    title: 'Prepare o caixa para começar',
    reassurance: 'Essa configuração é feita apenas uma vez e pode ser alterada depois.',
  },
};

export function PdvCashAccessState({
  kind,
  description,
  onRetry,
  actionLabel,
  onAction,
  actionPendingLabel = 'Preparando…',
}: PdvCashAccessStateProps) {
  const [isRetrying, setIsRetrying] = useState(false);
  const [isActing, setIsActing] = useState(false);
  const content = CONTENT[kind];
  const isSetup = kind === 'setup';

  const handleRetry = async () => {
    if (isRetrying) return;
    setIsRetrying(true);
    try {
      await onRetry();
    } finally {
      setIsRetrying(false);
    }
  };

  const handleAction = async () => {
    if (!onAction || isActing) return;
    setIsActing(true);
    try {
      await onAction();
    } finally {
      setIsActing(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Caixa"
        subtitle={isSetup ? 'Configuração inicial' : 'Vendas e movimentações da loja'}
        icon={Banknote}
      />

      <section
        aria-labelledby="pdv-cash-access-title"
        aria-live="polite"
        className="flex min-h-[22rem] items-start justify-center px-3 py-8 sm:min-h-[26rem] sm:items-center sm:py-12"
      >
        <div className="flex w-full max-w-md flex-col items-center text-center">
          <div
            className={isSetup
              ? 'mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground'
              : 'mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-destructive text-destructive-foreground'}
          >
            {isSetup
              ? <Settings2 aria-hidden="true" className="h-7 w-7" />
              : <CircleAlert aria-hidden="true" className="h-7 w-7" />}
          </div>

          <h2 id="pdv-cash-access-title" className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            {content.title}
          </h2>
          <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground sm:text-base">
            {description}
          </p>
          <p className="mt-2 text-sm font-medium text-foreground/80">
            {content.reassurance}
          </p>

          <div className="mt-6 flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
            <Button
              type="button"
              variant={actionLabel && onAction ? 'outline' : 'default'}
              disabled={isRetrying || isActing}
              onClick={() => void handleRetry()}
              className="min-h-11 w-full sm:w-auto"
            >
              <RefreshCw aria-hidden="true" className={isRetrying ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
              {isRetrying ? 'Atualizando…' : isSetup ? 'Atualizar dados' : 'Tentar novamente'}
            </Button>
            {actionLabel && onAction ? (
              <Button type="button" disabled={isRetrying || isActing} onClick={() => void handleAction()} className="min-h-11 w-full sm:w-auto">
                {isActing
                  ? <RefreshCw aria-hidden="true" className="h-4 w-4 animate-spin" />
                  : <Settings2 aria-hidden="true" className="h-4 w-4" />}
                {isActing ? actionPendingLabel : actionLabel}
              </Button>
            ) : null}
          </div>

          {!isSetup ? (
            <p className="mt-5 text-xs leading-5 text-muted-foreground">
              Se o problema continuar, peça ajuda a um responsável.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
