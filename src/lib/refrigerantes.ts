import { FONTES_TABELAS_SATURACAO, type FonteTabelaSaturacao } from '@/data/refrigerantSaturationSources';

/**
 * Tabelas de saturação (pressão–temperatura) de refrigerantes e cálculos de
 * superaquecimento (SH) e subresfriamento (SC).
 *
 * 100% client-side / offline — interpolação linear entre pontos publicados
 * por National Refrigerants, Chemours e Solstice. Todas as curvas possuem
 * documento, páginas, revisão e intervalo próprios; não há pontos históricos
 * sem fonte nem extrapolação além dos extremos documentados.
 * Pressões de uso MANOMÉTRICAS (gauge); psia da fonte é convertida uma vez.
 *
 * R-410A usa liquid/bubble e vapor/dew, mesmo com glide pequeno. Unidades e
 * pontos originais estão em `refrigerantSaturationSources.ts`.
 * Blends com glide têm curvas `bubble` (líquido) e `dew` (vapor).
 * A interpolação não extrapola além da faixa de cada tabela.
 */

/** Unidade de pressão de trabalho. */
export type UnidadePressao = 'bar' | 'psi';

/** Qual curva da tabela usar (blends com glide têm bubble/dew). */
export type Curva = 'bubble' | 'dew' | 'unica';

/** Ponto da tabela de saturação: temperatura (°C) e pressão gauge em bar e psi. */
export interface PontoSaturacao {
  t: number;
  bar: number;
  psi: number;
}

/**
 * Classe de segurança ASHRAE 34 quanto à INFLAMABILIDADE (só o eixo de chama).
 * - 'A1'  = não inflamável (sem ícone na UI).
 * - 'A2L' = levemente inflamável → fogo ÂMBAR na UI.
 * - 'A3'  = altamente inflamável → fogo VERMELHO na UI.
 * (A2 puro não existe no catálogo atual; entra como 'leve' se vier no futuro.)
 */
export type ClasseInflamabilidade = 'A1' | 'A2L' | 'A3';

/** Nível de inflamabilidade derivado da classe ASHRAE, para a UI. */
export type NivelInflamabilidade = 'nao' | 'leve' | 'alta';

/** Definição de um refrigerante: nome de exibição + curva(s) + origem documental. */
export interface Refrigerante {
  id: string;
  nome: string;
  /** Fonte primária e revisão dos pontos usados nesta tabela. */
  fonte: FonteTabelaSaturacao;
  /** Cor de referência do cilindro (hex), só visual. */
  cor: string;
  /**
   * Classe de inflamabilidade ASHRAE 34. Fonte única para o ícone de chama
   * exibido ao lado do gás (vermelho A3 / âmbar A2L / nada para A1).
   */
  inflamabilidade: ClasseInflamabilidade;
  /** true se tem glide (duas curvas bubble/dew). */
  temGlide: boolean;
  /** Curva única (refrigerantes sem glide). */
  unica?: PontoSaturacao[];
  /** Curva de líquido (refrigerantes com glide). */
  bubble?: PontoSaturacao[];
  /** Curva de vapor (refrigerantes com glide). */
  dew?: PontoSaturacao[];
}

/** Converte a linha documental sem alterar sua referência de pressão. */
function curvaDocumental(sourceId: string, curva: Curva): PontoSaturacao[] {
  const fonte = FONTES_TABELAS_SATURACAO[sourceId];
  const coluna = fonte.curves[curva];
  if (coluna === undefined) return [];
  return fonte.rows
    .filter((row) => !fonte.excluded?.some((item) => item.curve === curva && item.coordinate === row[0]))
    .map((row) => {
      const temperatura = fonte.axis === 'temperature' ? row[0] : row[coluna];
      const pressao = fonte.axis === 'pressure' ? row[0] : row[coluna];
      const t = fonte.temperatureUnit === 'F' ? (temperatura - 32) * 5 / 9 : temperatura;
      const psi = fonte.pressureUnit === 'psia' ? pressao - 14.695948776
        : fonte.pressureUnit === 'barg' ? pressao * 14.503773773 : pressao;
      return { t, psi, bar: psi / 14.503773773 };
    });
}

const R22 = curvaDocumental('R22', 'unica');
const R410A_BUBBLE = curvaDocumental('R410A', 'bubble');
const R410A_DEW = curvaDocumental('R410A', 'dew');
const R32 = curvaDocumental('R32', 'unica');
const R134A = curvaDocumental('R134A', 'unica');
const R290 = curvaDocumental('R290', 'unica');
const R12 = curvaDocumental('R12', 'unica');
const R404A_BUBBLE = curvaDocumental('R404A', 'bubble');
const R404A_DEW = curvaDocumental('R404A', 'dew');
const R407C_BUBBLE = curvaDocumental('R407C', 'bubble');
const R407C_DEW = curvaDocumental('R407C', 'dew');
const R422D_BUBBLE = curvaDocumental('R422D', 'bubble');
const R422D_DEW = curvaDocumental('R422D', 'dew');
const R438A_BUBBLE = curvaDocumental('R438A', 'bubble');
const R438A_DEW = curvaDocumental('R438A', 'dew');
const R407A_BUBBLE = curvaDocumental('R407A', 'bubble');
const R407A_DEW = curvaDocumental('R407A', 'dew');
const R448A_BUBBLE = curvaDocumental('R448A', 'bubble');
const R448A_DEW = curvaDocumental('R448A', 'dew');
const R449A_BUBBLE = curvaDocumental('R449A', 'bubble');
const R449A_DEW = curvaDocumental('R449A', 'dew');

/** Catálogo de refrigerantes suportados (ordem de exibição). */
export const REFRIGERANTES: Refrigerante[] = [
  { id: 'R-410A', fonte: FONTES_TABELAS_SATURACAO.R410A, nome: 'R-410A', cor: '#EC6FAA', inflamabilidade: 'A1', temGlide: true, bubble: R410A_BUBBLE, dew: R410A_DEW },
  { id: 'R-22', fonte: FONTES_TABELAS_SATURACAO.R22, nome: 'R-22', cor: '#7AC74F', inflamabilidade: 'A1', temGlide: false, unica: R22 },
  { id: 'R-32', fonte: FONTES_TABELAS_SATURACAO.R32, nome: 'R-32', cor: '#EF4444', inflamabilidade: 'A2L', temGlide: false, unica: R32 },
  { id: 'R-134a', fonte: FONTES_TABELAS_SATURACAO.R134A, nome: 'R-134a', cor: '#56B4E9', inflamabilidade: 'A1', temGlide: false, unica: R134A },
  { id: 'R-290', fonte: FONTES_TABELAS_SATURACAO.R290, nome: 'R-290 (Propano)', cor: '#EF4444', inflamabilidade: 'A3', temGlide: false, unica: R290 },
  {
    id: 'R-404A', fonte: FONTES_TABELAS_SATURACAO.R404A,
    nome: 'R-404A',
    cor: '#F97316',
    inflamabilidade: 'A1',
    temGlide: true,
    bubble: R404A_BUBBLE,
    dew: R404A_DEW,
  },
  {
    id: 'R-407C', fonte: FONTES_TABELAS_SATURACAO.R407C,
    nome: 'R-407C',
    cor: '#8B5E3C',
    inflamabilidade: 'A1',
    temGlide: true,
    bubble: R407C_BUBBLE,
    dew: R407C_DEW,
  },
  {
    id: 'R-422D', fonte: FONTES_TABELAS_SATURACAO.R422D,
    nome: 'R-422D',
    cor: '#A0522D',
    inflamabilidade: 'A1',
    temGlide: true,
    bubble: R422D_BUBBLE,
    dew: R422D_DEW,
  },
  {
    id: 'R-438A', fonte: FONTES_TABELAS_SATURACAO.R438A,
    nome: 'R-438A',
    cor: '#B5651D',
    inflamabilidade: 'A1',
    temGlide: true,
    bubble: R438A_BUBBLE,
    dew: R438A_DEW,
  },
  {
    id: 'R-407A', fonte: FONTES_TABELAS_SATURACAO.R407A,
    nome: 'R-407A',
    cor: '#6B8E23',
    inflamabilidade: 'A1',
    temGlide: true,
    bubble: R407A_BUBBLE,
    dew: R407A_DEW,
  },
  {
    id: 'R-448A', fonte: FONTES_TABELAS_SATURACAO.R448A,
    nome: 'R-448A',
    cor: '#4F7942',
    inflamabilidade: 'A1',
    temGlide: true,
    bubble: R448A_BUBBLE,
    dew: R448A_DEW,
  },
  {
    id: 'R-449A', fonte: FONTES_TABELAS_SATURACAO.R449A,
    nome: 'R-449A',
    cor: '#558B2F',
    inflamabilidade: 'A1',
    temGlide: true,
    bubble: R449A_BUBBLE,
    dew: R449A_DEW,
  },
  { id: 'R-12', fonte: FONTES_TABELAS_SATURACAO.R12, nome: 'R-12', cor: '#CFD4DA', inflamabilidade: 'A1', temGlide: false, unica: R12 },
];

/**
 * Classificação dos gases do select por seção (fonte única, independe da ordem
 * do catálogo). "Atuais" fica no topo SEM cabeçalho (padrão do projeto pra
 * default). Qualquer id do catálogo não listado abaixo cai em "Atuais"
 * (fallback seguro, nunca some da lista).
 */
export const GASES_LEGADO_IDS = ['R-22', 'R-12', 'R-404A'];
export const GASES_BLEND_IDS = ['R-407C', 'R-422D', 'R-438A', 'R-407A', 'R-448A', 'R-449A'];

/** Uma seção do select de refrigerantes (label null = "Atuais", sem cabeçalho). */
export interface SecaoRefrigerantes {
  label: string | null;
  refrigerantes: Refrigerante[];
}

/**
 * Agrupa o catálogo nas seções da UI, na ordem: Atuais (label null), Legado,
 * Blends. Seções vazias são omitidas. Ids não classificados caem em "Atuais"
 * (fallback seguro). Fonte única para Régua de Gases e Superaquecimento.
 */
export function agruparRefrigerantesEmSecoes(): SecaoRefrigerantes[] {
  const byId = new Map(REFRIGERANTES.map((r) => [r.id, r]));
  const legado = GASES_LEGADO_IDS.map((id) => byId.get(id)).filter(Boolean) as Refrigerante[];
  const blends = GASES_BLEND_IDS.map((id) => byId.get(id)).filter(Boolean) as Refrigerante[];
  const classificados = new Set([...GASES_LEGADO_IDS, ...GASES_BLEND_IDS]);
  // "Atuais" = tudo que não é legado nem blend (inclui ids novos não mapeados).
  const atuais = REFRIGERANTES.filter((r) => !classificados.has(r.id));

  const secoes: SecaoRefrigerantes[] = [
    { label: null, refrigerantes: atuais },
    { label: 'Gases Legado (Antigos)', refrigerantes: legado },
    { label: 'Substitutos / Blends de retrofit', refrigerantes: blends },
  ];
  return secoes.filter((s) => s.refrigerantes.length > 0);
}

/** Mapeia a classe ASHRAE para o nível de inflamabilidade usado na UI. */
export function nivelInflamabilidade(classe: ClasseInflamabilidade): NivelInflamabilidade {
  if (classe === 'A3') return 'alta';
  if (classe === 'A2L') return 'leve';
  return 'nao';
}

/** Inflamabilidade (nível + classe) de um refrigerante pelo id; default não inflamável. */
export function getInflamabilidade(
  refrigId: string,
): { nivel: NivelInflamabilidade; classe: ClasseInflamabilidade } {
  const refrig = getRefrigerante(refrigId);
  const classe = refrig?.inflamabilidade ?? 'A1';
  return { nivel: nivelInflamabilidade(classe), classe };
}

/** Faixas-alvo de referência (°C). */
export const FAIXA_SH = { min: 4, max: 8 } as const; // referência genérica, não alvo de carga
export const FAIXA_SC = { min: 4, max: 8 } as const; // referência genérica, não alvo de carga

/** Acha um refrigerante pelo id. */
export function getRefrigerante(id: string): Refrigerante | undefined {
  return REFRIGERANTES.find((r) => r.id === id);
}

/** Seleciona a tabela de pontos para um refrigerante + curva pedida. */
function getTabela(refrig: Refrigerante, curva: Curva): PontoSaturacao[] | null {
  if (!refrig.temGlide) return refrig.unica ?? null;
  if (curva === 'bubble') return refrig.bubble ?? null;
  if (curva === 'dew') return refrig.dew ?? null;
  // 'unica' pedida em refrigerante com glide → cai no dew por segurança.
  return refrig.dew ?? refrig.bubble ?? null;
}

/**
 * Converte pressão gauge (na unidade dada) em temperatura de saturação (°C)
 * por interpolação linear sobre a tabela. Fora da faixa → null (aviso na UI).
 */
export function pressaoParaTempSat(
  refrigId: string,
  pressao: number,
  unidade: UnidadePressao,
  curva: Curva,
): number | null {
  const refrig = getRefrigerante(refrigId);
  if (!refrig) return null;
  const tabela = getTabela(refrig, curva);
  if (!tabela || tabela.length < 2) return null;
  if (!Number.isFinite(pressao)) return null;

  const valorDe = (p: PontoSaturacao) => (unidade === 'bar' ? p.bar : p.psi);

  // Tabela está ordenada por temperatura crescente; pressão também cresce
  // monotonicamente com a temperatura.
  const min = valorDe(tabela[0]);
  const max = valorDe(tabela[tabela.length - 1]);
  if (pressao < min || pressao > max) return null;

  for (let i = 0; i < tabela.length - 1; i++) {
    const p0 = valorDe(tabela[i]);
    const p1 = valorDe(tabela[i + 1]);
    if (pressao >= p0 && pressao <= p1) {
      if (p1 === p0) return tabela[i].t;
      const frac = (pressao - p0) / (p1 - p0);
      return tabela[i].t + frac * (tabela[i + 1].t - tabela[i].t);
    }
  }
  return null;
}

/**
 * Converte temperatura de saturação (°C) em pressão gauge (na unidade dada)
 * por interpolação linear sobre a tabela. É o inverso de `pressaoParaTempSat`.
 * Fora da faixa de temperatura da tabela → null (aviso na UI).
 */
export function tempParaPressao(
  refrigId: string,
  tempC: number,
  unidade: UnidadePressao,
  curva: Curva,
): number | null {
  const refrig = getRefrigerante(refrigId);
  if (!refrig) return null;
  const tabela = getTabela(refrig, curva);
  if (!tabela || tabela.length < 2) return null;
  if (!Number.isFinite(tempC)) return null;

  const valorDe = (p: PontoSaturacao) => (unidade === 'bar' ? p.bar : p.psi);

  // Tabela ordenada por temperatura crescente.
  const tMin = tabela[0].t;
  const tMax = tabela[tabela.length - 1].t;
  if (tempC < tMin || tempC > tMax) return null;

  for (let i = 0; i < tabela.length - 1; i++) {
    const t0 = tabela[i].t;
    const t1 = tabela[i + 1].t;
    if (tempC >= t0 && tempC <= t1) {
      if (t1 === t0) return valorDe(tabela[i]);
      const frac = (tempC - t0) / (t1 - t0);
      return valorDe(tabela[i]) + frac * (valorDe(tabela[i + 1]) - valorDe(tabela[i]));
    }
  }
  return null;
}

/** A outra unidade de pressão (helper). */
export function outraUnidade(u: UnidadePressao): UnidadePressao {
  return u === 'bar' ? 'psi' : 'bar';
}

/**
 * Sugestão quando a pressão está fora da faixa na unidade escolhida MAS
 * dentro da faixa na outra unidade (caso clássico: digitar 120 em bar
 * querendo psi). Retorna a unidade alternativa e a T_sat que ela daria,
 * ou null se também estiver fora na outra unidade.
 */
export interface SugestaoUnidade {
  unidadeSugerida: UnidadePressao;
  tempSat: number;
}

export function sugerirOutraUnidade(
  refrigId: string,
  pressao: number,
  unidadeAtual: UnidadePressao,
  curva: Curva,
): SugestaoUnidade | null {
  if (!Number.isFinite(pressao)) return null;
  // Só sugere se está fora na unidade atual.
  if (pressaoParaTempSat(refrigId, pressao, unidadeAtual, curva) !== null) {
    return null;
  }
  const alt = outraUnidade(unidadeAtual);
  const tempSat = pressaoParaTempSat(refrigId, pressao, alt, curva);
  if (tempSat === null) return null;
  return { unidadeSugerida: alt, tempSat };
}

/** Classificação de uma medida frente a uma faixa-alvo. */
export type ClassificacaoFaixa = 'baixo' | 'ideal' | 'alto';

/** Classifica um valor (°C) frente a uma faixa min/max. */
export function classificarFaixa(
  valor: number,
  faixa: { min: number; max: number },
): ClassificacaoFaixa | null {
  if (!Number.isFinite(valor) || !Number.isFinite(faixa.min) || !Number.isFinite(faixa.max) || faixa.min > faixa.max) return null;
  if (valor < faixa.min) return 'baixo';
  if (valor > faixa.max) return 'alto';
  return 'ideal';
}

export interface ResultadoSaturacao {
  /** Temperatura de saturação calculada (°C), ou null se fora da faixa. */
  tempSat: number | null;
  /** Resultado: SH ou SC em °C, ou null se faltar dado / fora de faixa. */
  delta: number | null;
  /** Classificação frente à faixa-alvo, quando há delta. */
  classificacao: ClassificacaoFaixa | null;
}

/**
 * Superaquecimento (SH) = T_sucção_medida − T_sat(pressão de sucção).
 * Blends com glide usam a curva DEW (vapor); demais, curva única.
 */
export function calcularSuperaquecimento(
  refrigId: string,
  pressaoSuccao: number,
  unidade: UnidadePressao,
  tempSuccaoMedida: number,
): ResultadoSaturacao {
  const refrig = getRefrigerante(refrigId);
  const curva: Curva = refrig?.temGlide ? 'dew' : 'unica';
  const tempSat = pressaoParaTempSat(refrigId, pressaoSuccao, unidade, curva);
  if (tempSat === null || !Number.isFinite(tempSuccaoMedida) || tempSuccaoMedida < -273.15) {
    return { tempSat, delta: null, classificacao: null };
  }
  const delta = tempSuccaoMedida - tempSat;
  return { tempSat, delta, classificacao: classificarFaixa(delta, FAIXA_SH) };
}

/**
 * Subresfriamento (SC) = T_sat(pressão de líquido) − T_líquido_medida.
 * Blends com glide usam a curva BUBBLE (líquido); demais, curva única.
 */
export function calcularSubresfriamento(
  refrigId: string,
  pressaoLiquido: number,
  unidade: UnidadePressao,
  tempLiquidoMedida: number,
): ResultadoSaturacao {
  const refrig = getRefrigerante(refrigId);
  const curva: Curva = refrig?.temGlide ? 'bubble' : 'unica';
  const tempSat = pressaoParaTempSat(refrigId, pressaoLiquido, unidade, curva);
  if (tempSat === null || !Number.isFinite(tempLiquidoMedida) || tempLiquidoMedida < -273.15) {
    return { tempSat, delta: null, classificacao: null };
  }
  const delta = tempSat - tempLiquidoMedida;
  return { tempSat, delta, classificacao: classificarFaixa(delta, FAIXA_SC) };
}

/** Formata uma temperatura (°C) no padrão PT-BR, 1 casa. */
export function formatarTemp(valor: number): string {
  return valor.toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

/**
 * Formata uma pressão no padrão PT-BR: 2 casas em bar (valores baixos),
 * 0 casas em psi (valores altos). Negativos (vácuo, ex.: R-134a frio) inclusos.
 */
export function formatarPressao(valor: number, unidade: UnidadePressao): string {
  const casas = unidade === 'bar' ? 2 : 0;
  return valor.toLocaleString('pt-BR', {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
}

/** Curva usada como referência principal na régua (dew p/ blends, única p/ os demais). */
export function curvaReferencia(refrig: Refrigerante): Curva {
  return refrig.temGlide ? 'dew' : 'unica';
}
