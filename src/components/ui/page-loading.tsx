import { cn } from '@/lib/utils';

interface PageLoadingProps {
  message?: string;
  className?: string;
}

/**
 * Loading padrão de página — ring spinner Dominex (cor primária) + mensagem opcional.
 */
export function PageLoading({ message, className }: PageLoadingProps) {
  return (
    <div className={cn('flex min-h-screen flex-col items-center justify-center gap-3 bg-background', className)}>
      <div className="loader" />
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </div>
  );
}

/**
 * Loading sobreposto (overlay full-screen) — usado em transições críticas sobre conteúdo já renderizado.
 */
export function ContentLoading({ message, className }: PageLoadingProps) {
  return (
    <div className={cn('fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-background/95 backdrop-blur-sm', className)}>
      <div className="loader" />
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </div>
  );
}
