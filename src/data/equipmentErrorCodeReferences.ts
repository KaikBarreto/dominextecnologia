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
  page: number;
  reviewedAt: string;
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

const REFERENCES: EquipmentCodeReference[] = [
  { id: 'daikin-ftkp-qs', scope: 'FTKP 09/12/18/24 Q5VL e S5VL · EcoSwing / EcoSwing Gold', document: 'Daikin 3P611135-1G', url: 'https://www.daikin.com.br/static/uploads/conteudos/downloads/231009034205000000.pdf', page: 18, reviewedAt: '2026-11-15', codes: DAIKIN_CODES },
  { id: 'daikin-fthp-qs', scope: 'FTHP 09/12/18/24 Q5VL e S5VL · EcoSwing / EcoSwing Gold', document: 'Daikin 3P611135-2F', url: 'https://www.daikin.com.br/static/uploads/conteudos/downloads/231009034252000000.pdf', page: 18, reviewedAt: '2026-11-15', codes: DAIKIN_CODES },
  { id: 'samsung-dyfa', scope: 'AR09/12/18DYFAAWK · WindFree AI R-32', document: 'Samsung DB68-13010A-00', url: 'https://castaticstorage.blob.core.windows.net/centralar/mds/manuais/samsung/inverter/3866/manual%20%2B%20termo%20de%20garantia/manual%20%2B%20termo%20de%20garantia.pdf', supportUrl: 'https://www.samsung.com/br/support/model/AR09DYFAAWKNAZ/', distributorCopy: true, page: 2, reviewedAt: '2026-11-15', codes: SAMSUNG_CODES },
];

export function getEquipmentCodeReference(model: ReferenceModelIdentity | null | undefined): EquipmentCodeReference | null {
  if (!model || model.domain !== 'ar_condicionado' || !model.code) return null;
  const brand = model.brand?.name.trim().toLowerCase();
  const tokens = model.code.toUpperCase().match(/[A-Z0-9]+/g) ?? [];
  if (brand === 'daikin' || brand === 'daikin brasil') {
    if (tokens.some((code) => /^FTKP(?:09|12|18|24)[QS]5VL$/.test(code))) return REFERENCES[0];
    if (tokens.some((code) => /^FTHP(?:09|12|18|24)[QS]5VL$/.test(code))) return REFERENCES[1];
  }
  if (brand === 'samsung' && tokens.some((code) => /^AR(?:09|12|18)DYFAAWK(?:[NX]AZ)?$/.test(code))) return REFERENCES[2];
  return null;
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
