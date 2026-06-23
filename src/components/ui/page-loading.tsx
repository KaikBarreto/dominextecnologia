import { useRouteLoadingMessage } from '@/hooks/useRouteLoadingMessage';
import { cn } from '@/lib/utils';

interface PageLoadingProps {
  /** Texto fixo. Se omitido, usa a mensagem da rota (typewriter contextual). */
  message?: string;
  className?: string;
}

/**
 * Cursor piscando no fim do texto — reforça o efeito "digitando" do typewriter.
 */
function TypewriterCursor() {
  return (
    <span
      className="ml-0.5 inline-block w-[1px] animate-pulse bg-current align-middle"
      style={{ height: '0.9em' }}
      aria-hidden
    />
  );
}

/**
 * Loading padrão de página — ring spinner Dominex (cor primária) + mensagem.
 *
 * O texto vem do `useRouteLoadingMessage` (typewriter: apaga letra a letra,
 * pausa, digita a próxima letra a letra — estilo "pensando"). Rota com mensagem
 * específica exibe texto fixo; rota sem match cicla o fallback. A prop `message`
 * tem prioridade e sobrepõe a mensagem da rota com texto fixo.
 *
 * Importante: NÃO usar `key={label}` no <p> — re-mountaria a cada caractere e
 * piscaria. O texto muda in-place dentro do hook.
 */
export function PageLoading({ message, className }: PageLoadingProps = {}) {
  const routeMessage = useRouteLoadingMessage();
  const label = message ?? routeMessage;

  return (
    <div className={cn('flex min-h-screen flex-col items-center justify-center gap-3 bg-background', className)}>
      <div className="loader" />
      <p className="text-sm text-muted-foreground min-h-[1.25rem]">
        {label}
        <TypewriterCursor />
      </p>
    </div>
  );
}

/**
 * Loading sobreposto (overlay full-screen) — usado em transições críticas sobre
 * conteúdo já renderizado. Mesma mecânica de texto do `PageLoading`.
 */
export function ContentLoading({ message, className }: PageLoadingProps = {}) {
  const routeMessage = useRouteLoadingMessage();
  const label = message ?? routeMessage;

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-background/95 backdrop-blur-sm',
        className
      )}
    >
      <div className="loader" />
      <p className="text-sm text-muted-foreground min-h-[1.25rem]">
        {label}
        <TypewriterCursor />
      </p>
    </div>
  );
}
