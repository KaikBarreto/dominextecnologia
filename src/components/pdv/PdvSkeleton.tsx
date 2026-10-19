import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { PdvProductCardSkeleton } from '@/components/pdv/PdvProductCard';

/** Quantidade de células de skeleton na grade — cobre ~2 fileiras no desktop largo
 * sem exagerar no mobile (a grade é a mesma `grid-cols-2 ... min-[1280px]:grid-cols-5`
 * da tela real, então sobra ou falta célula dependendo da largura — tudo bem, é
 * só decoração de carregamento). */
const GRID_SKELETON_COUNT = 10;

interface PdvSkeletonProps {
  isMobileCart: boolean;
  showNumpad: boolean;
}

/**
 * Esqueleto do Caixa enquanto inventário, estoques, grupos e clientes ainda
 * não voltaram do servidor — pedido do CEO 2026-10-18: "ao entrar no caixa,
 * carregou e depois vieram as fotos, faça o carregamento de tudo ser
 * amigável com loading skeletons".
 *
 * Reproduz a MESMA estrutura de colunas da tela real (busca + seletor de
 * local, pills de categoria, grade de produtos, resumo do carrinho) com as
 * MESMAS alturas (`calc(100vh-18rem)`, ver nota em `Pdv.tsx`) pra não dar
 * salto de layout (CLS) quando os dados chegam — só troca conteúdo por
 * blocos cinza pulsantes. Foto de produto tem skeleton PRÓPRIO dentro de
 * `PdvProductCard` (cobre o tempo da URL assinada + download, que é
 * independente deste gate inicial) — ver `PdvProductCardSkeleton`.
 */
export function PdvSkeleton({ isMobileCart, showNumpad }: PdvSkeletonProps) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-3 md:h-[calc(100vh-18rem)]">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-full sm:w-56" />
        </div>

        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-16 rounded-full" />
          <Skeleton className="h-9 w-28 rounded-full" />
          <Skeleton className="h-9 w-24 rounded-full" />
        </div>

        <div className={cn('min-h-0', !isMobileCart && 'flex-1 overflow-hidden')}>
          <div className="grid grid-cols-2 gap-2 min-[768px]:grid-cols-3 min-[1024px]:grid-cols-4 min-[1280px]:grid-cols-5">
            {Array.from({ length: GRID_SKELETON_COUNT }).map((_, i) => (
              <PdvProductCardSkeleton key={i} />
            ))}
          </div>
        </div>

        {!isMobileCart && (
          <div className="flex shrink-0 flex-col gap-2 rounded-lg border border-border p-3">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-4 w-full" />
          </div>
        )}
      </div>

      {!isMobileCart && (
        <Card className="w-full shrink-0 md:w-80 lg:w-96">
          <CardContent className="flex h-[calc(100vh-18rem)] flex-col justify-end gap-3 p-4">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-8 w-1/2" />
            <Skeleton className="h-16 w-full" />
            <div className="grid grid-cols-2 gap-2">
              <Skeleton className="h-11 w-full" />
              <Skeleton className="h-11 w-full" />
            </div>
            {showNumpad && <Skeleton className="h-40 w-full" />}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
