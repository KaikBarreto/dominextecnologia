import { X, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useSignedUrl, resolveStorageUrl } from '@/hooks/useSignedUrl';

interface ImagePreviewModalProps {
  src: string;
  alt?: string;
  open: boolean;
  onClose: () => void;
  /** All images in the gallery for navigation */
  images?: string[];
  /** Current index in the gallery */
  currentIndex?: number;
  /** Callback when navigating */
  onNavigate?: (index: number) => void;
}

export function ImagePreviewModal({ src, alt, open, onClose, images, currentIndex, onNavigate }: ImagePreviewModalProps) {
  const hasGallery = images && images.length > 1 && currentIndex !== undefined && onNavigate;
  // Resolve signed URL pra buckets privados (os-photos, team-photos, etc).
  // Pra URLs públicas ou blob:, devolve o próprio src.
  const resolvedSrc = useSignedUrl(src) ?? src;

  const handlePrev = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (hasGallery && currentIndex > 0) onNavigate(currentIndex - 1);
  }, [hasGallery, currentIndex, onNavigate]);

  const handleNext = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (hasGallery && currentIndex < images.length - 1) onNavigate(currentIndex + 1);
  }, [hasGallery, currentIndex, images, onNavigate]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Fecha o viewer e impede que o Esc propague pro Dialog do contrato
        // por baixo (senão fecharia os dois de uma vez).
        e.stopPropagation();
        onClose();
        return;
      }
      if (!hasGallery) return;
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'ArrowRight') handleNext();
    };
    // capture: true garante que pegamos o Esc antes do Radix Dialog por baixo.
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [open, hasGallery, handlePrev, handleNext, onClose]);

  if (!open) return null;

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const downloadSrc = (await resolveStorageUrl(src)) ?? src;
      const response = await fetch(downloadSrc);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = alt || 'imagem';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      window.open(resolvedSrc, '_blank');
    }
  };

  const content = (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
      // pointer-events explícito: quando este viewer abre POR CIMA de um Radix
      // Dialog modal (ex.: Novo Contrato com lockBackdrop), o Radix coloca
      // `pointer-events: none` no body. Como este modal é portalizado pro body
      // (fora da árvore do Dialog), ele herdaria esse bloqueio e o clique no
      // backdrop nunca chegaria no onClick. Forçar `auto` aqui restaura o clique.
      style={{ pointerEvents: 'auto' }}
      onClick={onClose}
    >
      <div className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 flex items-center gap-2 z-50">
        {hasGallery && (
          <span className="text-white/70 text-sm mr-2">
            {currentIndex + 1} / {images.length}
          </span>
        )}
        <button
          className="rounded-full bg-black/50 p-2 text-white hover:bg-black/70 transition-colors"
          onClick={handleDownload}
          title="Baixar imagem"
        >
          <Download className="h-6 w-6" />
        </button>
        <button
          className="rounded-full bg-black/50 p-2 text-white hover:bg-black/70 transition-colors"
          onClick={onClose}
        >
          <X className="h-6 w-6" />
        </button>
      </div>

      {/* Left arrow */}
      {hasGallery && currentIndex > 0 && (
        <button
          className="absolute left-4 top-1/2 -translate-y-1/2 z-50 rounded-full bg-black/50 p-3 text-white hover:bg-black/70 transition-colors"
          onClick={(e) => handlePrev(e)}
        >
          <ChevronLeft className="h-8 w-8" />
        </button>
      )}

      {/* Right arrow */}
      {hasGallery && currentIndex < images.length - 1 && (
        <button
          className="absolute right-4 top-1/2 -translate-y-1/2 z-50 rounded-full bg-black/50 p-3 text-white hover:bg-black/70 transition-colors"
          onClick={(e) => handleNext(e)}
        >
          <ChevronRight className="h-8 w-8" />
        </button>
      )}

      <img
        src={resolvedSrc}
        alt={alt || 'Preview'}
        className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );

  return createPortal(content, document.body);
}
