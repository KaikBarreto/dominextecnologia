/**
 * "Tinta" do logo do tenant: a arte é escura (feita pra papel/fundo claro) ou
 * clara (feita pra fundo escuro)?
 *
 * Por que existe: o white-label guarda UM arquivo só, e o mesmo arquivo é
 * desenhado no menu escuro, no topo, no PDF branco e na prévia das
 * Configurações. Logo de tinta escura (cinza-chumbo, preto) simplesmente some
 * no menu escuro — e some nos DOIS temas, porque o menu é escuro por padrão
 * (Fase 2). Medindo a luminância da própria arte dá pra colocar uma placa
 * clara atrás só de quem precisa, sem pedir nada ao cliente.
 *
 * A decisão combina luminância média com presença relevante de tinta clara.
 * Só a média não basta para logos mistos: um símbolo preto mais denso pode
 * esconder que o nome da marca foi desenhado em branco e precisa de fundo
 * escuro. `chooseSocialBackground` usa esta mesma classificação para o menu e
 * a arte social concordarem sobre o mesmo arquivo.
 */

export type LogoInk = 'dark' | 'light';
export type LogoSurfaceTone = 'dark' | 'light';
export type LogoSurfacePreference = 'auto' | 'system' | LogoSurfaceTone;

/** Acima disso a arte é considerada CLARA (pede fundo escuro). */
export const LOGO_INK_LUMINANCE_THRESHOLD = 0.38;

/** Branco/cinza muito claro que indica arte desenhada para fundo escuro. */
const LIGHT_INK_LUMINANCE_THRESHOLD = 0.7;

/**
 * Parcela mínima de tinta clara para ela ser tratada como parte relevante do
 * logo, e não como um brilho ou detalhe pequeno de uma arte escura.
 */
const MIN_LIGHT_INK_SHARE = 0.18;

/**
 * Alguns arquivos não são transparentes: o próprio PNG/JPG já traz uma placa
 * retangular atrás da marca. Nesse caso, tentar inferir só a "tinta" produz o
 * efeito inverso (ex.: logo branco/dourado dentro de um retângulo preto ganha
 * uma faixa branca externa). A borda do arquivo é a evidência mais segura de
 * uma placa incorporada, desde que seja opaca e praticamente uniforme.
 */
const EMBEDDED_SURFACE_MIN_OPAQUE_SHARE = 0.92;
const EMBEDDED_SURFACE_MIN_UNIFORM_SHARE = 0.86;
const EMBEDDED_SURFACE_COLOR_TOLERANCE = 24;

function relativeLuminance(red: number, green: number, blue: number): number {
  const linearize = (channel: number) => {
    const normalized = channel / 255;
    return normalized <= 0.04045
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linearize(red)
    + 0.7152 * linearize(green)
    + 0.0722 * linearize(blue);
}

/**
 * Luminância relativa média dos pixels visíveis, ponderada pelo alfa. Pixels
 * quase transparentes não entram. Devolve `null` quando não há pixel legível.
 */
export function inkLuminance(pixels: Uint8ClampedArray): number | null {
  let weightedLuminance = 0;
  let totalAlpha = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3] / 255;
    if (alpha < 0.15) continue;
    const luminance = relativeLuminance(pixels[index], pixels[index + 1], pixels[index + 2]);
    weightedLuminance += luminance * alpha;
    totalAlpha += alpha;
  }
  if (totalAlpha === 0) return null;
  return weightedLuminance / totalAlpha;
}

/** Classifica a tinta a partir dos pixels já amostrados. */
export function classifyInk(pixels: Uint8ClampedArray): LogoInk | null {
  const luminance = inkLuminance(pixels);
  if (luminance === null) return null;
  if (luminance > LOGO_INK_LUMINANCE_THRESHOLD) return 'light';

  let lightAlpha = 0;
  let totalAlpha = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3] / 255;
    if (alpha < 0.15) continue;
    totalAlpha += alpha;
    if (relativeLuminance(pixels[index], pixels[index + 1], pixels[index + 2]) >= LIGHT_INK_LUMINANCE_THRESHOLD) {
      lightAlpha += alpha;
    }
  }

  // Em logos mistos, preserva o lettering branco mesmo quando um símbolo
  // preto e visualmente denso derruba a luminância média do arquivo inteiro.
  return lightAlpha / totalAlpha >= MIN_LIGHT_INK_SHARE ? 'light' : 'dark';
}

function colorDistanceFrom(
  red: number,
  green: number,
  blue: number,
  reference: readonly [number, number, number],
): number {
  return Math.max(
    Math.abs(red - reference[0]),
    Math.abs(green - reference[1]),
    Math.abs(blue - reference[2]),
  );
}

/**
 * Detecta uma placa opaca já incorporada ao arquivo do logo.
 *
 * A amostra usa dois pixels de espessura em todo o perímetro. As quatro bordas
 * precisam estar majoritariamente opacas, e a grande maioria dos pixels deve
 * estar próxima da mesma cor. Logos transparentes ou artes que chegam até a
 * borda não são classificados por palpite.
 */
export function detectEmbeddedLogoSurfaceTone(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): LogoSurfaceTone | null {
  if (width < 4 || height < 4 || pixels.length < width * height * 4) return null;

  const edgeDepth = Math.min(2, Math.floor(Math.min(width, height) / 2));
  const edgeIndexes: number[] = [];
  const edges = [
    { startX: 0, endX: width, startY: 0, endY: edgeDepth },
    { startX: 0, endX: width, startY: height - edgeDepth, endY: height },
    { startX: 0, endX: edgeDepth, startY: edgeDepth, endY: height - edgeDepth },
    { startX: width - edgeDepth, endX: width, startY: edgeDepth, endY: height - edgeDepth },
  ];

  for (const edge of edges) {
    let edgeOpaque = 0;
    let edgeTotal = 0;
    for (let y = edge.startY; y < edge.endY; y += 1) {
      for (let x = edge.startX; x < edge.endX; x += 1) {
        const index = (y * width + x) * 4;
        edgeTotal += 1;
        if (pixels[index + 3] / 255 >= 0.9) {
          edgeOpaque += 1;
          edgeIndexes.push(index);
        }
      }
    }
    if (edgeTotal === 0 || edgeOpaque / edgeTotal < EMBEDDED_SURFACE_MIN_OPAQUE_SHARE) {
      return null;
    }
  }

  const perimeterPixelCount = 2 * edgeDepth * width
    + 2 * edgeDepth * Math.max(0, height - 2 * edgeDepth);
  if (edgeIndexes.length / perimeterPixelCount < EMBEDDED_SURFACE_MIN_OPAQUE_SHARE) return null;

  let red = 0;
  let green = 0;
  let blue = 0;
  for (const index of edgeIndexes) {
    red += pixels[index];
    green += pixels[index + 1];
    blue += pixels[index + 2];
  }
  const average = [
    red / edgeIndexes.length,
    green / edgeIndexes.length,
    blue / edgeIndexes.length,
  ] as const;

  const uniformPixels = edgeIndexes.filter((index) => (
    colorDistanceFrom(pixels[index], pixels[index + 1], pixels[index + 2], average)
      <= EMBEDDED_SURFACE_COLOR_TOLERANCE
  )).length;
  if (uniformPixels / edgeIndexes.length < EMBEDDED_SURFACE_MIN_UNIFORM_SHARE) return null;

  return relativeLuminance(average[0], average[1], average[2])
    <= LOGO_INK_LUMINANCE_THRESHOLD
    ? 'dark'
    : 'light';
}

/**
 * Classificação usada pela imagem real. Quando o arquivo já tem uma placa,
 * devolve a tinta efetiva oposta a ela para que o modo automático preserve o
 * mesmo tom no shell. Sem placa incorporada, mantém a análise normal da arte.
 */
export function classifyLogoPixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): LogoInk | null {
  const embeddedSurface = detectEmbeddedLogoSurfaceTone(pixels, width, height);
  if (embeddedSurface) return embeddedSurface === 'dark' ? 'light' : 'dark';
  return classifyInk(pixels);
}

/**
 * Define a placa de contraste apenas quando a tinta e a superfície têm o
 * mesmo tom. Em superfícies opostas o próprio fundo já dá contraste suficiente.
 */
export function getLogoPlateTone(
  ink: LogoInk | null,
  surface: LogoSurfaceTone,
): LogoSurfaceTone | null {
  if (ink === null || ink !== surface) return null;
  return surface === 'dark' ? 'light' : 'dark';
}

/** Tom da faixa inteira: sempre o oposto da tinta detectada no logo. */
export function getContrastingLogoSurfaceTone(
  ink: LogoInk | null,
): LogoSurfaceTone | null {
  if (ink === null) return null;
  return ink === 'dark' ? 'light' : 'dark';
}

/**
 * Resolve a preferência persistida da empresa para a faixa do logo.
 * `system` não força tokens: cada shell acompanha o próprio fundo/tema.
 */
export function resolveLogoSurfaceTone(
  preference: LogoSurfacePreference | null | undefined,
  ink: LogoInk | null,
): LogoSurfaceTone | null {
  const normalized = preference ?? 'auto';
  if (normalized === 'system') return null;
  if (normalized === 'light' || normalized === 'dark') return normalized;
  return getContrastingLogoSurfaceTone(ink);
}

// Um logo por tenant muda quase nunca; a URL já carrega o timestamp do upload,
// então dá pra memorizar por URL sem risco de servir resultado velho.
const cache = new Map<string, LogoInk | null>();
const inFlight = new Map<string, Promise<LogoInk | null>>();

/** Resultado já conhecido pra esta URL, se houver (evita piscar na 1ª pintura). */
export function cachedLogoInk(url: string): LogoInk | null | undefined {
  return cache.get(url);
}

async function measure(url: string): Promise<LogoInk | null> {
  const response = await fetch(url, { mode: 'cors', cache: 'force-cache' });
  if (!response.ok) throw new Error('logo indisponível');
  const objectUrl = URL.createObjectURL(await response.blob());
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('logo ilegível'));
      element.src = objectUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    // Esticado de propósito: só a cor/alfa importa, e esticar evita que a
    // sobra transparente do canvas entre na conta como se fosse do arquivo.
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return classifyLogoPixels(
      context.getImageData(0, 0, canvas.width, canvas.height).data,
      canvas.width,
      canvas.height,
    );
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Mede a tinta do logo. Erro de rede/CORS devolve `null` — quem chama trata
 * como "não sei" e mantém o visual atual, nunca quebra a tela.
 */
export function detectLogoInk(url: string): Promise<LogoInk | null> {
  const known = cache.get(url);
  if (known !== undefined) return Promise.resolve(known);
  const running = inFlight.get(url);
  if (running) return running;

  const promise = measure(url)
    .catch(() => null)
    .then((ink) => {
      cache.set(url, ink);
      inFlight.delete(url);
      return ink;
    });
  inFlight.set(url, promise);
  return promise;
}
