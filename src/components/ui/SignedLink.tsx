import { useState } from 'react';
import { resolveStorageUrl } from '@/hooks/useSignedUrl';

interface SignedLinkProps {
  src: string | null | undefined;
  children: React.ReactNode;
  className?: string;
  title?: string;
}

/**
 * Anchor que, ao ser clicado, gera signed URL on-demand para buckets privados
 * e abre em nova aba. Para buckets públicos, usa a URL diretamente.
 */
export function SignedLink({ src, children, className, title }: SignedLinkProps) {
  const [loading, setLoading] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!src || loading) return;
    setLoading(true);
    try {
      const url = await resolveStorageUrl(src);
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    } finally {
      setLoading(false);
    }
  };

  if (!src) return null;
  return (
    <a href={src} onClick={handleClick} className={className} title={title} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}
