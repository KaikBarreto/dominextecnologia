import { X, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useCallback } from 'react';

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

  const handlePrev = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (hasGallery && currentIndex > 0) onNavigate(currentIndex - 1);
  }, [hasGallery, currentIndex, onNavigate]);

  const handleNext = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (hasGallery && currentIndex < images.length - 1) onNavigate(currentIndex + 1);
  }, [hasGallery, currentIndex, images, onNavigate]);

  useEffect(() => {
    if (!open || !hasGallery) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'ArrowRight') handleNext();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, hasGallery, handlePrev, handleNext]);

  if (!open) return null;

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const response = await fetch(src);
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
      window.open(src, '_blank');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div className="absolute top-4 right-4 flex items-center gap-2 z-50">
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
        src={src}
        alt={alt || 'Preview'}
        className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
