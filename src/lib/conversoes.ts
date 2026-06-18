/**
 * Conversões de unidades para o técnico de campo. 100% funções puras, sem rede.
 *
 * Estratégia: cada categoria define um conjunto de unidades. Toda conversão
 * passa por uma UNIDADE BASE — converte o valor de origem para a base e depois
 * da base para o destino. Isso evita matriz N×N de conversões.
 *
 * - Pressão:     base = Pascal (Pa)
 * - Potência:    base = Watt (W)
 * - Comprimento: base = metro (m)
 * - Temperatura: base = Celsius (°C) — conversões NÃO lineares simples, então
 *                usa funções dedicadas de/para a base.
 */

/**
 * Categorias NUMÉRICAS — têm unidades e passam por `converter()`.
 */
export type ConversaoCategoriaNumerica = 'pressao' | 'temperatura' | 'potencia' | 'comprimento';

/**
 * Categorias da ferramenta de Conversão. Hoje todas são numéricas (passam por
 * `converter()`). Alias mantido para o deep-link de `ToolNavPayload` e para os
 * mapas internos da view; reabra-o como união se voltar a existir categoria de
 * referência (não-numérica) com view própria.
 */
export type ConversaoCategoria = ConversaoCategoriaNumerica;

export interface UnidadeDef {
  /** Código interno único da unidade. */
  code: string;
  /** Rótulo exibido ao usuário (PT-BR). */
  label: string;
}

// ───────────────────────────── Pressão (base: Pascal) ─────────────────────────────
// Fator = quantos Pascal vale 1 unidade.
const PRESSAO_PARA_PA: Record<string, number> = {
  bar: 100000,
  psi: 6894.757293168,
  kPa: 1000,
  atm: 101325,
  mca: 9806.65, // metro de coluna d'água (a 4 °C, g padrão)
};

const PRESSAO_UNIDADES: UnidadeDef[] = [
  { code: 'bar', label: 'bar' },
  { code: 'psi', label: 'psi' },
  { code: 'kPa', label: 'kPa' },
  { code: 'atm', label: 'atm' },
  { code: 'mca', label: 'm.c.a (coluna d’água)' },
];

// ───────────────────────────── Potência (base: Watt) ─────────────────────────────
// Fator = quantos Watt vale 1 unidade.
const POTENCIA_PARA_W: Record<string, number> = {
  W: 1,
  kW: 1000,
  HP: 745.699872, // 1 HP ≈ 746 W
  cv: 735.49875, // cavalo-vapor métrico ≈ 735,5 W
  'BTU/h': 1 / 3.412142, // 1 W = 3,412142 BTU/h
  TR: 3516.852842, // 1 TR = 12000 BTU/h
};

const POTENCIA_UNIDADES: UnidadeDef[] = [
  { code: 'W', label: 'W' },
  { code: 'kW', label: 'kW' },
  { code: 'HP', label: 'HP' },
  { code: 'cv', label: 'cv' },
  { code: 'BTU/h', label: 'BTU/h' },
  { code: 'TR', label: 'TR (tonelada de refrigeração)' },
];

// ─────────────────────────── Comprimento (base: metro) ───────────────────────────
// Fator = quantos metros vale 1 unidade.
const COMPRIMENTO_PARA_M: Record<string, number> = {
  mm: 0.001,
  cm: 0.01,
  m: 1,
  pol: 0.0254, // polegada = 25,4 mm
  ft: 0.3048, // pé = 304,8 mm
};

const COMPRIMENTO_UNIDADES: UnidadeDef[] = [
  { code: 'mm', label: 'mm' },
  { code: 'cm', label: 'cm' },
  { code: 'm', label: 'm' },
  { code: 'pol', label: 'pol (polegada)' },
  { code: 'ft', label: 'ft (pé)' },
];

// ──────────────────────────── Temperatura (base: °C) ────────────────────────────
const TEMPERATURA_UNIDADES: UnidadeDef[] = [
  { code: 'C', label: '°C' },
  { code: 'F', label: '°F' },
  { code: 'K', label: 'K' },
];

/** Converte qualquer unidade de temperatura para Celsius. */
function temperaturaParaCelsius(valor: number, de: string): number {
  switch (de) {
    case 'C':
      return valor;
    case 'F':
      return (valor - 32) * (5 / 9);
    case 'K':
      return valor - 273.15;
    default:
      return NaN;
  }
}

/** Converte Celsius para qualquer unidade de temperatura. */
function celsiusPara(valorC: number, para: string): number {
  switch (para) {
    case 'C':
      return valorC;
    case 'F':
      return valorC * (9 / 5) + 32;
    case 'K':
      return valorC + 273.15;
    default:
      return NaN;
  }
}

// ─────────────────────────────── Catálogo público ───────────────────────────────

export const CONVERSAO_CATEGORIAS: Record<
  ConversaoCategoriaNumerica,
  { label: string; unidades: UnidadeDef[] }
> = {
  pressao: { label: 'Pressão', unidades: PRESSAO_UNIDADES },
  temperatura: { label: 'Temperatura', unidades: TEMPERATURA_UNIDADES },
  potencia: { label: 'Potência', unidades: POTENCIA_UNIDADES },
  comprimento: { label: 'Comprimento', unidades: COMPRIMENTO_UNIDADES },
};

/**
 * Converte um valor entre duas unidades de uma mesma categoria.
 * Retorna NaN se as unidades forem inválidas pra categoria.
 */
export function converter(
  categoria: ConversaoCategoriaNumerica,
  de: string,
  para: string,
  valor: number,
): number {
  if (categoria === 'temperatura') {
    const base = temperaturaParaCelsius(valor, de);
    return celsiusPara(base, para);
  }

  const fatores =
    categoria === 'pressao'
      ? PRESSAO_PARA_PA
      : categoria === 'potencia'
        ? POTENCIA_PARA_W
        : COMPRIMENTO_PARA_M;

  const fatorDe = fatores[de];
  const fatorPara = fatores[para];
  if (fatorDe === undefined || fatorPara === undefined) return NaN;

  const base = valor * fatorDe;
  return base / fatorPara;
}

/**
 * Formata o resultado da conversão em PT-BR, com até 6 casas significativas e
 * sem zeros à direita desnecessários.
 */
export function formatarResultado(valor: number): string {
  if (!Number.isFinite(valor)) return '—';
  // Arredonda pra evitar lixo de ponto flutuante, mantém precisão útil.
  const arredondado = Number(valor.toFixed(6));
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 6 }).format(arredondado);
}
