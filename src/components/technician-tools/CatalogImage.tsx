import { useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Imagem do Catálogo de Equipamentos com carregamento gracioso.
 *
 * Enquanto a imagem baixa, mostra um skeleton/shimmer no lugar exato dela; quando
 * carrega, a `<img>` faz fade-in suave. Em erro de rede, esconde tudo (sem ícone
 * de imagem quebrada) — o chamador já trata o caso "sem foto" à parte.
 *
 * Renderiza um wrapper `relative` (que recebe `containerClassName` pra casar com o
 * tamanho da `<img>`): o skeleton fica `absolute inset-0` por baixo e a `<img>` por
 * cima. Assim o shimmer ocupa exatamente a área da imagem sem empurrar o layout do
 * card (que costuma ser `flex items-center justify-center`).
 *
 * Os cards de marca usam `bg-white` FIXO nos 2 temas (logos coloridos não somem no
 * dark). O `Skeleton` padrão (`bg-muted`) some sobre branco, então aqui o shimmer
 * usa um cinza neutro (`bg-neutral-200`) que aparece tanto no claro quanto no escuro.
 */
export function CatalogImage({
  src,
  alt,
  className,
  containerClassName,
}: {
  src: string;
  alt: string;
  /** Classes do `<img>` (mantém o `object-contain` de cada contexto). */
  className?: string;
  /**
   * Classes do wrapper `relative`. Define o tamanho que o skeleton ocupa e onde a
   * `<img>` se ajusta. Para LOGOS, um retângulo discreto centralizado (ex:
   * `h-10 w-24`). Para FOTOS, a área toda (`h-full w-full`).
   */
  containerClassName?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  // Em erro de rede, não deixa buraco nem ícone quebrado — colapsa pra nada.
  if (error) return null;

  return (
    <div className={cn('relative', containerClassName)}>
      {!loaded && (
        <div
          aria-hidden
          // Shimmer cinza que contrasta com o bg-white fixo dos cards (e segue
          // visível no dark). Cantos arredondados discretos.
          className="absolute inset-0 animate-pulse rounded-md bg-neutral-200"
        />
      )}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        className={cn(
          'transition-opacity duration-300',
          loaded ? 'opacity-100' : 'opacity-0',
          className,
        )}
      />
    </div>
  );
}
