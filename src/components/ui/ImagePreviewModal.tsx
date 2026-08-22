import { X, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSignedUrl, resolveStorageUrl } from '@/hooks/useSignedUrl';

// Detecta iPhone/iPad (inclui iPadOS que se disfarça de Mac no userAgent).
const isIOS = () => {
  const ua = navigator.userAgent || '';
  return /iP(hone|ad|od)/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

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

  // Arquivo pré-carregado em memória pra possibilitar o navigator.share síncrono
  // no iOS. O share precisa ser disparado NO gesto do toque (transient activation);
  // qualquer await antes invalida o gesto e o iOS bloqueia silenciosamente.
  const [preparedFile, setPreparedFile] = useState<File | null>(null);

  useEffect(() => {
    if (!open) return;

    // Zera o arquivo preparado do src anterior enquanto o novo carrega.
    setPreparedFile(null);

    let cancelled = false;

    const prefetch = async () => {
      try {
        const downloadSrc = (await resolveStorageUrl(src)) ?? src;
        const response = await fetch(downloadSrc);
        const blob = await response.blob();

        if (cancelled) return;

        // Deriva nome de arquivo com extensão válida pra que o iOS reconheça
        // a mídia como imagem ao receber via navigator.share.
        const ext = blob.type === 'image/png' ? '.png'
          : blob.type === 'image/gif' ? '.gif'
          : blob.type === 'image/webp' ? '.webp'
          : '.jpg';
        const baseName = (alt || 'imagem').replace(/[^\w\s-]/g, '').trim() || 'imagem';
        const fileName = baseName.endsWith(ext) ? baseName : `${baseName}${ext}`;

        setPreparedFile(new File([blob], fileName, { type: blob.type || 'image/jpeg' }));
      } catch {
        // best-effort: se falhar, handleDownload cai no fluxo async de fallback
      }
    };

    prefetch();

    return () => {
      cancelled = true;
    };
  }, [open, src, alt]);

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

  // iOS: navigator.share precisa ser chamado SINCRONAMENTE no gesto do toque
  // (transient activation). Qualquer await antes do share invalida o gesto e o
  // iOS bloqueia silenciosamente. Por isso o blob é pré-carregado no useEffect
  // acima e o handler NÃO é async — chama o share imediatamente com o File pronto.
  // Android/desktop: usa o caminho <a download> clássico.
  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();

    // Caminho iOS: share síncrono com o File já em memória.
    if (isIOS() && preparedFile && typeof navigator.canShare === 'function' && navigator.canShare({ files: [preparedFile] })) {
      navigator.share({ files: [preparedFile], title: alt || 'Imagem' }).catch(() => {
        /* cancelado pelo usuário ou sem suporte */
      });
      return;
    }

    // Caminho Android/desktop (ou iOS sem File ainda pronto):
    // se o blob já está em memória, baixa direto (evita refazer o fetch);
    // caso contrário, faz o fetch async como fallback.
    if (preparedFile) {
      try {
        const url = URL.createObjectURL(preparedFile);
        const a = document.createElement('a');
        a.href = url;
        a.download = preparedFile.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch {
        window.open(resolvedSrc, '_blank');
      }
      return;
    }

    // Fallback async: blob ainda não pronto (ex.: src trocou faz menos de 1s).
    resolveStorageUrl(src).then((downloadSrc) => {
      return fetch(downloadSrc ?? src);
    }).then((response) => response.blob()).then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = alt || 'imagem';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }).catch(() => {
      window.open(resolvedSrc, '_blank');
    });
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
