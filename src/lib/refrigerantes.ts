/**
 * Tabelas de saturação (pressão–temperatura) de refrigerantes e cálculos de
 * superaquecimento (SH) e subresfriamento (SC).
 *
 * 100% client-side / offline — apenas interpolação linear sobre tabelas
 * de referência. Fontes rastreáveis estão registradas junto às tabelas
 * revisadas; as demais são dados legados, sem certificação integral de precisão.
 * Todas as pressões de uso são MANOMÉTRICAS (gauge).
 *
 * Pontos históricos em passos de 5 °C de -40 a 60 °C; R-448A usa diretamente
 * os pontos de pressão publicados pelo fabricante (intervalos variáveis).
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

/** Definição de um refrigerante: nome de exibição + curva(s). */
export interface Refrigerante {
  id: string;
  nome: string;
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

const R22: PontoSaturacao[] = [
  { t: -40, bar: 0.04, psi: 0.6 },
  { t: -35, bar: 0.31, psi: 4.4 },
  { t: -30, bar: 0.63, psi: 9.1 },
  { t: -25, bar: 1.0, psi: 14.5 },
  { t: -20, bar: 1.44, psi: 20.9 },
  { t: -15, bar: 1.95, psi: 28.3 },
  { t: -10, bar: 2.54, psi: 36.8 },
  { t: -5, bar: 3.21, psi: 46.5 },
  { t: 0, bar: 3.97, psi: 57.5 },
  { t: 5, bar: 4.83, psi: 70.0 },
  { t: 10, bar: 5.8, psi: 84.1 },
  { t: 15, bar: 6.88, psi: 99.8 },
  { t: 20, bar: 8.09, psi: 117.3 },
  { t: 25, bar: 9.43, psi: 136.7 },
  { t: 30, bar: 10.91, psi: 158.2 },
  { t: 35, bar: 12.54, psi: 181.8 },
  { t: 40, bar: 14.32, psi: 207.7 },
  { t: 45, bar: 16.28, psi: 236.1 },
  { t: 50, bar: 18.41, psi: 267.1 },
  { t: 55, bar: 20.73, psi: 300.7 },
  { t: 60, bar: 23.26, psi: 337.3 },
];

const R410A: PontoSaturacao[] = [
  { t: -40, bar: 0.74, psi: 10.8 },
  { t: -35, bar: 1.17, psi: 17.0 },
  { t: -30, bar: 1.69, psi: 24.4 },
  { t: -25, bar: 2.29, psi: 33.1 },
  { t: -20, bar: 2.98, psi: 43.3 },
  { t: -15, bar: 3.79, psi: 55.0 },
  { t: -10, bar: 4.72, psi: 68.5 },
  { t: -5, bar: 5.78, psi: 83.8 },
  { t: 0, bar: 6.98, psi: 101.3 },
  { t: 5, bar: 8.34, psi: 120.9 },
  { t: 10, bar: 9.86, psi: 143.1 },
  { t: 15, bar: 11.57, psi: 167.8 },
  { t: 20, bar: 13.47, psi: 195.3 },
  { t: 25, bar: 15.57, psi: 225.9 },
  { t: 30, bar: 17.9, psi: 259.6 },
  { t: 35, bar: 20.46, psi: 296.7 },
  { t: 40, bar: 23.27, psi: 337.5 },
  { t: 45, bar: 26.34, psi: 382.1 },
  { t: 50, bar: 29.7, psi: 430.7 },
  { t: 55, bar: 33.35, psi: 483.7 },
  { t: 60, bar: 37.31, psi: 541.1 },
];

const R32: PontoSaturacao[] = [
  { t: -40, bar: 0.75, psi: 10.9 },
  { t: -35, bar: 1.18, psi: 17.2 },
  { t: -30, bar: 1.7, psi: 24.7 },
  { t: -25, bar: 2.31, psi: 33.5 },
  { t: -20, bar: 3.02, psi: 43.8 },
  { t: -15, bar: 3.84, psi: 55.7 },
  { t: -10, bar: 4.78, psi: 69.3 },
  { t: -5, bar: 5.86, psi: 85.0 },
  { t: 0, bar: 7.09, psi: 102.8 },
  { t: 5, bar: 8.47, psi: 122.9 },
  { t: 10, bar: 10.03, psi: 145.5 },
  { t: 15, bar: 11.78, psi: 170.8 },
  { t: 20, bar: 13.72, psi: 199.0 },
  { t: 25, bar: 15.88, psi: 230.4 },
  { t: 30, bar: 18.27, psi: 265.0 },
  { t: 35, bar: 20.89, psi: 303.1 },
  { t: 40, bar: 23.78, psi: 344.9 },
  { t: 45, bar: 26.93, psi: 390.6 },
  { t: 50, bar: 30.37, psi: 440.5 },
  { t: 55, bar: 34.11, psi: 494.8 },
  { t: 60, bar: 38.17, psi: 553.6 },
];

const R134A: PontoSaturacao[] = [
  { t: -40, bar: -0.5, psi: -7.3 },
  { t: -35, bar: -0.35, psi: -5.1 },
  { t: -30, bar: -0.17, psi: -2.5 },
  { t: -25, bar: 0.05, psi: 0.7 },
  { t: -20, bar: 0.31, psi: 4.6 },
  { t: -15, bar: 0.63, psi: 9.1 },
  { t: -10, bar: 0.99, psi: 14.4 },
  { t: -5, bar: 1.42, psi: 20.6 },
  { t: 0, bar: 1.91, psi: 27.8 },
  { t: 5, bar: 2.48, psi: 36.0 },
  { t: 10, bar: 3.13, psi: 45.4 },
  { t: 15, bar: 3.87, psi: 56.1 },
  { t: 20, bar: 4.7, psi: 68.2 },
  { t: 25, bar: 5.64, psi: 81.8 },
  { t: 30, bar: 6.69, psi: 97.0 },
  { t: 35, bar: 7.86, psi: 114.0 },
  { t: 40, bar: 9.15, psi: 132.8 },
  { t: 45, bar: 10.59, psi: 153.6 },
  { t: 50, bar: 12.17, psi: 176.5 },
  { t: 55, bar: 13.9, psi: 201.6 },
  { t: 60, bar: 15.8, psi: 229.2 },
];

const R290: PontoSaturacao[] = [
  { t: -40, bar: 0.1, psi: 1.4 },
  { t: -35, bar: 0.36, psi: 5.2 },
  { t: -30, bar: 0.67, psi: 9.7 },
  { t: -25, bar: 1.02, psi: 14.9 },
  { t: -20, bar: 1.44, psi: 20.8 },
  { t: -15, bar: 1.91, psi: 27.7 },
  { t: -10, bar: 2.44, psi: 35.4 },
  { t: -5, bar: 3.05, psi: 44.3 },
  { t: 0, bar: 3.73, psi: 54.2 },
  { t: 5, bar: 4.5, psi: 65.3 },
  { t: 10, bar: 5.35, psi: 77.7 },
  { t: 15, bar: 6.3, psi: 91.4 },
  { t: 20, bar: 7.35, psi: 106.6 },
  { t: 25, bar: 8.51, psi: 123.4 },
  { t: 30, bar: 9.77, psi: 141.8 },
  { t: 35, bar: 11.16, psi: 161.9 },
  { t: 40, bar: 12.68, psi: 183.9 },
  { t: 45, bar: 14.33, psi: 207.8 },
  { t: 50, bar: 16.12, psi: 233.7 },
  { t: 55, bar: 18.06, psi: 261.9 },
  { t: 60, bar: 20.15, psi: 292.3 },
];

/**
 * R-404A: National Refrigerants Reference Guide, 7ª edição (2020), página 39.
 * https://refrigerants.com/wp-content/uploads/2020/03/R404A_RefGuid.pdf
 * Conferido em 15/11/2026. Tuplas: [°F, pressão líquido psia, pressão vapor psia].
 * A fonte usa pressão ABSOLUTA: converter para gauge subtraindo 1 atm.
 * O ponto líquido de 125°F foi omitido: a própria publicação contém 384,4 psia,
 * maior que o ponto seguinte (370,6). Interpolar os vizinhos íntegros, sem corrigir
 * o número da fonte por suposição. A curva de vapor preserva esse ponto válido.
 */
const R404A_PONTOS: [number, number, number][] = [
  [-60, 11.8, 11.3], [-55, 13.5, 13], [-50, 15.4, 14.9],
  [-45, 17.6, 16.9], [-40, 19.9, 19.3], [-35, 22.5, 21.8],
  [-30, 25.4, 24.6], [-25, 28.5, 27.7], [-20, 31.9, 31],
  [-15, 35.6, 34.7], [-10, 39.7, 38.7], [-5, 44.1, 43],
  [0, 48.8, 47.7], [5, 54, 52.8], [10, 59.5, 58.3],
  [15, 65.5, 64.2], [20, 71.9, 70.5], [25, 78.7, 77.3],
  [30, 86.1, 84.6], [35, 93.9, 92.4], [40, 102.3, 100.7],
  [45, 111.2, 109.5], [50, 120.7, 118.9], [55, 130.7, 128.9],
  [60, 141.4, 139.6], [65, 152.8, 150.8], [70, 164.7, 162.8],
  [75, 177.4, 175.4], [80, 190.8, 188.8], [85, 204.9, 202.8],
  [90, 219.9, 217.7], [95, 235.6, 233.4], [100, 252.1, 249.9],
  [105, 269.5, 267.3], [110, 287.8, 285.5], [115, 307, 304.7],
  [120, 327.2, 324.9], [125, 384.4, 346.1], [130, 370.6, 368.4],
  [135, 394, 391.8], [140, 418.5, 416.4], [145, 444.3, 442.3],
  [150, 471.4, 469.6], [155, 500, 498.4],
];
const R404A_BUBBLE: PontoSaturacao[] = R404A_PONTOS.filter(([f]) => f !== 125).map(([f, absolute]) => {
  const psi = absolute - 14.695948776;
  return { t: (f - 32) * 5 / 9, psi, bar: psi / 14.503773773 };
});
const R404A_DEW: PontoSaturacao[] = R404A_PONTOS.map(([f, , absolute]) => {
  const psi = absolute - 14.695948776;
  return { t: (f - 32) * 5 / 9, psi, bar: psi / 14.503773773 };
});

const R407C_BUBBLE: PontoSaturacao[] = [
  { t: -40, bar: 0.19, psi: 2.8 },
  { t: -35, bar: 0.49, psi: 7.1 },
  { t: -30, bar: 0.86, psi: 12.5 },
  { t: -25, bar: 1.29, psi: 18.7 },
  { t: -20, bar: 1.79, psi: 26 },
  { t: -15, bar: 2.37, psi: 34.4 },
  { t: -10, bar: 3.03, psi: 43.9 },
  { t: -5, bar: 3.8, psi: 55.1 },
  { t: 0, bar: 4.67, psi: 67.7 },
  { t: 5, bar: 5.65, psi: 81.9 },
  { t: 10, bar: 6.75, psi: 97.9 },
  { t: 15, bar: 7.99, psi: 115.9 },
  { t: 20, bar: 9.36, psi: 135.8 },
  { t: 25, bar: 10.89, psi: 157.9 },
  { t: 30, bar: 12.58, psi: 182.5 },
  { t: 35, bar: 14.44, psi: 209.4 },
  { t: 40, bar: 16.48, psi: 239 },
  { t: 45, bar: 18.71, psi: 271.4 },
  { t: 50, bar: 21.15, psi: 306.8 },
  { t: 55, bar: 23.8, psi: 345.2 },
  { t: 60, bar: 26.68, psi: 387 },
];

const R407C_DEW: PontoSaturacao[] = [
  { t: -40, bar: -0.16, psi: -2.3 },
  { t: -35, bar: 0.08, psi: 1.2 },
  { t: -30, bar: 0.37, psi: 5.4 },
  { t: -25, bar: 0.72, psi: 10.4 },
  { t: -20, bar: 1.13, psi: 16.4 },
  { t: -15, bar: 1.62, psi: 23.5 },
  { t: -10, bar: 2.18, psi: 31.6 },
  { t: -5, bar: 2.84, psi: 41.2 },
  { t: 0, bar: 3.59, psi: 52.1 },
  { t: 5, bar: 4.46, psi: 64.7 },
  { t: 10, bar: 5.44, psi: 78.9 },
  { t: 15, bar: 6.54, psi: 94.9 },
  { t: 20, bar: 7.79, psi: 113 },
  { t: 25, bar: 9.19, psi: 133.3 },
  { t: 30, bar: 10.75, psi: 155.9 },
  { t: 35, bar: 12.48, psi: 181 },
  { t: 40, bar: 14.4, psi: 208.9 },
  { t: 45, bar: 16.52, psi: 239.6 },
  { t: 50, bar: 18.86, psi: 273.5 },
  { t: 55, bar: 21.44, psi: 311 },
  { t: 60, bar: 24.27, psi: 352 },
];

const R422D_BUBBLE: PontoSaturacao[] = [
  { t: -40, bar: 0.17, psi: 2.5 },
  { t: -35, bar: 0.46, psi: 6.7 },
  { t: -30, bar: 0.81, psi: 11.7 },
  { t: -25, bar: 1.22, psi: 17.7 },
  { t: -20, bar: 1.69, psi: 24.5 },
  { t: -15, bar: 2.25, psi: 32.6 },
  { t: -10, bar: 2.88, psi: 41.8 },
  { t: -5, bar: 3.61, psi: 52.4 },
  { t: 0, bar: 4.42, psi: 64.1 },
  { t: 5, bar: 5.35, psi: 77.6 },
  { t: 10, bar: 6.39, psi: 92.7 },
  { t: 15, bar: 7.54, psi: 109.4 },
  { t: 20, bar: 8.84, psi: 128.2 },
  { t: 25, bar: 10.27, psi: 149 },
  { t: 30, bar: 11.85, psi: 171.9 },
  { t: 35, bar: 13.6, psi: 197.3 },
  { t: 40, bar: 15.5, psi: 224.8 },
  { t: 45, bar: 17.6, psi: 255.3 },
  { t: 50, bar: 19.88, psi: 288.3 },
  { t: 55, bar: 22.37, psi: 324.5 },
  { t: 60, bar: 25.08, psi: 363.8 },
];

const R422D_DEW: PontoSaturacao[] = [
  { t: -40, bar: -0.08, psi: -1.2 },
  { t: -35, bar: 0.18, psi: 2.6 },
  { t: -30, bar: 0.49, psi: 7.1 },
  { t: -25, bar: 0.85, psi: 12.3 },
  { t: -20, bar: 1.28, psi: 18.6 },
  { t: -15, bar: 1.79, psi: 26 },
  { t: -10, bar: 2.37, psi: 34.4 },
  { t: -5, bar: 3.04, psi: 44.1 },
  { t: 0, bar: 3.81, psi: 55.3 },
  { t: 5, bar: 4.69, psi: 68 },
  { t: 10, bar: 5.67, psi: 82.2 },
  { t: 15, bar: 6.78, psi: 98.3 },
  { t: 20, bar: 8.03, psi: 116.5 },
  { t: 25, bar: 9.42, psi: 136.6 },
  { t: 30, bar: 10.95, psi: 158.8 },
  { t: 35, bar: 12.66, psi: 183.6 },
  { t: 40, bar: 14.54, psi: 210.9 },
  { t: 45, bar: 16.61, psi: 240.9 },
  { t: 50, bar: 18.88, psi: 273.8 },
  { t: 55, bar: 21.38, psi: 310.1 },
  { t: 60, bar: 24.11, psi: 349.7 },
];

const R438A_BUBBLE: PontoSaturacao[] = [
  { t: -40, bar: 0.12, psi: 1.7 },
  { t: -35, bar: 0.41, psi: 5.9 },
  { t: -30, bar: 0.75, psi: 10.9 },
  { t: -25, bar: 1.16, psi: 16.8 },
  { t: -20, bar: 1.62, psi: 23.5 },
  { t: -15, bar: 2.17, psi: 31.5 },
  { t: -10, bar: 2.79, psi: 40.5 },
  { t: -5, bar: 3.52, psi: 51.1 },
  { t: 0, bar: 4.33, psi: 62.8 },
  { t: 5, bar: 5.24, psi: 76 },
  { t: 10, bar: 6.28, psi: 91.1 },
  { t: 15, bar: 7.45, psi: 108.1 },
  { t: 20, bar: 8.73, psi: 126.6 },
  { t: 25, bar: 10.17, psi: 147.5 },
  { t: 30, bar: 11.74, psi: 170.3 },
  { t: 35, bar: 13.49, psi: 195.7 },
  { t: 40, bar: 15.39, psi: 223.2 },
  { t: 45, bar: 17.49, psi: 253.7 },
  { t: 50, bar: 19.77, psi: 286.7 },
  { t: 55, bar: 22.26, psi: 322.9 },
  { t: 60, bar: 24.95, psi: 361.9 },
];

const R438A_DEW: PontoSaturacao[] = [
  { t: -40, bar: -0.17, psi: -2.5 },
  { t: -35, bar: 0.06, psi: 0.9 },
  { t: -30, bar: 0.34, psi: 4.9 },
  { t: -25, bar: 0.68, psi: 9.9 },
  { t: -20, bar: 1.08, psi: 15.7 },
  { t: -15, bar: 1.55, psi: 22.5 },
  { t: -10, bar: 2.09, psi: 30.3 },
  { t: -5, bar: 2.73, psi: 39.6 },
  { t: 0, bar: 3.45, psi: 50 },
  { t: 5, bar: 4.28, psi: 62.1 },
  { t: 10, bar: 5.21, psi: 75.6 },
  { t: 15, bar: 6.28, psi: 91.1 },
  { t: 20, bar: 7.46, psi: 108.2 },
  { t: 25, bar: 8.79, psi: 127.5 },
  { t: 30, bar: 10.28, psi: 149.1 },
  { t: 35, bar: 11.92, psi: 172.9 },
  { t: 40, bar: 13.75, psi: 199.4 },
  { t: 45, bar: 15.76, psi: 228.6 },
  { t: 50, bar: 17.98, psi: 260.8 },
  { t: 55, bar: 20.43, psi: 296.3 },
  { t: 60, bar: 23.1, psi: 335 },
];

const R407A_BUBBLE: PontoSaturacao[] = [
  { t: -40, bar: 0.27, psi: 3.9 },
  { t: -35, bar: 0.59, psi: 8.6 },
  { t: -30, bar: 0.98, psi: 14.2 },
  { t: -25, bar: 1.43, psi: 20.7 },
  { t: -20, bar: 1.96, psi: 28.4 },
  { t: -15, bar: 2.57, psi: 37.3 },
  { t: -10, bar: 3.28, psi: 47.6 },
  { t: -5, bar: 4.08, psi: 59.2 },
  { t: 0, bar: 4.99, psi: 72.4 },
  { t: 5, bar: 6.02, psi: 87.3 },
  { t: 10, bar: 7.18, psi: 104.1 },
  { t: 15, bar: 8.48, psi: 123 },
  { t: 20, bar: 9.92, psi: 143.9 },
  { t: 25, bar: 11.52, psi: 167.1 },
  { t: 30, bar: 13.28, psi: 192.6 },
  { t: 35, bar: 15.22, psi: 220.7 },
  { t: 40, bar: 17.36, psi: 251.8 },
  { t: 45, bar: 19.69, psi: 285.6 },
  { t: 50, bar: 22.23, psi: 322.4 },
  { t: 55, bar: 25, psi: 362.6 },
  { t: 60, bar: 28, psi: 406.1 },
];

const R407A_DEW: PontoSaturacao[] = [
  { t: -40, bar: -0.07, psi: -1 },
  { t: -35, bar: 0.19, psi: 2.8 },
  { t: -30, bar: 0.51, psi: 7.4 },
  { t: -25, bar: 0.88, psi: 12.8 },
  { t: -20, bar: 1.33, psi: 19.3 },
  { t: -15, bar: 1.85, psi: 26.8 },
  { t: -10, bar: 2.46, psi: 35.7 },
  { t: -5, bar: 3.16, psi: 45.8 },
  { t: 0, bar: 3.97, psi: 57.6 },
  { t: 5, bar: 4.89, psi: 70.9 },
  { t: 10, bar: 5.94, psi: 86.2 },
  { t: 15, bar: 7.11, psi: 103.1 },
  { t: 20, bar: 8.44, psi: 122.4 },
  { t: 25, bar: 9.92, psi: 143.9 },
  { t: 30, bar: 11.57, psi: 167.8 },
  { t: 35, bar: 13.41, psi: 194.5 },
  { t: 40, bar: 15.44, psi: 223.9 },
  { t: 45, bar: 17.68, psi: 256.4 },
  { t: 50, bar: 20.15, psi: 292.3 },
  { t: 55, bar: 22.87, psi: 331.7 },
  { t: 60, bar: 25.86, psi: 375.1 },
];

/**
 * R-448A: tabela primária Solstice N40, ficha técnica 7900001, revisão 05/2026,
 * página 3. Conferida em 15/11/2026 na auditoria técnica da Área do Técnico.
 * https://prod-edam.solstice.com/content/dam/honeywell-edam/pmt/oneam/en-us/refrigerants/documents/7900001-ras-tds-solstice-n40-ltr-en.pdf
 * Tuplas: [pressão manométrica psig, temperatura bubble °F, temperatura dew °F].
 * A conversão para bar preserva gauge; NÃO subtrair atmosfera de novo.
 * Abaixo do primeiro ponto da curva, retornar null em vez de extrapolar.
 */
const R448A_PONTOS: [number, number, number][] = [
  [0, -51, -39.9], [1, -48.6, -37.5], [2, -46.2, -35.2],
  [3, -44, -32.9], [4, -41.9, -30.8], [5, -39.8, -28.8],
  [6, -37.8, -26.9], [7, -35.9, -25], [8, -34.1, -23.2],
  [9, -32.4, -21.4], [10, -30.6, -19.7], [11, -29, -18.1],
  [12, -27.4, -16.5], [13, -25.8, -15], [14, -24.3, -13.5],
  [16, -21.4, -10.6], [18, -18.6, -7.8], [20, -16, -5.2],
  [22, -13.5, -2.7], [24, -11, -0.3], [26, -8.7, 2],
  [28, -6.5, 4.2], [29, -5.4, 5.3], [31, -3.3, 7.4],
  [34, -0.2, 10.4], [37, 2.7, 13.3], [40, 5.5, 16],
  [43, 8.2, 18.7], [46, 10.8, 21.2], [49, 13.2, 23.7],
  [52, 15.6, 26], [55, 17.9, 28.3], [59, 20.9, 31.2],
  [63, 23.8, 34], [67, 26.5, 36.7], [83, 36.5, 46.6],
  [101, 46.5, 56.3], [121, 56.2, 65.9], [142, 65.4, 74.9],
  [154, 70.2, 79.6], [167, 75.1, 84.4], [181, 80.2, 89.3],
  [196, 85.3, 94.3], [212, 90.5, 99.3], [229, 95.7, 104.3],
  [246, 100.7, 109.1], [264, 105.6, 113.9], [284, 110.9, 119],
  [304, 115.9, 123.8], [325, 121, 128.6], [348, 126.2, 133.6],
  [349, 126.4, 133.8], [372, 131.4, 138.5], [397, 136.6, 143.4],
  [423, 141.8, 148.3], [450, 146.9, 153],
];
const R448A_BUBBLE: PontoSaturacao[] = R448A_PONTOS.map(([psi, bubble]) => ({
  t: (bubble - 32) * 5 / 9, psi, bar: psi / 14.503773773,
}));
const R448A_DEW: PontoSaturacao[] = R448A_PONTOS.map(([psi, , dew]) => ({
  t: (dew - 32) * 5 / 9, psi, bar: psi / 14.503773773,
}));

const R449A_BUBBLE: PontoSaturacao[] = [
  { t: -40, bar: 0.31, psi: 4.5 },
  { t: -35, bar: 0.64, psi: 9.3 },
  { t: -30, bar: 1.04, psi: 15.1 },
  { t: -25, bar: 1.5, psi: 21.8 },
  { t: -20, bar: 2.03, psi: 29.4 },
  { t: -15, bar: 2.66, psi: 38.6 },
  { t: -10, bar: 3.37, psi: 48.9 },
  { t: -5, bar: 4.18, psi: 60.6 },
  { t: 0, bar: 5.11, psi: 74.1 },
  { t: 5, bar: 6.15, psi: 89.2 },
  { t: 10, bar: 7.31, psi: 106 },
  { t: 15, bar: 8.62, psi: 125 },
  { t: 20, bar: 10.07, psi: 146.1 },
  { t: 25, bar: 11.68, psi: 169.4 },
  { t: 30, bar: 13.45, psi: 195.1 },
  { t: 35, bar: 15.39, psi: 223.2 },
  { t: 40, bar: 17.53, psi: 254.3 },
  { t: 45, bar: 19.86, psi: 288 },
  { t: 50, bar: 22.4, psi: 324.9 },
  { t: 55, bar: 25.16, psi: 364.9 },
  { t: 60, bar: 28.15, psi: 408.3 },
];

const R449A_DEW: PontoSaturacao[] = [
  { t: -40, bar: 0, psi: 0 },
  { t: -35, bar: 0.27, psi: 3.9 },
  { t: -30, bar: 0.6, psi: 8.7 },
  { t: -25, bar: 0.99, psi: 14.4 },
  { t: -20, bar: 1.44, psi: 20.9 },
  { t: -15, bar: 1.98, psi: 28.7 },
  { t: -10, bar: 2.6, psi: 37.7 },
  { t: -5, bar: 3.31, psi: 48 },
  { t: 0, bar: 4.13, psi: 59.9 },
  { t: 5, bar: 5.06, psi: 73.4 },
  { t: 10, bar: 6.11, psi: 88.6 },
  { t: 15, bar: 7.3, psi: 105.9 },
  { t: 20, bar: 8.63, psi: 125.2 },
  { t: 25, bar: 10.11, psi: 146.6 },
  { t: 30, bar: 11.76, psi: 170.6 },
  { t: 35, bar: 13.59, psi: 197.1 },
  { t: 40, bar: 15.62, psi: 226.5 },
  { t: 45, bar: 17.85, psi: 258.9 },
  { t: 50, bar: 20.31, psi: 294.6 },
  { t: 55, bar: 23.01, psi: 333.7 },
  { t: 60, bar: 25.98, psi: 376.8 },
];

const R12: PontoSaturacao[] = [
  { t: -40, bar: -0.37, psi: -5.4 },
  { t: -35, bar: -0.21, psi: -3 },
  { t: -30, bar: -0.01, psi: -0.1 },
  { t: -25, bar: 0.22, psi: 3.2 },
  { t: -20, bar: 0.49, psi: 7.1 },
  { t: -15, bar: 0.81, psi: 11.7 },
  { t: -10, bar: 1.17, psi: 17 },
  { t: -5, bar: 1.59, psi: 23.1 },
  { t: 0, bar: 2.07, psi: 30 },
  { t: 5, bar: 2.61, psi: 37.9 },
  { t: 10, bar: 3.21, psi: 46.6 },
  { t: 15, bar: 3.89, psi: 56.4 },
  { t: 20, bar: 4.65, psi: 67.4 },
  { t: 25, bar: 5.49, psi: 79.6 },
  { t: 30, bar: 6.42, psi: 93.1 },
  { t: 35, bar: 7.45, psi: 108.1 },
  { t: 40, bar: 8.57, psi: 124.3 },
  { t: 45, bar: 9.81, psi: 142.3 },
  { t: 50, bar: 11.15, psi: 161.7 },
  { t: 55, bar: 12.62, psi: 183 },
  { t: 60, bar: 14.21, psi: 206.1 },
];

/** Catálogo de refrigerantes suportados (ordem de exibição). */
export const REFRIGERANTES: Refrigerante[] = [
  { id: 'R-410A', nome: 'R-410A', cor: '#EC6FAA', inflamabilidade: 'A1', temGlide: false, unica: R410A },
  { id: 'R-22', nome: 'R-22', cor: '#7AC74F', inflamabilidade: 'A1', temGlide: false, unica: R22 },
  { id: 'R-32', nome: 'R-32', cor: '#EF4444', inflamabilidade: 'A2L', temGlide: false, unica: R32 },
  { id: 'R-134a', nome: 'R-134a', cor: '#56B4E9', inflamabilidade: 'A1', temGlide: false, unica: R134A },
  { id: 'R-290', nome: 'R-290 (Propano)', cor: '#EF4444', inflamabilidade: 'A3', temGlide: false, unica: R290 },
  {
    id: 'R-404A',
    nome: 'R-404A',
    cor: '#F97316',
    inflamabilidade: 'A1',
    temGlide: true,
    bubble: R404A_BUBBLE,
    dew: R404A_DEW,
  },
  {
    id: 'R-407C',
    nome: 'R-407C',
    cor: '#8B5E3C',
    inflamabilidade: 'A1',
    temGlide: true,
    bubble: R407C_BUBBLE,
    dew: R407C_DEW,
  },
  {
    id: 'R-422D',
    nome: 'R-422D',
    cor: '#A0522D',
    inflamabilidade: 'A1',
    temGlide: true,
    bubble: R422D_BUBBLE,
    dew: R422D_DEW,
  },
  {
    id: 'R-438A',
    nome: 'R-438A',
    cor: '#B5651D',
    inflamabilidade: 'A1',
    temGlide: true,
    bubble: R438A_BUBBLE,
    dew: R438A_DEW,
  },
  {
    id: 'R-407A',
    nome: 'R-407A',
    cor: '#6B8E23',
    inflamabilidade: 'A1',
    temGlide: true,
    bubble: R407A_BUBBLE,
    dew: R407A_DEW,
  },
  {
    id: 'R-448A',
    nome: 'R-448A',
    cor: '#4F7942',
    inflamabilidade: 'A1',
    temGlide: true,
    bubble: R448A_BUBBLE,
    dew: R448A_DEW,
  },
  {
    id: 'R-449A',
    nome: 'R-449A',
    cor: '#558B2F',
    inflamabilidade: 'A1',
    temGlide: true,
    bubble: R449A_BUBBLE,
    dew: R449A_DEW,
  },
  { id: 'R-12', nome: 'R-12', cor: '#CFD4DA', inflamabilidade: 'A1', temGlide: false, unica: R12 },
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
export const FAIXA_SH = { min: 4, max: 8 } as const; // típico TXV
export const FAIXA_SC = { min: 4, max: 8 } as const; // default seguro 6–7 °C

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
