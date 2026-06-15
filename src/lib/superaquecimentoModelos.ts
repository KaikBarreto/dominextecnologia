/**
 * Modelos/fabricantes de equipamentos para as subabas de Superaquecimento (SH)
 * e Subresfriamento (SC).
 *
 * O cálculo MEDIDO continua sendo física pura (ver `refrigerantes.ts`):
 *   SH = T_sucção − T_sat(dew);  SC = T_sat(bubble) − T_líquido.
 *
 * O modelo NÃO altera essa medida — ele define a FAIXA-ALVO (usada no selo
 * Ideal/Baixo/Alto) e uma NOTA de campo baseada no manual do fabricante.
 * Quando `alvoSH`/`alvoSC` é null, a UI cai numa faixa genérica de referência
 * e sinaliza que o fabricante não publica o alvo.
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
}

/** Opção padrão (default) — usada quando a marca não está na lista. */
export const MODELO_PADRAO_ID = 'padrao';

/** Catálogo de modelos/fabricantes (ordem de exibição: padrão primeiro, depois por popularidade). */
export const MODELOS_SUPERAQUECIMENTO: ModeloSuperaquecimento[] = [
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
  },
  {
    id: 'samsung',
    label: 'Samsung (Split / WindFree / Inverter)',
    alvoSH: null,
    alvoSC: null,
    nota: 'A Samsung não publica superaquecimento alvo para splits residenciais (EEV). Carregue por peso: ~7,5 m sem adicional, +15 g/m (até 18.000 BTU) ou +30 g/m (24–48.000), R-32. Em VRF DVM, alvo ~5 K.',
    confianca: 'generico',
    grupo: 'SPLIT HI-WALL',
  },
  {
    id: 'comfee',
    label: 'Split Hi-Wall Comfee',
    alvoSH: [5, 7],
    alvoSC: null,
    nota: 'On/off (plataforma Midea), ARI 210. Em inverter, valide a carga por peso.',
    confianca: 'alta',
    grupo: 'SPLIT HI-WALL',
  },
  {
    id: 'philco-elgin',
    label: 'Split HiWall Philco, Elgin',
    alvoSH: [6, 11],
    alvoSC: null,
    nota: 'Philco inverter: ideal 6–11 °C (aceitável 4–14). A Elgin não publica alvo de SA — valide por peso.',
    confianca: 'alta',
    grupo: 'SPLIT HI-WALL',
  },
  {
    id: 'hitachi-hiwall',
    label: 'Piso-Teto Hi-Wall Hitachi',
    alvoSH: null,
    alvoSC: null,
    nota: 'A Hitachi não publica superaquecimento alvo para hi-wall/piso-teto residencial (EEV/capilar). Usando referência genérica; em inverter, valide por peso.',
    confianca: 'generico',
    grupo: 'PISO-TETO',
  },
  {
    id: 'york-hiwall',
    label: 'Piso-Teto Hi-Wall York',
    alvoSH: null,
    alvoSC: [5, 6],
    nota: 'A York não publica alvo de SA para a linha BR. Em sistemas com válvula termostática, a York carrega por subresfriamento (~5,6 °C).',
    confianca: 'baixa',
    grupo: 'PISO-TETO',
  },
  {
    id: 'rheem-k7-hiwall',
    label: 'Piso-Teto K7 Hi-Wall Rheem',
    alvoSH: [5, 7],
    alvoSC: null,
    nota: 'Rheem (capilar, R-22): ideal 5–7 °C, aceitável 4–9 °C. Fonte secundária — confira o manual.',
    confianca: 'media',
    grupo: 'PISO-TETO',
  },
  {
    id: 'carrier-springer-pt-k7',
    label: 'Piso-Teto e K7 Carrier, Springer',
    alvoSH: [5, 7],
    alvoSC: null,
    nota: 'Sistemas on/off (capilar/pistão), condição ARI 210. Em modelos inverter, valide a carga por peso.',
    confianca: 'alta',
    grupo: 'PISO-TETO',
  },
  {
    id: 'hitachi-serie-e',
    label: 'Hitachi Série E RVT/RTC/RUV/RUT',
    alvoSH: [4, 12],
    alvoSC: [4, 12],
    nota: 'Splitão Série E (válvula termostática, R-410A). Confira o manual de serviço oficial.',
    confianca: 'alta',
    grupo: 'SPLITÃO / VRF',
  },
  {
    id: 'carrier-ecosplit',
    label: 'Set Free 40MX, 40RT, 40VX, 38ES, 38EV, 38EX Carrier',
    alvoSH: [3, 7],
    alvoSC: [8, 11],
    nota: 'Carrier Ecosplit (válvula termostática, R-410A): SA 3–7 °C (fixa 5–7), SC 8–11 °C. Ajuste o subresfriamento antes do superaquecimento.',
    confianca: 'alta',
    grupo: 'SPLITÃO / VRF',
  },
];

/** Acha um modelo pelo id. */
export function getModeloSuperaquecimento(id: string): ModeloSuperaquecimento | undefined {
  return MODELOS_SUPERAQUECIMENTO.find((m) => m.id === id);
}
