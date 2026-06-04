import { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { cn } from '@/lib/utils';

type ImgProps = React.ImgHTMLAttributes<HTMLImageElement>;

interface SignedImgProps extends Omit<ImgProps, 'src'> {
  src: string | null | undefined;
  /**
   * Texto opcional do placeholder mostrado quando a imagem falha ou não há src.
   * Default: 'Imagem indisponível'.
   */
  fallbackLabel?: string;
}

/**
 * Wrapper para <img> que:
 * 1. Resolve signed URLs automaticamente para buckets privados (employee-photos,
 *    time-photos, financial-receipts, team-photos).
 * 2. Mostra placeholder amigável (ícone ImageOff + texto PT-BR) quando a imagem
 *    falha ao carregar (404, file deletado, URL expirada, signed URL revogada).
 *
 * Substitui o "Erro" cru que o browser mostrava antes — agora aparece um
 * quadradinho cinza com ícone de imagem riscada e "Imagem indisponível".
 *
 * Preserva todas as props do <img> (className, onClick, alt, etc.).
 */
export function SignedImg({ src, fallbackLabel = 'Imagem indisponível', className, ...rest }: SignedImgProps) {
  const resolved = useSignedUrl(src);
  const [errored, setErrored] = useState(false);

  // Reset error state quando src ou resolved muda — nova tentativa válida.
  useEffect(() => {
    setErrored(false);
  }, [src, resolved]);

  const effectiveSrc = resolved ?? src ?? undefined;

  // Placeholder amigável: sem src OU erro de carregamento.
  if (!effectiveSrc || errored) {
    return (
      <div
        // Herda dimensões via className do consumer (mesmas classes que iriam pro img).
        // bg-muted + border + ícone + texto pequeno em muted-foreground.
        className={cn(
          'flex flex-col items-center justify-center gap-1 bg-muted/60 text-muted-foreground border border-border/70',
          className,
        )}
        title={fallbackLabel}
        onClick={rest.onClick}
        role={rest.onClick ? 'button' : undefined}
      >
        <ImageOff className="h-5 w-5 opacity-60" aria-hidden="true" />
        <span className="text-[10px] opacity-70 text-center px-1 leading-tight">{fallbackLabel}</span>
      </div>
    );
  }

  return (
    <img
      {...rest}
      src={effectiveSrc}
      className={className}
      onError={() => setErrored(true)}
    />
  );
}
