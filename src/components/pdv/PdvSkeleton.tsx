import { PdvPageSkeleton } from '@/components/pdv/loading/PdvPageSkeleton';

interface PdvSkeletonProps {
  isMobileCart: boolean;
  showNumpad: boolean;
  catalogMode?: 'quick' | 'catalog';
}

/** Mantém a API dos gates de venda e compartilha o layout atual do catálogo. */
export function PdvSkeleton({ isMobileCart, showNumpad, catalogMode = 'catalog' }: PdvSkeletonProps) {
  return <PdvPageSkeleton variant="sale" catalogMode={catalogMode} hideCart={isMobileCart} showNumpad={showNumpad} label="Carregando venda" />;
}
