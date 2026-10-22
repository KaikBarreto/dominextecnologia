import { useParams } from 'react-router-dom';
import { useIsMobile } from '@/hooks/use-mobile';
import Customers from '@/pages/Customers';
import CustomerDetail from '@/pages/CustomerDetail';

/**
 * Porta de entrada de `/clientes` E de `/clientes/:id`.
 *
 * As duas rotas renderizam ESTE mesmo componente de propósito: como o tipo do
 * elemento não muda, o React não desmonta nada ao abrir um cadastro. É isso que
 * mantém o cabeçalho, a coluna da lista, a busca e a ordenação de pé — e tira o
 * "pisca" de tela inteira que havia quando cada rota tinha seu componente.
 *
 * No celular não existe lista ao lado: a ficha ocupa a tela toda, com o voltar
 * do shell.
 */
export default function CustomersRoute() {
  const { id } = useParams<{ id: string }>();
  const isMobile = useIsMobile();

  if (isMobile && id) return <CustomerDetail />;
  return <Customers />;
}
