import { memo, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { SignedImg } from '@/components/ui/SignedImg';
import { Skeleton } from '@/components/ui/skeleton';
import { PdvProductName } from '@/components/pdv/PdvProductName';
import { cn } from '@/lib/utils';

/**
 * Teto de espera pela foto antes de desistir e revelar o que o `SignedImg`
 * tiver (sucesso ou placeholder "sem foto") — rede de segurança pro caso raro
 * de `onLoad` nunca disparar (arquivo apagado do bucket, signed URL que falha
 * sempre). Sem isso o skeleton pode cobrir pra sempre um "sem foto" legítimo,
 * virando o antipadrão que a régua proíbe: carregando ≠ vazio.
 *
 * 8s (não 3s): o `SignedImg` faz uma dança de 2-3 idas e vindas pra cada foto
 * (tentativa com a URL crua → 403/errored → assina via RPC → baixa a foto de
 * verdade), e cada perna soma latência de rede de verdade. MEDIDO com
 * Playwright simulando 1.5s de latência extra na assinatura: o carregamento
 * genuíno (bem-sucedido) levou ~3.9s ponta a ponta. Um teto de 3s teria
 * cortado ESSE carregamento genuíno na frente do `onLoad` de verdade,
 * revelando um frame não-decodificado por um instante — o MESMO flicker que
 * este componente existe pra evitar, só que uma vez só em vez de a cada
 * navegação. 8s dá folga de sobra pro caminho feliz (mesmo em rede ruim de
 * campo) sem deixar um "sem foto" legítimo pendurado por tempo desproporcional.
 */
const PHOTO_SKELETON_TIMEOUT_MS = 8000;

export interface PdvGridProduct {
  inventoryId: string;
  name: string;
  imageUrl: string | null;
  unitPrice: number;
  unit?: string | null;
  availableQuantity: number;
}

interface PdvProductCardProps {
  product: PdvGridProduct;
  formatCurrency: (value: number) => string;
  outOfStockLabel: string;
  availableLabel: string;
  noPhotoLabel: string;
  onSelect: (product: PdvGridProduct) => void;
  /**
   * Variante densificada pra viewport baixo (notebook 1366×768) — pedido do
   * CEO 2026-10-19 via Tech Lead: "o card tem que ter uma variante
   * compacta", mantendo as 4 informações exigidas (foto, nome em negrito,
   * preço em destaque, saldo) e só densificando. A foto cai pra caixa de
   * ALTURA FIXA (`h-16`=64px, não mais `aspect-[4/3]`) de propósito: assim a
   * altura do card não depende da LARGURA da coluna (que varia com o nº de
   * colunas que a grade escolhe por breakpoint) — decisão mais robusta que
   * tentar prever a largura real da coluna. `object-contain` continua: a
   * foto nunca é cortada, só fica menor.
   *
   * Altura total CALCULADA a partir das classes abaixo (NÃO medida em
   * navegador real — ver `GRID_FLOOR_COMPACT_PX` em `Pdv.tsx` pra quem for
   * conferir contra a tela de verdade): borda 2px + foto 64px + padding
   * 12px (`p-1.5`) + nome 2 linhas (`text-xs`/`leading-tight`) ≈30px + gap
   * 2px + preço (`text-sm`) ≈20px + gap 2px + saldo
   * (`text-[10px]`/`leading-none`) ≈10px ≈ 142px.
   */
  compact?: boolean;
  /**
   * Proporção reservada para a foto. `landscape` mantém o comportamento atual;
   * `square` atende catálogos cuja fotografia de produto nasce em 1:1.
   * A imagem continua com `object-contain`, então mudar a moldura não corta a peça.
   */
  imageAspect?: 'landscape' | 'square';
  /**
   * Tratamento do espaço atrás da imagem. `blur` preserva o preenchimento atual
   * para fotografias; `cutout` usa uma superfície neutra para PNG/WebP com
   * transparência, evitando transformar logos e recortes em uma mancha de cor.
   */
  imageBackdrop?: 'blur' | 'cutout';
}

/**
 * Célula da grade do Caixa. Réguas do CEO respeitadas aqui:
 * - foto + nome em negrito + preço em destaque + saldo visível na própria célula;
 * - "Sem estoque" é selo SATURADO (fundo vermelho, texto branco), nunca outline;
 * - sem foto cai no placeholder digno do `SignedImg` (ícone + texto), nunca
 *   quadrado quebrado;
 * - item sem saldo é claramente marcado E não é clicável (não entra no carrinho).
 */
function PdvProductCardImpl({
  product,
  formatCurrency,
  outOfStockLabel,
  availableLabel,
  noPhotoLabel,
  onSelect,
  compact = false,
  imageAspect = 'landscape',
  imageBackdrop = 'blur',
}: PdvProductCardProps) {
  const outOfStock = product.availableQuantity <= 0;

  // Sem foto cadastrada: `SignedImg` já mostra o placeholder "sem foto" na
  // hora, sem esperar rede nenhuma — não é um estado de carregamento, é vazio
  // de verdade, então nasce "pronto" (sem skeleton por cima). Com foto, nasce
  // "carregando" até o <img> real disparar `onLoad` (dois tempos: a URL
  // assinada E o download da imagem — o skeleton cobre os dois).
  const [photoReady, setPhotoReady] = useState(() => !product.imageUrl);

  useEffect(() => {
    if (!product.imageUrl || photoReady) return;
    const timeout = window.setTimeout(() => setPhotoReady(true), PHOTO_SKELETON_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.imageUrl]);

  return (
    <button
      type="button"
      disabled={outOfStock}
      aria-disabled={outOfStock}
      onClick={() => !outOfStock && onSelect(product)}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-lg border border-border bg-background text-left transition-shadow',
        outOfStock ? 'cursor-not-allowed' : 'hover:shadow-md active:scale-[0.98] cursor-pointer',
      )}
    >
      {/* `opacity-60` fica SÓ na foto, nunca no botão inteiro: o selo "Sem
          estoque" é um Badge saturado (bg-destructive + texto branco) e
          precisa ficar fora do escopo da opacidade, senão o vermelho lava
          pra um salmão pálido — exatamente o antipadrão que a régua proíbe.

          A variante `landscape` continua em `aspect-[4/3]`: com a grade populada (38
          produtos, foto+saldo reais) a foto quadrada em 221px de card total
          deixava só ~97px pro nome+preço+saldo, e o preço ficava fora da
          janela de rolagem (medido 2026-10-18, regressão do Finalizar
          Venda). Foto mais baixa libera a proporção certa pro que a régua do
          CEO exige: nome em negrito, preço em destaque e saldo SEMPRE
          visíveis na própria célula. */}
      <div
        className={cn(
          'relative w-full',
          imageBackdrop === 'cutout' && product.imageUrl
            ? 'bg-[radial-gradient(circle_at_50%_42%,hsl(var(--background))_0%,hsl(var(--muted)/0.72)_100%)]'
            : 'bg-muted/40',
          imageAspect === 'square' ? 'aspect-square' : compact ? 'h-16' : 'aspect-[4/3]',
          outOfStock && 'opacity-60',
        )}
      >
        {/* Skeleton por cima enquanto a foto não chegou (URL assinada +
            download) — sem isso o card aparece "pronto" e a foto pisca
            depois, um card de cada vez (queixa do CEO 2026-10-18). */}
        {!photoReady && <Skeleton className="absolute inset-0 h-full w-full rounded-none" />}
        {/* `absolute inset-0` no <img> (correção 2026-10-19, "fotos ficaram
            com tamanho diferente"): o tenant demo tem foto 4:3 (acervo
            livre) e desenho 1:1 (gerado) lado a lado na MESMA fileira. Com o
            <img> em fluxo normal (`h-full w-full` sem `absolute`), o
            `aspect-ratio` do container e a altura percentual do filho viram
            uma dependência circular que alguns engines resolvem deixando a
            PROPORÇÃO NATURAL DA IMAGEM vazar pra fora da caixa — medido:
            card de imagem 1:1 ficava com a caixa 138×138 (quadrada) enquanto
            o vizinho 4:3 ficava 138×104, cards da mesma fileira com altura
            de foto DIFERENTE. `absolute inset-0` tira o <img> do fluxo (mesmo
            truque que o Skeleton já usava) — a caixa passa a ser 100% do
            `aspect-[4/3]` do pai, sempre, pra QUALQUER proporção de arquivo
            (celular 4:3/3:4, catálogo 1:1, print qualquer-coisa — não dá pra
            depender do cliente subir foto "do jeito certo").

            `object-contain` (não `object-cover`, pedido do CEO 2026-10-19):
            cobrir cortava a peça nas bordas; conter mostra a foto INTEIRA.

            A barra que sobra quando a proporção não bate com 4:3 é preenchida
            pela PRÓPRIA FOTO borrada (`blurFillClassName`, pedido do CEO
            2026-10-19: "quando a foto não for da mesma proporção faça ter um
            fundo da foto ocupando todo o espaço porém com blur") — o acervo
            real é foto de celular, de catálogo e print na mesma fileira, e o
            cinza chapado nas bordas fazia o card parecer defeituoso.

            NÃO é detecção de proporção, de propósito: a cópia borrada é
            sempre renderizada e, quando a foto JÁ tem a proporção da caixa, a
            de cima a cobre por inteiro e o borrão simplesmente não aparece.
            Medir `naturalWidth/naturalHeight` pra decidir custaria um estado a
            mais por card e um frame de layout pra errar, pra chegar no mesmo
            resultado visual.

            `scale-110` existe porque `blur` amostra pixel de fora da caixa e
            deixaria uma orla transparente na borda sem o zoom. O `opacity-0`
            enquanto a foto não chegou acompanha o da imagem real: sem isso a
            cópia borrada (que não tem `onLoad`) apareceria por cima do
            Skeleton e mataria o carregamento amigável. */}
        <SignedImg
          src={product.imageUrl}
          alt={product.name}
          fallbackLabel={noPhotoLabel}
          className={cn('absolute inset-0 h-full w-full object-contain', !photoReady && 'opacity-0')}
          blurFillClassName={
            imageBackdrop === 'blur'
              ? cn(
                  'absolute inset-0 h-full w-full scale-110 object-cover blur-xl',
                  !photoReady && 'opacity-0',
                )
              : undefined
          }
          onLoad={() => setPhotoReady(true)}
        />
      </div>
      {outOfStock && (
        <Badge
          variant="destructive"
          className="absolute right-1.5 top-1.5 rounded-full px-2 py-0.5 text-[10px]"
        >
          {outOfStockLabel}
        </Badge>
      )}
      <div
        className={cn(
          'flex flex-1 flex-col gap-0.5',
          compact ? 'p-1.5' : 'p-2',
          outOfStock && 'opacity-60',
        )}
      >
        {/* Nome em ATÉ 2 linhas (correção 2026-10-19: 1 linha com corte de
            caractere fixo cortava cedo demais, sobrando 200px+ de card
            vazio). `PdvProductName` mede a largura REAL do card e só corta
            no MEIO quando o nome de fato não cabe em 2 linhas — nome curto
            aparece inteiro, nome longo preserva o FIM (onde mora "35uF" x
            "45uF"). `min-h` reserva a altura de 2 linhas SEMPRE, pra um nome
            de 1 linha não deixar o card mais baixo que o vizinho (grade
            serrilhada). `title` guarda o nome inteiro pro mouse/leitor de
            tela. Na variante compacta a fonte desce um passo (`text-xs`) e
            o `min-h` acompanha (2 linhas em `text-xs`/`leading-tight`). */}
        <PdvProductName
          name={product.name}
          className={cn(
            'font-bold leading-tight text-foreground',
            compact ? 'min-h-[1.875rem] text-xs' : 'min-h-[2.25rem] text-sm',
          )}
        />
        <span className={cn('font-extrabold text-primary', compact ? 'text-sm' : 'text-base')}>
          {formatCurrency(product.unitPrice)}
        </span>
        {!outOfStock && (
          <span
            className={cn(
              'text-muted-foreground',
              compact ? 'text-[10px] leading-none' : 'text-xs',
            )}
          >
            {availableLabel.replace('{count}', String(product.availableQuantity))}
          </span>
        )}
      </div>
    </button>
  );
}

export const PdvProductCard = memo(PdvProductCardImpl);

/**
 * Esqueleto da célula da grade, com a MESMA forma do card real (foto
 * quadrada + 2 linhas de nome + 1 linha de preço) — usado enquanto o
 * catálogo (inventário/estoques/grupos) ainda não chegou do servidor.
 * Pedido do CEO 2026-10-18: "faça o carregamento de tudo ser amigável com
 * skeletons".
 */
export function PdvProductCardSkeleton({
  imageAspect = 'landscape',
}: {
  imageAspect?: 'landscape' | 'square';
} = {}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-background">
      <Skeleton className={cn(imageAspect === 'square' ? 'aspect-square' : 'aspect-[4/3]', 'w-full rounded-none')} />
      <div className="flex flex-col gap-1.5 p-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}
