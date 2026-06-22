/**
 * Normaliza o LABEL de uma seção de checklist PMOC para EXIBIÇÃO (relatório +
 * execução). O dado bruto (`item.section`) vem como SLUG do catálogo
 * (`'medicoes'`, `'condicionadores'`, `'testes'`…) — sem acento e em caixa baixa.
 * Mostrar o slug cru estampa "MEDICOES" em vez de "Medições".
 *
 * Esta função NÃO altera o dado/catálogo (domínio do PMOC/contratos): só traduz
 * o slug conhecido para o rótulo PT-BR acentuado na hora de renderizar. Slug
 * desconhecido cai no fallback (capitaliza, troca `_`/`-` por espaço).
 *
 * Mantém em sincronia com as seções de `pmocMachineRoutine.ts`
 * (LOCAL_SCOPE_SECTIONS + AC_EQUIPMENT_SECTIONS + PMOC_CUSTOM_SECTION).
 */
const SECTION_LABELS: Record<string, string> = {
  // Ar-condicionado (por equipamento)
  condicionadores: 'Condicionadores',
  medicoes: 'Medições',
  testes: 'Testes',
  // Local (norma de grande porte — não se repete por aparelho)
  casa_maquinas: 'Casa de Máquinas',
  dutos: 'Dutos',
  tomada_ar_exterior: 'Tomada de Ar Exterior',
  torres_resfriamento: 'Torres de Resfriamento',
  bombas_agua: 'Bombas de Água',
  caixa_expansao: 'Caixa de Expansão',
  tratamento_quimico: 'Tratamento Químico',
  quadros_eletricos: 'Quadros Elétricos',
  qualidade_ar: 'Qualidade do Ar',
  // Checklist personalizado por máquina
  personalizados: 'Personalizados',
};

/** Capitaliza a 1ª letra de cada palavra (fallback de slug desconhecido). */
function titleCase(raw: string): string {
  return raw
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/**
 * Rótulo PT-BR de uma seção. `null`/vazio → string vazia (quem chama decide o
 * fallback genérico, ex.: "Itens"). Slug conhecido → label acentuado; senão
 * título a partir do valor cru.
 */
export function sectionLabel(section: string | null | undefined): string {
  if (!section) return '';
  const key = section.trim().toLowerCase();
  return SECTION_LABELS[key] ?? titleCase(section);
}
