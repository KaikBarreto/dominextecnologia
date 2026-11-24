import { Banknote, Eye, PackageCheck, Printer, RotateCcw, Trash2, UserRound, WalletCards } from 'lucide-react';
import { RowActionsMenu } from '@/components/ui/RowActionsMenu';

/** Menus de pedidos compartilham destinos reais; quem chama aplica as permissões. */
export interface PdvOrderActionsMenuProps {
  orderId: string;
  orderNumber: number;
  canGenerateReceipt: boolean;
  onView: () => void;
  onReceipt: () => void;
  onReceive?: () => void;
  onPickup?: () => void;
  onReturns?: () => void;
  onValues?: () => void;
  onCustomer?: () => void;
  onCancel?: () => void;
  triggerClassName?: string;
  onOpenChange?: (open: boolean) => void;
}

export function PdvOrderActionsMenu(props: PdvOrderActionsMenuProps) {
  return <RowActionsMenu
    ariaLabel={`Ações do pedido ${props.orderNumber}`}
    triggerVariant="plain"
    triggerClassName={props.triggerClassName}
    onOpenChange={props.onOpenChange}
    actions={[
      { label: 'Ver pedido e histórico', icon: Eye, onClick: props.onView },
      { label: 'Receber no caixa', icon: Banknote, onClick: () => props.onReceive?.(), hidden: !props.onReceive },
      { label: 'Conferir retirada', icon: PackageCheck, onClick: () => props.onPickup?.(), hidden: !props.onPickup },
      { label: 'Gerar comprovante', icon: Printer, onClick: props.onReceipt, hidden: !props.canGenerateReceipt },
      { label: 'Devoluções e itens não retirados', icon: RotateCcw, onClick: () => props.onReturns?.(), hidden: !props.onReturns },
      { label: 'Trocas, créditos e reembolsos', icon: WalletCards, onClick: () => props.onValues?.(), hidden: !props.onValues },
      { label: 'Saldo e histórico do cliente', icon: UserRound, onClick: () => props.onCustomer?.(), hidden: !props.onCustomer },
      { label: 'Cancelar pedido', icon: Trash2, onClick: () => props.onCancel?.(), hidden: !props.onCancel, variant: 'delete' },
    ]}
  />;
}
