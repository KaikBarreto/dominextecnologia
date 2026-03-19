const DEFAULT_MESSAGE = 'Ocorreu um erro inesperado. Tente novamente.';

const DATABASE_ERROR_MAP: Array<{ test: (message: string) => boolean; text: string }> = [
  // ── FK: Service Types ──
  {
    test: (m) => m.includes('violates foreign key constraint') && m.includes('quote_items_service_type_id_fkey'),
    text: 'Este tipo de serviço não pode ser excluído porque já está sendo usado em itens de orçamento.',
  },
  {
    test: (m) => m.includes('violates foreign key constraint') && m.includes('service_orders_service_type_id_fkey'),
    text: 'Este tipo de serviço não pode ser excluído porque já está vinculado a ordens de serviço.',
  },
  {
    test: (m) => m.includes('violates foreign key constraint') && m.includes('contracts_service_type_id_fkey'),
    text: 'Este tipo de serviço não pode ser excluído porque já está vinculado a contratos.',
  },
  {
    test: (m) => m.includes('violates foreign key constraint') && m.includes('form_template_service_types'),
    text: 'Este tipo de serviço não pode ser excluído porque está vinculado a questionários.',
  },

  // ── FK: Technician / OS insert ──
  {
    test: (m) => m.includes('violates foreign key constraint') && m.includes('service_orders_technician_id_fkey'),
    text: 'O técnico selecionado é inválido ou foi removido. Selecione um técnico válido ou deixe o campo em branco.',
  },
  {
    test: (m) => m.includes('violates foreign key constraint') && m.includes('service_orders_customer_id_fkey'),
    text: 'O cliente selecionado é inválido ou foi removido. Selecione um cliente válido ou deixe o campo em branco quando permitido.',
  },
  {
    test: (m) => m.includes('violates foreign key constraint') && m.includes('service_orders_team_id_fkey'),
    text: 'A equipe selecionada é inválida ou foi removida. Selecione uma equipe válida ou deixe o campo em branco.',
  },
  {
    test: (m) => m.includes('violates foreign key constraint') && m.includes('service_orders_equipment_id_fkey'),
    text: 'O equipamento selecionado é inválido ou foi removido.',
  },

  // ── FK: Customers (delete blocked) ──
  {
    test: (m) => m.includes('violates foreign key constraint') && m.includes('_customer_id_fkey'),
    text: 'Este cliente não pode ser excluído porque possui registros vinculados (OS, contratos, equipamentos ou orçamentos). Remova os vínculos primeiro.',
  },

  // ── FK: Equipment (delete blocked) ──
  {
    test: (m) => m.includes('violates foreign key constraint') && m.includes('_equipment_id_fkey'),
    text: 'Este equipamento não pode ser excluído porque está vinculado a ordens de serviço, contratos ou planos PMOC.',
  },

  // ── FK: Employees (delete blocked) ──
  {
    test: (m) => m.includes('violates foreign key constraint') && m.includes('_employee_id_fkey'),
    text: 'Este funcionário não pode ser excluído porque possui registros de ponto ou movimentações vinculadas.',
  },

  // ── FK: Contracts (delete blocked) ──
  {
    test: (m) => m.includes('violates foreign key constraint') && m.includes('contract_occurrences_contract_id_fkey'),
    text: 'Este contrato não pode ser excluído porque possui ocorrências geradas. Use a exclusão do contrato pela página de detalhe.',
  },
  {
    test: (m) => m.includes('violates foreign key constraint') && m.includes('financial_transactions_contract_id_fkey'),
    text: 'Este contrato não pode ser excluído porque possui transações financeiras vinculadas.',
  },

  // ── FK: Form Templates / Questionnaires ──
  {
    test: (m) => m.includes('violates foreign key constraint') && m.includes('service_orders_form_template_id_fkey'),
    text: 'Este questionário não pode ser excluído porque está vinculado a ordens de serviço.',
  },
  {
    test: (m) => m.includes('violates foreign key constraint') && m.includes('contract_items_form_template_id_fkey'),
    text: 'Este questionário não pode ser excluído porque está vinculado a itens de contrato.',
  },
  {
    test: (m) => m.includes('violates foreign key constraint') && m.includes('contracts_form_template_id_fkey'),
    text: 'Este questionário não pode ser excluído porque está vinculado a contratos.',
  },
  {
    test: (m) => m.includes('violates foreign key constraint') && m.includes('_template_id_fkey'),
    text: 'Este questionário não pode ser excluído porque está vinculado a ordens de serviço ou contratos.',
  },
...
type ErrorLike = {
  code?: string;
  details?: string;
  hint?: string;
  message?: string;
};

export function getErrorMessage(error: unknown, fallback = DEFAULT_MESSAGE) {
  let raw = '';

  if (error instanceof Error) {
    raw = error.message;
  } else if (typeof error === 'string') {
    raw = error;
  } else if (error && typeof error === 'object') {
    const typedError = error as ErrorLike;
    raw = [typedError.message, typedError.details, typedError.hint, typedError.code]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .join(' | ');
  }

  const message = raw.toLowerCase();
  const mapped = DATABASE_ERROR_MAP.find((item) => item.test(message));
  return mapped?.text || raw || fallback;
}
