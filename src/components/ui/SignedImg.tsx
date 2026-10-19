import { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { cn } from '@/lib/utils';

type ImgProps = React.ImgHTMLAttributes<HTMLImageElement>;

interface SignedImgProps extends Omit<ImgProps, 'src'> {
  src: string | null | undefined;
  /**
   * Texto opcional do placeholder mostrado quando a imagem falha ou não há src.
   * Default: 'Imagem indisponível'.
   */
  fallbackLabel?: string;
  /**
   * Classes de uma CÓPIA DECORATIVA da mesma imagem, renderizada ANTES da
   * imagem real (logo, atrás dela na pintura). Serve pro preenchimento
   * desfocado de letterbox: quando a foto não tem a proporção da caixa,
   * `object-contain` deixa barra vazia nas laterais ou no topo, e esta cópia
   * em `object-cover` + `blur` preenche esse vazio com a própria foto em vez
   * de um cinza chapado (pedido do CEO 2026-10-19 na grade do PDV).
   *
   * POR QUE ISTO MORA AQUI e não no componente que consome: a resolução da
   * URL assinada acontece DENTRO deste componente (`useSignedUrl`), e
   * `resolveStorageUrl` não tem deduplicação de chamada em voo — só cache de
   * resultado. Dois `SignedImg` (ou dois `useSignedUrl`) pro mesmo arquivo
   * erram o cache juntos e disparam DUAS `createSignedUrl`. Na grade do PDV,
   * com 38 produtos, isso seria 38 idas extras ao servidor só pra desenhar um
   * borrão. Com a cópia aqui dentro, a URL é assinada UMA vez e o segundo
   * `<img>` sai do cache HTTP do navegador (mesma URL), sem rede nenhuma.
   *
   * Omitido (padrão) = nada muda: um `<img>` só, como sempre foi.
   *
   * Vazio e sem `src` resolvido não renderiza nada — o placeholder "sem foto"
   * não ganha borrão de imagem que não existe.
   */
  blurFillClassName?: string;
}

/**
 * Wrapper para <img> que:
 * 1. Resolve signed URLs automaticamente para buckets privados (employee-photos,
 *    time-photos, financial-receipts, team-photos).
 * 2. Mostra placeholder amigável (ícone ImageOff + texto PT-BR) quando a imagem
 *    falha ao carregar (404, file deletado, URL expirada, signed URL revogada).
 *
 * Substitui o "Erro" cru que o browser mostrava antes — agora aparece um
 * quadradinho cinza com ícone de imagem riscada e "Imagem indisponível".
 *
 * Preserva todas as props do <img> (className, onClick, alt, etc.).
 */
export function SignedImg({
  src,
  fallbackLabel = 'Imagem indisponível',
  className,
  blurFillClassName,
  ...rest
}: SignedImgProps) {
  const resolved = useSignedUrl(src);
  const [errored, setErrored] = useState(false);

  // Reset error state quando src ou resolved muda — nova tentativa válida.
  useEffect(() => {
    setErrored(false);
  }, [src, resolved]);

  const effectiveSrc = resolved ?? src ?? undefined;

  // Placeholder amigável: sem src OU erro de carregamento.
  if (!effectiveSrc || errored) {
    return (
      <div
        // Herda dimensões via className do consumer (mesmas classes que iriam pro img).
        // bg-muted + border + ícone + texto pequeno em muted-foreground.
        className={cn(
          'flex flex-col items-center justify-center gap-1 bg-muted/60 text-muted-foreground border border-border/70',
          className,
        )}
        title={fallbackLabel}
        onClick={rest.onClick}
        role={rest.onClick ? 'button' : undefined}
      >
        <ImageOff className="h-5 w-5 opacity-60" aria-hidden="true" />
        <span className="text-[10px] opacity-70 text-center px-1 leading-tight">{fallbackLabel}</span>
      </div>
    );
  }

  const img = (
    <img
      {...rest}
      src={effectiveSrc}
      className={className}
      onError={() => setErrored(true)}
    />
  );

  if (!blurFillClassName) return img;

  return (
    <>
      {/* Decorativa: é a MESMA imagem de novo, então fica fora da árvore de
          acessibilidade (`aria-hidden` + `alt=""`) pra o leitor de tela não
          anunciar a foto duas vezes. Sem `onError`/`onLoad` de propósito: quem
          manda no estado de carregamento é o `<img>` de verdade abaixo — se
          esta falhar, o resultado é só não ter borrão, nunca um placeholder
          duplicado. `draggable={false}`: arrastar a cópia borrada não faz
          sentido nenhum. */}
      <img src={effectiveSrc} alt="" aria-hidden="true" draggable={false} className={blurFillClassName} />
      {img}
    </>
  );
}
