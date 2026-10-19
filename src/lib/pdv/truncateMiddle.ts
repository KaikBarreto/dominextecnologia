/**
 * Corta um nome longo no MEIO (mantendo começo e fim), em vez de só no fim
 * como `truncate`/`text-overflow: ellipsis` fazem.
 *
 * Por quê: em loja de peça, boa parte do catálogo é "mesma coisa, medida
 * diferente" — a informação que distingue um item de outro (capacidade,
 * bitola, polegada, amperagem) quase sempre mora no FIM do nome. Com
 * `truncate` simples, "Capacitor de partida 35uF" e "Capacitor de partida
 * 45uF" ficam visualmente IDÊNTICOS no card do PDV ("Capacitor de..."),
 * risco real de venda errada no balcão (decisão do CEO, 2026-10-18).
 *
 * CORREÇÃO 2026-10-19 (o orçamento fixo de caractere da 1ª versão estava
 * ERRADO): a 1ª versão usava um número fixo de caracteres por chamador
 * (ex: `truncateMiddle(name, 6, 4)` no card), calibrado só pro PIOR caso
 * medido (card mais estreito, 5 colunas em 1366px). Em card LARGO (ex:
 * grade de 2 colunas no mobile, ~350px) isso cortava "Capacitor de partida
 * 35uF" pra "Capaci…35uF" com MAIS de 200px de espaço vazio sobrando — nome
 * cortado cedo demais sem necessidade nenhuma. `truncateMiddle` (a função
 * pura abaixo) continua existindo e correta — ela só FAZ o corte depois que
 * alguém decidiu que precisa. Quem decide ISSO agora é `truncateForTwoLines`
 * (também abaixo) + o componente `PdvProductName`, que MEDEM a largura real
 * do container (via `ResizeObserver`) e só cortam quando o nome de verdade
 * não cabe em 2 linhas nessa largura — nome curto ou médio aparece INTEIRO,
 * em 1 ou 2 linhas (CSS `line-clamp-2`), sem orçamento de caractere chutado.
 */

/**
 * Corta `name` no meio, preservando `headChars` caracteres do começo e
 * `tailChars` do fim, com uma reticência (`…`, um único caractere) entre
 * eles. Nome que já cabe (comprimento <= headChars + tailChars + 1) passa
 * inteiro, sem reticência nenhuma — só corta o que de fato não cabe.
 *
 * `tailChars` tem prioridade maior que `headChars` pro caso de "sobrar 1
 * caractere": é o FIM do nome que carrega a medida/variante que distingue
 * um item do outro, então entre encurtar o início ou o fim, encurtamos o
 * início.
 */
export function truncateMiddle(name: string, headChars = 10, tailChars = 8): string {
  const safeHead = Math.max(0, headChars);
  const safeTail = Math.max(0, tailChars);
  const trimmed = name ?? '';

  if (trimmed.length <= safeHead + safeTail + 1) {
    return trimmed;
  }

  if (safeHead === 0 && safeTail === 0) {
    return '…';
  }

  const head = trimmed.slice(0, safeHead);
  const tail = safeTail > 0 ? trimmed.slice(trimmed.length - safeTail) : '';
  return `${head}…${tail}`;
}

let sharedMeasureCanvas: HTMLCanvasElement | null = null;

/**
 * Largura em pixel de `text` renderizado com `font` (CSS font shorthand, ex:
 * `getComputedStyle(el).font` → `"700 14px Inter, sans-serif"`), via
 * `canvas.measureText` — a mesma técnica que o browser usa internamente,
 * então respeita fonte variável (bold mais largo que regular) sem precisar
 * de tabela de métricas por fonte.
 *
 * FALLBACK defensivo pra ambiente sem canvas de verdade (jsdom nos testes
 * não implementa `getContext('2d')` por padrão, devolve `null`): heurística
 * por tamanho de fonte (extrai o "Npx" do shorthand), proporção ~0,55
 * largura/altura — típica de fonte sans-serif. Impreciso mas determinístico
 * e testável; em produção (browser de verdade) o canvas sempre resolve.
 */
export function measureTextWidth(text: string, font: string): number {
  if (typeof document === 'undefined') {
    return text.length * 14 * 0.55;
  }
  if (!sharedMeasureCanvas) {
    sharedMeasureCanvas = document.createElement('canvas');
  }
  const ctx = sharedMeasureCanvas.getContext('2d');
  if (!ctx) {
    const sizeMatch = font.match(/(\d+(?:\.\d+)?)px/);
    const fontSize = sizeMatch ? parseFloat(sizeMatch[1]) : 14;
    return text.length * fontSize * 0.55;
  }
  ctx.font = font || '14px sans-serif';
  return ctx.measureText(text).width;
}

/**
 * Decide se `name` cabe INTEIRO em 2 linhas dentro de `containerWidthPx`
 * (com `font` = CSS font shorthand do container) e, se não couber, aplica
 * `truncateMiddle` com o orçamento de caractere DERIVADO da largura medida
 * (não mais um número fixo chutado — ver correção 2026-10-19 no topo do
 * arquivo).
 *
 * Como deriva o orçamento: mede a largura do nome INTEIRO com
 * `measureTextWidth`, divide pelo número de caracteres pra achar a largura
 * MÉDIA por caractere daquele texto específico (mais preciso que uma média
 * genérica — "iiiiii" e "WWWWWW" têm médias bem diferentes), estima quantos
 * caracteres cabem por linha (`containerWidthPx / avgCharWidth`) e multiplica
 * por 2 linhas. O fator `0.92` dá folga porque quebra de palavra raramente
 * preenche a linha até o último pixel (a palavra que não coube inteira pula
 * pra linha seguinte, deixando resto em branco no fim da linha anterior).
 *
 * `containerWidthPx <= 0` (ainda não mediu/SSR) devolve o nome INTEIRO sem
 * cortar — falha pro lado de MOSTRAR DEMAIS, nunca de esconder informação
 * por falta de medição.
 */
export function truncateForTwoLines(name: string, containerWidthPx: number, font: string): string {
  const trimmed = name ?? '';
  if (containerWidthPx <= 0 || trimmed.length === 0) return trimmed;

  const fullWidth = measureTextWidth(trimmed, font);
  const avgCharWidth = fullWidth / trimmed.length;
  if (!(avgCharWidth > 0)) return trimmed;

  const WRAP_SLACK = 0.92;
  const charsPerLine = Math.max(1, Math.floor(containerWidthPx / avgCharWidth));
  const budget = Math.floor(charsPerLine * 2 * WRAP_SLACK);

  if (trimmed.length <= budget) return trimmed;

  // Tail prioritário (mesma régua do `truncateMiddle`): é o fim do nome que
  // carrega a medida/variante que distingue um item do outro.
  const tail = Math.max(4, Math.floor(budget * 0.4));
  const head = Math.max(0, budget - tail - 1);
  return truncateMiddle(trimmed, head, tail);
}
