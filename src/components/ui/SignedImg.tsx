import { useSignedUrl } from '@/hooks/useSignedUrl';

type ImgProps = React.ImgHTMLAttributes<HTMLImageElement>;

interface SignedImgProps extends Omit<ImgProps, 'src'> {
  src: string | null | undefined;
}

/**
 * Wrapper para <img> que resolve signed URLs automaticamente para buckets privados
 * (employee-photos, time-photos, financial-receipts, team-photos, os-photos).
 *
 * Enquanto o hook ainda não resolveu, exibe a URL original como fallback — evita
 * flash em buckets ainda públicos e nao quebra preview de blob: URLs (createObjectURL).
 */
export function SignedImg({ src, ...rest }: SignedImgProps) {
  const resolved = useSignedUrl(src);
  return <img {...rest} src={resolved ?? src ?? undefined} />;
}
