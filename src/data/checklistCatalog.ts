/**
 * Catálogo de Checklists — modelos sugeridos de checklist por segmento da empresa.
 *
 * Estes são modelos curados, prontos para o gestor importar e ADEQUAR aos seus
 * próprios processos. Cada template vira um conjunto de perguntas adicionadas ao
 * checklist atual (form_questions), editáveis depois normalmente.
 *
 * Para o segmento de refrigeração/climatização, além destes templates, a tela
 * também oferece importar atividades direto do catálogo PMOC da norma
 * (ver usePmocActivityCatalog). Aqui ficam os templates de SERVIÇO curados.
 *
 * Como estender: adicione uma chave em CHECKLIST_CATALOG com o `value` do
 * segmento (ver src/utils/companySegments.ts) e uma lista de ChecklistTemplate.
 */

export type CatalogQuestionType =
  | 'boolean'
  | 'conformidade'
  | 'text'
  | 'number'
  | 'photo'
  | 'select'
  | 'signature';

export interface CatalogQuestion {
  question: string;
  question_type: CatalogQuestionType;
  description?: string;
  is_required?: boolean;
  options?: string[];
  unit?: string;
  expected_min?: number;
  expected_max?: number;
}

export interface ChecklistTemplate {
  id: string;
  nome: string;
  descricao: string;
  questions: CatalogQuestion[];
}

// ---------------------------------------------------------------------------
// Refrigeração e Climatização
// ---------------------------------------------------------------------------

const REFRIGERACAO_TEMPLATES: ChecklistTemplate[] = [
  {
    id: 'ref-instalacao-split',
    nome: 'Instalação de Split',
    descricao: 'Roteiro de instalação de ar-condicionado split (hi-wall) do recebimento à entrega.',
    questions: [
      { question: 'Equipamento conferido sem avarias na embalagem?', question_type: 'boolean', is_required: true, description: 'Fotografar qualquer avaria antes de abrir.' },
      { question: 'Modelo e capacidade (BTUs) conferem com o pedido?', question_type: 'boolean', is_required: true },
      { question: 'Foto do local antes da instalação', question_type: 'photo', is_required: true, description: 'Parede e ponto onde a evaporadora será fixada.' },
      { question: 'Suporte/coxim da condensadora nivelado e fixo?', question_type: 'boolean', is_required: true },
      { question: 'Comprimento da tubulação instalada', question_type: 'number', unit: 'm', description: 'Para conferir necessidade de carga complementar de gás.' },
      { question: 'Vácuo realizado na linha?', question_type: 'boolean', is_required: true, description: 'Mínimo recomendado conforme fabricante antes de liberar o gás.' },
      { question: 'Pressão de trabalho após liberar o gás', question_type: 'number', unit: 'psi' },
      { question: 'Dreno testado com escoamento correto (sem vazamento)?', question_type: 'boolean', is_required: true },
      { question: 'Teste de aquecimento e refrigeração ok?', question_type: 'boolean', is_required: true },
      { question: 'Temperatura de insuflamento medida', question_type: 'number', unit: '°C' },
      { question: 'Foto da instalação concluída (evaporadora e condensadora)', question_type: 'photo', is_required: true },
      { question: 'Cliente orientado sobre uso e limpeza dos filtros?', question_type: 'boolean', is_required: true },
      { question: 'Assinatura do cliente', question_type: 'signature', is_required: true },
    ],
  },
  {
    id: 'ref-higienizacao-split',
    nome: 'Higienização de Split',
    descricao: 'Limpeza completa de evaporadora e condensadora com produto específico.',
    questions: [
      { question: 'Foto do equipamento antes da limpeza', question_type: 'photo', is_required: true },
      { question: 'Filtros retirados e lavados?', question_type: 'boolean', is_required: true },
      { question: 'Serpentina da evaporadora higienizada?', question_type: 'boolean', is_required: true, description: 'Usar produto bactericida específico para ar-condicionado.' },
      { question: 'Bandeja e dreno limpos e desobstruídos?', question_type: 'boolean', is_required: true },
      { question: 'Turbina/hélice limpa?', question_type: 'boolean', is_required: true },
      { question: 'Condensadora higienizada (aletas e gabinete)?', question_type: 'boolean', is_required: true },
      { question: 'Aspecto da água/resíduo retirado', question_type: 'select', options: ['Pouca sujeira', 'Sujeira moderada', 'Muita sujeira / mofo'], description: 'Indicador de quanto tempo sem manutenção.' },
      { question: 'Foto do equipamento após a limpeza', question_type: 'photo', is_required: true },
      { question: 'Teste de funcionamento ok após limpeza?', question_type: 'boolean', is_required: true },
      { question: 'Observações', question_type: 'text' },
      { question: 'Assinatura do cliente', question_type: 'signature', is_required: true },
    ],
  },
  {
    id: 'ref-preventiva-split',
    nome: 'Manutenção Preventiva de Split',
    descricao: 'Inspeção preventiva periódica de ar-condicionado split.',
    questions: [
      { question: 'Filtros limpos / em bom estado?', question_type: 'boolean', is_required: true },
      { question: 'Serpentinas (evap/cond) sem sujeira excessiva?', question_type: 'boolean', is_required: true },
      { question: 'Dreno desobstruído e escoando?', question_type: 'boolean', is_required: true },
      { question: 'Fixações e suportes firmes?', question_type: 'boolean', is_required: true },
      { question: 'Conexões elétricas reapertadas e sem aquecimento?', question_type: 'boolean', is_required: true, description: 'Verificar bornes e contatos.' },
      { question: 'Corrente do compressor medida', question_type: 'number', unit: 'A', description: 'Comparar com a corrente nominal de placa.' },
      { question: 'Pressão de baixa', question_type: 'number', unit: 'psi' },
      { question: 'Pressão de alta', question_type: 'number', unit: 'psi' },
      { question: 'Temperatura de insuflamento', question_type: 'number', unit: '°C' },
      { question: 'Ruído / vibração anormal?', question_type: 'select', options: ['Normal', 'Leve', 'Anormal — requer atenção'] },
      { question: 'Foto do equipamento', question_type: 'photo' },
      { question: 'Recomendações ao cliente', question_type: 'text' },
      { question: 'Assinatura do cliente', question_type: 'signature', is_required: true },
    ],
  },
  {
    id: 'ref-carga-gas',
    nome: 'Carga de Gás',
    descricao: 'Procedimento de detecção de vazamento e recarga de fluido refrigerante.',
    questions: [
      { question: 'Tipo de fluido refrigerante', question_type: 'select', is_required: true, options: ['R-22', 'R-410A', 'R-32', 'R-134a', 'R-404A', 'R-407C', 'Outro'] },
      { question: 'Teste de vazamento realizado?', question_type: 'boolean', is_required: true, description: 'Detector eletrônico ou espuma nas conexões.' },
      { question: 'Vazamento localizado?', question_type: 'select', options: ['Sem vazamento', 'Conexões', 'Serpentina', 'Tubulação', 'Outro'] },
      { question: 'Vazamento corrigido antes da carga?', question_type: 'boolean', description: 'Não recarregar sobre vazamento sem reparo.' },
      { question: 'Vácuo realizado antes da carga?', question_type: 'boolean', is_required: true },
      { question: 'Quantidade de gás adicionada', question_type: 'number', unit: 'g' },
      { question: 'Pressão de baixa após a carga', question_type: 'number', unit: 'psi' },
      { question: 'Pressão de alta após a carga', question_type: 'number', unit: 'psi' },
      { question: 'Superaquecimento dentro do esperado?', question_type: 'boolean' },
      { question: 'Foto do manifold com as pressões', question_type: 'photo' },
      { question: 'Equipamento funcionando normalmente?', question_type: 'boolean', is_required: true },
      { question: 'Observações', question_type: 'text' },
      { question: 'Assinatura do cliente', question_type: 'signature', is_required: true },
    ],
  },
];

// ---------------------------------------------------------------------------
// Genérico (fallback para segmentos ainda não curados)
// ---------------------------------------------------------------------------

const GENERICO_TEMPLATES: ChecklistTemplate[] = [
  {
    id: 'gen-visita-tecnica',
    nome: 'Visita Técnica',
    descricao: 'Modelo genérico de registro de visita técnica e atendimento.',
    questions: [
      { question: 'Foto do local / equipamento na chegada', question_type: 'photo', is_required: true },
      { question: 'Descrição do problema relatado pelo cliente', question_type: 'text', is_required: true },
      { question: 'Serviço pôde ser concluído nesta visita?', question_type: 'boolean', is_required: true },
      { question: 'Materiais utilizados', question_type: 'text' },
      { question: 'Foto do serviço concluído', question_type: 'photo' },
      { question: 'Observações / pendências', question_type: 'text' },
      { question: 'Assinatura do cliente', question_type: 'signature', is_required: true },
    ],
  },
];

/** Catálogo por segmento (chave = value do segmento em companySegments.ts). */
export const CHECKLIST_CATALOG: Record<string, ChecklistTemplate[]> = {
  refrigeracao: REFRIGERACAO_TEMPLATES,
};

/** Templates curados para o segmento informado, com fallback genérico. */
export function getCatalogForSegment(segment: string | null | undefined): ChecklistTemplate[] {
  if (segment && CHECKLIST_CATALOG[segment]) return CHECKLIST_CATALOG[segment];
  return GENERICO_TEMPLATES;
}

/** Indica se o segmento tem integração com o catálogo PMOC da norma. */
export function segmentHasPmocCatalog(segment: string | null | undefined): boolean {
  return segment === 'refrigeracao';
}
