import daikinSupplement from './daikinErrorCodeReferences.json';
import additionalSupplement from './additionalErrorCodeReferences.json';

/**
 * Referências documentais de escopo fechado, revisadas em 15/11/2026.
 * Complementam lacunas de leitura; nunca sobrescrevem os registros do catálogo.
 * Compatibilidade vem da capa/tabela de modelos, não apenas da marca.
 */
export interface ReferenceModelIdentity {
  id: string;
  code: string | null;
  domain?: string;
  brand?: { name: string } | null;
}
interface ReferenceCode {
  code: string;
  title: string;
  component: string;
  solution?: string;
}
export interface EquipmentCodeReference {
  id: string;
  scope: string;
  document: string;
  url: string;
  supportUrl?: string;
  distributorCopy?: boolean;
  /** Página impressa no documento. */
  page: number | string;
  /** Página física do PDF quando difere da paginação impressa. */
  pdfPage?: number;
  pdfSha256?: string;
  reviewedAt: string;
  conditions?: string;
  context?: 'operation' | 'commissioning';
  codes: ReferenceCode[];
}

// Manuais Daikin 3P611135-1G e 3P611135-2F, página 18.
const DAIKIN_CODES: ReferenceCode[] = [
  ['00', 'Funcionamento normal', 'Sistema'],
  ['UA', 'Combinação incompatível entre unidades', 'Sistema'],
  ['U0', 'Falta de refrigerante', 'Sistema'],
  ['U2', 'Subtensão ou sobretensão no circuito principal', 'Sistema'],
  ['U4', 'Falha de comunicação entre unidades', 'Sistema'],
  ['A1', 'Falha da placa eletrônica interna', 'Unidade interna'],
  ['A5', 'Proteção contra congelamento', 'Unidade interna'],
  ['A6', 'Falha do motor da ventoinha', 'Unidade interna'],
  ['C4', 'Falha do sensor do trocador de calor', 'Unidade interna'],
  ['C9', 'Falha do sensor do ar de sucção', 'Unidade interna'],
  ['EA', 'Falha na comutação frio/quente', 'Unidade externa'],
  ['E1', 'Falha da placa eletrônica', 'Unidade externa'],
  ['E5', 'Proteção OL acionada', 'Unidade externa'],
  ['E6', 'Falha na partida do compressor', 'Unidade externa'],
  ['E7', 'Falha do motor CC da ventilação', 'Unidade externa'],
  ['E8', 'Sobrecorrente de entrada', 'Unidade externa'],
  ['F3', 'Temperatura elevada no tubo de descarga', 'Unidade externa'],
  ['F6', 'Proteção de alta pressão na refrigeração', 'Unidade externa'],
  ['H0', 'Falha de sensor', 'Unidade externa'],
  ['H6', 'Falha do sensor de posição', 'Unidade externa'],
  ['H8', 'Falha do sensor de corrente CC', 'Unidade externa'],
  ['H9', 'Falha do sensor do ar de sucção', 'Unidade externa'],
  ['J3', 'Falha do sensor do tubo de descarga', 'Unidade externa'],
  ['J6', 'Falha do sensor do trocador de calor', 'Unidade externa'],
  ['L3', 'Aquecimento das peças elétricas', 'Unidade externa'],
  ['L4', 'Temperatura elevada no dissipador do inversor', 'Unidade externa'],
  ['L5', 'Sobrecorrente de saída', 'Unidade externa'],
  ['P4', 'Falha do sensor do dissipador do inversor', 'Unidade externa'],
].map(([code, title, component]) => ({ code, title, component }));

// Manual Samsung DB68-13010A-00, página 2, tabela "Indicador de erro".
// Documento original da fabricante, cópia pública distribuída pela CentralAr.
const SAMSUNG_CODES: ReferenceCode[] = [
  { code: 'C101', title: 'Falha de comunicação entre unidades', component: 'Comunicação', solution: 'Conferir conexões e possível cruzamento dos cabos de alimentação e comunicação entre as unidades.' },
  { code: 'C121', title: 'Falha do sensor de temperatura interno', component: 'Unidade interna', solution: 'Conferir a conexão do sensor de temperatura interno.' },
  ...['C122', 'C123'].map((code) => ({ code, title: 'Falha no sensor do trocador de calor interno', component: 'Unidade interna', solution: 'Conferir a conexão do sensor de temperatura do evaporador.' })),
  { code: 'C154', title: 'Falha do motor do ventilador interno', component: 'Unidade interna', solution: 'Conferir conexão do motor à placa e obstruções na roda do ventilador.' },
  ...['88', 'C162', 'C163'].map((code) => ({ code, title: 'Erro de configuração ou EEPROM', component: 'Configuração', solution: 'Conferir e redefinir os códigos de opção conforme o manual de instalação.' })),
  { code: 'C422', title: 'Bloqueio no fluxo de refrigerante', component: 'Circuito refrigerante', solution: 'Conferir válvulas de serviço, obstruções, vazamentos e conexões dos cabos entre unidades.' },
  { code: 'C554', title: 'Falta de refrigerante', component: 'Circuito refrigerante', solution: 'Conferir vazamentos e a carga adicional exigida pelo comprimento da tubulação, conforme o manual.' },
];

// As linhas Exclusive e FTXM têm sua própria tabela; não herdam códigos apenas pela marca.
const DAIKIN_HEAT_CODES: ReferenceCode[] = DAIKIN_CODES.map((entry) => entry.code === 'A5'
  ? { ...entry, title: 'Proteção de alta pressão ou contra congelamento' } : entry);
const DAIKIN_EXCLUSIVE_CODES: ReferenceCode[] = [
  ...DAIKIN_HEAT_CODES,
  { code: 'F8', title: 'Parada por temperatura interna anormal do compressor', component: 'Unidade externa' },
];
const DAIKIN_SKYAIR_CODES: ReferenceCode[] = [
  ['A0', 'Proteção externa acionada', 'Unidade interna'],
  ['A1', 'Falha da placa eletrônica', 'Unidade interna'],
  ['A3', 'Falha no controle do nível de drenagem', 'Unidade interna'],
  ['A6', 'Falha do motor do ventilador', 'Unidade interna'],
  ['A7', 'Travamento do motor da aleta', 'Unidade interna'],
  ['A8', 'Tensão de alimentação anormal', 'Unidade interna'],
  ['AF', 'Falha do sistema de drenagem', 'Unidade interna'],
  ['AJ', 'Configuração de capacidade incorreta', 'Unidade interna'],
  ['C4', 'Falha do termistor do trocador', 'Unidade interna'],
  ['C5', 'Falha do termistor intermediário do trocador', 'Unidade interna'],
  ['C9', 'Falha do termistor de sucção', 'Unidade interna'],
  ['CC', 'Falha do sensor de umidade', 'Unidade interna'],
  ['CJ', 'Falha do termistor do controle remoto', 'Unidade interna'],
  ['E1', 'Falha da placa eletrônica', 'Unidade externa'],
  ['E3', 'Proteção de alta pressão', 'Unidade externa'],
  ['E4', 'Proteção de baixa pressão', 'Unidade externa'],
  ['E5', 'Motor do compressor travado', 'Unidade externa'],
  ['E7', 'Falha do motor do ventilador', 'Unidade externa'],
  ['E9', 'Falha da válvula de expansão eletrônica', 'Unidade externa'],
  ['F3', 'Controle de temperatura da descarga', 'Unidade externa'],
  ['H3', 'Falha do pressostato de alta', 'Unidade externa'],
  ['H9', 'Falha do termistor de ar externo', 'Unidade externa'],
  ['J1', 'Falha do sensor de pressão', 'Unidade externa'],
  ['J3', 'Falha do termistor da descarga', 'Unidade externa'],
  ['J5', 'Falha do termistor da sucção', 'Unidade externa'],
  ['J6', 'Falha do termistor do trocador', 'Unidade externa'],
  ['J7', 'Falha do termistor intermediário do trocador', 'Unidade externa'],
  ['J8', 'Falha do termistor da linha de líquido', 'Unidade externa'],
  ['L1', 'Falha da placa eletrônica', 'Unidade externa'],
  ['L4', 'Temperatura elevada no dissipador', 'Unidade externa'],
  ['L5', 'Sobrecorrente na saída CC', 'Unidade externa'],
  ['L8', 'Proteção térmica eletrônica', 'Unidade externa'],
  ['L9', 'Proteção contra falha do compressor', 'Unidade externa'],
  ['LC', 'Comunicação entre controle e inversor', 'Unidade externa'],
  ['P4', 'Falha do termistor do dissipador', 'Unidade externa'],
  ['PJ', 'Configuração de capacidade incorreta', 'Unidade externa'],
  ['U0', 'Refrigerante insuficiente', 'Sistema'],
  ['U2', 'Tensão de alimentação anormal', 'Sistema'],
  ['U4', 'Comunicação entre unidades', 'Sistema'],
  ['U5', 'Comunicação com o controle remoto', 'Sistema'],
  ['U8', 'Comunicação entre controles principal e secundário', 'Sistema'],
  ['UA', 'Configuração de campo incorreta', 'Sistema'],
  ['UC', 'Endereço centralizado incorreto', 'Sistema'],
  ['UF', 'Comunicação, tubulação/fiação incompatível ou refrigerante insuficiente', 'Sistema'],
].map(([code, title, component]) => ({ code, title, component }));

const REFERENCES: EquipmentCodeReference[] = [
  { id: 'philco-janela-fh', scope: 'PAJ7FH / PAJ10FH / PAJ12FH / PAJ18FH / PAJ24FH · janela eletrônico', document: 'Philco 7267-00-05 Rev.1 · 05/2024', url: 'https://cdn.leroymerlin.com.br/medias/document-92510705-user-manual-ar-condicionado-janela-frio-10000-btus-eletronico-127v--110v--paj10fh-philco.pdf', supportUrl: 'https://suporte.philco.com.br/', distributorCopy: true, page: 19, reviewedAt: '2026-11-15', codes: ['E1', 'E2'].map((code) => ({ code, title: 'Falha em sensor', component: 'Sensores', solution: 'O manual não distingue o sensor por código. Solicite diagnóstico ao serviço autorizado.' })) },
  { id: 'daikin-ftkp-qs', scope: 'FTKP 09/12/18/24 Q5VL e S5VL · EcoSwing / EcoSwing Gold', document: 'Daikin 3P611135-1G', url: 'https://www.daikin.com.br/static/uploads/conteudos/downloads/231009034205000000.pdf', page: 18, reviewedAt: '2026-11-15', codes: DAIKIN_CODES },
  { id: 'daikin-fthp-qs', scope: 'FTHP 09/12/18/24 Q5VL e S5VL · EcoSwing / EcoSwing Gold', document: 'Daikin 3P611135-2F', url: 'https://www.daikin.com.br/static/uploads/conteudos/downloads/231009034252000000.pdf', page: 18, reviewedAt: '2026-11-15', codes: DAIKIN_CODES },
  { id: 'samsung-dyfa', scope: 'AR09/12/18/24 · DXEA, DXFA, DYFA e DYFZ · R-32', document: 'Samsung DB68-13010A-00', url: 'https://castaticstorage.blob.core.windows.net/centralar/mds/manuais/samsung/inverter/3866/manual%20%2B%20termo%20de%20garantia/manual%20%2B%20termo%20de%20garantia.pdf', supportUrl: 'https://www.samsung.com/br/support/model/AR09DYFAAWKNAZ/', distributorCopy: true, page: 2, reviewedAt: '2026-11-15', codes: SAMSUNG_CODES },
  { id: 'daikin-full-inverter', scope: 'FTKC/FTHC 09/12/18/24 T5VL · Full Inverter R-32', document: 'Daikin 3P775937-1B', url: 'https://www.daikin.com.br/static/uploads/conteudos/downloads/260119030823000000.pdf', page: 19, reviewedAt: '2026-11-15', codes: DAIKIN_CODES },
  { id: 'daikin-advance-cool', scope: 'FTK 09/12/18/24 P5VL · Advance só frio', document: 'Daikin 3P401260-1A', url: 'https://www.daikin.com.br/static/uploads/conteudos/downloads/200508064318000000.pdf', page: 28, pdfPage: 29, reviewedAt: '2026-11-15', codes: DAIKIN_CODES.filter((entry) => entry.code !== 'EA') },
  { id: 'daikin-advance-heat', scope: 'FTH 09/12/18/24 P5VL · Advance quente/frio', document: 'Daikin 3P401260-2B', url: 'https://www.daikin.com.br/static/uploads/conteudos/downloads/200508064117000000.pdf', page: 28, pdfPage: 29, reviewedAt: '2026-11-15', codes: DAIKIN_HEAT_CODES },
  { id: 'daikin-exclusive', scope: 'FTHS 09/12/18/24 T5VL · Exclusive', document: 'Daikin 3P553789-1', url: 'https://www.daikin.com.br/static/uploads/conteudos/downloads/200508082952000000.pdf', page: 28, pdfPage: 29, reviewedAt: '2026-11-15', codes: DAIKIN_EXCLUSIVE_CODES },
  { id: 'daikin-ftxm32', scope: 'FTXM32TVL · Split Hi Wall R-32', document: 'Daikin 3P524053-1', url: 'https://www.daikin.com.br/static/uploads/conteudos/downloads/200508084103000000.pdf', page: 36, pdfPage: 37, reviewedAt: '2026-11-15', codes: DAIKIN_HEAT_CODES },
  { id: 'daikin-skyair-avl', scope: 'FCQ/FBQ 30/36/42/48 AVL com RZQ AVL · SkyAir R-410A', document: 'Daikin SiBR281412B · diagnóstico de serviço', url: 'https://www.daikin.com.br/static/uploads/conteudos/downloads/200827110308000000.pdf', page: 84, pdfPage: 20, reviewedAt: '2026-11-15', codes: DAIKIN_SKYAIR_CODES },
  { id: 'samsung-cvfa', scope: 'AR09/12/18/24 CVFA · WindFree Wi-Fi AI Energy', document: 'Samsung DB68-12233A-00', url: 'https://cdn2.centralar.com.br/centralar/mds/manuais/samsung/inverter/3179%20-%203180%20-%203181%20-%20HW%20WindFree%20linha%2023_24/Manual%20Instala%C3%A7%C3%A3o%20AR_CVFA%20-%20DB68-12233A-00_IM_23Y%20AR9500T%20Win.pdf', supportUrl: 'https://www.samsung.com/br/support/model/AR09CVFAAWKNAZ/', distributorCopy: true, page: 2, reviewedAt: '2026-11-15', codes: SAMSUNG_CODES },
];

const DAIKIN_EXACT_REFERENCES = new Map(daikinSupplement.references.flatMap(reference => reference.coveredCodes.map(code => [code.replace(/[^A-Z0-9]/g, ''), reference as EquipmentCodeReference] as const)));
const referenceIdentity = (brand: string, code: string) => `${brand.trim().toLowerCase()}:${code.toUpperCase().replace(/[^A-Z0-9]/g, '')}`;
const ADDITIONAL_EXACT_REFERENCES = new Map(additionalSupplement.references.flatMap(reference => reference.coveredModels.map(model => [referenceIdentity(model.brand, model.code), reference as EquipmentCodeReference] as const)));

const REFERENCE_MATCHERS = [
  { brands: ['philco'], code: /^PAJ(?:7|10|12|18|24)FH$/, reference: 'philco-janela-fh' },
  { brands: ['daikin', 'daikin brasil'], code: /^FTKP(?:09|12|18|24)[QS]5VL$/, reference: 'daikin-ftkp-qs' },
  { brands: ['daikin', 'daikin brasil'], code: /^FTHP(?:09|12|18|24)[QS]5VL$/, reference: 'daikin-fthp-qs' },
  { brands: ['daikin', 'daikin brasil'], code: /^(?:FTKC|FTHC)(?:09|12|18|24)T5VL$/, reference: 'daikin-full-inverter' },
  { brands: ['daikin', 'daikin brasil'], code: /^FTK(?:09|12|18|24)P5VL$/, reference: 'daikin-advance-cool' },
  { brands: ['daikin', 'daikin brasil'], code: /^FTH(?:09|12|18|24)P5VL$/, reference: 'daikin-advance-heat' },
  { brands: ['daikin', 'daikin brasil'], code: /^FTHS(?:09|12|18|24)T5VL$/, reference: 'daikin-exclusive' },
  { brands: ['daikin', 'daikin brasil'], code: /^FTXM32TVL$/, reference: 'daikin-ftxm32' },
  { brands: ['daikin', 'daikin brasil'], code: /^(?:FCQ|FBQ)(?:30|36|42|48)AVL$/, reference: 'daikin-skyair-avl' },
  // A capa do DB68-13010A-00 declara estas quatro famílias; a tabela inclui classes 09/12/18/24.
  { brands: ['samsung'], code: /^AR(?:09|12|18|24)(?:DXEA|DXFA|DYFA|DYFZ)[A-Z0-9]{3,6}$/, reference: 'samsung-dyfa' },
  { brands: ['samsung'], code: /^AR(?:09|12|18|24)CVFA[A-Z0-9]{3,6}$/, reference: 'samsung-cvfa' },
];

export function getEquipmentCodeReference(model: ReferenceModelIdentity | null | undefined): EquipmentCodeReference | null {
  if (!model || model.domain !== 'ar_condicionado' || !model.code) return null;
  const brand = model.brand?.name.trim().toLowerCase();
  if (!brand) return null;
  const additionalReference = ADDITIONAL_EXACT_REFERENCES.get(referenceIdentity(brand, model.code));
  if (additionalReference) return additionalReference;
  if (brand === 'daikin' || brand === 'daikin brasil') {
    const exactReference = DAIKIN_EXACT_REFERENCES.get(model.code.toUpperCase().replace(/[^A-Z0-9]/g, ''));
    if (exactReference) return exactReference;
  }
  const tokens = model.code.toUpperCase().match(/[A-Z0-9]+/g) ?? [];
  const match = REFERENCE_MATCHERS.find((rule) => rule.brands.includes(brand) && tokens.some((code) => rule.code.test(code)));
  const reference = match ? REFERENCES.find((entry) => entry.id === match.reference) : null;
  if (!reference) return null;
  if (brand === 'samsung' && match && reference.supportUrl) {
    const exactCode = tokens.find((code) => match.code.test(code));
    return { ...reference, supportUrl: `https://www.samsung.com/br/support/model/${exactCode}/` };
  }
  return reference;
}

export interface ReferenceErrorCode {
  id: string;
  model_id: string;
  code: string;
  title: string;
  description: null;
  diagnosis: null;
  solution: string | null;
  component: string;
  created_at: string;
  reference_id: string;
  i18n?: null;
}

export function getReferenceErrorCodes(model: ReferenceModelIdentity): ReferenceErrorCode[] {
  const reference = getEquipmentCodeReference(model);
  if (!reference) return [];
  return reference.codes.map((entry) => ({ ...entry, id: `reference:${reference.id}:${model.id}:${entry.code}`, model_id: model.id,
    description: null, diagnosis: null, solution: entry.solution ?? null, created_at: reference.reviewedAt,
    reference_id: reference.id }));
}

export function mergeEquipmentErrorCodeReferences<T extends { code: string }>(existing: T[], model: ReferenceModelIdentity): Array<T | ReferenceErrorCode> {
  const normalize = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const present = new Set(existing.map((entry) => normalize(entry.code)));
  return [...existing, ...getReferenceErrorCodes(model).filter((entry) => !present.has(normalize(entry.code)))]
    .sort((a, b) => a.code.localeCompare(b.code));
}
