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
  | 'data';

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
} as const satisfies Record<string, PmocVariableMeta>;

/** Chave válida (`'empresa.cnpj' | 'rt.nome' | ...`). */
export type PmocVariableKey = keyof typeof PMOC_VARIABLES;

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
