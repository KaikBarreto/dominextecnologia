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

/** Faixa-alvo [min, max] em °C, ou null sem alvo confirmado aplicável ao perfil. */
export type Faixa = [min: number, max: number] | null;

/** Confiança da fonte do alvo, pra calibrar o quão firme é a recomendação. */
export type ConfiancaModelo = 'alta' | 'media' | 'baixa' | 'generico';

export interface ModeloSuperaquecimento {
  id: string;
  label: string;
  /** Faixa-alvo de superaquecimento (°C), ou null = sem alvo confirmado. */
  alvoSH: Faixa;
  /** Faixa-alvo de subresfriamento (°C), ou null = sem alvo confirmado. */
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
  /** Documento e revisão aplicáveis, não a página genérica da marca. */
  fonteDocumento?: string;
  /** Páginas PDF, contando a capa como página 1. */
  fontePaginas?: number[];
  /** Data da conferência documental; ISO YYYY-MM-DD. */
  revisadoEm?: string;
  /** Família/códigos que constam no documento, sem inferência por marca. */
  modelosAbrangidos?: string[];
  /** Condições de operação necessárias para comparar a faixa numérica. */
  condicoes?: string;
  /** O procedimento publicado pode ser por massa ou pela placa, sem alvo SH/SC. */
  metodoCarga?: 'sh-sc' | 'peso' | 'placa';
  /** Documento original do fabricante hospedado por distribuidor, quando aplicável. */
  copiaDistribuidor?: boolean;
  fonteSuporteUrl?: string;
  /** Faixa adicional publicada como aceitável, distinta da faixa preferencial. */
  faixaAceitavelSH?: Faixa;
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

/** Perfis documentais: não herdam alvos ou refrigerantes dos grupos históricos. */
const MODELOS_DOCUMENTADOS_SUPERAQUECIMENTO: ModeloSuperaquecimento[] = [
  {
    id: 'daikin-ecoswing-gold-s-r32',
    label: 'Daikin EcoSwing Smart Gold FTKP/FTHP09–24S5VL R-32',
    grupo: 'SPLIT HI-WALL',
    alvoSH: null,
    alvoSC: null,
    refrigPadrao: 'R-32',
    metodoCarga: 'peso',
    confianca: 'alta',
    nota: 'O manual de instalação R-32 determina o adicional por massa e comprimento; não publica alvo numérico SH/SC. As classes 09/12, 18 e 24 têm condições diferentes.',
    condicoes: 'Manual 3P611134-1D vinculado pela biblioteca Daikin à linha EcoSwing Smart Gold R-32. Os manuais oficiais de operação confirmam os códigos FTKP/FTHP S5VL. Respeitar o ciclo e a combinação da placa.',
    fonteUrl: 'https://www.daikin.com.br/profissionais/download/force_download/1218',
    fonteDocumento: 'Daikin 3P611134-1D — Manual de instalação R-32, M20P002B',
    fontePaginas: [1, 2],
    revisadoEm: '2026-11-15',
    modelosAbrangidos: ['FTKP09S5VL', 'FTKP12S5VL', 'FTKP18S5VL', 'FTKP24S5VL', 'FTHP09S5VL', 'FTHP12S5VL', 'FTHP18S5VL', 'FTHP24S5VL'],
    fonteSuporteUrl: 'https://www.daikin.com.br/static/uploads/conteudos/downloads/231009034205000000.pdf',
  },
  {
    id: 'hitachi-airhome600-2023',
    label: 'Hitachi airHome 600 SPK09/12/18/24C3IVF/Q (2023)',
    grupo: 'SPLIT HI-WALL',
    alvoSH: null,
    alvoSC: null,
    refrigPadrao: 'R-32',
    metodoCarga: 'peso',
    confianca: 'alta',
    nota: 'A seção Carga de Refrigerante determina a massa de fábrica e o adicional pelo comprimento da linha para cada modelo. Não substituir pela referência genérica de SH/SC.',
    condicoes: 'Conjuntos SPK C3IVF/C3IVQ e pares RPK/RAA correspondentes da capa; observar a carga máxima específica e a revisão Out/2023. Documento original Hitachi em distribuidor.',
    fonteUrl: 'https://www.leverosintegra.com.br/download/manuais/hitachi/Manual-de-instalacao-operacao-HW-AirHome%20600.pdf',
    fonteDocumento: 'Hitachi HIOM-MSPAR001 — Out/2023 Rev.01',
    fontePaginas: [1, 22, 35, 74],
    revisadoEm: '2026-11-15',
    modelosAbrangidos: ['SPK09C3IVF', 'SPK12C3IVF', 'SPK18C3IVF', 'SPK24C3IVF', 'SPK09C3IVQ', 'SPK12C3IVQ', 'SPK18C3IVQ', 'SPK24C3IVQ'],
    copiaDistribuidor: true,
    fonteSuporteUrl: 'https://documentation.hitachiaircon.com/',
  },
  {
    id: 'elgin-eco-hv-b2-2019',
    label: 'Elgin Eco HVFI/HVQI B2IA e 24B2IB (Rev.04)',
    grupo: 'SPLIT HI-WALL',
    alvoSH: null,
    alvoSC: null,
    refrigPadrao: 'R-410A',
    metodoCarga: 'peso',
    confianca: 'alta',
    nota: 'A seção de complemento de refrigerante determina massa pela placa e pelo comprimento da tubulação. Os adicionais variam por capacidade; o procedimento não publica faixa-alvo SH/SC.',
    condicoes: 'Combinações HVFI/HVQI com HVFE/HVQE listadas na página 29 desta revisão, R-410A. Não aplicar à linha Eco II/Eco III R-32 nem assumir o mesmo adicional entre capacidades.',
    fonteUrl: 'https://suporteelgin.wordpress.com/wp-content/uploads/2019/12/manual-instalac3a7c3a3o_eco-inverter_v2.pdf',
    fonteDocumento: 'Elgin HVFC/HVQC — 4280.00 Rev.04 (04/19)',
    fontePaginas: [1, 21, 29, 36],
    revisadoEm: '2026-11-15',
    modelosAbrangidos: ['HVFI09B2IA + HVFE09B2IA', 'HVQI09B2IA + HVQE09B2IA', 'HVFI12B2IA + HVFE12B2IA', 'HVQI12B2IA + HVQE12B2IA', 'HVFI18B2IA + HVFE18B2IA', 'HVQI18B2IA + HVQE18B2IA', 'HVFI24B2IB + HVFE24B2NB', 'HVQI24B2IB + HVQE24B2NB', 'HVFI30B2IA + HVFE30B2IA', 'HVQI30B2IA + HVQE30B2IA'],
  },
  {
    id: 'daikin-ftkp-q-09-18',
    label: 'Daikin FTKP-Q 09/12/18 R-32 (3P611134-1A)',
    grupo: 'SPLIT HI-WALL',
    alvoSH: null,
    alvoSC: null,
    refrigPadrao: 'R-32',
    metodoCarga: 'peso',
    confianca: 'alta',
    nota: 'O manual dimensiona o refrigerante adicional por massa e comprimento, sem alvo numérico SH/SC. As classes 09/12 e 18 têm condições diferentes; não estender este perfil às séries S, FTHP ou à classe 24.',
    condicoes: 'Série FTKP-Q, classes 09/12/18, conforme extrato EDBR042103-PT. Confirmar a combinação e a placa da unidade externa. Cópia do documento original Daikin hospedada por distribuidor.',
    fonteUrl: 'https://cdn2.centralar.com.br/centralar/mds/manuais/daikin/inverter/Manual%20de%20Instala%C3%A7%C3%A3o%20FTKP_Q%20-%20Frio.pdf',
    fonteDocumento: 'Daikin 3P611134-1A — Série FTKP-Q, EDBR042103-PT',
    fontePaginas: [1, 3, 9],
    revisadoEm: '2026-11-15',
    modelosAbrangidos: ['FTKP09Q5VL', 'FTKP12Q5VL', 'FTKP18Q5VL'],
    copiaDistribuidor: true,
    fonteSuporteUrl: 'https://www.daikin.com.br/static/uploads/conteudos/downloads/231009034205000000.pdf',
  },
  {
    id: 'samsung-dxea-dxfa-dyfa-dyfz-2024',
    label: 'Samsung AR**DXEA / DXFA / DYFA / DYFZ (DB68-13010A-00)',
    grupo: 'SPLIT HI-WALL',
    alvoSH: null,
    alvoSC: null,
    refrigPadrao: 'R-32',
    metodoCarga: 'peso',
    confianca: 'alta',
    nota: 'O procedimento usa balança, sem alvo numérico SH/SC. Consulte a revisão específica do modelo e a Samsung para confirmar o adicional de refrigerante; este perfil não calcula a massa adicional.',
    condicoes: 'Famílias AR**DXEA****, AR**DXFA****, AR**DYFA**** e AR**DYFZ**** listadas na capa. Cópia original Samsung em distribuidor; a divergência da etapa 4-4 impede publicar uma fórmula automática de carga adicional.',
    fonteUrl: 'https://castaticstorage.blob.core.windows.net/centralar/mds/manuais/samsung/inverter/3866/manual%20%2B%20termo%20de%20garantia/manual%20%2B%20termo%20de%20garantia.pdf',
    fonteDocumento: 'Samsung Manual de instalação DB68-13010A-00',
    fontePaginas: [1, 2],
    revisadoEm: '2026-11-15',
    modelosAbrangidos: ['AR**DXEA****', 'AR**DXFA****', 'AR**DYFA****', 'AR**DYFZ****'],
    copiaDistribuidor: true,
    fonteSuporteUrl: 'https://www.samsung.com/br/support/model/AR09DYFAAWKNAZ/',
  },
  {
    id: 'carrier-space-42xqm-18-24-r22-2015',
    label: 'Carrier Space 42XQM18/24 + 38KCD/38KQD R-22 (2015)',
    grupo: 'PISO-TETO',
    alvoSH: [5, 10],
    alvoSC: null,
    refrigPadrao: 'R-22',
    metodoCarga: 'sh-sc',
    confianca: 'alta',
    nota: 'SH de 5–10 °C somente nas condições ARI 210 citadas no manual. Medir após estabilização, a 150 mm da condensadora, com sensor isolado. Fora dessas condições, consultar o procedimento do modelo.',
    condicoes: 'TBS externa 35 °C, TBS interna 26,7 °C, TBU externa 23,9 °C e TBU interna 19,4 °C. Perfil restrito às quatro combinações R-22 da página 66; outras combinações e gases exigem outro perfil.',
    fonteUrl: 'https://cdn.carrierdobrasil.com.br/downloads_docs/b95fa-IOM-Space_42XQM_256.08.731-D-01-15--view-.pdf',
    fonteDocumento: 'Carrier Space — IOM 256.08.731-D-01/15',
    fontePaginas: [40, 66],
    revisadoEm: '2026-11-15',
    modelosAbrangidos: ['42XQM18C5 + 38KCD018515MC', '42XQM18C5 + 38KQD018515MC', '42XQM24C5 + 38KCD024515MC', '42XQM24C5 + 38KQD024515MC'],
  },
  {
    id: 'carrier-ecosplit-ct-2014',
    label: 'Carrier Ecosplit 38ES/38EX/38EV + 40RT/40VX (CT 2014)',
    grupo: 'SPLITÃO / ECOSPLIT',
    alvoSH: [3, 15],
    alvoSC: [4, 8],
    refrigPadrao: 'R-410A',
    metodoCarga: 'sh-sc',
    confianca: 'alta',
    nota: 'O catálogo técnico desta revisão indica SH de 3–15 °C e SC de 4–8 °C para a verificação do regime de trabalho. Não aplicar a outras revisões ou linhas Carrier.',
    condicoes: 'Modelos e combinações 38ES/38EX/38EV com 40RT/40VX previstos no CT I-08/14. Confirmar o procedimento de instalação e os limites de operação da combinação exata.',
    fonteUrl: 'https://cdn.carrierdobrasil.com.br/downloads_docs/65fe1-CT-Ecosplit-Inverter-I-08-14--view-.pdf',
    fonteDocumento: 'CT Ecosplit Inverter I-08/14',
    fontePaginas: [1, 106],
    revisadoEm: '2026-11-15',
    modelosAbrangidos: ['38ES_10', '38ES_15', '38EV_10', '38EV_15', '38EX_10', '38EX_15', '38EX_20', '40RT_10–40', '40VX_10–45'],
  },
  {
    id: 'philco-pac30000-m8w',
    label: 'Philco PAC30000IFM8W / IQFM8W (inclui Protect)',
    grupo: 'SPLIT HI-WALL',
    alvoSH: [7, 11],
    alvoSC: null,
    refrigPadrao: 'R-410A',
    metodoCarga: 'sh-sc',
    confianca: 'alta',
    nota: 'Faixa de SH publicada para estes modelos: 7–11 °C. O sensor de contato fica a 20 cm da válvula de serviço, isolado do ar ambiente. O documento não publica alvo de SC.',
    condicoes: 'Usar apenas PAC30000IFM8W e PAC30000IQFM8W, incluindo versões Protect listadas na capa; confirmar a placa e seguir o procedimento da revisão indicada.',
    fonteUrl: 'https://philco.vteximg.com.br/arquivos/Manual_Ar_Condicionado_Philco_30000Btus_PAC30000IQFM8_Eco_Inverter_96652872.pdf',
    fonteDocumento: 'Philco 3411 00 05 Rev.0 — Manual unificado',
    fontePaginas: [1, 2],
    revisadoEm: '2026-11-15',
    modelosAbrangidos: ['PAC30000IFM8W', 'PAC30000IQFM8W', 'PAC30000IFM8W PROTECT', 'PAC30000IQFM8W PROTECT'],
  },
  {
    id: 'gree-gtop-auto-r32-rev00',
    label: 'Gree G-Top Auto Inverter R-32 (Rev.00)',
    grupo: 'SPLIT HI-WALL',
    alvoSH: null,
    alvoSC: null,
    refrigPadrao: 'R-32',
    metodoCarga: 'peso',
    confianca: 'alta',
    nota: 'O procedimento de carga adicional usa cilindro, manifold e balança. A massa depende da capacidade, do ciclo e do comprimento; este manual não oferece uma faixa SH/SC para substituir o procedimento por peso.',
    condicoes: 'Conferir o código completo da família ATA/ATC/ATD/ATE/ATEXF indicada no manual. Não aplicar os adicionais de uma capacidade ou versão frio a outra versão quente/frio.',
    fonteUrl: 'https://gree.com.br/wp-content/uploads/2025/02/Manual-G-TOP-AUTO-INVERTER_R32_REV00-full.pdf',
    fonteDocumento: 'Gree G-Top Auto Inverter R-32 Rev.00',
    fontePaginas: [9, 32, 33, 38],
    revisadoEm: '2026-11-15',
    modelosAbrangidos: ['GWC09ATA-D6DNA1A', 'GWH09ATA-D6DNA1A', 'GWC12ATC-D6DNA1A', 'GWH12ATC-D6DNA1A', 'GWC18ATD-D6DNA1A', 'GWH18ATD-D6DNA1A', 'GWC24ATE-D6DNA1A', 'GWH24ATE-D6DNA1A', 'GWC30ATEXF-S6DNA1A', 'GWH30ATEXF-S6DNA1A'],
  },
  {
    id: 'gree-ghcn36-60-r410-2020',
    label: 'Gree Piso-Teto GHCN36ND3CO / GHCN60NF3CO / NH3CO',
    grupo: 'PISO-TETO',
    alvoSH: null,
    alvoSC: null,
    refrigPadrao: 'R-410A',
    metodoCarga: 'peso',
    confianca: 'alta',
    nota: 'A seção Pesagem orienta a carga pela placa somada ao ajuste do comprimento da linha. Não substituir esse procedimento por uma faixa genérica de SH/SC.',
    condicoes: 'A tabela publicada distingue os modelos de 36 e 60 mil BTU/h e seus comprimentos de referência. Usar a linha exata do manual e a placa da unidade externa.',
    fonteUrl: 'https://gree.com.br/wp-content/uploads/2025/02/MANUAL-DO-PISO-TETO-INVERTER-REV01-11.01.2020.pdf',
    fonteDocumento: 'Gree Piso-Teto — Rev.01 11/01/2020',
    fontePaginas: [6, 41],
    revisadoEm: '2026-11-15',
    modelosAbrangidos: ['GHCN36ND3CO', 'GHCN60NF3CO', 'GHCN60NH3CO'],
  },
  {
    id: 'midea-ai-airvolution-efv-r32',
    label: 'Midea AI AirVolution 42EFV / 38TAV R-32',
    grupo: 'SPLIT HI-WALL',
    alvoSH: null,
    alvoSC: null,
    refrigPadrao: 'R-32',
    metodoCarga: 'peso',
    confianca: 'alta',
    nota: 'A adição de refrigerante é controlada por balança conforme capacidade e comprimento. A carga de referência vem da placa; não há alvo numérico SH/SC neste procedimento de carga.',
    condicoes: 'Usar apenas as combinações 42EFV/38TAV R-32 da revisão do manual, respeitando os adicionais próprios das capacidades 09/12/18/22. Não generalizar para Springer AirVolution 42AF ou Xtreme Save.',
    fonteUrl: 'https://conteudo.midea.com.br/manuais/Manual%20do%20usu%C3%A1rio%20-%20Ar-Condicionado%20Split%20AI%20AirVolution%20Midea.pdf',
    fonteDocumento: 'Midea AI AirVolution — Manual do usuário e instalação',
    fontePaginas: [58, 59, 71, 72, 73, 74],
    revisadoEm: '2026-11-15',
    modelosAbrangidos: ['42EFVCA09M5 + 38TAVCA09M5', '42EFVQA09M5 + 38TAVQA09M5', '42EFVCA12M5 + 38TAVCA12M5', '42EFVQA12M5 + 38TAVQA12M5', '42EFVCA18M5 + 38TAVCA18M5', '42EFVCA22M5 + 38TAVCA22M5'],
  },
];

/**
 * Fronteira entre dados legados e recomendações utilizáveis pela interface.
 * O padrão mantém sua referência explicitamente genérica; os demais perfis
 * sem manual não expõem alvos, afirmações por marca nem gás automático.
 */
function resolverModeloDocumentado(modelo: ModeloSuperaquecimento): ModeloSuperaquecimento {
  if (modelo.id === MODELO_PADRAO_ID) return { ...modelo, confianca: 'generico', fonteUrl: undefined, refrigPadrao: undefined };
  const possuiDocumento = modelo.fonteUrl?.startsWith('https://') && modelo.fonteDocumento &&
    modelo.fontePaginas?.length && modelo.fontePaginas.every(pagina => Number.isInteger(pagina) && pagina > 0) &&
    modelo.revisadoEm && modelo.modelosAbrangidos?.length && modelo.metodoCarga;
  if (possuiDocumento) return { ...modelo };
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
export const MODELOS_SUPERAQUECIMENTO: ModeloSuperaquecimento[] = [...MODELOS_LEGADOS_SUPERAQUECIMENTO, ...MODELOS_DOCUMENTADOS_SUPERAQUECIMENTO].map(resolverModeloDocumentado);

/** Acha o perfil utilizável pela UI, sem divulgar recomendações legadas sem fonte. */
export function getModeloSuperaquecimento(id: string): ModeloSuperaquecimento | undefined {
  const modelo = [...MODELOS_LEGADOS_SUPERAQUECIMENTO, ...MODELOS_DOCUMENTADOS_SUPERAQUECIMENTO].find((m) => m.id === id);
  return modelo ? resolverModeloDocumentado(modelo) : undefined;
}
