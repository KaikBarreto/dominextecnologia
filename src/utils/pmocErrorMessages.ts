/**
 * Mapeamento de códigos de erro das edge functions PMOC para mensagens amigáveis
 * em PT-BR (Onda G — v1.9.x).
 *
 * As edge functions (`generate-pmoc-trt-pdf`, `generate-pmoc-dossie-pdf` etc.)
 * retornam `{ error: '<code>' }` em casos de validação. Aqui traduzimos o
 * code técnico pra `{ title, description }` que o toast exibe pro gestor com
 * orientação clara sobre o que falta cadastrar.
 *
 * Mapa é estendido conforme o Database vai listando novos códigos —
 * ver `supabase/functions/_shared/pmoc-errors.ts` (Onda G — paralelo).
 *
 * Plano: docs/planos/2026-05-23-pmoc-onda-G-ajustes-finos.md (Onda G).
 */

export interface PmocFriendlyError {
  title: string;
  description: string;
  /** Quando preenchido, o toast pode mostrar um CTA levando o gestor pra esse path. */
  cta?: {
    label: string;
    path: string;
  };
}

export const PMOC_ERROR_MESSAGES: Record<string, PmocFriendlyError> = {
  cnpj_missing: {
    title: 'CNPJ da empresa não cadastrado',
    description:
      'O TRT exige CNPJ pela Lei 13.589/2018. Cadastre o CNPJ em Configurações → Empresa antes de gerar o documento.',
    cta: { label: 'Ir pra Configurações', path: '/configuracoes?tab=empresa' },
  },
  company_name_missing: {
    title: 'Razão social da empresa não cadastrada',
    description:
      'Cadastre a razão social em Configurações → Empresa antes de gerar o documento.',
    cta: { label: 'Ir pra Configurações', path: '/configuracoes?tab=empresa' },
  },
  rt_missing: {
    title: 'Responsável Técnico não atribuído',
    description:
      'Esse contrato PMOC precisa de um RT vinculado. Edite o contrato e selecione um Responsável Técnico na seção PMOC.',
  },
  rt_cft_missing: {
    title: 'CFT/CREA do RT em branco',
    description:
      'O RT atribuído ao contrato não tem CFT/CREA cadastrado. Vá em Responsáveis Técnicos, edite o RT e preencha o registro profissional.',
    cta: { label: 'Ir pra Responsáveis Técnicos', path: '/responsaveis-tecnicos' },
  },
  rt_name_missing: {
    title: 'Nome do RT em branco',
    description:
      'O RT atribuído a esse contrato está sem nome cadastrado. Vá em Responsáveis Técnicos e preencha o nome completo.',
    cta: { label: 'Ir pra Responsáveis Técnicos', path: '/responsaveis-tecnicos' },
  },
  rt_modality_missing: {
    title: 'Modalidade do RT em branco',
    description:
      'O RT atribuído a esse contrato está sem modalidade cadastrada (ex: Engenharia Mecânica, Refrigeração). Edite o RT pra completar.',
    cta: { label: 'Ir pra Responsáveis Técnicos', path: '/responsaveis-tecnicos' },
  },
  customer_missing: {
    title: 'Cliente do contrato não encontrado',
    description:
      'Esse contrato não tem um cliente válido vinculado. Recarregue a tela e, se persistir, entre em contato com o suporte.',
  },
  customer_address_missing: {
    title: 'Endereço do cliente em branco',
    description:
      'O Certificado de Conformidade exige endereço do cliente. Edite o cadastro do cliente e preencha o endereço antes de gerar.',
  },
  contract_not_pmoc: {
    title: 'Contrato não é PMOC',
    description:
      'Esse contrato não está marcado como PMOC. Edite o contrato e ative a opção "Contrato PMOC" pra gerar os documentos.',
  },
  contract_not_found: {
    title: 'Contrato não encontrado',
    description:
      'O contrato não foi encontrado ou foi removido. Recarregue a página e tente novamente.',
  },
  permission_denied: {
    title: 'Sem permissão',
    description:
      'Você não tem permissão para gerar este documento. Fale com o administrador da sua empresa.',
  },
  session_expired: {
    title: 'Sessão expirada',
    description: 'Sua sessão expirou. Faça login novamente.',
  },
  edge_not_deployed: {
    title: 'Geração de PDF em breve',
    description:
      'Aguarde a próxima atualização do sistema. Se persistir por mais de 24h, entre em contato com o suporte.',
  },
};

/**
 * Converte um erro vindo da edge function (string code OU mensagem livre) em
 * `{ title, description, cta? }` amigável.
 *
 * Heurística:
 *  1. Se o `errorMessage` bate exatamente com uma chave do mapa → usa.
 *  2. Se a mensagem CONTÉM uma chave conhecida (ex: "Erro: cnpj_missing") → usa.
 *  3. Senão → mensagem genérica com o texto bruto exibido em `description`.
 */
export function getPmocErrorMessage(
  errorMessage: string,
  fallbackTitle = 'Erro ao gerar documento',
): PmocFriendlyError {
  if (!errorMessage) {
    return {
      title: fallbackTitle,
      description: 'Erro desconhecido. Tente novamente em alguns instantes.',
    };
  }

  // 1. Match direto.
  const direct = PMOC_ERROR_MESSAGES[errorMessage];
  if (direct) return direct;

  // 2. Match parcial (mensagem que contém o code).
  const normalized = errorMessage.toLowerCase().trim();
  for (const [code, friendly] of Object.entries(PMOC_ERROR_MESSAGES)) {
    if (normalized.includes(code)) return friendly;
  }

  // 3. Genérico — mostra a mensagem original como descrição (pode ser uma
  //    string já amigável do hook, ex: "Você não tem permissão...").
  return {
    title: fallbackTitle,
    description: errorMessage,
  };
}
