// =============================================================================
// pmoc-templates/variables.ts — Substituição server-side das variáveis PMOC.
// =============================================================================
// PORTE DENO 1:1 de src/utils/pmocVariables.ts (Onda H — v1.9.x).
//
// Mantenha esse arquivo em sincronia manual com `src/utils/pmocVariables.ts`.
// Não há import compartilhado porque o frontend roda no browser e a edge function
// roda em Deno — paths diferentes, sem build cross-runtime. Catálogo travado
// pelo CEO em 17 variáveis.
//
// O HTML salvo em `pmoc_contract_documents_custom.termo_rt_content` e
// `.certificado_content` preserva os nós como `<span data-pmoc-var="X"></span>`.
// A substituição acontece AQUI no Deno (gerando o PDF) e no NodeView do TipTap
// (mostrando valor pro gestor enquanto edita).
//
// IMPORTANTE: `substituteVariables` deve ser chamado **ANTES** do
// `sanitizeHtml` em `termo-rt.ts` / `certificado.ts`, porque o sanitizer
// strippa o atributo `data-pmoc-var` (não está na whitelist de atributos de
// `<span>`). Se rodar na ordem inversa, o span chega "limpo" ao
// `substituteVariables` e nenhum match acontece — o PDF sai com `_____` em
// tudo (ou pior: com tags vazias).
// =============================================================================

/** Categorias do dropdown "Inserir variável" no editor rich-text. */
export type PmocVariableCategory =
  | "empresa"
  | "rt"
  | "cliente"
  | "contrato"
  | "data";

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
  "empresa.nome": {
    label: "Nome da Empresa",
    source: "companies.name",
    category: "empresa",
  },
  "empresa.razao_social": {
    label: "Razão Social",
    source: "company_settings.razao_social || companies.name",
    category: "empresa",
  },
  "empresa.cnpj": {
    label: "CNPJ",
    source: "company_settings.document",
    category: "empresa",
  },
  "empresa.endereco": {
    label: "Endereço da Empresa",
    source: "company_settings.address",
    category: "empresa",
  },
  "empresa.cidade": {
    label: "Cidade da Empresa",
    source: "company_settings.city",
    category: "empresa",
  },
  "empresa.estado": {
    label: "Estado da Empresa",
    source: "company_settings.state",
    category: "empresa",
  },
  "empresa.telefone": {
    label: "Telefone Público",
    source: "company_settings.phone",
    category: "empresa",
  },
  "empresa.email": {
    label: "Email da Empresa",
    source: "company_settings.email",
    category: "empresa",
  },

  // ───── Responsável Técnico ─────
  "rt.nome": {
    label: "Nome do RT",
    source: "responsible_technicians.full_name",
    category: "rt",
  },
  "rt.modalidade": {
    label: "Modalidade do RT",
    source: "responsible_technicians.modality",
    category: "rt",
  },
  "rt.cft_crea": {
    label: "CFT/CREA do RT",
    source: "responsible_technicians.cft_crea",
    category: "rt",
  },
  "rt.registro": {
    label: "Registro Profissional",
    source: "responsible_technicians.registry_number",
    category: "rt",
  },

  // ───── Cliente (unidade) ─────
  "cliente.nome": {
    label: "Nome do Cliente",
    source: "customers.name",
    category: "cliente",
  },
  "cliente.endereco": {
    label: "Endereço do Cliente",
    source: "customers.address",
    category: "cliente",
  },
  "cliente.cidade": {
    label: "Cidade do Cliente",
    source: "customers.city || extracted from address",
    category: "cliente",
  },

  // ───── Contrato ─────
  "contrato.nome": {
    label: "Nome do Contrato",
    source: "contracts.name",
    category: "contrato",
  },
  "contrato.vigencia_inicio": {
    label: "Vigência Início",
    source: "contracts.start_date (formato extenso)",
    category: "contrato",
  },
  "contrato.frequencia": {
    label: "Frequência",
    source: "getFrequencyLabel(frequency_type, frequency_value)",
    category: "contrato",
  },

  // ───── Data ─────
  "data.hoje_extenso": {
    label: "Data Atual (extenso)",
    source: 'now() formatado "23 de maio de 2026"',
    category: "data",
  },
} as const satisfies Record<string, PmocVariableMeta>;

/** Chave válida (`'empresa.cnpj' | 'rt.nome' | ...`). */
export type PmocVariableKey = keyof typeof PMOC_VARIABLES;

/** Type guard pra checar se uma string é uma chave válida do catálogo. */
export function isPmocVariableKey(value: string): value is PmocVariableKey {
  return Object.prototype.hasOwnProperty.call(PMOC_VARIABLES, value);
}

/**
 * Contexto runtime com os valores reais das variáveis. Montado nas edge
 * functions a partir do banco. Pode ter campos undefined — `getVariableValue`
 * trata vazio.
 */
export type PmocVariableContext = Partial<Record<PmocVariableKey, string>>;

/**
 * Busca o valor real de uma variável no contexto. Retorna `''` quando vazio.
 */
export function getVariableValue(
  key: PmocVariableKey,
  context: PmocVariableContext | undefined | null,
): string {
  if (!context) return "";
  const raw = context[key];
  if (typeof raw !== "string") return "";
  return raw.trim();
}

/** Linha pontilhada usada quando uma variável fica vazia ao gerar o PDF. */
export const EMPTY_VARIABLE_DASHED_LINE = "____________________";

/**
 * Substitui todos os nós `<span data-pmoc-var="X"></span>` em um HTML pelo
 * valor real da variável (ou linha pontilhada quando vazio).
 *
 * Função PURA — sem dependência de browser/DOM. Usa regex (porte 1:1 do
 * frontend pra coerência de comportamento).
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
  if (!html) return "";
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
 */
function escapeHtmlMinimal(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
