const DEFAULT_MESSAGE = 'Ocorreu um erro inesperado. Tente novamente.';

const DATABASE_ERROR_MAP: Array<{ test: (message: string) => boolean; text: string }> = [
  {
    test: (message) => message.includes('violates foreign key constraint') && message.includes('quote_items_service_type_id_fkey'),
    text: 'Este tipo de serviço não pode ser excluído porque já está sendo usado em itens de orçamento.',
  },
  {
    test: (message) => message.includes('violates foreign key constraint') && message.includes('service_orders_service_type_id_fkey'),
    text: 'Este tipo de serviço não pode ser excluído porque já está vinculado a ordens de serviço.',
  },
  {
    test: (message) => message.includes('violates foreign key constraint') && message.includes('contracts_service_type_id_fkey'),
    text: 'Este tipo de serviço não pode ser excluído porque já está vinculado a contratos.',
  },
  {
    test: (message) => message.includes('cannot insert a non-default value into column') && message.includes('final_price'),
    text: 'Não foi possível salvar o orçamento porque um valor calculado foi enviado incorretamente. Tente novamente.',
  },
  {
    test: (message) => message.includes('cannot insert a non-default value into column') && message.includes('displacement_cost'),
    text: 'Não foi possível salvar o orçamento porque um valor de deslocamento calculado foi enviado incorretamente. Tente novamente.',
  },
  {
    test: (message) => message.includes('duplicate key value'),
    text: 'Já existe um registro com esses dados.',
  },
  {
    test: (message) => message.includes('row-level security'),
    text: 'Você não tem permissão para realizar esta ação.',
  },
];

export function getErrorMessage(error: unknown, fallback = DEFAULT_MESSAGE) {
  let raw = '';
  if (error instanceof Error) {
    raw = error.message;
  } else if (typeof error === 'string') {
    raw = error;
  } else if (error && typeof error === 'object' && 'message' in error) {
    raw = String((error as any).message);
  } else {
    raw = '';
  }
  const message = raw.toLowerCase();
  const mapped = DATABASE_ERROR_MAP.find((item) => item.test(message));
  return mapped?.text || raw || fallback;
}
