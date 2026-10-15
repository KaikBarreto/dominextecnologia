/**
 * Recompressão de vídeo NO PRÓPRIO NAVEGADOR, sem servidor e sem biblioteca.
 *
 * Por que existe: a pergunta de vídeo do checklist aceita clipe de até 30s, mas
 * o teto de UPLOAD é de PESO (o limite do Storage do projeto). Um clipe de 28s
 * gravado em 4K no iPhone chega a 88 MB e era simplesmente recusado — o técnico
 * ficava sem saída em campo. Em vez de recusar, reduzimos o vídeo aqui mesmo:
 * 4K/1080p60 pesado vira ~720p a 1,5 Mbps (o MESMO ajuste do gravador do app,
 * que sai com ~6 MB em 30s).
 *
 * Como funciona (só APIs que o Safari do iPhone já tem, nenhuma dependência):
 *  1. O arquivo entra num `<video>` fora da tela (fora da tela, mas NUNCA
 *     `display:none` — WebKit para de decodificar e o loop de quadros morre).
 *  2. Cada quadro é desenhado num `<canvas>` já na resolução menor. O canvas
 *     vira faixa de vídeo por `captureStream()`.
 *  3. O áudio é desviado pelo WebAudio (`createMediaElementSource` →
 *     `createMediaStreamDestination`). Esse desvio é o que faz o vídeo tocar
 *     MUDO pro técnico: uma vez conectado ao grafo, o som não vai mais pro
 *     alto-falante, só pro gravador.
 *  4. As duas faixas entram num `MediaRecorder` — o mesmo caminho (e o mesmo
 *     mimeType) que o app já usa pra gravar na hora, então o resultado toca nos
 *     mesmos lugares que um clipe gravado pelo botão.
 *
 * Limites honestos:
 *  - Roda em TEMPO REAL (precisa tocar o vídeo inteiro pra ler os quadros). Um
 *    clipe de 28s leva ~28s. Por isso a tela mostra progresso e pede pra não
 *    sair — em segundo plano o iOS congela o loop.
 *  - Se qualquer etapa não existir ou falhar, devolve `null` em vez de estourar:
 *    quem chamou volta pro aviso claro de "arquivo pesado demais". Nunca troca
 *    um erro explicado por um erro silencioso.
 */

/** Lado MENOR do vídeo de saída (720p em pé ou deitado). */
const TARGET_SHORT_SIDE = 720;
/** Mesma taxa do gravador do app (OsVideoField): ~6 MB em 30s. */
const TARGET_BITRATE = 1_500_000;
/** Teto de quadros por segundo da saída — corta pela metade o custo de 60fps. */
const TARGET_FPS = 30;

export interface CompressedVideo {
  blob: Blob;
  ext: string;
}

/** O navegador tem as peças pra recomprimir? Checar ANTES de prometer na UI. */
export function canCompressVideoInBrowser(): boolean {
  return (
    typeof document !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function'
  );
}

/**
 * Recomprime `file` e devolve o blob menor, ou `null` quando não deu (sem
 * suporte, arquivo ilegível, gravação vazia). NUNCA lança.
 *
 * @param mime/ext  vêm do `pickRecordingMime()` do campo — garante que a saída
 *                  usa o mesmo contêiner que o device sabe gravar E tocar.
 * @param onProgress fração de 0 a 1, pra barra de progresso.
 */
export async function compressVideoInBrowser(
  file: File,
  { mime, ext, onProgress }: { mime: string; ext: string; onProgress?: (fraction: number) => void },
): Promise<CompressedVideo | null> {
  if (!canCompressVideoInBrowser()) return null;

  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.src = url;
  video.playsInline = true;
  video.preload = 'auto';
  // Fora da tela SEM `display:none`/`visibility:hidden`: o WebKit precisa achar
  // que o elemento está sendo exibido pra continuar decodificando quadros.
  video.setAttribute('aria-hidden', 'true');
  video.style.cssText =
    'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0.01;pointer-events:none;z-index:-1';
  document.body.appendChild(video);

  let audioCtx: AudioContext | null = null;
  let rafId = 0;
  let stopped = false;

  const cleanup = () => {
    stopped = true;
    if (rafId) cancelAnimationFrame(rafId);
    try { video.pause(); } catch { /* noop */ }
    video.removeAttribute('src');
    video.remove();
    URL.revokeObjectURL(url);
    // `close()` solta o hardware de áudio; sem isso o iPhone fica com a sessão
    // de áudio presa e o próximo play do app sai sem som.
    audioCtx?.close().catch(() => {});
  };

  try {
    const duration = await new Promise<number>((resolve, reject) => {
      video.onloadedmetadata = () => resolve(video.duration);
      video.onerror = () => reject(new Error('metadata'));
    });

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh || !Number.isFinite(duration) || duration <= 0) return null;

    // Reduz pelo lado MENOR (funciona igual em pé e deitado) e arredonda pra
    // par: codificador de vídeo rejeita/borra dimensão ímpar.
    const scale = Math.min(1, TARGET_SHORT_SIDE / Math.min(vw, vh));
    const even = (n: number) => Math.max(2, Math.round((n * scale) / 2) * 2);
    const canvas = document.createElement('canvas');
    canvas.width = even(vw);
    canvas.height = even(vh);
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return null;

    const tracks: MediaStreamTrack[] = [...canvas.captureStream(TARGET_FPS).getVideoTracks()];
    if (!tracks.length) return null;

    // Áudio desviado pro gravador. Se não der, segue SEM áudio (vídeo mudo é
    // melhor que recusar o envio) — mas aí precisa mutar o elemento, senão o
    // clipe toca alto na mão do técnico durante a compressão.
    try {
      const AC: typeof AudioContext | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) throw new Error('sem AudioContext');
      audioCtx = new AC();
      if (audioCtx.state === 'suspended') await audioCtx.resume();
      const destination = audioCtx.createMediaStreamDestination();
      audioCtx.createMediaElementSource(video).connect(destination);
      tracks.push(...destination.stream.getAudioTracks());
    } catch {
      audioCtx = null;
      video.muted = true;
    }

    const recorder = new MediaRecorder(new MediaStream(tracks), {
      mimeType: mime,
      videoBitsPerSecond: TARGET_BITRATE,
    });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
    // Sem `timeslice` no start(): é como o gravador do app já grava, e no Safari
    // o fatiamento produz arquivo fragmentado que nem todo player abre.
    const recorded = new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: mime }));
    });

    // `requestVideoFrameCallback` entrega exatamente um quadro decodificado por
    // vez (sem duplicar nem pular); onde não existe, cai no rAF.
    type WithRVFC = HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };
    const rvfc = (video as WithRVFC).requestVideoFrameCallback?.bind(video);
    // O progresso é AVISADO no máximo 4x por segundo. Sem essa trava, cada
    // quadro vira um setState e a árvore do checklist re-renderiza 30x/s
    // durante ~30s, roubando a thread principal justamente de quem está
    // desenhando os quadros — a compressão fica mais lenta que o vídeo.
    let lastReport = 0;
    const tick = () => {
      if (stopped) return;
      ctx2d.drawImage(video, 0, 0, canvas.width, canvas.height);
      const now = Date.now();
      if (now - lastReport >= 250) {
        lastReport = now;
        onProgress?.(Math.min(0.99, video.currentTime / duration));
      }
      if (rvfc) rvfc(tick);
      else rafId = requestAnimationFrame(tick);
    };

    // Primeiro quadro no canvas ANTES de gravar: o `captureStream` já começa
    // com imagem em vez de alguns quadros pretos na abertura do clipe.
    if (video.readyState < 2) {
      await new Promise<void>((resolve) => {
        const guard = setTimeout(resolve, 3000);
        video.onloadeddata = () => { clearTimeout(guard); resolve(); };
      });
    }
    ctx2d.drawImage(video, 0, 0, canvas.width, canvas.height);

    recorder.start();
    await video.play();
    tick();

    await new Promise<void>((resolve) => {
      // Trava de segurança: se o `ended` não vier (quadro travado, iOS
      // suspendendo a aba), para sozinho em vez de pendurar a tela pra sempre.
      const guard = setTimeout(resolve, (duration + 5) * 1000);
      video.onended = () => { clearTimeout(guard); resolve(); };
    });

    stopped = true;
    if (recorder.state !== 'inactive') recorder.stop();
    const blob = await recorded;
    if (!blob.size) return null;
    onProgress?.(1);
    return { blob, ext };
  } catch {
    return null;
  } finally {
    cleanup();
  }
}
