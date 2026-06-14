/**
 * Catálogo de variáveis dos documentos PMOC (Onda H — v1.9.x).
 *
 * Substitui o sistema antigo de placeholders literais (`{{empresa.cnpj}}` que
 * viravam texto colado no HTML). Agora, no editor rich-text, cada variável é
 * representada por um **nó TipTap dedicado** (`PmocVariableNode`) que renderiza
 * como **badge visual colorido**.
 *
 * No banco, o HTML salvo PRESERVA os nós como
 * `<span data-pmoc-var="empresa.cnpj"></span>`. A substituição pelo valor real
 * (ou linha pontilhada quando vazio) só acontece:
 *  - no `<NodeView>` do editor (pra mostrar valor pro gestor enquanto edita),
 *  - na edge function de geração de PDF (via `substituteVariables` portado pra
 *    Deno — TODO Tech Lead).
 *
 * Catálogo travado pelo CEO em conjunto de 17 variáveis. Mudança aqui só com
 * PM + Tech Lead (regulatório PMOC).
 *
 * Plano: docs/planos/2026-05-23-pmoc-onda-H-variaveis-badges.md
 */

/** Categorias do dropdown "Inserir variável" no editor rich-text. */
export type PmocVariableCategory =
  | 'empresa'
  | 'rt'
  | 'cliente'
  | 'contrato'
  | 'data'
  | 'documento';

export interface PmocVariableMeta {
  /** Rótulo PT-BR exibido no badge e no dropdown. */
  label: string;
  /** Origem do dado (apenas documental — usado na edge function). */
  source: string;
  /** Categoria pra agrupamento no dropdown. */
  category: PmocVariableCategory;
}

/**
 * Catálogo completo de variáveis disponíveis nos documentos PMOC.
 *
 * Chaves usam notação ponto (`empresa.cnpj`) que vira atributo
 * `data-pmoc-var="empresa.cnpj"` no HTML salvo.
 */
export const PMOC_VARIABLES = {
  // ───── Empresa (tenant) ─────
  'empresa.nome': {
    label: 'Nome da Empresa',
    source: 'companies.name',
    category: 'empresa',
  },
  'empresa.razao_social': {
    label: 'Razão Social',
    source: 'company_settings.razao_social || companies.name',
    category: 'empresa',
  },
  'empresa.cnpj': {
    label: 'CNPJ',
    source: 'company_settings.document',
    category: 'empresa',
  },
  'empresa.endereco': {
    label: 'Endereço da Empresa',
    source: 'company_settings.address',
    category: 'empresa',
  },
  'empresa.cidade': {
    label: 'Cidade da Empresa',
    source: 'company_settings.city',
    category: 'empresa',
  },
  'empresa.estado': {
    label: 'Estado da Empresa',
    source: 'company_settings.state',
    category: 'empresa',
  },
  'empresa.telefone': {
    label: 'Telefone Público',
    source: 'company_settings.phone',
    category: 'empresa',
  },
  'empresa.email': {
    label: 'Email da Empresa',
    source: 'company_settings.email',
    category: 'empresa',
  },

  // ───── Responsável Técnico ─────
  'rt.nome': {
    label: 'Nome do RT',
    source: 'responsible_technicians.full_name',
    category: 'rt',
  },
  'rt.modalidade': {
    label: 'Modalidade do RT',
    source: 'responsible_technicians.modality',
    category: 'rt',
  },
  'rt.cft_crea': {
    label: 'CFT/CREA do RT',
    source: 'responsible_technicians.cft_crea',
    category: 'rt',
  },
  'rt.registro': {
    label: 'Registro Profissional',
    source: 'responsible_technicians.registry_number',
    category: 'rt',
  },

  // ───── Cliente (unidade) ─────
  'cliente.nome': {
    label: 'Nome do Cliente',
    source: 'customers.name',
    category: 'cliente',
  },
  'cliente.documento': {
    label: 'CNPJ/CPF do Cliente',
    source: 'customers.document',
    category: 'cliente',
  },
  'cliente.endereco': {
    label: 'Endereço do Cliente',
    source: 'customers.address',
    category: 'cliente',
  },
  'cliente.cidade': {
    label: 'Cidade do Cliente',
    source: 'customers.city || extracted from address',
    category: 'cliente',
  },

  // ───── Contrato ─────
  'contrato.nome': {
    label: 'Nome do Contrato',
    source: 'contracts.name',
    category: 'contrato',
  },
  'contrato.vigencia_inicio': {
    label: 'Vigência Início',
    source: 'contracts.start_date (formato extenso)',
    category: 'contrato',
  },
  'contrato.frequencia': {
    label: 'Frequência',
    source: 'getFrequencyLabel(frequency_type, frequency_value)',
    category: 'contrato',
  },
  'contrato.criado_dia': {
    label: 'Dia da Criação do Contrato',
    source: 'contracts.created_at — dia (2 dígitos)',
    category: 'contrato',
  },
  'contrato.criado_mes': {
    label: 'Mês da Criação do Contrato',
    source: 'contracts.created_at — mês por extenso PT-BR (janeiro, fevereiro, …)',
    category: 'contrato',
  },
  'contrato.criado_ano': {
    label: 'Ano da Criação do Contrato',
    source: 'contracts.created_at — ano (4 dígitos)',
    category: 'contrato',
  },

  // ───── Data ─────
  'data.hoje_extenso': {
    label: 'Data Atual (extenso)',
    source: 'now() formatado "23 de maio de 2026"',
    category: 'data',
  },

  // ───── Documento (validade) ─────
  'documento.validade': {
    label: 'Validade do Documento',
    source: 'company_pmoc_document_templates.{termo_rt|certificado}_validity_months (ex: "12 meses")',
    category: 'documento',
  },
  'documento.data_vencimento': {
    label: 'Data de Vencimento',
    source: 'pmoc_documents.valid_until formatado DD/MM/AAAA',
    category: 'documento',
  },
  'documento.data_emissao': {
    label: 'Data de Emissão',
    source: 'pmoc_documents.generated_at formatado DD/MM/AAAA',
    category: 'documento',
  },
} as const satisfies Record<string, PmocVariableMeta>;

/** Chave válida (`'empresa.cnpj' | 'rt.nome' | ...`). */
export type PmocVariableKey = keyof typeof PMOC_VARIABLES;

/**
 * Valores genéricos de exemplo, um por chave do catálogo.
 *
 * Usado SÓ na prévia do documento (`PmocDocPreviewModal`) pra que o gestor veja
 * a folha "como ficaria preenchida" mesmo quando não há contrato/cliente real
 * (caso do template padrão da empresa). NÃO é usado na geração de PDF — lá os
 * valores reais (ou linha pontilhada) é que valem.
 *
 * O `Record<PmocVariableKey, string>` garante, em tempo de compilação, que toda
 * chave do catálogo tem um genérico correspondente.
 */
export const PMOC_PREVIEW_SAMPLE: Record<PmocVariableKey, string> = {
  // ───── Empresa ─────
  'empresa.nome': 'NOME DA EMPRESA',
  'empresa.razao_social': 'RAZÃO SOCIAL DA EMPRESA LTDA',
  'empresa.cnpj': '00.000.000/0001-00',
  'empresa.endereco': 'Rua Exemplo, 123 — Centro — Cidade/UF',
  'empresa.cidade': 'Cidade',
  'empresa.estado': 'UF',
  'empresa.telefone': '(99) 99999-9999',
  'empresa.email': 'contato@empresa.com.br',
  // ───── Responsável Técnico ─────
  'rt.nome': 'NOME DO RESPONSÁVEL TÉCNICO',
  'rt.modalidade': 'Engenheiro Civil',
  'rt.cft_crea': '000000000-0',
  'rt.registro': '000000000-0',
  // ───── Cliente ─────
  'cliente.nome': 'NOME DO CLIENTE',
  'cliente.documento': '00.000.000/0001-00',
  'cliente.endereco': 'Av. Exemplo, 456 — Bairro — Cidade/UF',
  'cliente.cidade': 'Cidade',
  // ───── Contrato ─────
  'contrato.nome': 'Contrato de Manutenção PMOC',
  'contrato.vigencia_inicio': '01 de janeiro de 2026',
  'contrato.frequencia': 'Mensal',
  'contrato.criado_dia': '01',
  'contrato.criado_mes': 'janeiro',
  'contrato.criado_ano': '2026',
  // ───── Data ─────
  'data.hoje_extenso': '01 de janeiro de 2026',
  // ───── Documento (validade) ─────
  'documento.validade': '12 meses',
  'documento.data_vencimento': '01/01/2027',
  'documento.data_emissao': '01/01/2026',
};

/**
 * Monta um contexto de prévia: para cada chave do catálogo, usa o valor REAL do
 * `context` quando existir e não-vazio; senão cai no genérico de
 * `PMOC_PREVIEW_SAMPLE`. Real tem prioridade — o genérico só preenche o que
 * falta. Resultado: prévia SEMPRE preenchida (nunca cai na linha pontilhada).
 *
 * Usado pela prévia do documento PMOC. NÃO usar na geração de PDF real.
 */
export function buildPreviewContext(
  context: PmocVariableContext | undefined | null,
): Record<PmocVariableKey, string> {
  const result = { ...PMOC_PREVIEW_SAMPLE };
  (Object.keys(PMOC_PREVIEW_SAMPLE) as PmocVariableKey[]).forEach((key) => {
    const real = context?.[key]?.trim();
    if (real) result[key] = real;
  });
  return result;
}

/** Type guard pra checar se uma string é uma chave válida do catálogo. */
export function isPmocVariableKey(value: string): value is PmocVariableKey {
  return Object.prototype.hasOwnProperty.call(PMOC_VARIABLES, value);
}

/** Lista ordenada por categoria, pra renderizar o dropdown. */
export const PMOC_VARIABLES_BY_CATEGORY: Record<PmocVariableCategory, Array<{ key: PmocVariableKey; meta: PmocVariableMeta }>> = (() => {
  const grouped: Record<PmocVariableCategory, Array<{ key: PmocVariableKey; meta: PmocVariableMeta }>> = {
    empresa: [],
    rt: [],
    cliente: [],
    contrato: [],
    data: [],
    documento: [],
  };
  (Object.entries(PMOC_VARIABLES) as Array<[PmocVariableKey, PmocVariableMeta]>).forEach(([key, meta]) => {
    grouped[meta.category].push({ key, meta });
  });
  return grouped;
})();

/** Label PT-BR da categoria pra cabeçalho do dropdown. */
export const PMOC_VARIABLE_CATEGORY_LABELS: Record<PmocVariableCategory, string> = {
  empresa: 'Empresa',
  rt: 'Responsável Técnico',
  cliente: 'Cliente',
  contrato: 'Contrato',
  data: 'Data',
  documento: 'Documento',
};

/**
 * Contexto runtime com os valores reais das variáveis. Montado em
 * ContractDetail a partir de `companySettings`, `contractRt`, `customer`,
 * `contract`. Pode ter campos undefined — `getVariableValue` trata vazio.
 */
export type PmocVariableContext = Partial<Record<PmocVariableKey, string>>;

/**
 * Busca o valor real de uma variável no contexto. Retorna `''` quando vazio
 * (chamadores decidem se renderizam linha pontilhada, badge vermelho ou
 * fallback).
 */
export function getVariableValue(
  key: PmocVariableKey,
  context: PmocVariableContext | undefined | null,
): string {
  if (!context) return '';
  const raw = context[key];
  if (typeof raw !== 'string') return '';
  return raw.trim();
}

/** Linha pontilhada usada quando uma variável fica vazia ao gerar o PDF. */
export const EMPTY_VARIABLE_DASHED_LINE = '____________________';

/**
 * Substitui todos os nós `<span data-pmoc-var="X"></span>` em um HTML pelo
 * valor real da variável (ou linha pontilhada quando vazio).
 *
 * IMPORTANTE: função **pura**, sem dependência de browser/DOM. Usa regex pra
 * que possa ser portada 1-pra-1 pra Deno na edge function de PDF.
 *
 * - Quando a chave é desconhecida (não está no catálogo), preserva o nó
 *   intacto. Isso protege contra HTML "morto" com keys de versões antigas.
 * - O wrapper `<span>` é REMOVIDO da saída (vira texto puro), pra que o PDF
 *   final não fique com spans desnecessários.
 */
export function substituteVariables(
  html: string,
  context: PmocVariableContext | undefined | null,
): string {
  if (!html) return '';
  // Captura: <span ... data-pmoc-var="KEY" ...>conteúdo opcional</span>
  // - Aceita atributos em qualquer ordem (data-pmoc-label vem junto).
  // - Conteúdo interno é descartado (sempre derivamos do contexto).
  const pattern = /<span\b[^>]*\bdata-pmoc-var\s*=\s*"([^"]+)"[^>]*>[\s\S]*?<\/span>/gi;
  return html.replace(pattern, (match, rawKey: string) => {
    if (!isPmocVariableKey(rawKey)) {
      // Chave desconhecida — preserva o HTML original pra não corromper texto.
      return match;
    }
    const value = getVariableValue(rawKey, context);
    if (!value) return EMPTY_VARIABLE_DASHED_LINE;
    return escapeHtmlMinimal(value);
  });
}

/**
 * Escape mínimo de HTML pra evitar quebra do markup ao substituir valor real.
 * Cópia local pra evitar dependência cruzada com `pmocDocumentTemplates`.
 */
function escapeHtmlMinimal(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
