/**
 * Brazilian national and municipal holidays calculator.
 */

export interface Holiday {
  date: string; // yyyy-MM-dd
  name: string;
  type: 'national' | 'municipal';
}

// Easter calculation (Anonymous Gregorian algorithm)
function getEasterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDaysToDate(d: Date, days: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + days);
  return result;
}

export function getNationalHolidays(year: number): Holiday[] {
  const easter = getEasterDate(year);

  return [
    { date: `${year}-01-01`, name: 'Ano Novo', type: 'national' },
    { date: formatDate(addDaysToDate(easter, -47)), name: 'Carnaval', type: 'national' },
    { date: formatDate(addDaysToDate(easter, -46)), name: 'Quarta de Cinzas', type: 'national' },
    { date: formatDate(addDaysToDate(easter, -2)), name: 'Sexta-feira Santa', type: 'national' },
    { date: formatDate(easter), name: 'Páscoa', type: 'national' },
    { date: `${year}-04-21`, name: 'Tiradentes', type: 'national' },
    { date: `${year}-05-01`, name: 'Dia do Trabalho', type: 'national' },
    { date: formatDate(addDaysToDate(easter, 60)), name: 'Corpus Christi', type: 'national' },
    { date: `${year}-09-07`, name: 'Independência', type: 'national' },
    { date: `${year}-10-12`, name: 'N. Sra. Aparecida', type: 'national' },
    { date: `${year}-11-02`, name: 'Finados', type: 'national' },
    { date: `${year}-11-15`, name: 'Proclamação da República', type: 'national' },
    { date: `${year}-11-20`, name: 'Consciência Negra', type: 'national' },
    { date: `${year}-12-25`, name: 'Natal', type: 'national' },
  ];
}

// Municipal holidays for major Brazilian cities (aniversário da cidade + padroeiro)
const municipalHolidaysDB: Record<string, { month: number; day: number; name: string }[]> = {
  // SP
  'são paulo-sp': [{ month: 1, day: 25, name: 'Aniversário de São Paulo' }],
  'campinas-sp': [{ month: 7, day: 14, name: 'Aniversário de Campinas' }],
  'guarulhos-sp': [{ month: 12, day: 8, name: 'Aniversário de Guarulhos' }],
  'santos-sp': [{ month: 1, day: 26, name: 'Aniversário de Santos' }],
  'ribeirão preto-sp': [{ month: 6, day: 19, name: 'Aniversário de Ribeirão Preto' }],
  'sorocaba-sp': [{ month: 8, day: 15, name: 'Aniversário de Sorocaba' }],
  'são josé dos campos-sp': [{ month: 3, day: 27, name: 'Aniversário de SJC' }],
  'osasco-sp': [{ month: 2, day: 19, name: 'Aniversário de Osasco' }],
  // RJ
  'rio de janeiro-rj': [
    { month: 1, day: 20, name: 'Dia de São Sebastião' },
    { month: 3, day: 1, name: 'Aniversário do Rio' },
  ],
  'niterói-rj': [{ month: 11, day: 22, name: 'Aniversário de Niterói' }],
  // MG
  'belo horizonte-mg': [{ month: 12, day: 12, name: 'Aniversário de BH' }],
  'uberlândia-mg': [{ month: 8, day: 31, name: 'Aniversário de Uberlândia' }],
  'contagem-mg': [{ month: 4, day: 3, name: 'Aniversário de Contagem' }],
  'juiz de fora-mg': [{ month: 5, day: 31, name: 'Aniversário de Juiz de Fora' }],
  // PR
  'curitiba-pr': [{ month: 3, day: 29, name: 'Aniversário de Curitiba' }],
  'londrina-pr': [{ month: 12, day: 10, name: 'Aniversário de Londrina' }],
  'maringá-pr': [{ month: 5, day: 10, name: 'Aniversário de Maringá' }],
  // RS
  'porto alegre-rs': [{ month: 3, day: 26, name: 'Aniversário de Porto Alegre' }],
  'caxias do sul-rs': [{ month: 6, day: 20, name: 'Aniversário de Caxias do Sul' }],
  // SC
  'florianópolis-sc': [{ month: 3, day: 23, name: 'Aniversário de Florianópolis' }],
  'joinville-sc': [{ month: 3, day: 9, name: 'Aniversário de Joinville' }],
  // BA
  'salvador-ba': [{ month: 3, day: 29, name: 'Aniversário de Salvador' }],
  // PE
  'recife-pe': [{ month: 3, day: 12, name: 'Aniversário de Recife' }],
  // CE
  'fortaleza-ce': [{ month: 4, day: 13, name: 'Aniversário de Fortaleza' }],
  // PA
  'belém-pa': [{ month: 1, day: 12, name: 'Aniversário de Belém' }],
  // AM
  'manaus-am': [{ month: 10, day: 24, name: 'Aniversário de Manaus' }],
  // GO
  'goiânia-go': [{ month: 10, day: 24, name: 'Aniversário de Goiânia' }],
  // DF
  'brasília-df': [{ month: 4, day: 21, name: 'Aniversário de Brasília' }],
  // MA
  'são luís-ma': [{ month: 9, day: 8, name: 'Aniversário de São Luís' }],
  // MT
  'cuiabá-mt': [{ month: 4, day: 8, name: 'Aniversário de Cuiabá' }],
  // MS
  'campo grande-ms': [{ month: 8, day: 26, name: 'Aniversário de Campo Grande' }],
  // ES
  'vitória-es': [{ month: 9, day: 8, name: 'Aniversário de Vitória' }],
  // RN
  'natal-rn': [{ month: 12, day: 25, name: 'Aniversário de Natal' }],
  // PB
  'joão pessoa-pb': [{ month: 8, day: 5, name: 'Aniversário de João Pessoa' }],
  // AL
  'maceió-al': [{ month: 12, day: 5, name: 'Aniversário de Maceió' }],
  // SE
  'aracaju-se': [{ month: 3, day: 17, name: 'Aniversário de Aracaju' }],
  // PI
  'teresina-pi': [{ month: 8, day: 16, name: 'Aniversário de Teresina' }],
  // TO
  'palmas-to': [{ month: 5, day: 20, name: 'Aniversário de Palmas' }],
  // RO
  'porto velho-ro': [{ month: 10, day: 2, name: 'Aniversário de Porto Velho' }],
  // AC
  'rio branco-ac': [{ month: 12, day: 28, name: 'Aniversário de Rio Branco' }],
  // AP
  'macapá-ap': [{ month: 2, day: 4, name: 'Aniversário de Macapá' }],
  // RR
  'boa vista-rr': [{ month: 6, day: 9, name: 'Aniversário de Boa Vista' }],
};

export function getMunicipalHolidays(city: string, state: string, year: number): Holiday[] {
  if (!city || !state) return [];

  const key = `${city.toLowerCase().trim()}-${state.toLowerCase().trim()}`;
  const entries = municipalHolidaysDB[key];
  if (!entries) return [];

  return entries.map((e) => ({
    date: `${year}-${String(e.month).padStart(2, '0')}-${String(e.day).padStart(2, '0')}`,
    name: e.name,
    type: 'municipal' as const,
  }));
}

export function getAllHolidays(city: string, state: string, year: number): Holiday[] {
  return [...getNationalHolidays(year), ...getMunicipalHolidays(city, state, year)];
}

/**
 * Build a lookup map: date string -> Holiday[]
 */
export function buildHolidayMap(holidays: Holiday[]): Record<string, Holiday[]> {
  const map: Record<string, Holiday[]> = {};
  for (const h of holidays) {
    if (!map[h.date]) map[h.date] = [];
    map[h.date].push(h);
  }
  return map;
}
