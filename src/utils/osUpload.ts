import { supabase } from '@/integrations/supabase/client';

/**
 * Motor de upload das MÍDIAS DA OS (fotos do checklist, fotos de atividade PMOC
 * e o vídeo da pergunta de vídeo). Tudo que o técnico manda do campo passa aqui.
 *
 * Nasceu da auditoria de 16/10/2026, que mediu no banco de produção:
 *  - 3.078 arquivos / 1,45 GB no bucket `os-photos`;
 *  - 502 deles (209 MB, 14%) ÓRFÃOS — sem nenhuma OS apontando. Vinham de
 *    remoção (só o ponteiro era apagado) e de envio que falhou no meio;
 *  - o laço antigo subia uma foto por vez e, se a 3ª de 5 falhasse, o `throw`
 *    abortava tudo: as 2 que já tinham subido NÃO eram salvas na pergunta
 *    (sumiam pro técnico e viravam lixo pago no bucket) e ele refazia as 5.
 *
 * O que este módulo garante:
 *  1. PARCIAL VALE. Quem chama recebe os sucessos E as falhas, separados, e
 *     salva o que deu certo. Oscilação de sinal nunca mais apaga trabalho feito.
 *  2. REENVIO AUTOMÁTICO. Até 3 tentativas com espera crescente. O nome do
 *     arquivo é sorteado UMA vez por arquivo, então repetir é seguro e não
 *     duplica (regra-lei 7: mutação idempotente, id gerado no cliente).
 *  3. PARALELO COM LIMITE. 3 de cada vez: aproveita a banda sem afogar o 4G
 *     nem a memória do celular.
 *  4. PROGRESSO DE VERDADE. O `supabase-js` não expõe bytes enviados, então o
 *     envio vai por XHR direto no endpoint de Storage, com os MESMOS cabeçalhos
 *     que o cliente usaria (token da sessão, ou a chave pública no fluxo do link
 *     público da OS). Se o XHR não estiver disponível, cai no `supabase-js`
 *     normal e o progresso só pula de arquivo em arquivo.
 */

/** Bucket público compartilhado por fotos e vídeos da OS. */
export const OS_MEDIA_BUCKET = 'os-photos';

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = [300, 1_200];
const CONCURRENCY = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Caminho do arquivo DENTRO do bucket, a partir da URL pública. `null` quando a
 * URL não é deste bucket — protege contra apagar arquivo de outro lugar por
 * engano. Aceita querystring (links assinados/versionados).
 */
export function osMediaPathFromUrl(url: string): string | null {
  if (!url) return null;
  const marker = `/${OS_MEDIA_BUCKET}/`;
  const at = url.indexOf(marker);
  if (at === -1) return null;
  const path = url.slice(at + marker.length).split('?')[0];
  if (!path) return null;
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

/**
 * Apaga do armazenamento as mídias que saíram da OS. BEST-EFFORT de propósito:
 * tirar a foto da pergunta é o que importa pro técnico, e não pode falhar
 * porque a limpeza falhou. URL que não é do bucket da OS é ignorada.
 */
export async function removeOsMedia(urls: Array<string | null | undefined>): Promise<void> {
  const paths = urls
    .map((u) => (u ? osMediaPathFromUrl(u) : null))
    .filter((p): p is string => !!p);
  if (!paths.length) return;
  try {
    await supabase.storage.from(OS_MEDIA_BUCKET).remove(paths);
  } catch {
    /* limpeza nunca derruba a ação do usuário */
  }
}

/** Nome único do arquivo no bucket. Sorteado UMA vez por arquivo, pra reenvio
 *  repetir o mesmo caminho em vez de criar cópia. */
export function buildOsMediaPath(serviceOrderId: string, pathPrefix: string, ext: string): string {
  const rand = Math.random().toString(36).slice(2, 6);
  return `${serviceOrderId}/${pathPrefix}-${Date.now()}-${rand}.${ext}`;
}

function publicUrlFor(path: string): string {
  return supabase.storage.from(OS_MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * Envia um arquivo por XHR pra conseguir `onProgress` em bytes. Devolve `false`
 * quando não dá pra usar esse caminho (sem XHR, sem credencial), pra quem
 * chamou cair no `supabase-js`.
 */
async function uploadViaXhr(
  path: string,
  body: Blob,
  onProgress?: (fraction: number) => void,
): Promise<'ok' | 'unsupported' | Error> {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  if (typeof XMLHttpRequest === 'undefined' || !url || !anonKey) return 'unsupported';

  // Técnico logado manda o token da sessão; o link público da OS (anônimo) manda
  // a chave pública — é exatamente o que o supabase-js faria nos dois casos.
  let token = anonKey;
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session?.access_token) token = data.session.access_token;
  } catch {
    /* segue com a chave pública */
  }

  return new Promise<'ok' | Error>((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${url}/storage/v1/object/${OS_MEDIA_BUCKET}/${encodeURI(path)}`, true);
    xhr.setRequestHeader('authorization', `Bearer ${token}`);
    xhr.setRequestHeader('apikey', anonKey);
    xhr.setRequestHeader('x-upsert', 'true'); // reenvio sobrescreve em vez de duplicar
    if (body.type) xhr.setRequestHeader('content-type', body.type);
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && e.total > 0) onProgress(Math.min(0.99, e.loaded / e.total));
      };
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1);
        resolve('ok');
      } else {
        resolve(new Error(`HTTP ${xhr.status}`));
      }
    };
    xhr.onerror = () => resolve(new Error('rede'));
    xhr.ontimeout = () => resolve(new Error('tempo esgotado'));
    xhr.onabort = () => resolve(new Error('cancelado'));
    xhr.send(body);
  });
}

/**
 * Sobe UM arquivo, com reenvio automático. O `path` é fixo entre as tentativas
 * (com `x-upsert`), então uma tentativa que morreu depois de gravar não deixa
 * arquivo duplicado pra trás.
 */
export async function uploadOsMedia(
  path: string,
  body: Blob,
  onProgress?: (fraction: number) => void,
): Promise<{ url: string } | { error: Error }> {
  let last: Error = new Error('falha no envio');
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAY_MS[attempt - 1] ?? 1_200);
    onProgress?.(0);

    const viaXhr = await uploadViaXhr(path, body, onProgress);
    if (viaXhr === 'ok') return { url: publicUrlFor(path) };
    if (viaXhr !== 'unsupported') {
      last = viaXhr;
      continue;
    }

    // Caminho de reserva: sem progresso em bytes, mas com o mesmo reenvio.
    const { error } = await supabase.storage
      .from(OS_MEDIA_BUCKET)
      .upload(path, body, { contentType: body.type || undefined, upsert: true });
    if (!error) {
      onProgress?.(1);
      return { url: publicUrlFor(path) };
    }
    last = error as unknown as Error;
  }
  return { error: last };
}

export interface OsMediaUploadItem {
  /** Caminho final no bucket (de `buildOsMediaPath`). */
  path: string;
  body: Blob;
  /** Devolvido junto com o resultado pra quem chamou reconhecer o arquivo. */
  label?: string;
}

export interface OsMediaUploadOutcome {
  /** URLs que entraram, NA ORDEM dos itens enviados. */
  uploaded: Array<{ url: string; index: number; label?: string }>;
  /** O que não entrou, mesmo depois das tentativas. */
  failed: Array<{ index: number; label?: string; error: Error }>;
}

/**
 * Sobe vários arquivos em paralelo (3 por vez) e devolve SUCESSOS E FALHAS
 * separados — nunca lança. Quem chama é obrigado a decidir o que fazer com o
 * parcial, que é justamente o ponto: antes, uma falha no meio jogava fora o que
 * já tinha subido.
 *
 * `onProgress` recebe a fração do LOTE inteiro (bytes de todos os arquivos),
 * pra barra única em vez de uma por foto.
 */
export async function uploadOsMediaBatch(
  items: OsMediaUploadItem[],
  onProgress?: (fraction: number) => void,
): Promise<OsMediaUploadOutcome> {
  const outcome: OsMediaUploadOutcome = { uploaded: [], failed: [] };
  if (!items.length) return outcome;

  // Progresso do lote ponderado por TAMANHO: 5 fotos onde uma é 3x maior não
  // pode fazer a barra andar em degraus mentirosos.
  const sizes = items.map((i) => Math.max(1, i.body.size));
  const totalBytes = sizes.reduce((a, b) => a + b, 0);
  const done = new Array(items.length).fill(0);
  const report = () => {
    if (!onProgress) return;
    const sent = done.reduce((acc, f, i) => acc + f * sizes[i], 0);
    onProgress(Math.min(1, sent / totalBytes));
  };

  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor++;
      const item = items[index];
      const result = await uploadOsMedia(item.path, item.body, (f) => {
        done[index] = f;
        report();
      });
      if ('url' in result) {
        done[index] = 1;
        outcome.uploaded.push({ url: result.url, index, label: item.label });
      } else {
        done[index] = 0;
        outcome.failed.push({ index, label: item.label, error: result.error });
      }
      report();
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, () => worker()),
  );

  // Ordem dos itens, não ordem de chegada: a galeria do técnico tem que refletir
  // a sequência em que ele escolheu as fotos.
  outcome.uploaded.sort((a, b) => a.index - b.index);
  outcome.failed.sort((a, b) => a.index - b.index);
  return outcome;
}
