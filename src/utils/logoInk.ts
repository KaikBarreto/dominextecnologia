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
 * O corte (0.38) é o MESMO de `chooseSocialBackground` em `osSocialImage.ts`,
 * de propósito: a arte social e o menu precisam concordar sobre o que é um
 * logo escuro, senão o cliente vê duas decisões diferentes pro mesmo arquivo.
 */

export type LogoInk = 'dark' | 'light';

/** Acima disso a arte é considerada CLARA (pede fundo escuro). */
export const LOGO_INK_LUMINANCE_THRESHOLD = 0.38;

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
    const linearize = (channel: number) => {
      const normalized = channel / 255;
      return normalized <= 0.04045
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4;
    };
    const luminance = 0.2126 * linearize(pixels[index])
      + 0.7152 * linearize(pixels[index + 1])
      + 0.0722 * linearize(pixels[index + 2]);
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
  return luminance > LOGO_INK_LUMINANCE_THRESHOLD ? 'light' : 'dark';
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
    return classifyInk(context.getImageData(0, 0, canvas.width, canvas.height).data);
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
