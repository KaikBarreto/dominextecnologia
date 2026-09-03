// ─────────────────────────────────────────────────────────────────────────────
// mapTiles — ÚNICO módulo do repo que conhece o endereço do mapa. 🛡️ invariante
//
// Por quê: até 2026-09 as 4 telas de mapa repetiam a URL do fornecedor de tiles
// na mão (8 ocorrências, zero centralização). Quando o fornecedor mudou a
// política e passou a carimbar "API KEY REQUIRED" DENTRO do PNG, o servidor
// continuou devolvendo HTTP 200 — nada quebrou, nada apareceu em log, o mapa só
// chegou sujo em produção. Com um módulo único, trocar de fornecedor (ou apontar
// pros nossos próprios tiles) é mexer em UMA constante.
//
// Fornecedor atual: OpenFreeMap (tiles VETORIAIS). Sem chave, sem registro, sem
// cota, uso comercial permitido, MIT + auto-hospedável. Renderização via MapLibre
// GL rodando DENTRO do Leaflet (@maplibre/maplibre-gl-leaflet), então marcadores,
// popups, rotas e toda a lógica das telas continuam sendo Leaflet puro.
//
// Auto-hospedagem no futuro: basta definir VITE_MAP_TILES_URL na Vercel
// (ex.: https://tiles.dominex.app). Sem env, cai no OpenFreeMap público.
//
// NUNCA importar `maplibre-gl` estaticamente aqui: o build roda SSG em Node
// (scripts/ssg.mjs) e o MapLibre toca window/WebGL no import. Tudo carrega por
// `await import(...)` dentro do helper — igual o Leaflet já faz nas telas.
// ─────────────────────────────────────────────────────────────────────────────

type LeafletMap = import('leaflet').Map;

/** Endereço base dos tiles. Sem env configurada, usa o OpenFreeMap público. */
const DEFAULT_TILES_BASE = 'https://tiles.openfreemap.org';

const TILES_BASE = (
  (import.meta.env.VITE_MAP_TILES_URL as string | undefined)?.trim() || DEFAULT_TILES_BASE
).replace(/\/+$/, '');

/** Nome do style MapLibre por tema. `positron` é o claro; `dark`, o escuro. */
const STYLE_LIGHT = 'positron';
const STYLE_DARK = 'dark';

/**
 * Atribuição obrigatória. São TRÊS créditos, não um: os dados são do
 * OpenStreetMap (ODbL), o schema/tiles vêm do OpenMapTiles e o style + a
 * hospedagem são do OpenFreeMap. Todo mapa da aplicação exibe isso.
 */
export const MAP_ATTRIBUTION = [
  '<a href="https://openfreemap.org" target="_blank" rel="noopener noreferrer">OpenFreeMap</a>',
  '&copy; <a href="https://openmaptiles.org/" target="_blank" rel="noopener noreferrer">OpenMapTiles</a>',
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',
].join(' ');

/** URL do style MapLibre do tema pedido. */
export function getMapStyleUrl(dark: boolean): string {
  return `${TILES_BASE}/styles/${dark ? STYLE_DARK : STYLE_LIGHT}`;
}

/**
 * O app controla o dark mode na mão (classe `dark` no <html>, sem next-themes).
 * As telas de mapa leem o tema daqui pra não duplicar a regra.
 */
export function isDarkTheme(): boolean {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
}

let webglSupport: boolean | null = null;

/** MapLibre exige WebGL. Celular de campo antigo pode não ter. */
export function hasWebGLSupport(): boolean {
  if (webglSupport !== null) return webglSupport;
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    webglSupport = false;
    return webglSupport;
  }
  try {
    const canvas = document.createElement('canvas');
    webglSupport = Boolean(
      canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl'),
    );
  } catch {
    webglSupport = false;
  }
  return webglSupport;
}

/** Handle da camada de fundo. A tela não precisa saber nada de MapLibre. */
export interface MapBaseLayer {
  /** Troca claro/escuro sem recriar a camada. */
  setTheme: (dark: boolean) => void;
  /** Remove a camada do mapa (chamar no cleanup). */
  remove: () => void;
  /** true quando o aparelho não suporta WebGL e caímos no fundo neutro. */
  isFallback: boolean;
}

export interface AddBaseLayerOptions {
  /** Tema inicial. Quando omitido, lê do <html>. */
  dark?: boolean;
  /** Zoom máximo do mapa. Ver DEFAULT_MAX_ZOOM. */
  maxZoom?: number;
  /**
   * Cancela a montagem se a tela desmontar durante o carregamento do chunk.
   * OPCIONAL: o guard de container vivo (ver mapStillAlive) já protege quem
   * esquecer de passar. O signal é a defesa explícita, não a única.
   */
  signal?: AbortSignal;
}

/**
 * Camada raster ensinava o zoom máximo ao Leaflet (18 por padrão do GridLayer).
 * A camada vetorial não faz isso, e sem teto o Leaflet aceita zoom infinito
 * enquanto o MapLibre trava — o mapa "congela" enquanto o usuário continua dando
 * zoom. Por isso o helper fixa o teto.
 */
const DEFAULT_MAX_ZOOM = 20;

const FALLBACK_CLASS = 'dominex-map-fallback';

/**
 * Handle inerte pra quando a tela desmontou durante o carregamento: nada foi
 * adicionado ao mapa, então setTheme/remove não têm o que fazer.
 */
function createNoopLayer(): MapBaseLayer {
  return {
    isFallback: false,
    setTheme: () => undefined,
    remove: () => undefined,
  };
}

/**
 * O mapa ainda está vivo?
 *
 * Por quê: `addBaseLayer` espera um chunk de ~970 kB antes de montar a camada.
 * No 3G do técnico em campo dá tempo de sobra da tela desmontar no meio — e aí
 * `layer.addTo(map)` cria um contexto WebGL num container morto, que NUNCA é
 * liberado. O navegador tem teto baixo de contextos simultâneos (pior no
 * celular): entra e sai da tela algumas vezes e o mapa para de renderizar.
 *
 * O sinal confiável é o container ainda estar pendurado no documento — o React
 * remove os nós DOM DEPOIS de rodar os cleanups dos efeitos, então na hora que
 * a promise resolve o `isConnected` já está false. Não olhamos campo interno do
 * Leaflet (`_mapPane` e afins) de propósito: é API privada.
 */
function mapStillAlive(map: LeafletMap): boolean {
  try {
    const container = map.getContainer();
    return Boolean(container && container.isConnected);
  } catch {
    return false;
  }
}

/**
 * Sem WebGL não há mapa — mas a tela não pode estourar: fundo neutro do tema
 * (tokens, então acompanha claro/escuro sozinho) + aviso curto em PT-BR.
 * Marcadores, rota e popups continuam funcionando por cima. Não chama fornecedor
 * nenhum aqui.
 */
function createFallbackLayer(map: LeafletMap): MapBaseLayer {
  const container = map.getContainer();

  const backdrop = document.createElement('div');
  backdrop.className = FALLBACK_CLASS;
  backdrop.setAttribute('aria-hidden', 'true');
  backdrop.style.cssText =
    'position:absolute;inset:0;z-index:0;pointer-events:none;background:hsl(var(--muted));';

  const notice = document.createElement('div');
  notice.textContent = 'Fundo do mapa indisponível neste aparelho. Os pontos e a rota continuam funcionando.';
  notice.style.cssText = [
    'position:absolute',
    'left:50%',
    'top:50%',
    'transform:translate(-50%,-50%)',
    'max-width:min(280px,80%)',
    'text-align:center',
    'font-family:system-ui,sans-serif',
    'font-size:12px',
    'line-height:1.4',
    'padding:8px 12px',
    'border-radius:10px',
    'background:hsl(var(--card))',
    'color:hsl(var(--muted-foreground))',
    'border:1px solid hsl(var(--border))',
    'box-shadow:0 2px 8px rgba(0,0,0,0.12)',
  ].join(';');

  backdrop.appendChild(notice);
  container.appendChild(backdrop);

  return {
    isFallback: true,
    // O fundo usa tokens de cor, então segue o tema sozinho.
    setTheme: () => undefined,
    remove: () => {
      backdrop.remove();
    },
  };
}

let maplibreCssPromise: Promise<unknown> | null = null;

/**
 * Monta a camada de fundo do mapa e devolve o handle.
 *
 * Cobre tanto as telas de camada única quanto a de "base + rótulos" que existia
 * antes: em tiles vetoriais os rótulos já fazem parte do style, então é sempre
 * UMA camada só.
 */
export async function addBaseLayer(
  map: LeafletMap,
  options: AddBaseLayerOptions = {},
): Promise<MapBaseLayer> {
  const dark = options.dark ?? isDarkTheme();
  const aborted = () => options.signal?.aborted === true || !mapStillAlive(map);

  if (aborted()) return createNoopLayer();

  try {
    map.setMaxZoom(options.maxZoom ?? DEFAULT_MAX_ZOOM);
  } catch {
    /* noop */
  }

  if (hasWebGLSupport()) {
    try {
      // CSS junto do JS: nada de import estático (o SSG roda em Node).
      if (!maplibreCssPromise) maplibreCssPromise = import('maplibre-gl/dist/maplibre-gl.css');
      await maplibreCssPromise;

      const { maplibreGL } = await import('@maplibre/maplibre-gl-leaflet');

      // Depois de TODOS os awaits: a tela pode ter desmontado no meio.
      // Sem isso, o addTo abaixo vaza um contexto WebGL órfão.
      if (aborted()) return createNoopLayer();

      const layer = maplibreGL({
        style: getMapStyleUrl(dark),
        // O plugin lê a atribuição daqui e repassa pro controle do Leaflet.
        attributionControl: { customAttribution: MAP_ATTRIBUTION },
      });

      layer.addTo(map);

      // setStyle refaz o fetch do style: só troca quando o tema mudou de fato
      // (as telas chamam setTheme a cada sync de marcador).
      let currentDark = dark;

      return {
        isFallback: false,
        setTheme: (nextDark: boolean) => {
          if (nextDark === currentDark) return;
          currentDark = nextDark;
          try {
            layer.getMaplibreMap()?.setStyle(getMapStyleUrl(nextDark));
          } catch {
            /* mapa ainda não montou — o próximo setTheme resolve */
          }
        },
        remove: () => {
          // O onRemove do plugin chama _glMap.remove(), MAS só depois de
          // `map.getPane(...).removeChild(...)`, que estoura se o mapa Leaflet
          // já foi destruído — e aí o contexto WebGL ficaria pendurado. Por
          // isso o backstop: se o removeLayer não deu conta, mata o GL na mão.
          try {
            map.removeLayer(layer);
          } catch {
            /* mapa já removido */
          }
          try {
            // Se o onRemove rodou inteiro, _glMap já é null e isso é no-op.
            layer.getMaplibreMap()?.remove();
          } catch {
            /* nada a liberar */
          }
        },
      };
    } catch {
      /* WebGL indisponível de fato / falha ao carregar: cai no fundo neutro */
    }
  }

  if (aborted()) return createNoopLayer();

  return createFallbackLayer(map);
}
