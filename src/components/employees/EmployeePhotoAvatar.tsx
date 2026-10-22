import { useState } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { SignedAvatarImage } from '@/components/ui/SignedAvatarImage';
import { ImagePreviewModal } from '@/components/ui/ImagePreviewModal';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { cn } from '@/lib/utils';

interface EmployeePhotoAvatarProps {
  name: string;
  src?: string | null;
  className?: string;
  fallbackClassName?: string;
}

const getInitials = (name: string) =>
  name
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

/**
 * Avatar de funcionário com a mesma resolução de URL assinada já usada no app.
 * Quando há foto, o clique abre o visualizador em tela cheia sem disparar a
 * ação da linha/card que contém o avatar.
 */
export function EmployeePhotoAvatar({
  name,
  src,
  className,
  fallbackClassName,
}: EmployeePhotoAvatarProps) {
  const { locale } = useAppLocaleContext();
  const zoomPhotoLabel = MESSAGES[locale].app.common.listDetail.zoomPhoto.replace('{name}', name);
  const [previewOpen, setPreviewOpen] = useState(false);

  const avatar = (
    <Avatar className={className}>
      <SignedAvatarImage src={src} alt={name} />
      <AvatarFallback
        className={cn('bg-primary/10 text-xs font-semibold text-primary', fallbackClassName)}
      >
        {getInitials(name)}
      </AvatarFallback>
    </Avatar>
  );

  if (!src) return avatar;

  return (
    <span
      className="inline-flex shrink-0"
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label={zoomPhotoLabel}
        title={zoomPhotoLabel}
        onClick={(event) => {
          event.stopPropagation();
          setPreviewOpen(true);
        }}
      >
        {avatar}
      </button>
      <ImagePreviewModal
        src={src}
        alt={name}
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
      />
    </span>
  );
}
