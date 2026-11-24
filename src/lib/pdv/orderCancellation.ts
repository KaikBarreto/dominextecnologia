type PdvCancellationResult = Record<string, unknown> | null;

export function canCancelPdvOrder(status: string): boolean {
  return !['rascunho', 'aguardando_pagamento'].includes(status) && !status.startsWith('cancelado');
}

export function assertPdvCancellationResult(result: PdvCancellationResult): Record<string, unknown> {
  if (result?.status !== 'cancelado' || result.cancelado !== true) {
    throw new Error('A venda não foi cancelada. Atualize a tela e tente novamente pelo pedido.');
  }
  return result;
}

export function mapPdvOrderCancellationError(error: unknown): Error {
  const raw = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const details = typeof raw.details === 'string' ? raw.details : '';
  const message = typeof raw.message === 'string' ? raw.message : '';
  const code = /(?:^|\s)code=([a-z0-9_]+)/i.exec(details)?.[1] ?? '';

  if (code === 'pdv_order_cash_access_denied') {
    return new Error('Este pedido pertence a outro caixa e não pode ser cancelado pelo seu perfil.');
  }
  if (raw.code === 'P0002') return new Error('Este pedido não foi encontrado. Atualize a lista.');
  if (raw.code === '42501') return new Error('Seu perfil não permite cancelar este pedido.');
  if (/já está cancelado/i.test(message)) return new Error('Este pedido já foi cancelado. Atualize a lista.');
  if (/fetch|network|connection/i.test(message)) {
    return new Error('Não foi possível acessar o servidor. Verifique sua conexão.');
  }
  return new Error('Não foi possível cancelar o pedido. Nenhum valor foi alterado.');
}
