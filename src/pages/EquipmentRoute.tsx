import { useParams } from 'react-router-dom';
import { useIsMobile } from '@/hooks/use-mobile';
import EquipmentPage from '@/pages/Equipment';
import EquipmentDetail from '@/pages/EquipmentDetail';

/**
 * Porta de entrada de `/equipamentos` E de `/equipamentos/:id`.
 *
 * As duas rotas renderizam ESTE mesmo componente de propósito: o tipo do
 * elemento não muda, então o React não desmonta nada ao abrir um aparelho — o
 * cabeçalho, a coluna da lista, a busca e a ordenação continuam de pé, sem o
 * "pisca" de tela inteira.
 *
 * No celular não existe lista ao lado: a ficha ocupa a tela toda.
 */
export default function EquipmentRoute() {
  const { id } = useParams<{ id: string }>();
  const isMobile = useIsMobile();

  if (isMobile && id) return <EquipmentDetail />;
  return <EquipmentPage />;
}
