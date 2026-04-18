import { AvatarImage } from '@/components/ui/avatar';
import { useSignedUrl } from '@/hooks/useSignedUrl';

interface SignedAvatarImageProps {
  src: string | null | undefined;
  alt?: string;
  className?: string;
}

/**
 * Wrapper para AvatarImage que resolve signed URLs automaticamente
 * para fotos hospedadas em buckets privados (employee-photos, time-photos).
 */
export function SignedAvatarImage({ src, alt, className }: SignedAvatarImageProps) {
  const resolved = useSignedUrl(src);
  return <AvatarImage src={resolved || undefined} alt={alt} className={className} />;
}
