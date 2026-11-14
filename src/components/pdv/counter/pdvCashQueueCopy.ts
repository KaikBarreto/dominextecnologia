export function getPdvCashQueueCopy(cashierDeliveryEnabled: boolean) {
  return cashierDeliveryEnabled
    ? {
        description: 'Receba ou aprove o fiado. Todos os itens serão entregues agora, neste caixa.',
        action: 'Receber e entregar',
        paymentDescription: 'Confirme a forma de pagamento ou o fiado para receber e entregar todos os itens.',
        paymentConfirm: 'Receber e entregar',
        paymentSubmitting: 'Recebendo e entregando...',
        successTitle: 'Pedido recebido e entregue',
        successDescription: 'Pagamento ou fiado, estoque e entrega foram registrados juntos.',
      }
    : {
        description: 'Receba ou aprove o fiado. A entrega acontece depois, na expedição.',
        action: 'Receber e liberar',
        paymentDescription: 'Confirme a forma de pagamento ou o fiado para liberar o pedido para retirada.',
        paymentConfirm: 'Receber e liberar retirada',
        paymentSubmitting: 'Recebendo e liberando...',
        successTitle: 'Pedido liberado para retirada',
        successDescription: 'O caixa registrou o pagamento ou fiado. A mercadoria segue para a expedição.',
      };
}
