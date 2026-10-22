import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface AddressMapProps {
  /** URL do embed (Google Maps `output=embed`). */
  src: string;
  title: string;
  className?: string;
}

/**
 * Mapa de endereço que troca de lugar SEM piscar.
 *
 * Um `<iframe>` que muda de `src` navega, e navegar deixa o quadro BRANCO até o
 * mapa novo pintar. Como a ficha do cliente agora fica montada enquanto se
 * troca de cadastro (lista + ficha), esse branco virava um pisca a cada clique.
 *
 * Aqui existem DUAS camadas com `key` fixa: a da frente continua mostrando o
 * mapa atual enquanto a de trás carrega o endereço novo escondida. Quando a de
 * trás termina (`onLoad`), ela ganha opacidade e vira a da frente. Nenhum
 * iframe é remontado — só o `src` da camada escondida muda.
 */
export function AddressMap({ src, title, className }: AddressMapProps) {
  const [slots, setSlots] = useState<[string | null, string | null]>([src, null]);
  const [prontos, setProntos] = useState<[boolean, boolean]>([false, false]);
  const [frente, setFrente] = useState<0 | 1>(0);

  useEffect(() => {
    if (slots[frente] === src) return;
    const fundo: 0 | 1 = frente === 0 ? 1 : 0;
    if (slots[fundo] === src) return;
    setSlots((atual) => {
      const proximo = [...atual] as [string | null, string | null];
      proximo[fundo] = src;
      return proximo;
    });
    setProntos((atual) => {
      const proximo = [...atual] as [boolean, boolean];
      proximo[fundo] = false;
      return proximo;
    });
  }, [src, slots, frente]);

  const aoCarregar = (indice: 0 | 1) => {
    setProntos((atual) => {
      const proximo = [...atual] as [boolean, boolean];
      proximo[indice] = true;
      return proximo;
    });
    // Só assume a frente se for mesmo o endereço pedido agora (uma troca rápida
    // de cadastro pode deixar um carregamento antigo chegando atrasado).
    if (slots[indice] === src) setFrente(indice);
  };

  return (
    <div className={cn('relative overflow-hidden rounded-lg border bg-muted', className)}>
      {([0, 1] as const).map((indice) => {
        const url = slots[indice];
        if (!url) return null;
        const naFrente = indice === frente;
        // A camada que está carregando fica transparente; a que já carregou fica
        // OPACA mesmo quando é a de trás. Assim a nova entra POR CIMA da antiga
        // (z-10) e nada some no meio do caminho — sem o esmaecido de quando as
        // duas faziam fade ao mesmo tempo.
        return (
          <iframe
            key={indice}
            title={naFrente ? title : ''}
            src={url}
            onLoad={() => aoCarregar(indice)}
            aria-hidden={!naFrente}
            loading="lazy"
            allowFullScreen
            referrerPolicy="no-referrer-when-downgrade"
            className={cn(
              'absolute inset-0 h-full w-full border-0 transition-opacity duration-300',
              prontos[indice] ? 'opacity-100' : 'opacity-0',
              naFrente ? 'z-10' : 'z-0 pointer-events-none',
            )}
          />
        );
      })}
    </div>
  );
}
