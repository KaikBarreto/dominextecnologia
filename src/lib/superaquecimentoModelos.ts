/**
 * Modelos/fabricantes de equipamentos para as subabas de Superaquecimento (SH)
 * e Subresfriamento (SC).
 *
 * O cálculo MEDIDO continua sendo física pura (ver `refrigerantes.ts`):
 *   SH = T_sucção − T_sat(dew);  SC = T_sat(bubble) − T_líquido.
 *
 * O modelo NÃO altera essa medida. Um alvo ou refrigerante automático só
 * pode ser aplicado quando houver manual oficial rastreável para aquele perfil.
 * A ausência de fonte não significa que o fabricante não publica um alvo:
 * significa que este catálogo ainda não o confirmou.
 *
 * Revisão de rastreabilidade: 15/11/2026, Codex (auditoria técnica do catálogo).
 * Os dados históricos sem fonte são preservados privadamente para pesquisa,
 * mas não alimentam recomendações, notas de campo ou seleção automática de gás.
 */

/** Faixa-alvo [min, max] em °C, ou null quando o fabricante não publica. */
export type Faixa = [min: number, max: number] | null;

/** Confiança da fonte do alvo, pra calibrar o quão firme é a recomendação. */
export type ConfiancaModelo = 'alta' | 'media' | 'baixa' | 'generico';

export interface ModeloSuperaquecimento {
  id: string;
  label: string;
  /** Faixa-alvo de superaquecimento (°C), ou null = sem alvo publicado. */
  alvoSH: Faixa;
  /** Faixa-alvo de subresfriamento (°C), ou null = sem alvo publicado. */
  alvoSC: Faixa;
  /** Nota de campo (PT-BR) exibida ao escolher o modelo. */
  nota: string;
  /** Confiança da fonte do alvo. */
  confianca: ConfiancaModelo;
  /** Seção de agrupamento no select (null/undefined = sem cabeçalho, fica no topo). */
  grupo?: string;
  /** Fluido refrigerante do modelo exato, confirmado no manual oficial. */
  refrigPadrao?: string;
  /**
   * Manual oficial que fundamenta alvo/nota/refrigerante deste perfil exato.
   * Só preencher após conferência técnica do documento e do modelo; uma página
   * genérica da marca ou um link de busca não confirma estes dados.
   */
  fonteUrl?: string;
}

/** Opção padrão (default) — usada quando a marca não está na lista. */
export const MODELO_PADRAO_ID = 'padrao';

/**
 * Catálogo legado preservado para rastrear IDs e revisar os documentos.
 * LEGACY_UNVERIFIED: números, notas e gases sem fonte não são dados aprovados
 * para exibição. Consultar apenas o catálogo público normalizado ou o getter.
 */
const MODELOS_LEGADOS_SUPERAQUECIMENTO: ModeloSuperaquecimento[] = [
  {
    id: MODELO_PADRAO_ID,
    label: 'Padrão — Usar esta caso desconheça o modelo',
    alvoSH: [4, 8],
    alvoSC: null,
    nota: 'Valor genérico de referência. Não substitui o alvo do manual do fabricante.',
    confianca: 'generico',
  },
  {
    id: 'split-11d',
    label: 'Split Hi-Wall Midea, Springer, Carrier, Gree, Admiral, Brastemp',
    alvoSH: [5, 7],
    alvoSC: null,
    nota: 'On/off: 5–7 °C. Em modelos inverter o superaquecimento é controlado por EEV — valide por peso, não pelo manifold.',
    confianca: 'alta',
    grupo: 'SPLIT HI-WALL',
    refrigPadrao: 'R-32',
  },
  {
    id: 'samsung',
    label: 'Samsung (Split / WindFree / Inverter)',
    alvoSH: null,
    alvoSC: null,
    nota: 'A Samsung não publica superaquecimento alvo para splits residenciais (EEV). Carregue por peso: ~7,5 m sem adicional, +15 g/m (até 18.000 BTU) ou +30 g/m (24–48.000), R-32. Em VRF DVM, alvo ~5 K.',
    confianca: 'generico',
    grupo: 'SPLIT HI-WALL',
    refrigPadrao: 'R-32',
  },
  {
    id: 'comfee',
    label: 'Split Hi-Wall Comfee',
    alvoSH: [5, 7],
    alvoSC: null,
    nota: 'On/off (plataforma Midea), ARI 210. Em inverter, valide a carga por peso.',
    confianca: 'alta',
    grupo: 'SPLIT HI-WALL',
    refrigPadrao: 'R-32',
  },
  {
    id: 'philco-elgin',
    label: 'Split HiWall Philco, Elgin',
    alvoSH: [6, 11],
    alvoSC: null,
    nota: 'Philco inverter: ideal 6–11 °C (aceitável 4–14). A Elgin não publica alvo de SA — valide por peso.',
    confianca: 'alta',
    grupo: 'SPLIT HI-WALL',
    refrigPadrao: 'R-32',
  },
  {
    id: 'hitachi-hiwall',
    label: 'Piso-Teto Hi-Wall Hitachi',
    alvoSH: null,
    alvoSC: null,
    nota: 'A Hitachi não publica superaquecimento alvo para hi-wall/piso-teto residencial (EEV/capilar). Usando referência genérica; em inverter, valide por peso.',
    confianca: 'generico',
    grupo: 'PISO-TETO',
    refrigPadrao: 'R-32',
  },
  {
    id: 'york-hiwall',
    label: 'Piso-Teto Hi-Wall York',
    alvoSH: null,
    alvoSC: [5, 6],
    nota: 'A York não publica alvo de SA para a linha BR. Em sistemas com válvula termostática, a York carrega por subresfriamento (~5,6 °C).',
    confianca: 'baixa',
    grupo: 'PISO-TETO',
    refrigPadrao: 'R-410A',
  },
  {
    id: 'rheem-k7-hiwall',
    label: 'Piso-Teto K7 Hi-Wall Rheem',
    alvoSH: [5, 7],
    alvoSC: null,
    nota: 'Rheem (capilar, R-22): ideal 5–7 °C, aceitável 4–9 °C. Fonte secundária — confira o manual.',
    confianca: 'media',
    grupo: 'PISO-TETO',
    refrigPadrao: 'R-22',
  },
  {
    id: 'carrier-springer-pt-k7',
    label: 'Piso-Teto e K7 Carrier, Springer',
    alvoSH: [5, 7],
    alvoSC: null,
    nota: 'Sistemas on/off (capilar/pistão), condição ARI 210. Em modelos inverter, valide a carga por peso.',
    confianca: 'alta',
    grupo: 'PISO-TETO',
    refrigPadrao: 'R-410A',
  },
  {
    id: 'hitachi-serie-e',
    label: 'Hitachi Série E RVT/RTC/RUV/RUT',
    alvoSH: [4, 12],
    alvoSC: [4, 12],
    nota: 'Splitão Série E (válvula termostática, R-410A). Confira o manual de serviço oficial.',
    confianca: 'alta',
    grupo: 'SPLITÃO / VRF',
    refrigPadrao: 'R-410A',
  },
  {
    id: 'carrier-ecosplit',
    label: 'Set Free 40MX, 40RT, 40VX, 38ES, 38EV, 38EX Carrier',
    alvoSH: [3, 7],
    alvoSC: [8, 11],
    nota: 'Carrier Ecosplit (válvula termostática, R-410A): SA 3–7 °C (fixa 5–7), SC 8–11 °C. Ajuste o subresfriamento antes do superaquecimento.',
    confianca: 'alta',
    grupo: 'SPLITÃO / VRF',
    refrigPadrao: 'R-410A',
  },
];

/**
 * Fronteira entre dados legados e recomendações utilizáveis pela interface.
 * O padrão mantém sua referência explicitamente genérica; os demais perfis
 * sem manual não expõem alvos, afirmações por marca nem gás automático.
 */
function resolverModeloDocumentado(modelo: ModeloSuperaquecimento): ModeloSuperaquecimento {
  if (modelo.id === MODELO_PADRAO_ID) return { ...modelo, confianca: 'generico', fonteUrl: undefined, refrigPadrao: undefined };
  if (modelo.fonteUrl?.startsWith('https://')) return { ...modelo };
  return {
    id: modelo.id,
    label: modelo.label,
    grupo: modelo.grupo,
    alvoSH: null,
    alvoSC: null,
    nota: 'Ainda não há um alvo confirmado neste catálogo para este perfil. Use o manual do modelo exato; a referência exibida é genérica.',
    confianca: 'generico',
  };
}

/** Catálogo público: mantém IDs/labels antigos com recomendações documentadas. */
export const MODELOS_SUPERAQUECIMENTO: ModeloSuperaquecimento[] = MODELOS_LEGADOS_SUPERAQUECIMENTO.map(resolverModeloDocumentado);

/** Acha o perfil utilizável pela UI, sem divulgar recomendações legadas sem fonte. */
export function getModeloSuperaquecimento(id: string): ModeloSuperaquecimento | undefined {
  const modelo = MODELOS_LEGADOS_SUPERAQUECIMENTO.find((m) => m.id === id);
  return modelo ? resolverModeloDocumentado(modelo) : undefined;
}
