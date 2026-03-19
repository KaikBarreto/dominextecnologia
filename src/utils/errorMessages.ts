const DEFAULT_MESSAGE = 'Ocorreu um erro inesperado. Tente novamente.';

type ErrorLike = {
  code?: string;
  details?: string;
  hint?: string;
  message?: string;
};

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
    test: (m) => m.includes('violates foreign key constraint') && m.includes('service_orders_team_id_fkey') && !m.includes('update or delete'),
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

  // ── FK: Inventory ──
  {
    test: (m) => m.includes('violates foreign key constraint') && m.includes('inventory_movements_inventory_id_fkey'),
    text: 'Este item de estoque não pode ser excluído porque possui movimentações registradas.',
  },
  {
    test: (m) => m.includes('violates foreign key constraint') && m.includes('_inventory_id_fkey'),
    text: 'Este item de estoque não pode ser excluído porque está vinculado a materiais de serviço ou itens de orçamento.',
  },

  // ── FK: Teams (delete blocked) ──
  {
    test: (m) => m.includes('violates foreign key constraint') && m.includes('_team_id_fkey') && (m.includes('update or delete') || m.includes('on table "teams"')),
    text: 'Esta equipe não pode ser excluída porque está vinculada a ordens de serviço ou contratos.',
  },
  {
    test: (m) => m.includes('violates foreign key constraint') && m.includes('_team_id_fkey'),
    text: 'A equipe selecionada é inválida ou foi removida. Selecione uma equipe válida ou deixe o campo em branco.',
  },

  // ── FK: CRM Stages ──
  {
    test: (m) => m.includes('violates foreign key constraint') && m.includes('leads_stage_id_fkey'),
    text: 'Este estágio não pode ser excluído porque possui leads vinculados. Mova os leads para outro estágio antes.',
  },

  // ── FK: Financial Categories ──
  {
    test: (m) => m.includes('violates foreign key constraint') && m.includes('financial_transactions_category'),
    text: 'Esta categoria não pode ser excluída porque está sendo usada em transações financeiras.',
  },

  // ── FK: Equipment Categories ──
  {
    test: (m) => m.includes('violates foreign key constraint') && m.includes('equipment_category_id_fkey'),
    text: 'Esta categoria não pode ser excluída porque possui equipamentos vinculados.',
  },

  // ── FK: Cost Resources ──
  {
    test: (m) => m.includes('violates foreign key constraint') && m.includes('cost_resource_items_resource_id_fkey'),
    text: 'Este recurso não pode ser excluído porque possui itens de custo vinculados.',
  },
  {
    test: (m) => m.includes('violates foreign key constraint') && m.includes('service_cost_resources'),
    text: 'Este recurso não pode ser excluído porque está vinculado a custos de serviço.',
  },

  // ── FK: Generic catch-all ──
  {
    test: (m) => m.includes('violates foreign key constraint'),
    text: 'Este registro não pode ser excluído porque possui dados vinculados. Remova os vínculos antes de excluir.',
  },

  // ── Generated columns ──
  {
    test: (m) => m.includes('cannot insert a non-default value into column') && m.includes('final_price'),
    text: 'Não foi possível salvar o orçamento porque um valor calculado foi enviado incorretamente. Tente novamente.',
  },
  {
    test: (m) => m.includes('cannot insert a non-default value into column') && m.includes('displacement_cost'),
    text: 'Não foi possível salvar o orçamento porque um valor de deslocamento calculado foi enviado incorretamente. Tente novamente.',
  },

  // ── Not null violations ──
  {
    test: (m) => m.includes('not-null constraint') || m.includes('null value in column'),
    text: 'Um campo obrigatório não foi preenchido. Verifique os campos e tente novamente.',
  },

  // ── Duplicate ──
  {
    test: (m) => m.includes('duplicate key value'),
    text: 'Já existe um registro com esses dados.',
  },

  // ── RLS ──
  {
    test: (m) => m.includes('row-level security'),
    text: 'Você não tem permissão para realizar esta ação.',
  },

  // ── Network / connectivity errors ──
  {
    test: (m) => m.includes('failed to fetch') || m.includes('networkerror') || m.includes('network request failed'),
    text: 'Sem conexão com a internet. Verifique sua rede e tente novamente.',
  },
  {
    test: (m) => m.includes('timeout') || m.includes('econnrefused') || m.includes('econnreset'),
    text: 'O servidor demorou para responder. Tente novamente em alguns instantes.',
  },
  {
    test: (m) => m.includes('jwt expired') || m.includes('invalid jwt'),
    text: 'Sua sessão expirou. Faça login novamente.',
  },
];

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
