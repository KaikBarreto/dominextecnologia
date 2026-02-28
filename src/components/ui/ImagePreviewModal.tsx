import { useState } from 'react';
import { X } from 'lucide-react';

interface ImagePreviewModalProps {
  src: string;
  alt?: string;
  open: boolean;
  onClose: () => void;
}

export function ImagePreviewModal({ src, alt, open, onClose }: ImagePreviewModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <button
        className="absolute top-4 right-4 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 transition-colors z-50"
        onClick={onClose}
      >
        <X className="h-6 w-6" />
      </button>
      <img
        src={src}
        alt={alt || 'Preview'}
        className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
