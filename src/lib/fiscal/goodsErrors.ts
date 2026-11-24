const ERRORS: Record<string, string> = {
  unauthorized: 'Sua sessão expirou. Entre novamente.',
  no_company: 'Sua conta precisa estar vinculada a uma empresa ativa.',
  module_inactive: 'O módulo de Notas Fiscais não está disponível para esta empresa.',
  forbidden: 'Você não tem permissão para emitir notas fiscais. Peça acesso ao administrador.',
  certificate_required: 'Envie um certificado A1 válido nas Configurações Fiscais antes de emitir.',
  document_disabled: 'Ative este documento nas Configurações Fiscais antes de emitir.',
  production_not_approved: 'A produção continua bloqueada. Conclua a homologação e solicite a liberação.',
  production_blocked: 'A emissão em produção está bloqueada.',
  homologation_not_approved: 'A conta ainda não foi liberada para o teste em homologação. Fale com o suporte.',
  nfce_urls_required: 'Configure as URLs oficiais da SEFAZ para a UF e o ambiente nas Configurações Fiscais.',
  issuer_incomplete: 'Complete CNPJ, endereço, inscrição estadual e município IBGE nas Configurações Fiscais.',
  csc_required: 'O CSC de NFC-e precisa ser configurado pelo suporte no ambiente seguro do servidor.',
  source_forbidden: 'Esta venda ou compra não está disponível para seu acesso fiscal.',
  invalid_draft: 'Revise o modelo, a direção e a origem do documento fiscal.',
  source_not_ready: 'A venda precisa estar confirmada nesta empresa antes da emissão.',
  source_mismatch: 'Os itens, descontos e pagamentos precisam corresponder à venda concluída. Importe novamente.',
  resultado_incerto: 'A confirmação da SEFAZ não voltou. Consulte esta mesma nota antes de tentar novamente.',
  artifact_not_found: 'Este arquivo fiscal ainda não está disponível. Consulte a situação da nota.',
  document_not_transmitted: 'A nota ainda não possui chave de acesso. Aguarde o processamento.',
  not_found: 'A nota não foi encontrada nesta empresa.',
  automatic_blocked: 'A emissão automática permanece bloqueada até a aprovação do canário.',
};
export function goodsFiscalError(payload: unknown, fallback = 'Não foi possível concluir a operação fiscal. Tente novamente.') {
  const row = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const code = String(row.error ?? row.code ?? '');
  if (ERRORS[code]) return ERRORS[code];
  if (code === 'validation_failed' && typeof row.message === 'string' && !/SQLSTATE|constraint|public\.|rpc|supabase|token|certificate_ref|235\d\d|42\w{3}/i.test(row.message)) return row.message.slice(0, 1500);
  return fallback;
}
