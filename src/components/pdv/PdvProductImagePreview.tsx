import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { SignedImg } from '@/components/ui/SignedImg';
import { cn } from '@/lib/utils';

interface PdvProductImagePreviewProps {
  imageUrl: string | null | undefined;
  name: string;
  fallbackLabel: string;
  openLabel: string;
  viewerDescription: string;
  className?: string;
}

/**
 * Miniatura do item do carrinho com um gatilho acessível para o visualizador
 * em tela cheia. Sem URL, preserva o placeholder do `SignedImg` e não cria um
 * botão que não teria ação útil.
 */
export function PdvProductImagePreview({
  imageUrl,
  name,
  fallbackLabel,
  openLabel,
  viewerDescription,
  className,
}: PdvProductImagePreviewProps) {
  const [open, setOpen] = useState(false);
  const hasImage = Boolean(imageUrl?.trim());

  if (!hasImage) {
    return (
      <SignedImg
        src={imageUrl}
        alt=""
        fallbackLabel={fallbackLabel}
        className={className}
      />
    );
  }

  const previewLabel = openLabel.replace('{name}', name);

  return (
    <>
      <button
        type="button"
        className={cn(
          'shrink-0 overflow-hidden rounded-md transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          className,
        )}
        aria-label={previewLabel}
        title={previewLabel}
        onClick={() => setOpen(true)}
      >
        <SignedImg
          src={imageUrl}
          alt=""
          fallbackLabel={fallbackLabel}
          className="h-full w-full object-cover"
        />
      </button>

      <Dialog open={open} onOpenChange={setOpen} disableMobileDrawer>
        <DialogContent className="h-[100dvh] w-screen max-w-none place-items-center rounded-none border-0 bg-black p-4 text-white sm:rounded-none">
          <DialogTitle className="sr-only">{previewLabel}</DialogTitle>
          <DialogDescription className="sr-only">{viewerDescription}</DialogDescription>
          <SignedImg
            src={imageUrl}
            alt={name}
            fallbackLabel={fallbackLabel}
            className="max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] rounded-lg object-contain"
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
