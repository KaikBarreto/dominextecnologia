import { useEffect, useState } from 'react';
import { Package } from 'lucide-react';
import { resolveStorageUrl } from '@/hooks/useSignedUrl';
import { cn } from '@/lib/utils';

interface InventoryItemThumbnailProps {
  name: string;
  imageUrl?: string | null;
  accentColor?: string | null;
  fallbackVariant?: 'accent' | 'plain';
  className?: string;
}

/**
 * Miniatura compacta de material para listas. URL ausente ou imagem quebrada
 * volta ao ícone de estoque sem deslocar a linha.
 */
export function InventoryItemThumbnail({
  name,
  imageUrl,
  accentColor,
  fallbackVariant = 'accent',
  className,
}: InventoryItemThumbnailProps) {
  const source = imageUrl ?? '';
  const [imageState, setImageState] = useState<{
    source: string;
    resolvedUrl: string | null;
    failed: boolean;
  }>({ source, resolvedUrl: null, failed: false });

  useEffect(() => {
    let cancelled = false;

    setImageState({ source, resolvedUrl: null, failed: false });

    if (!source) return () => { cancelled = true; };

    resolveStorageUrl(source)
      .then((resolvedUrl) => {
        if (!cancelled) {
          setImageState({ source, resolvedUrl, failed: !resolvedUrl });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setImageState({ source, resolvedUrl: null, failed: true });
        }
      });

    return () => { cancelled = true; };
  }, [source]);

  // O source guard impede exibir a URL resolvida do item anterior enquanto a
  // lista virtual/reordenada resolve a nova foto.
  const resolvedUrl = imageState.source === source && !imageState.failed
    ? imageState.resolvedUrl
    : null;
  const showImage = !!resolvedUrl;

  return (
    <span
      className={cn(
        'flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted',
        fallbackVariant === 'plain' && !showImage && 'border-transparent bg-transparent',
        className,
      )}
      style={fallbackVariant === 'accent' && !showImage && accentColor
        ? { backgroundColor: `${accentColor}22`, color: accentColor }
        : undefined}
    >
      {showImage ? (
        <img
          src={resolvedUrl}
          alt={`Foto de ${name}`}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
          onError={() => {
            setImageState((current) => current.source === source
              ? { ...current, failed: true }
              : current);
          }}
        />
      ) : (
        <Package
          aria-hidden="true"
          className={cn('h-5 w-5', fallbackVariant === 'plain' && 'text-foreground')}
          style={fallbackVariant === 'accent' && !accentColor
            ? { color: 'hsl(var(--primary))' }
            : undefined}
        />
      )}
    </span>
  );
}
