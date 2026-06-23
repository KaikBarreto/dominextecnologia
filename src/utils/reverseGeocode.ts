// =============================================================================
// Reverse geocode (Nominatim/OSM) com FILA FIFO robusta POR CLIENTE.
//
// IMPORTANTE — a fila é POR NAVEGADOR/CLIENTE:
//   Cada usuário roda este código no próprio navegador, com IP próprio. O limite
//   de 1 req/s do Nominatim é por IP, então usuários diferentes NÃO compartilham
//   a mesma fila — cada um tem a sua. Por isso a fila vive no nível do módulo
//   (singleton do bundle daquele navegador) e NÃO deve ser centralizada num
//   servidor: o objetivo é (a) proteger CADA cliente de estourar o rate-limit e
//   (b) dar resiliência (retry/backoff) sem travar a UI.
//
// Todas as chamadas (`reverseGeocode`, `reverseGeocodeShort`, `batchReverseGeocode`)
// passam por esta fila. Um único WORKER drena a fila 1-a-1, com ~1100ms entre
// requisições efetivas à rede. Cache HIT resolve na hora, sem entrar na fila.
// =============================================================================

// Cache em memória por coordenada (4 casas decimais ~ 11m de precisão).
// Reusado entre as duas variantes de saída (cada qual com seu próprio Map,
// pois o formato do texto difere).
const cache = new Map<string, string>();
const shortCache = new Map<string, string | null>();

function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

// -----------------------------------------------------------------------------
// FILA FIFO + WORKER
// -----------------------------------------------------------------------------

const QUEUE_INTERVAL_MS = 1100; // folga sobre o 1 req/s do Nominatim
const MAX_ATTEMPTS = 4; // tentativas antes de desistir (cair no fallback)
const BACKOFF_BASE_MS = 2000; // 2s, 4s, 8s, ...
const BACKOFF_CEIL_MS = 30_000; // teto do backoff

interface QueueTask {
  lat: number;
  lng: number;
  run: () => Promise<void>; // resolve a Promise externa do chamador
}

const queue: QueueTask[] = [];
let workerRunning = false;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Enfileira uma tarefa e garante que o worker esteja rodando.
 * O worker processa 1 tarefa por vez e espera QUEUE_INTERVAL_MS entre cada
 * requisição de rede efetiva (cache hits dentro da task não contam, mas aqui
 * só entram tasks que JÁ deram cache miss).
 */
function enqueue(task: QueueTask): void {
  queue.push(task);
  if (!workerRunning) {
    workerRunning = true;
    void drainQueue();
  }
}

async function drainQueue(): Promise<void> {
  while (queue.length > 0) {
    const task = queue.shift()!;
    try {
      await task.run();
    } catch {
      // task.run nunca deve lançar (resolve com fallback), mas não deixamos o
      // worker morrer por garantia.
    }
    // Espaça a próxima requisição efetiva. Só espera se ainda há fila.
    if (queue.length > 0) await sleep(QUEUE_INTERVAL_MS);
  }
  workerRunning = false;
}

/**
 * Faz UM fetch ao Nominatim com retry + backoff exponencial.
 * Retorna o JSON parseado, ou lança quando esgota as tentativas (rede/429/503).
 * A espera do backoff acontece DENTRO do worker (serializada), então não
 * dispara requisições paralelas.
 */
async function fetchNominatim(lat: number, lng: number): Promise<any> {
  let attempt = 0;
  let lastErr: unknown;

  while (attempt < MAX_ATTEMPTS) {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&zoom=18`,
        { headers: { 'Accept-Language': 'pt-BR' } },
      );

      // 429 (Too Many Requests) / 503 (Service Unavailable) → backoff e retry.
      if (res.status === 429 || res.status === 503) {
        throw new Error(`Nominatim ${res.status}`);
      }
      if (!res.ok) throw new Error(`Nominatim ${res.status}`);

      return await res.json();
    } catch (err) {
      lastErr = err;
      attempt++;
      if (attempt >= MAX_ATTEMPTS) break;
      const backoff = Math.min(BACKOFF_BASE_MS * 2 ** (attempt - 1), BACKOFF_CEIL_MS);
      await sleep(backoff);
    }
  }

  throw lastErr ?? new Error('Nominatim: tentativas esgotadas');
}

// -----------------------------------------------------------------------------
// Parsers de endereço (compartilhados)
// -----------------------------------------------------------------------------

const STATE_TO_UF: Record<string, string> = {
  'acre': 'AC', 'alagoas': 'AL', 'amapá': 'AP', 'amazonas': 'AM',
  'bahia': 'BA', 'ceará': 'CE', 'distrito federal': 'DF', 'espírito santo': 'ES',
  'goiás': 'GO', 'maranhão': 'MA', 'mato grosso': 'MT', 'mato grosso do sul': 'MS',
  'minas gerais': 'MG', 'pará': 'PA', 'paraíba': 'PB', 'paraná': 'PR',
  'pernambuco': 'PE', 'piauí': 'PI', 'rio de janeiro': 'RJ',
  'rio grande do norte': 'RN', 'rio grande do sul': 'RS', 'rondônia': 'RO',
  'roraima': 'RR', 'santa catarina': 'SC', 'são paulo': 'SP', 'sergipe': 'SE',
  'tocantins': 'TO',
};

function stateToUF(state: string): string {
  if (!state) return '';
  if (state.length === 2) return state.toUpperCase();
  return STATE_TO_UF[state.toLowerCase()] || state;
}

// -----------------------------------------------------------------------------
// API pública
// -----------------------------------------------------------------------------

/**
 * Reverse geocode → "rua, nº - bairro - cidade". Sempre resolve (cache, ou via
 * fila); em falha após os retries, retorna a coordenada formatada como fallback.
 *
 * Não trava a UI: o chamador faz `await`/`.then`; a fila roda em background.
 */
export function reverseGeocode(lat: number, lng: number): Promise<string> {
  const key = cacheKey(lat, lng);
  if (cache.has(key)) return Promise.resolve(cache.get(key)!);

  return new Promise<string>((resolve) => {
    enqueue({
      lat,
      lng,
      run: async () => {
        // Cache pode ter sido preenchido por outra task enfileirada na mesma coord.
        if (cache.has(key)) {
          resolve(cache.get(key)!);
          return;
        }
        const fallback = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        try {
          const data = await fetchNominatim(lat, lng);
          const addr = data?.address;
          if (!addr) {
            cache.set(key, fallback);
            resolve(fallback);
            return;
          }

          const parts: string[] = [];
          const road = addr.road || addr.pedestrian || addr.footway || addr.cycleway || '';
          if (road) {
            let line = road;
            if (addr.house_number) line += `, ${addr.house_number}`;
            parts.push(line);
          }
          const neighborhood = addr.suburb || addr.neighbourhood || addr.quarter || '';
          if (neighborhood) parts.push(neighborhood);
          const city = addr.city || addr.town || addr.village || addr.municipality || '';
          if (city) parts.push(city);

          const result =
            parts.length > 0
              ? parts.join(' - ')
              : data.display_name?.split(',').slice(0, 3).join(',') || fallback;
          cache.set(key, result);
          resolve(result);
        } catch {
          // Esgotou retries — devolve coordenada. Cacheia pra não re-tentar em loop
          // na mesma sessão (a coord não vai mudar).
          cache.set(key, fallback);
          resolve(fallback);
        }
      },
    });
  });
}

/**
 * Endereço CONCISO pra carimbo de assinatura / check-in / check-out:
 * "{logradouro}{, nº} - {bairro} - {cidade} - {UF}". Sem CEP nem país.
 *
 * Passa pela MESMA fila do reverseGeocode (serializada por navegador). Em falha
 * após retries, retorna `null` — o chamador grava só a coordenada.
 */
export function reverseGeocodeShort(lat: number, lng: number): Promise<string | null> {
  const key = cacheKey(lat, lng);
  if (shortCache.has(key)) return Promise.resolve(shortCache.get(key)!);

  return new Promise<string | null>((resolve) => {
    enqueue({
      lat,
      lng,
      run: async () => {
        if (shortCache.has(key)) {
          resolve(shortCache.get(key)!);
          return;
        }
        try {
          const data = await fetchNominatim(lat, lng);
          const addr = data?.address;
          if (!addr) {
            shortCache.set(key, null);
            resolve(null);
            return;
          }

          const parts: string[] = [];
          const road = addr.road || addr.pedestrian || addr.footway || addr.cycleway || '';
          if (road) {
            let line = road;
            if (addr.house_number) line += `, ${addr.house_number}`;
            parts.push(line);
          }
          const neighborhood = addr.suburb || addr.neighbourhood || addr.quarter || '';
          if (neighborhood) parts.push(neighborhood);
          const city = addr.city || addr.town || addr.village || addr.municipality || '';
          if (city) parts.push(city);
          const uf = stateToUF(addr.state || '');
          if (uf) parts.push(uf);

          if (parts.length === 0) {
            shortCache.set(key, null);
            resolve(null);
            return;
          }
          const result = parts.join(' - ');
          shortCache.set(key, result);
          resolve(result);
        } catch {
          // Falha de rede após retries — NÃO cacheia null permanente (pode ter
          // sido um pico temporário); deixa re-tentar numa próxima chamada.
          resolve(null);
        }
      },
    });
  });
}

/**
 * Reverse geocode de várias coordenadas. Apenas ENFILEIRA (até `maxCalls` coords
 * únicas ainda não cacheadas) — a fila serializa e espaça as requisições. As
 * coords que excedem `maxCalls` recebem o fallback de coordenada na hora.
 * Retorna um Map de "lat,lng" (4 casas) → endereço.
 */
export async function batchReverseGeocode(
  coords: Array<{ lat: number; lng: number }>,
  maxCalls = 10,
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  const unique = new Map<string, { lat: number; lng: number }>();

  for (const c of coords) {
    const key = cacheKey(c.lat, c.lng);
    if (cache.has(key)) {
      results.set(key, cache.get(key)!);
    } else if (!unique.has(key)) {
      unique.set(key, c);
    }
  }

  let calls = 0;
  const pending: Array<Promise<void>> = [];
  for (const [key, c] of unique) {
    if (calls >= maxCalls) {
      results.set(key, `${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`);
      continue;
    }
    calls++;
    // Enfileira tudo de uma vez; a fila serializa internamente (1-a-1).
    pending.push(
      reverseGeocode(c.lat, c.lng).then((addr) => {
        results.set(key, addr);
      }),
    );
  }

  await Promise.all(pending);
  return results;
}
