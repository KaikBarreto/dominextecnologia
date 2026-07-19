/**
 * Ilustração do ciclo de refrigeração — diagrama SVG inline, original (sem arte
 * de terceiros), no estilo CLÁSSICO de manual técnico (orientação paisagem).
 *
 * LAYOUT (compressor SEMPRE EMBAIXO — régua do CEO):
 *   - Compressor: BAIXO-CENTRO, símbolo de círculo com cunha de compressão.
 *     Fica INLINE com a linha horizontal de baixo: sucção entra pela ESQUERDA
 *     e descarga sai pela DIREITA, ambas na ALTURA DO CENTRO do compressor.
 *   - Evaporador: ESQUERDA, CAIXA AZUL (fria) com SERPENTINA em MEANDRO.
 *   - Condensador: DIREITA, CAIXA LARANJA (quente) com SERPENTINA em MEANDRO.
 *   - Válvula de Expansão: TOPO-CENTRO, símbolo de bowtie, inline na linha
 *     de cima (a linha passa pelo centro dela, igual ao compressor embaixo).
 *
 * SERPENTINAS: cada caixa tem uma serpentina em meandro/boustrophedon — ~5
 * passagens horizontais paralelas conectadas por curvas em U nas pontas,
 * alternando o lado (vai-e-volta), como em trocador de calor real. A geometria
 * é calculada (array de Ys + map) para ficar regular. A entrada e a saída da
 * serpentina conectam coerentemente às linhas do ciclo, com a curva fluindo no
 * MESMO sentido da fileira (sem U invertido) e o trecho final AFINANDO até a
 * linha externa (transição tubo↔linha como peça única, sem degrau).
 *
 * LOOP FECHADO (linhas grossas com seta tocando cada componente, sem pontas soltas):
 *   - Sucção (azul):   Evaporador (base) → Compressor (esquerda)   — vapor baixa pressão
 *   - Descarga (laranja): Compressor (direita) → Condensador (base) — vapor alta pressão
 *   - Líquido (laranja):  Condensador (topo) → Válvula (lado dir.)  — líquido alta pressão
 *   - Expansão (azul):    Válvula (lado esq.) → Evaporador (topo)   — líquido/vapor baixa pressão
 *
 * CORES DE PRESSÃO: lado ESQUERDO = baixa (azul/frio); lado DIREITO = alta
 * (laranja/quente). Fundo dividido em duas metades translúcidas.
 *
 * RÓTULOS: "COMPRESSOR", "EVAPORADOR", "CONDENSADOR" e "VÁLVULA DE EXPANSÃO" em
 * CAIXA ALTA, negrito e fonte GRANDE (ênfase). Evaporador/Condensador na vertical.
 *
 * TOOLTIP: implementação própria via React state + áreas de hit transparentes
 * (SVG só detecta hover no pixel pintado, então cada item tem um <rect>/região
 * com fill transparente clicável cobrindo forma + rótulo). O tooltip é um <div>
 * HTML sobreposto, instantâneo, posicionado perto do cursor. SVG leve, sem
 * imagens externas (PWA offline). Cores via tokens/Tailwind em dark mode.
 */

import { useEffect, useState } from "react";
import { useIsDark } from "@/hooks/useIsDark";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAppLocaleContext } from "@/contexts/AppLocaleContext";
import { MESSAGES } from "@/lib/i18n/messages";

const TIPS = {
  compressor: {
    titulo: "Compressor",
    descricao:
      "Aspira o vapor frio de baixa pressão e o comprime, elevando muito a pressão e a temperatura. É aqui que o lado de baixa vira alta pressão — o 'coração' do sistema.",
  },
  condensador: {
    titulo: "Condensador",
    descricao:
      "Recebe o vapor quente de alta pressão e troca calor com o ar externo. O gás esfria e se condensa, virando líquido de alta pressão. É onde o calor é jogado para fora.",
  },
  evaporador: {
    titulo: "Evaporador",
    descricao:
      "Recebe o líquido frio de baixa pressão, que evapora absorvendo calor do ambiente — é aqui que o ar é resfriado. Sai como vapor frio de baixa pressão.",
  },
  expansao: {
    titulo: "Válvula de expansão",
    descricao:
      "Restringe a passagem do líquido de alta pressão e provoca uma queda brusca de pressão. O líquido vira uma mistura fria de baixa pressão antes de entrar no evaporador. Pode ser válvula termostática, eletrônica (EEV) ou tubo capilar.",
  },
  linhaDescarga: {
    titulo: "Linha de descarga",
    descricao:
      "Tubo entre o compressor e o condensador. Carrega o vapor quente em alta pressão recém-comprimido.",
  },
  linhaLiquido: {
    titulo: "Linha de líquido",
    descricao:
      "Tubo entre o condensador e a válvula de expansão. Carrega o refrigerante líquido em alta pressão.",
  },
  linhaExpansao: {
    titulo: "Linha de expansão",
    descricao:
      "Tubo entre a válvula de expansão e o evaporador. Carrega a mistura líquido-vapor fria em baixa pressão.",
  },
  linhaSuccao: {
    titulo: "Linha de sucção",
    descricao:
      "Tubo entre o evaporador e o compressor. Carrega vapor frio em baixa pressão. É aqui que se medem a pressão e a temperatura para calcular o superaquecimento.",
  },
  manometro: {
    titulo: "Manômetro",
    descricao:
      "Mede a pressão na linha de sucção. Convertida em temperatura de saturação (pela tabela do gás), é a base do cálculo de superaquecimento.",
  },
  termometro: {
    titulo: "Termômetro",
    descricao:
      "Mede a temperatura real do tubo na linha de sucção. O superaquecimento é essa temperatura menos a temperatura de saturação.",
  },
  altaPressao: {
    titulo: "Alta pressão",
    descricao:
      "Lado de alta pressão: da saída do compressor, passando pelo condensador, até a entrada da válvula de expansão.",
  },
  baixaPressao: {
    titulo: "Baixa pressão",
    descricao:
      "Lado de baixa pressão: da saída da válvula de expansão, passando pelo evaporador, até a sucção do compressor.",
  },
} as const;

type TipKey = keyof typeof TIPS;

// `d` do ícone vetorial de compressor (path principal extraído do SVG de origem).
// O SVG original mapeia coords grandes para 600x575 via o transform
// `translate(0,575) scale(0.066667,-0.066667)` — replicado abaixo (INNER).
export const COMPRESSOR_ICON_D =
  "M3225 7493 l0 -338 83 0 82 0 0 -112 0 -111 -454 -5 -453 -4 -86 -43 c-98 -47 -212 -167 -239 -250 -10 -29 -53 -87 -96 -128 -195 -188 -184 -39 -180 -2596 l4 -2176 39 -87 c22 -47 60 -112 86 -144 l47 -59 -43 0 c-34 0 -67 24 -147 105 l-105 105 -458 0 -457 0 0 -532 0 -533 2891 0 2891 0 0 533 0 532 -455 0 -455 0 -101 -105 c-82 -84 -111 -105 -147 -105 l-45 0 49 56 c97 110 125 200 131 412 l6 190 587 5 c508 4 595 8 640 30 173 81 284 237 297 419 l7 102 54 9 c144 21 389 89 515 141 l140 58 3 556 4 557 135 -10 135 -9 0 535 0 536 -135 -10 -135 -11 0 382 0 382 -154 61 c-84 33 -204 72 -266 87 -62 14 -121 28 -131 31 -14 4 -19 70 -19 268 l0 263 83 0 82 0 0 341 0 342 -521 -4 -521 -3 -5 -339 -4 -340 85 5 84 6 2 -267 3 -267 -38 -9 c-147 -33 -237 -60 -371 -112 l-154 -60 0 -382 0 -381 -202 0 -202 0 -4 612 -4 611 -50 100 c-30 62 -76 125 -121 165 -40 36 -78 82 -84 102 -20 66 -99 179 -160 227 -123 97 -160 103 -647 103 l-438 0 0 112 0 113 86 0 86 0 0 338 0 337 -525 0 -525 0 0 -337z m795 0 l0 -83 -90 0 -90 0 0 -327 0 -327 -94 2 -93 3 5 324 6 325 -92 0 -92 0 0 83 0 82 270 0 270 0 0 -82z m3180 -668 l0 -75 -82 0 -83 0 -4 -461 -3 -460 -94 -3 -94 -2 0 464 0 464 -86 -4 -86 -4 -1 78 -2 78 268 0 267 0 0 -75z m-2205 -187 c56 -29 105 -99 115 -165 l9 -53 -1376 0 -1375 0 9 49 c13 62 51 115 113 157 l49 34 1206 0 c1038 0 1213 -3 1250 -22z m223 -307 c46 -25 102 -106 119 -173 23 -90 23 -4295 0 -4385 -20 -80 -107 -175 -174 -190 -41 -9 -45 -16 -52 -85 -8 -88 -45 -145 -117 -182 -88 -44 -2423 -40 -2503 5 -69 39 -108 102 -112 180 -3 55 -8 62 -77 96 -43 22 -90 61 -112 93 l-37 55 -5 2184 c-2 1201 0 2205 5 2232 9 54 68 131 128 167 49 30 2881 33 2937 3z m2035 -639 c66 -12 167 -38 225 -57 l105 -35 4 -370 4 -370 -661 0 -660 0 0 366 0 366 59 23 c261 105 608 134 924 77z m607 -1199 l0 -263 -1204 0 -1203 0 0 262 0 263 1203 0 1204 0 0 -262z m-270 -915 l0 -547 -121 -38 c-349 -110 -726 -110 -1073 0 l-126 41 0 545 0 546 660 0 660 0 0 -547z m-1571 -164 l4 -555 120 -51 c131 -56 433 -138 507 -138 77 -1 93 -19 77 -85 l-14 -57 -552 -4 -551 -4 0 725 0 726 202 0 203 -1 4 -556z m-4256 -2139 l105 -102 1875 1 1875 0 105 102 105 102 269 3 269 4 1 -265 1 -265 -2629 0 -2629 0 0 260 c0 143 3 263 6 266 4 4 127 4 274 2 l268 -5 105 -103z";

/**
 * Ícone vetorial de compressor centralizado em (cx, cy) e escalado para caber
 * dentro do círculo do compressor. O path original mapeia para 600x575 via o
 * transform INNER `translate(0,575) scale(0.066667,-0.066667)`; depois o grupo
 * é escalado por `scale` e transladado para centralizar o bounding 600x575 em
 * (cx, cy). `fill` theme-aware (branco no escuro, preto no claro) para contrastar
 * com o círculo (preto no escuro / transparente no claro).
 */
function CompressorIcon({ cx, cy, scale, fill }: { cx: number; cy: number; scale: number; fill: string }) {
  const w = 600 * scale;
  const h = 575 * scale;
  const tx = cx - w / 2;
  const ty = cy - h / 2;
  return (
    <g transform={`translate(${tx} ${ty}) scale(${scale}) translate(0,575) scale(0.066667,-0.066667)`}>
      <path d={COMPRESSOR_ICON_D} fill={fill} stroke="none" />
    </g>
  );
}

// Paths do ícone vetorial de TERMÔMETRO (viewBox 32×64), extraídos do SVG de
// origem. O `fill` original era preto; aqui é sobrescrito pela cor da linha de
// sucção (azul theme-aware).
const TERMOMETRO_ICON_PATHS = [
  "M14 63.5C21.72 63.5 28 57.21 28 49.49C28 44.55 25.4 39.99 21.19 37.47V7.17999C21.19 3.21997 17.96 0 14 0C10.04 0 6.81 3.21997 6.81 7.17999V37.47C2.59998 39.99 0 44.55 0 49.49C0 57.21 6.27997 63.5 14 63.5ZM9.13806 40.743L10.8114 39.8148V7.18347C10.8114 5.42517 12.2416 3.995 13.9999 3.995C15.7582 3.995 17.1888 5.42517 17.1888 7.18347V39.8148L18.8622 40.743C22.0336 42.5028 24.0038 45.8549 24.0038 49.4911C24.0038 55.0072 19.516 59.495 13.9999 59.495C8.48377 59.495 3.99597 55.0072 3.99597 49.4911C3.99597 45.8553 5.96619 42.5033 9.13806 40.743Z",
  "M14 57.9961C18.689 57.9961 22.5039 54.1812 22.5039 49.4922C22.5039 46.4004 20.8296 43.5513 18.1348 42.0557L16.0752 40.9131C15.8369 40.7808 15.689 40.5298 15.689 40.2573V7.18457C15.689 6.23779 14.9473 5.49609 14 5.49609C13.0688 5.49609 12.3115 6.25342 12.3115 7.18457V40.2573C12.3115 40.5298 12.1636 40.7808 11.9253 40.9131L9.86572 42.0557C7.17041 43.5513 5.49609 46.4009 5.49609 49.4922C5.49609 54.1812 9.31104 57.9961 14 57.9961Z",
  "M28.6187 9.76953H24.4375V11.2695H28.6187V9.76953Z",
  "M31.6187 3.99609H24.4375V5.49609H31.6187V3.99609Z",
  "M31.6187 15.543H24.4375V17.043H31.6187V15.543Z",
  "M29.6187 21.3203H24.4375V22.8203H29.6187V21.3203Z",
  "M28.6187 27.0938H24.4375V28.5938H28.6187V27.0938Z",
  "M31.6187 32.8711H24.4375V34.3711H31.6187V32.8711Z",
];

/**
 * Ícone vetorial de TERMÔMETRO centralizado em (cx, cy), escalado para `height`
 * px de altura (viewBox nativo 32×64). `fill` theme-aware (cor da linha de
 * sucção / baixa pressão — azul). Substitui o marcador antigo na linha de sucção.
 */
function TermometroIcon({ cx, cy, height, fill }: { cx: number; cy: number; height: number; fill: string }) {
  const scale = height / 64;
  const w = 32 * scale;
  const h = 64 * scale;
  const tx = cx - w / 2;
  const ty = cy - h / 2;
  return (
    <g transform={`translate(${tx} ${ty}) scale(${scale})`}>
      {TERMOMETRO_ICON_PATHS.map((d, i) => (
        <path key={i} d={d} fill={fill} stroke="none" />
      ))}
    </g>
  );
}

// `d` do ícone vetorial de MANÔMETRO (viewBox 92×80), extraído do SVG de origem.
// O `fill` original era preto; aqui é sobrescrito pela cor da linha de sucção
// (azul theme-aware), igual ao termômetro.
const MANOMETRO_ICON_D =
  "M68 80H24C23.4477 80 23 79.5523 23 79V65C23 64.4477 23.4477 64 24 64H68C68.5523 64 69 64.4477 69 65V79C69 79.5523 68.5523 80 68 80ZM1 66C0.45 66 0 66.45 0 67V77C0 77.55 0.45 78 1 78H20V66H1ZM91 66H72V78H91C91.55 78 92 77.55 92 77V67C92 66.45 91.55 66 91 66ZM46 28.5C46.8271 28.5 47.5 27.8271 47.5 27C47.5 26.1729 46.8271 25.5 46 25.5C45.1729 25.5 44.5 26.1729 44.5 27C44.5 27.8271 45.1729 28.5 46 28.5ZM57.2573 40.3787C54.2115 42.9457 50.2857 44.5 46 44.5C41.7143 44.5 37.7885 42.9457 34.7427 40.3787L36.4541 38.667C37.04 38.0816 37.04 37.1314 36.4541 36.5459C35.8682 35.96 34.9189 35.96 34.333 36.5459L32.6214 38.2575C30.3575 35.5715 28.8922 32.199 28.576 28.5H31C31.8286 28.5 32.5 27.8286 32.5 27C32.5 26.1714 31.8286 25.5 31 25.5H28.576C28.8922 21.801 30.3576 18.4285 32.6214 15.7425L34.333 17.4541C34.626 17.7471 35.0098 17.8936 35.3935 17.8936C35.7772 17.8936 36.1611 17.7471 36.454 17.4541C37.0399 16.8687 37.0399 15.9185 36.454 15.333L34.7424 13.6214C37.4284 11.3575 40.8009 9.8922 44.4999 9.576V12C44.4999 12.8286 45.1713 13.5 45.9999 13.5C46.8285 13.5 47.4999 12.8286 47.4999 12V9.576C51.1989 9.8922 54.5714 11.3576 57.2574 13.6214L55.5458 15.333C54.9599 15.9184 54.9599 16.8686 55.5458 17.4541C55.8388 17.7471 56.2226 17.8936 56.6063 17.8936C56.99 17.8936 57.3739 17.7471 57.6668 17.4541L59.3784 15.7425C61.6423 18.4285 63.1076 21.801 63.4238 25.5H60.9998C60.1712 25.5 59.4998 26.1714 59.4998 27C59.4998 27.8286 60.1712 28.5 60.9998 28.5H63.4238C63.1076 32.199 61.6422 35.5715 59.3784 38.2575L57.6668 36.5459C57.0809 35.96 56.1316 35.96 55.5457 36.5459C54.9598 37.1313 54.9598 38.0815 55.5457 38.667L57.2573 40.3787ZM41.5 27C41.5 29.4814 43.5186 31.5 46 31.5C48.4814 31.5 50.5 29.4814 50.5 27C50.5 25.6785 49.917 24.5002 49.007 23.6763L51.1865 18.4361C51.5049 17.671 51.1426 16.793 50.3779 16.4752C49.6118 16.1568 48.7348 16.5191 48.417 17.2838L46.2375 22.5241C46.1572 22.5198 46.0813 22.5001 46 22.5001C43.5186 22.5001 41.5 24.5186 41.5 27ZM52.5 37C52.5 36.1714 51.8286 35.5 51 35.5H41C40.1714 35.5 39.5 36.1714 39.5 37C39.5 37.8286 40.1714 38.5 41 38.5H51C51.8286 38.5 52.5 37.8286 52.5 37ZM73 27C73 39.85 64.02 50.6 52 53.32V61H40V53.32C27.98 50.6 19 39.85 19 27C19 12.09 31.09 0 46 0C60.91 0 73 12.09 73 27ZM66.5 27C66.5 21.37 64.22 16.27 60.53 12.56C60.52 12.54 60.51 12.52 60.5 12.5C60.48 12.49 60.46 12.48 60.44 12.47C56.73 8.78 51.63 6.5 46 6.5C40.37 6.5 35.27 8.78 31.56 12.47C31.54 12.48 31.52 12.49 31.5 12.5C31.49 12.52 31.48 12.54 31.47 12.56C27.78 16.27 25.5 21.37 25.5 27C25.5 32.63 27.78 37.73 31.47 41.44C31.48 41.46 31.49 41.48 31.5 41.5C31.52 41.51 31.54 41.52 31.56 41.53C35.27 45.22 40.37 47.5 46 47.5C51.63 47.5 56.73 45.22 60.44 41.53C60.46 41.52 60.48 41.51 60.5 41.5C60.51 41.48 60.52 41.46 60.53 41.44C64.22 37.73 66.5 32.63 66.5 27Z";

/**
 * Ícone vetorial de MANÔMETRO centralizado em (cx, cy), escalado para `height`
 * px de altura (viewBox nativo 92×80). `fill` theme-aware (cor da linha de
 * sucção / baixa pressão — azul). Substitui o mostrador improvisado antigo.
 */
function ManometroIcon({ cx, cy, height, fill }: { cx: number; cy: number; height: number; fill: string }) {
  const scale = height / 80;
  const w = 92 * scale;
  const h = 80 * scale;
  const tx = cx - w / 2;
  const ty = cy - h / 2;
  return (
    <g transform={`translate(${tx} ${ty}) scale(${scale})`}>
      <path d={MANOMETRO_ICON_D} fill={fill} stroke="none" />
    </g>
  );
}

/**
 * Gera o `d` de uma serpentina em MEANDRO como UM ÚNICO PATH CONTÍNUO, que
 * COMEÇA no tubo externo de entrada (centro-x na borda da caixa), entra no
 * meandro por uma CURVA suave que FLUI NO MESMO SENTIDO da 1ª fileira (sem
 * U invertido), percorre `rows` fileiras horizontais ligadas por curvas em U
 * nas pontas, e SAI por outra curva suave de volta ao tubo externo de saída.
 *
 * `entry`/`exit` = 'top' | 'bottom' indicam por onde o tubo externo conecta
 * (com o compressor EMBAIXO e a válvula EM CIMA):
 *   - Evaporador: entry='top' (expansão vem da válvula no topo), exit='bottom' (sucção desce ao compressor).
 *   - Condensador: entry='bottom' (descarga vem do compressor embaixo), exit='top' (líquido sobe à válvula).
 *
 * IMPORTANTE: é UM ÚNICO path com ESPESSURA UNIFORME (sem trechos afilados). As
 * pontas de ENTRADA e de SAÍDA usam EXATAMENTE a mesma construção (espelhada):
 * stub vertical pelo centro-x até `±r` da fileira, curva quadrática suave para
 * dentro/fora da fileira, fundindo na linha externa sem degrau nem ponta solta.
 * Tudo desenhado com o mesmo `stroke-width` das linhas externas (4).
 *
 * Retorna { d, entryX, entryY, exitX, exitY }.
 */
function meanderPath(opts: {
  left: number;
  right: number;
  top: number;
  bottom: number;
  cx: number;
  boxTop: number;
  boxBottom: number;
  rows: number;
  entry: "top" | "bottom";
  exit: "top" | "bottom";
}): {
  d: string;
  entryX: number;
  entryY: number;
  exitX: number;
  exitY: number;
} {
  const { left, right, top, bottom, cx, boxTop, boxBottom, rows, entry, exit } = opts;

  // Fileiras horizontais (Ys regulares), do topo para a base.
  const ys: number[] = [];
  const gap = (bottom - top) / (rows - 1);
  for (let i = 0; i < rows; i++) ys.push(top + gap * i);

  // Pontos de borda onde a linha externa toca a caixa (centro-x).
  const entryY = entry === "top" ? boxTop : boxBottom;
  const exitY = exit === "top" ? boxTop : boxBottom;

  // ORDEM das fileiras: começamos pela fileira mais próxima da ENTRADA, para
  // que entrada e saída fiquem em bordas opostas (tubo passante).
  const order =
    entry === "top"
      ? ys.map((_, i) => i) // 0,1,2,... (cima → baixo)
      : ys.map((_, i) => rows - 1 - i); // baixo → cima

  const firstY = ys[order[0]];
  const lastY = ys[order[order.length - 1]];

  const r = gap / 2;
  // Sentido vertical do stub que sai da BORDA rumo à 1ª fileira. Se a entrada é
  // pelo topo (boxTop, acima da 1ª fileira), o stub DESCE (+1); se é pela base,
  // o stub SOBE (-1). Igual para a saída.
  const entryStubDir = firstY > entryY ? 1 : -1; // borda → fileira
  const exitStubDir = exitY > lastY ? 1 : -1; // fileira → borda

  // ---- PONTA DE ENTRADA: borda → stub vertical pelo centro → curva p/ a 1ª
  // fileira (sentido DIREITA), fundindo na fileira sem degrau.
  let d = `M ${cx} ${entryY}`;
  d += ` L ${cx} ${firstY - entryStubDir * r}`;
  d += ` Q ${cx} ${firstY} ${cx + r} ${firstY}`;
  d += ` L ${right} ${firstY}`;

  // ---- CORPO do meandro: vai-e-vem pelas fileiras seguintes.
  // Na ÚLTIMA fileira NÃO cruzamos até a borda oposta: paramos exatamente no
  // ponto onde a ponta de saída inicia a curva (towardCenterX), pra não sobrar
  // RETA solta indo até a borda e voltando. Por isso precisamos saber, ANTES,
  // de que lado a última fileira começa (após sua curva em U).
  let side: "left" | "right" = "right"; // lado em que estamos AGORA (direita)
  for (let k = 1; k < order.length; k++) {
    const y = ys[order[k]];
    const prevY = ys[order[k - 1]];
    const uR = Math.abs(y - prevY) / 2;
    const x = side === "left" ? left : right;
    const goingDown = y > prevY;
    const sweep = side === "left" ? (goingDown ? 0 : 1) : goingDown ? 1 : 0;
    // curva em U na ponta `side`, da fileira anterior para a atual
    d += ` A ${uR} ${uR} 0 0 ${sweep} ${x} ${y}`;

    const isLastRow = k === order.length - 1;
    // lado de onde a fileira atual PARTE, após a curva em U (oposto a `side`).
    const startX = side === "left" ? left : right;
    if (isLastRow) {
      // termina a fileira no ponto da curva de saída (sem reta até a borda).
      const towardCenterX = startX > cx ? cx + r : cx - r;
      d += ` L ${towardCenterX} ${y}`;
    } else {
      // cruza a fileira para o lado oposto
      const target = side === "left" ? right : left;
      d += ` L ${target} ${y}`;
    }
    side = side === "left" ? "right" : "left";
  }

  // ---- PONTA DE SAÍDA: curva quadrática suave do fim da última fileira para o
  // centro-x e sobe/desce o stub vertical até a borda, fundindo na linha externa
  // sem degrau nem ponta solta. (A última fileira já parou em towardCenterX.)
  d += ` Q ${cx} ${lastY} ${cx} ${lastY + exitStubDir * r}`;
  d += ` L ${cx} ${exitY}`;

  return {
    d,
    entryX: cx,
    entryY,
    exitX: cx,
    exitY,
  };
}

export function CicloRefrigeracaoIlustracao() {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.technicianTools;

  // No tema escuro o fundo das peças é preto; no claro fica transparente para a
  // zona de cor aparecer atrás (borda/serpentina/ícone seguem iguais).
  const isDark = useIsDark();
  const pecaFill = isDark ? "#000" : "transparent";
  // Ícone do compressor: branco no escuro (contrasta com o círculo preto),
  // preto no claro (contrasta com o fundo claro).
  const compIconFill = isDark ? "#fff" : "#000";
  // Ícone do termômetro na linha de sucção: cor da linha de baixa pressão
  // (azul) theme-aware — sky-500 no claro, sky-400 no escuro (igual aos outros
  // elementos azuis do diagrama).
  const termoIconFill = isDark ? "#38bdf8" : "#0ea5e9";

  // MOBILE: NÃO há mais rotação. O mobile tem um LAYOUT PRÓPRIO em RETRATO,
  // desenhado em coordenadas próprias (ver bloco MOBILE abaixo), com a MESMA
  // topologia do desktop (Evaporador esquerda / Condensador direita / Compressor
  // topo-centro / Válvula base-centro) só que mais ALTO e ESTREITO e com TODOS os
  // textos na HORIZONTAL natural. O DESKTOP segue paisagem original intacto.
  const isMobile = useIsMobile();

  // Tooltip via estado próprio (Radix asChild não dispara em SVG no hover).
  const [tip, setTip] = useState<{ key: TipKey; x: number; y: number } | null>(null);

  // Handlers reutilizados por todas as hit areas.
  const onEnter = (key: TipKey) => (e: React.PointerEvent) =>
    setTip({ key, x: e.clientX, y: e.clientY });
  const onMove = (key: TipKey) => (e: React.PointerEvent) =>
    setTip({ key, x: e.clientX, y: e.clientY });
  const onLeave = () => setTip(null);

  // MOBILE/TOQUE: tocar numa hit area ABRE o tooltip daquele item no ponto
  // tocado. stopPropagation impede que esse MESMO toque dispare o fechamento
  // global (listener em pointerdown no document). Hover do desktop segue intacto.
  const onTap = (key: TipKey) => (e: React.PointerEvent) => {
    e.stopPropagation();
    setTip({ key, x: e.clientX, y: e.clientY });
  };

  // FECHAMENTO ao tocar FORA das hit areas: enquanto há tooltip aberto, escuta
  // pointerdown no document. As hit areas chamam stopPropagation, então só
  // toques que NÃO caíram numa hit area chegam aqui e limpam o tooltip.
  useEffect(() => {
    if (!tip) return;
    const closeOutside = () => setTip(null);
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [tip]);

  // Props comuns das hit areas transparentes.
  const hitProps = (key: TipKey) => ({
    fill: "transparent",
    style: { pointerEvents: "all" as const, cursor: "help" },
    onPointerEnter: onEnter(key),
    onPointerMove: onMove(key),
    onPointerLeave: onLeave,
    onPointerDown: onTap(key),
  });

  // Caixas dos trocadores (compartilham os mesmos Y).
  // CENTRALIZADAS verticalmente: o centro (255) é o ponto médio entre a faixa da
  // válvula (valveY=110, topo) e a faixa do compressor (compY=400, base), de modo
  // que o espaço acima (até a válvula) ≈ espaço abaixo (até o compressor).
  const boxTop = 190;
  const boxBottom = 320;
  const boxH = boxBottom - boxTop;

  // Evaporador (esquerda)
  const evapX = 40;
  const evapW = 180;
  // Condensador (direita)
  const condX = 540;
  const condW = 180;

  // Serpentinas em meandro (5 passagens), com margem interna
  const padX = 20;
  const padY = 26;
  const rows = 5;

  const evapCx = evapX + evapW / 2; // 130
  const condCx = condX + condW / 2; // 630

  // Compressor agora EMBAIXO: o evaporador entra em CIMA (expansão, que vem da
  // válvula no topo) e sai EMBAIXO (sucção, que desce até o compressor).
  const evapSerp = meanderPath({
    left: evapX + padX,
    right: evapX + evapW - padX,
    top: boxTop + padY,
    bottom: boxBottom - padY,
    cx: evapCx,
    boxTop,
    boxBottom,
    rows,
    entry: "top",
    exit: "bottom",
  });
  // Condensador: entra EMBAIXO (descarga vinda do compressor no rodapé) e sai em
  // CIMA (líquido, que sobe até a válvula no topo) — tubo contínuo.
  const condSerp = meanderPath({
    left: condX + padX,
    right: condX + condW - padX,
    top: boxTop + padY,
    bottom: boxBottom - padY,
    cx: condCx,
    boxTop,
    boxBottom,
    rows,
    entry: "bottom",
    exit: "top",
  });

  // Compressor: inline na linha de BAIXO (y=400), centro x=380 — agora no rodapé.
  const compY = 400;
  const compCx = 380;
  const compR = 30;

  // Válvula: inline na linha do TOPO (y=110), centro x=380 — agora em cima.
  const valveY = 110;
  const valveCx = 380;

  const currentTip = tip ? TIPS[tip.key] : null;

  // ===================================================================
  // GEOMETRIA MOBILE (RETRATO) — coordenadas PRÓPRIAS, sem rotação.
  // viewBox alto e estreito. Mesma topologia do desktop:
  //   Evaporador esquerda (azul), Condensador direita (laranja),
  //   Compressor topo-centro, Válvula base-centro. Serpentinas ALTAS.
  // ===================================================================
  const M = {
    W: 400,
    H: 760,
    cx: 200, // centro horizontal (divisória de pressão)
    // caixas dos trocadores — COMPACTAS (altura razoável, ~5 passagens como o
    // desktop). O espaço vertical que sobra fica para os TUBOS de ligação, mais
    // longos, entre as caixas e o compressor (topo) / válvula (base).
    boxTop: 300,
    boxBottom: 460,
    evapX: 38,
    condX: 252,
    boxW: 110,
    // compressor agora BASE-centro e válvula TOPO-centro (CEO: compressor sempre
    // embaixo). compY desce p/ o rodapé, valveY sobe p/ o topo.
    compY: 642,
    compR: 28,
    valveY: 118,
    // padding interno da serpentina
    padX: 18,
    padY: 24,
  };
  const mBoxH = M.boxBottom - M.boxTop;
  const mEvapCx = M.evapX + M.boxW / 2; // 93
  const mCondCx = M.condX + M.boxW / 2; // 307
  // y das linhas que tocam o compressor (rodapé) e a válvula (topo).
  const mCompY = M.compY; // y das linhas de sucção/descarga (rodapé)
  const mValveY = M.valveY; // y das linhas de líquido/expansão (topo)

  // Compressor embaixo: evaporador entra em CIMA (expansão vinda da válvula no
  // topo) e sai EMBAIXO (sucção, que desce até o compressor).
  const mEvapSerp = meanderPath({
    left: M.evapX + M.padX,
    right: M.evapX + M.boxW - M.padX,
    top: M.boxTop + M.padY,
    bottom: M.boxBottom - M.padY,
    cx: mEvapCx,
    boxTop: M.boxTop,
    boxBottom: M.boxBottom,
    // Mesma quantidade/aparência do desktop: caixa COMPACTA com ~5 passagens.
    rows: 5,
    entry: "top",
    exit: "bottom",
  });
  // Condensador: entra EMBAIXO (descarga vinda do compressor no rodapé) e sai em
  // CIMA (líquido, que sobe até a válvula no topo).
  const mCondSerp = meanderPath({
    left: M.condX + M.padX,
    right: M.condX + M.boxW - M.padX,
    top: M.boxTop + M.padY,
    bottom: M.boxBottom - M.padY,
    cx: mCondCx,
    boxTop: M.boxTop,
    boxBottom: M.boxBottom,
    rows: 5,
    entry: "bottom",
    exit: "top",
  });

  return (
    <div className={isMobile ? "w-full" : "mx-auto w-full max-w-5xl"}>
      {/* wrapper relativo para o tooltip HTML sobreposto */}
      <div className="relative">
        <svg
          // MOBILE: viewBox RETRATO próprio (0 0 400 760), layout dedicado em
          // coordenadas próprias (sem rotação). DESKTOP: paisagem original.
          viewBox={isMobile ? "0 0 408 760" : "-24 0 828 480"}
          role="img"
          aria-label={t.common.cycleDiagramAria}
          className={
            isMobile
              ? "block h-auto w-full max-h-[80vh]"
              : "mx-auto h-auto w-full max-h-[70vh] sm:max-h-[540px]"
          }
        >
          <defs>
            <marker
              id="seta-quente"
              markerWidth="9"
              markerHeight="9"
              refX="5.5"
              refY="3"
              orient="auto"
            >
              <path d="M0 0 L6 3 L0 6 Z" className="fill-orange-500 dark:fill-orange-400" />
            </marker>
            <marker id="seta-fria" markerWidth="9" markerHeight="9" refX="5.5" refY="3" orient="auto">
              <path d="M0 0 L6 3 L0 6 Z" className="fill-sky-500 dark:fill-sky-400" />
            </marker>
          </defs>

          {/* ===================================================================
              DESKTOP — layout paisagem original (só renderiza fora do mobile).
              =================================================================== */}
          {!isMobile && (
          <g>
          {/* ===== ZONAS DE PRESSÃO (duas metades de cor) ===== */}
          {/* BAIXA — metade esquerda (azul frio) */}
          <rect x="-24" y="0" width="404" height="480" fill="hsl(217 91% 60% / 0.09)" />
          {/* ALTA — metade direita (laranja quente) */}
          <rect x="380" y="0" width="404" height="480" fill="hsl(25 95% 53% / 0.09)" />

          {/* divisória vertical no meio */}
          <line
            x1="380"
            y1="0"
            x2="380"
            y2="480"
            className="stroke-border"
            strokeWidth="1.5"
            strokeDasharray="6 6"
          />

          {/* rótulos das zonas */}
          <text
            x="20"
            y="466"
            textAnchor="start"
            className="fill-sky-600 dark:fill-sky-400 text-[13px] font-bold uppercase tracking-wide"
          >
            Baixa pressão
          </text>
          <text
            x="740"
            y="466"
            textAnchor="end"
            className="fill-orange-600 dark:fill-orange-400 text-[13px] font-bold uppercase tracking-wide"
          >
            Alta pressão
          </text>

          {/* ===================================================================
              LINHAS DO CICLO (desenhadas antes dos componentes; setas tocam o destino)
              =================================================================== */}

          {/* SUCÇÃO (azul): Evaporador (base, 130,320) → Compressor (esquerda, 350,400) */}
          <path
            d="M130 320 V400 H350"
            className="text-sky-500 dark:text-sky-400"
            stroke="currentColor"
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            markerEnd="url(#seta-fria)"
          />
          {/* Rótulo SUBIDO (y=372 em vez de 388) pra não encostar nos ícones de
              manômetro/termômetro, cujos círculos (cy=400, r=13) começam em ~387. */}
          <text
            x="156"
            y="372"
            textAnchor="start"
            className="fill-sky-600 dark:fill-sky-400 text-[11px] font-semibold"
          >
            Vapor — baixa pressão
          </text>

          {/* DESCARGA (laranja): Compressor (direita, 410,400) → Condensador (base, 630,320) */}
          <path
            d="M410 400 H630 V320"
            className="text-orange-500 dark:text-orange-400"
            stroke="currentColor"
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            markerEnd="url(#seta-quente)"
          />
          <text
            x="604"
            y="388"
            textAnchor="end"
            className="fill-orange-600 dark:fill-orange-400 text-[11px] font-semibold"
          >
            Vapor — alta pressão
          </text>

          {/* LÍQUIDO (laranja): Condensador (topo, 630,190) → Válvula (lado dir., 406,110) */}
          <path
            d="M630 190 V110 H406"
            className="text-orange-500 dark:text-orange-400"
            stroke="currentColor"
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            markerEnd="url(#seta-quente)"
          />
          <text
            x="604"
            y="130"
            textAnchor="end"
            className="fill-orange-600 dark:fill-orange-400 text-[11px] font-semibold"
          >
            Líquido — alta pressão
          </text>

          {/* EXPANSÃO (azul): Válvula (lado esq., 354,110) → Evaporador (topo, 130,190) */}
          <path
            d="M354 110 H130 V190"
            className="text-sky-500 dark:text-sky-400"
            stroke="currentColor"
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            markerEnd="url(#seta-fria)"
          />
          <text
            x="156"
            y="130"
            textAnchor="start"
            className="fill-sky-600 dark:fill-sky-400 text-[11px] font-semibold"
          >
            Líquido / vapor — baixa pressão
          </text>

          {/* ===================================================================
              COMPONENTES — desenhados sobre as linhas
              =================================================================== */}

          {/* Compressor — BASE-CENTRO (círculo com cunha), inline na linha de baixo.
              Rótulo ACIMA do círculo (entre as caixas) pra não colidir com os
              rótulos de pressão do rodapé (y=466). */}
          <circle
            cx={compCx}
            cy={compY}
            r={compR}
            fill={pecaFill}
            className="stroke-foreground/80"
            strokeWidth="2.5"
          />
          <CompressorIcon cx={compCx} cy={compY} scale={(compR * 1.4) / 600} fill={compIconFill} />
          <text
            x={compCx}
            y={compY - compR - 12}
            textAnchor="middle"
            className="fill-foreground text-[19px] font-extrabold uppercase tracking-wide"
          >
            Compressor
          </text>

          {/* Evaporador — ESQUERDA (caixa azul fria + serpentina em MEANDRO) */}
          <rect
            x={evapX}
            y={boxTop}
            width={evapW}
            height={boxH}
            rx="10"
            fill={isDark ? "hsl(217 91% 60% / 0.12)" : "transparent"}
            className="stroke-sky-500/60 dark:stroke-sky-400/60"
            strokeWidth="2.5"
          />
          {/* serpentina: UM path contínuo, espessura UNIFORME (4) das pontas ao corpo */}
          <path
            d={evapSerp.d}
            className="stroke-sky-500 dark:stroke-sky-400"
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* rótulo VERTICAL fora da caixa (à esquerda) */}
          <text
            x={evapX - 14}
            y={boxTop + boxH / 2}
            textAnchor="middle"
            transform={`rotate(-90 ${evapX - 14} ${boxTop + boxH / 2})`}
            className="fill-foreground text-[19px] font-extrabold uppercase tracking-wide"
          >
            Evaporador
          </text>

          {/* Condensador — DIREITA (caixa laranja quente + serpentina em MEANDRO) */}
          <rect
            x={condX}
            y={boxTop}
            width={condW}
            height={boxH}
            rx="10"
            fill={isDark ? "hsl(25 95% 53% / 0.12)" : "transparent"}
            className="stroke-orange-500/60 dark:stroke-orange-400/60"
            strokeWidth="2.5"
          />
          {/* serpentina: UM path contínuo, espessura UNIFORME (4) das pontas ao corpo */}
          <path
            d={condSerp.d}
            className="stroke-orange-500 dark:stroke-orange-400"
            strokeWidth="4"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* rótulo VERTICAL fora da caixa (à direita) */}
          <text
            x={condX + condW + 30}
            y={boxTop + boxH / 2}
            textAnchor="middle"
            transform={`rotate(-90 ${condX + condW + 30} ${boxTop + boxH / 2})`}
            className="fill-foreground text-[19px] font-extrabold uppercase tracking-wide"
          >
            Condensador
          </text>

          {/* Válvula de expansão — BAIXO-CENTRO (bowtie), inline na linha de baixo */}
          <path
            d={`M ${valveCx - 26} ${valveY - 20} L ${valveCx + 26} ${valveY + 20} L ${
              valveCx + 26
            } ${valveY - 20} L ${valveCx - 26} ${valveY + 20} Z`}
            className="fill-card stroke-foreground"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <text
            x={valveCx}
            y={valveY + 44}
            textAnchor="middle"
            className="fill-foreground text-[17px] font-extrabold uppercase tracking-wide"
          >
            Válvula de expansão
          </text>

          {/* ===================================================================
              INSTRUMENTOS na linha de sucção (trecho vertical x=130)
              Cada instrumento fica DENTRO de um círculo de fundo NEUTRO (theme-
              aware) com borda azul sutil, pra dar CONTRASTE — o ícone azul some
              quando desenhado direto sobre a linha de sucção (também azul). O
              círculo é desenhado POR CIMA da linha (a linha passa "atrás").
              =================================================================== */}
          {/* A linha de sucção agora corre EMBAIXO: trecho horizontal em y=400
              entre o evaporador (x=130) e o compressor (x=350). Os dois
              instrumentos ficam sobre esse trecho, com rótulo ACIMA da linha
              pra não brigar com o rótulo "Vapor — baixa pressão" (y≈388). */}
          {/* Manômetro — círculo de contraste + ícone vetorial dentro */}
          <circle
            cx="180"
            cy="400"
            r="13"
            fill="hsl(var(--background))"
            className="stroke-sky-500/60 dark:stroke-sky-400/60"
            strokeWidth="1.5"
          />
          <ManometroIcon cx={180} cy={400} height={18} fill={termoIconFill} />
          <text
            x="180"
            y="430"
            textAnchor="middle"
            className="fill-sky-600 dark:fill-sky-300 text-[11px] font-semibold"
          >
            Manômetro
          </text>

          {/* Termômetro — círculo de contraste + ícone vetorial dentro */}
          <circle
            cx="270"
            cy="400"
            r="13"
            fill="hsl(var(--background))"
            className="stroke-sky-500/60 dark:stroke-sky-400/60"
            strokeWidth="1.5"
          />
          <TermometroIcon cx={270} cy={400} height={18} fill={termoIconFill} />
          <text
            x="270"
            y="430"
            textAnchor="middle"
            className="fill-sky-600 dark:fill-sky-300 text-[11px] font-semibold"
          >
            Termômetro
          </text>

          {/* ===================================================================
              HIT AREAS TRANSPARENTES (no topo de tudo) — SVG só detecta hover no
              pixel pintado, então cada item interativo tem um <rect> cheio,
              transparente e clicável, cobrindo forma + rótulo. Desenhadas por
              ÚLTIMO para ficarem acima e capturarem o ponteiro.
              =================================================================== */}

          {/* zonas de pressão (faixas finas na base, sem cobrir o resto) */}
          <rect x="0" y="448" width="220" height="32" {...hitProps("baixaPressao")} />
          <rect x="600" y="448" width="160" height="32" {...hitProps("altaPressao")} />

          {/* linhas do ciclo — agora sucção/descarga embaixo (y≈400) e
              líquido/expansão em cima (y≈110), acompanhando a inversão */}
          <rect x="118" y="386" width="244" height="28" {...hitProps("linhaSuccao")} />
          <rect x="398" y="386" width="244" height="28" {...hitProps("linhaDescarga")} />
          <rect x="398" y="96" width="244" height="28" {...hitProps("linhaLiquido")} />
          <rect x="118" y="96" width="244" height="28" {...hitProps("linhaExpansao")} />

          {/* compressor (forma + rótulo) */}
          <rect x={compCx - 60} y={compY - compR - 24} width="120" height="84" {...hitProps("compressor")} />

          {/* evaporador (caixa + rótulo vertical à esquerda) */}
          <rect x={evapX - 26} y={boxTop} width={evapW + 26} height={boxH} {...hitProps("evaporador")} />

          {/* condensador (caixa + rótulo vertical à direita) */}
          <rect x={condX} y={boxTop} width={condW + 26} height={boxH} {...hitProps("condensador")} />

          {/* válvula de expansão (bowtie + rótulo) */}
          <rect x={valveCx - 80} y={valveY - 26} width="160" height="64" {...hitProps("expansao")} />

          {/* manômetro (círculo + rótulo abaixo, na linha de sucção do rodapé) */}
          <rect x="148" y="385" width="64" height="52" {...hitProps("manometro")} />
          {/* termômetro (círculo + rótulo abaixo, na linha de sucção do rodapé) */}
          <rect x="238" y="385" width="64" height="52" {...hitProps("termometro")} />
          </g>
          )}

          {/* ===================================================================
              MOBILE — layout RETRATO dedicado (sem rotação). Coordenadas próprias
              (viewBox 0 0 400 760). Mesma topologia do desktop:
                • Evaporador ESQUERDA (caixa azul, serpentina ALTA)
                • Condensador DIREITA (caixa laranja, serpentina ALTA)
                • Compressor TOPO-CENTRO  • Válvula BASE-CENTRO
              Zonas: baixa (azul) à esquerda, alta (laranja) à direita, divisória
              vertical no centro. TODOS os rótulos HORIZONTAIS. Reaproveita
              meanderPath, TIPS, tooltips e fills theme-aware. Loop conectado:
                Sucção (Evap→Comp, azul) · Descarga (Comp→Cond, laranja)
                Líquido (Cond→Válvula, laranja) · Expansão (Válvula→Evap, azul)
              =================================================================== */}
          {isMobile && (
            <g>
              {/* ===== ZONAS DE PRESSÃO (duas metades verticais) ===== */}
              <rect x="0" y="0" width={M.cx} height={M.H} fill="hsl(217 91% 60% / 0.09)" />
              <rect x={M.cx} y="0" width={408 - M.cx} height={M.H} fill="hsl(25 95% 53% / 0.09)" />
              {/* divisória vertical no meio */}
              <line
                x1={M.cx}
                y1="0"
                x2={M.cx}
                y2={M.H}
                className="stroke-border"
                strokeWidth="1.5"
                strokeDasharray="6 6"
              />

              {/* ===== CABEÇALHOS DE PRESSÃO (topo, horizontais) ===== */}
              <text
                x={M.cx / 2}
                y={28}
                textAnchor="middle"
                className="fill-sky-600 dark:fill-sky-400 text-[14px] font-bold uppercase tracking-wide"
              >
                Baixa pressão
              </text>
              <text
                x={M.cx + (M.W - M.cx) / 2}
                y={28}
                textAnchor="middle"
                className="fill-orange-600 dark:fill-orange-400 text-[14px] font-bold uppercase tracking-wide"
              >
                Alta pressão
              </text>

              {/* ===================================================================
                  LINHAS DO CICLO (antes dos componentes; seta toca o destino)
                  =================================================================== */}
              {/* SUCÇÃO (azul): Evaporador (base) → Compressor (esq., rodapé) */}
              <path
                d={`M${mEvapCx} ${M.boxBottom} V${mCompY} H${M.cx - M.compR}`}
                className="text-sky-500 dark:text-sky-400"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                markerEnd="url(#seta-fria)"
              />
              {/* DESCARGA (laranja): Compressor (dir., rodapé) → Condensador (base) */}
              <path
                d={`M${M.cx + M.compR} ${mCompY} H${mCondCx} V${M.boxBottom}`}
                className="text-orange-500 dark:text-orange-400"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                markerEnd="url(#seta-quente)"
              />
              {/* LÍQUIDO (laranja): Condensador (topo) → Válvula (dir., topo) */}
              <path
                d={`M${mCondCx} ${M.boxTop} V${mValveY} H${M.cx + 26}`}
                className="text-orange-500 dark:text-orange-400"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                markerEnd="url(#seta-quente)"
              />
              {/* EXPANSÃO (azul): Válvula (esq., topo) → Evaporador (topo) */}
              <path
                d={`M${M.cx - 26} ${mValveY} H${mEvapCx} V${M.boxTop}`}
                className="text-sky-500 dark:text-sky-400"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                markerEnd="url(#seta-fria)"
              />

              {/* ===== RÓTULOS DAS LINHAS — cada um JUNTO ao seu trecho de tubo,
                   em área livre, sem sobrepor outro rótulo/caixa/linha. =====
                   Tubos de ligação ficaram longos (compY 118 ↔ boxTop 300 em
                   cima; boxBottom 460 ↔ valveY 642 embaixo). */}
              {/* Com o compressor no RODAPÉ e a válvula no TOPO, a sucção/descarga
                   correm EMBAIXO (entre boxBottom=460 e compY=642) e a
                   líquido/expansão correm EM CIMA (entre valveY=118 e boxTop=300). */}
              {/* SUCÇÃO — trecho vertical base-esquerda (Evap→Compressor). Rótulo
                   à DIREITA do tubo (x=93), na metade baixa-pressão. */}
              <text
                x={mEvapCx + 8}
                y={514}
                textAnchor="start"
                className="fill-sky-600 dark:fill-sky-400 text-[12px] font-semibold"
              >
                Vapor —
                <tspan x={mEvapCx + 8} dy="15">baixa pressão</tspan>
              </text>
              {/* DESCARGA — trecho vertical base-direita (Compressor→Cond). Rótulo
                   à ESQUERDA do tubo (x=307), na metade alta-pressão. */}
              <text
                x={mCondCx - 8}
                y={514}
                textAnchor="end"
                className="fill-orange-600 dark:fill-orange-400 text-[12px] font-semibold"
              >
                Vapor —
                <tspan x={mCondCx - 8} dy="15">alta pressão</tspan>
              </text>
              {/* LÍQUIDO — trecho vertical topo-direita (Cond→Válvula). Rótulo à
                   ESQUERDA do tubo (x=307), na metade alta-pressão. */}
              <text
                x={mCondCx - 8}
                y={216}
                textAnchor="end"
                className="fill-orange-600 dark:fill-orange-400 text-[12px] font-semibold"
              >
                Líquido —
                <tspan x={mCondCx - 8} dy="15">alta pressão</tspan>
              </text>
              {/* EXPANSÃO — trecho vertical topo-esquerda (Válvula→Evap). Rótulo à
                   DIREITA do tubo (x=93), na metade baixa-pressão. */}
              <text
                x={mEvapCx + 8}
                y={216}
                textAnchor="start"
                className="fill-sky-600 dark:fill-sky-400 text-[12px] font-semibold"
              >
                Líquido / vapor
                <tspan x={mEvapCx + 8} dy="15">— baixa pressão</tspan>
              </text>

              {/* ===================================================================
                  COMPONENTES
                  =================================================================== */}
              {/* Compressor — BASE-CENTRO (círculo com cunha). Rótulo ABAIXO do
                   círculo (no mobile não há rótulos de pressão no rodapé — eles
                   ficam no topo). */}
              <circle
                cx={M.cx}
                cy={M.compY}
                r={M.compR}
                fill={pecaFill}
                className="stroke-foreground/80"
                strokeWidth="2.5"
              />
              <CompressorIcon cx={M.cx} cy={M.compY} scale={(M.compR * 1.4) / 600} fill={compIconFill} />
              <text
                x={M.cx}
                y={M.compY + M.compR + 26}
                textAnchor="middle"
                className="fill-foreground text-[16px] font-extrabold uppercase tracking-wide"
              >
                Compressor
              </text>

              {/* Evaporador — ESQUERDA (caixa azul + serpentina ALTA) */}
              <rect
                x={M.evapX}
                y={M.boxTop}
                width={M.boxW}
                height={mBoxH}
                rx="10"
                fill={isDark ? "hsl(217 91% 60% / 0.12)" : "transparent"}
                className="stroke-sky-500/60 dark:stroke-sky-400/60"
                strokeWidth="2.5"
              />
              <path
                d={mEvapSerp.d}
                className="stroke-sky-500 dark:stroke-sky-400"
                strokeWidth="4"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* rótulo VERTICAL fora da caixa (à esquerda), igual ao desktop */}
              <text
                x={M.evapX - 14}
                y={M.boxTop + mBoxH / 2}
                textAnchor="middle"
                transform={`rotate(-90 ${M.evapX - 14} ${M.boxTop + mBoxH / 2})`}
                className="fill-foreground text-[15px] font-extrabold uppercase tracking-wide"
              >
                Evaporador
              </text>

              {/* Condensador — DIREITA (caixa laranja + serpentina ALTA) */}
              <rect
                x={M.condX}
                y={M.boxTop}
                width={M.boxW}
                height={mBoxH}
                rx="10"
                fill={isDark ? "hsl(25 95% 53% / 0.12)" : "transparent"}
                className="stroke-orange-500/60 dark:stroke-orange-400/60"
                strokeWidth="2.5"
              />
              <path
                d={mCondSerp.d}
                className="stroke-orange-500 dark:stroke-orange-400"
                strokeWidth="4"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* rótulo VERTICAL fora da caixa (à direita), igual ao desktop.
                   Afastado um pouco mais da caixa pra não ficar colado (viewBox
                   mobile tem padding direito até 408 pra não cortar). */}
              <text
                x={M.condX + M.boxW + 24}
                y={M.boxTop + mBoxH / 2}
                textAnchor="middle"
                transform={`rotate(-90 ${M.condX + M.boxW + 24} ${M.boxTop + mBoxH / 2})`}
                className="fill-foreground text-[15px] font-extrabold uppercase tracking-wide"
              >
                Condensador
              </text>

              {/* Válvula de expansão — BASE-CENTRO (bowtie) */}
              <path
                d={`M ${M.cx - 24} ${M.valveY - 18} L ${M.cx + 24} ${M.valveY + 18} L ${
                  M.cx + 24
                } ${M.valveY - 18} L ${M.cx - 24} ${M.valveY + 18} Z`}
                className="fill-card stroke-foreground"
                strokeWidth="2.5"
                strokeLinejoin="round"
              />
              {/* rótulo HORIZONTAL em 2 linhas (NUNCA vertical), abaixo do bowtie */}
              <text
                x={M.cx}
                y={M.valveY + 42}
                textAnchor="middle"
                className="fill-foreground text-[15px] font-extrabold uppercase tracking-wide"
              >
                <tspan x={M.cx} dy="0">
                  Válvula de
                </tspan>
                <tspan x={M.cx} dy="20">
                  expansão
                </tspan>
              </text>

              {/* ===== INSTRUMENTOS na linha de sucção (UM conjunto só) =====
                   A sucção agora corre EMBAIXO: trecho vertical em x=93 entre o
                   evaporador (boxBottom=460) e o compressor (compY=642). Os dois
                   instrumentos ficam sobre esse trecho, abaixo do rótulo de
                   pressão (y≈528/543). Cada um num círculo neutro (contraste) com
                   rótulo à direita do tubo. */}
              {/* Manômetro — círculo de contraste + ícone vetorial dentro */}
              <circle
                cx={mEvapCx}
                cy={552}
                r="13"
                fill="hsl(var(--background))"
                className="stroke-sky-500/60 dark:stroke-sky-400/60"
                strokeWidth="1.5"
              />
              <ManometroIcon cx={mEvapCx} cy={552} height={18} fill={termoIconFill} />
              <line
                x1={mEvapCx + 15}
                y1={552}
                x2={mEvapCx + 28}
                y2={552}
                className="stroke-sky-500/50 dark:stroke-sky-400/50"
                strokeWidth="1.2"
              />
              <text
                x={mEvapCx + 32}
                y={556}
                textAnchor="start"
                className="fill-sky-600 dark:fill-sky-300 text-[12px] font-semibold"
              >
                Manômetro
              </text>
              {/* Termômetro — círculo de contraste + ícone vetorial dentro */}
              <circle
                cx={mEvapCx}
                cy={592}
                r="13"
                fill="hsl(var(--background))"
                className="stroke-sky-500/60 dark:stroke-sky-400/60"
                strokeWidth="1.5"
              />
              <TermometroIcon cx={mEvapCx} cy={592} height={18} fill={termoIconFill} />
              <line
                x1={mEvapCx + 15}
                y1={592}
                x2={mEvapCx + 28}
                y2={592}
                className="stroke-sky-500/50 dark:stroke-sky-400/50"
                strokeWidth="1.2"
              />
              <text
                x={mEvapCx + 32}
                y={596}
                textAnchor="start"
                className="fill-sky-600 dark:fill-sky-300 text-[12px] font-semibold"
              >
                Termômetro
              </text>

              {/* ===================================================================
                  HIT AREAS TRANSPARENTES (tooltips) — por último, no topo.
                  =================================================================== */}
              {/* zonas de pressão (cabeçalhos no topo) */}
              <rect x="0" y="6" width={M.cx} height="30" {...hitProps("baixaPressao")} />
              <rect x={M.cx} y="6" width={M.W - M.cx} height="30" {...hitProps("altaPressao")} />

              {/* linhas do ciclo (trechos verticais junto às caixas) — sucção e
                   descarga agora EMBAIXO (boxBottom→compY), líquido e expansão
                   EM CIMA (valveY→boxTop). */}
              <rect x={mEvapCx - 16} y={M.boxBottom} width="32" height="90" {...hitProps("linhaSuccao")} />
              <rect x={mCondCx - 16} y={M.boxBottom} width="32" height="90" {...hitProps("linhaDescarga")} />
              <rect x={mCondCx - 16} y={M.boxTop - 90} width="32" height="90" {...hitProps("linhaLiquido")} />
              <rect x={mEvapCx - 16} y={M.boxTop - 90} width="32" height="90" {...hitProps("linhaExpansao")} />

              {/* compressor (forma + rótulo abaixo do círculo) */}
              <rect
                x={M.cx - 46}
                y={M.compY - M.compR - 4}
                width="92"
                height={M.compR * 2 + 40}
                {...hitProps("compressor")}
              />
              {/* evaporador (caixa + rótulo vertical à esquerda) */}
              <rect x={M.evapX - 26} y={M.boxTop} width={M.boxW + 26} height={mBoxH} {...hitProps("evaporador")} />
              {/* condensador (caixa + rótulo vertical à direita) */}
              <rect x={M.condX} y={M.boxTop} width={M.boxW + 26} height={mBoxH} {...hitProps("condensador")} />
              {/* válvula (bowtie no topo + rótulo 2 linhas abaixo dele) */}
              <rect x={M.cx - 48} y={M.valveY - 24} width="96" height="92" {...hitProps("expansao")} />
              {/* manômetro (círculo + rótulo, na sucção do rodapé) */}
              <rect x={mEvapCx - 15} y={537} width="135" height="30" {...hitProps("manometro")} />
              {/* termômetro (círculo + rótulo, na sucção do rodapé) */}
              <rect x={mEvapCx - 15} y={577} width="135" height="30" {...hitProps("termometro")} />
            </g>
          )}
        </svg>

        {/* ===== TOOLTIP HTML SOBREPOSTO (instantâneo, perto do ponto) =====
             Posição CLAMPADA para nunca vazar a viewport (importante no toque
             mobile, onde o ponto tocado pode estar perto da borda). Estimamos
             largura (max 260) e altura para flipar/grudar nas bordas. */}
        {tip && currentTip && (
          <div
            className="pointer-events-none fixed z-50 w-max max-w-[260px] rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md"
            style={(() => {
              const W = 260;
              const H = 140; // estimativa segura para o maior tooltip
              const margin = 8;
              const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
              const vh = typeof window !== "undefined" ? window.innerHeight : 768;
              let left = tip.x + 14;
              let top = tip.y + 14;
              if (left + W + margin > vw) left = tip.x - W - 14; // flipa p/ esquerda
              if (left < margin) left = margin;
              if (top + H + margin > vh) top = tip.y - H - 14; // flipa p/ cima
              if (top < margin) top = margin;
              return { left, top };
            })()}
            role="tooltip"
          >
            <p className="font-bold">{currentTip.titulo}</p>
            <p className="mt-0.5 leading-relaxed">{currentTip.descricao}</p>
          </div>
        )}
      </div>

      {/* Legenda das cores */}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-5 rounded-full bg-sky-500 dark:bg-sky-400" />
          Baixa pressão (frio)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-5 rounded-full bg-orange-500 dark:bg-orange-400" />
          Alta pressão (quente)
        </span>
      </div>
    </div>
  );
}
