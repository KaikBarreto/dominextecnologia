import { X, Download } from 'lucide-react';

interface ImagePreviewModalProps {
  src: string;
  alt?: string;
  open: boolean;
  onClose: () => void;
}

export function ImagePreviewModal({ src, alt, open, onClose }: ImagePreviewModalProps) {
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
      <img
        src={src}
        alt={alt || 'Preview'}
        className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
