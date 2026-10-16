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
 * 🚨 iOS: o `AudioContext` TEM que vir pronto de fora (`audioContext`), criado e
 * destravado DENTRO do gesto do usuário (o `change` do input de arquivo), antes
 * de qualquer `await`. Foi exatamente isso que travou a v1.32.7 em campo: a
 * primeira versão criava o contexto aqui dentro, depois de dois `await`, quando
 * a "ativação transitória" do toque já tinha expirado. Sem gesto válido o
 * WebKit não libera a sessão de áudio, o `play()` de um vídeo COM som fica
 * pendurado pra sempre (não resolve nem rejeita) e a barra congela em 0% — o
 * técnico ficou 1min48 olhando pra ela.
 *
 * Limites honestos:
 *  - Roda em TEMPO REAL (precisa tocar o vídeo inteiro pra ler os quadros). Um
 *    clipe de 28s leva ~28s. Por isso a tela mostra progresso e pede pra não
 *    sair — em segundo plano o iOS congela o loop.
 *  - NADA aqui pode pendurar: todo `await` tem prazo, e um vigia derruba o
 *    processo se o vídeo parar de andar. Falhou, devolve `null` e quem chamou
 *    volta pro aviso claro de "arquivo pesado demais". Nunca troca um erro
 *    explicado por uma tela congelada.
 */

/** Lado MENOR do vídeo de saída (720p em pé ou deitado). */
const TARGET_SHORT_SIDE = 720;
/** Mesma taxa do gravador do app (OsVideoField): ~6 MB em 30s. */
const TARGET_BITRATE = 1_500_000;
/** Teto de quadros por segundo da saída — corta pela metade o custo de 60fps. */
const TARGET_FPS = 30;
/** Sem avanço no `currentTime` por este tempo = travou, aborta. */
const STALL_MS = 8_000;
/** Teto absoluto, não importa o que aconteça. */
const HARD_CAP_MS = 120_000;

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
 * Cria e destrava um `AudioContext`. TEM que ser chamado DENTRO do manipulador
 * do gesto do usuário (o `change` do input), de forma SÍNCRONA, antes de
 * qualquer `await` — é o que dá ao WebKit a permissão de tocar som. Devolve
 * `null` quando o navegador não tem WebAudio (segue sem áudio).
 */
export function unlockAudioContextForCompression(): AudioContext | null {
  try {
    const AC: typeof AudioContext | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();
    // `resume()` sem await de propósito: o que importa é a CHAMADA acontecer
    // dentro do gesto. Esperar aqui já jogaria o resto pra fora da ativação.
    void ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

/** Promessa com prazo. Resolve `fallback` quando estoura, em vez de pendurar. */
function withDeadline<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      () => { clearTimeout(timer); resolve(fallback); },
    );
  });
}

/** Espera um evento do elemento, com prazo. `true` = veio, `false` = estourou. */
function waitEvent(target: HTMLElement, event: string, ms: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const done = (ok: boolean) => {
      clearTimeout(timer);
      target.removeEventListener(event, onEvent);
      resolve(ok);
    };
    const onEvent = () => done(true);
    const timer = setTimeout(() => done(false), ms);
    target.addEventListener(event, onEvent, { once: true });
  });
}

/**
 * Recomprime `file` e devolve o blob menor, ou `null` quando não deu (sem
 * suporte, arquivo ilegível, travou, gravação vazia). NUNCA lança e NUNCA
 * pendura: tudo tem prazo.
 *
 * @param mime/ext      vêm do `pickRecordingMime()` do campo — garante que a
 *                      saída usa o contêiner que o device sabe gravar E tocar.
 * @param audioContext  contexto JÁ destravado no gesto (ver
 *                      `unlockAudioContextForCompression`). Sem ele, o vídeo é
 *                      comprimido MUDO, porque no iOS tocar com som exigiria o
 *                      gesto que já passou.
 * @param onProgress    fração de 0 a 1, pra barra de progresso.
 */
export async function compressVideoInBrowser(
  file: File,
  {
    mime,
    ext,
    audioContext,
    onProgress,
  }: {
    mime: string;
    ext: string;
    audioContext?: AudioContext | null;
    onProgress?: (fraction: number) => void;
  },
): Promise<CompressedVideo | null> {
  if (!canCompressVideoInBrowser()) return null;
  // Guarda de entrada: sem isso, um `file` inválido estoura no
  // `createObjectURL` ANTES do try e a promessa rejeita, contrariando o
  // contrato de "nunca lança" que o campo depende pra cair no aviso claro.
  if (!(file instanceof Blob) || file.size === 0) return null;

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

  let rafId = 0;
  let stopped = false;
  let recorder: MediaRecorder | null = null;

  const cleanup = () => {
    stopped = true;
    if (rafId) cancelAnimationFrame(rafId);
    try { if (recorder && recorder.state !== 'inactive') recorder.stop(); } catch { /* noop */ }
    try { video.pause(); } catch { /* noop */ }
    video.removeAttribute('src');
    video.remove();
    URL.revokeObjectURL(url);
    // `close()` solta o hardware de áudio; sem isso o iPhone fica com a sessão
    // de áudio presa e o próximo play do app sai sem som. O contexto nasceu
    // fora, mas quem usou fecha — ele é de uso único, por compressão.
    audioContext?.close().catch(() => {});
  };

  try {
    // Corre `loadedmetadata` contra `error`: arquivo que o device não sabe ler
    // falha em milissegundos em vez de queimar os 15s inteiros do prazo.
    const gotMetadata = await Promise.race([
      waitEvent(video, 'loadedmetadata', 15_000),
      waitEvent(video, 'error', 15_000).then((errored) => !errored),
    ]);
    if (!gotMetadata) return null;

    const duration = video.duration;
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
    // `alpha:false` + `desynchronized:true` tiram a composição com transparência
    // e a sincronia com o compositor: é o `drawImage` mais barato possível, que
    // é o trabalho repetido 30x por segundo durante todo o clipe.
    const ctx2d = canvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!ctx2d) return null;
    ctx2d.imageSmoothingQuality = 'low';

    const tracks: MediaStreamTrack[] = [...canvas.captureStream(TARGET_FPS).getVideoTracks()];
    if (!tracks.length) return null;

    // Áudio pelo contexto JÁ destravado no gesto. Sem contexto (ou se o WebKit
    // não liberou), segue MUDO e com o elemento mutado — vídeo sem som é melhor
    // que tela travada, e mutado o `play()` nunca depende de permissão.
    let hasAudio = false;
    if (audioContext && audioContext.state === 'running') {
      try {
        const destination = audioContext.createMediaStreamDestination();
        audioContext.createMediaElementSource(video).connect(destination);
        tracks.push(...destination.stream.getAudioTracks());
        hasAudio = true;
      } catch { /* cai pro mudo abaixo */ }
    }
    if (!hasAudio) video.muted = true;

    recorder = new MediaRecorder(new MediaStream(tracks), {
      mimeType: mime,
      videoBitsPerSecond: TARGET_BITRATE,
    });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
    // Sem `timeslice` no start(): é como o gravador do app já grava, e no Safari
    // o fatiamento produz arquivo fragmentado que nem todo player abre.
    const recorded = new Promise<Blob>((resolve) => {
      recorder!.onstop = () => resolve(new Blob(chunks, { type: mime }));
    });

    // Primeiro quadro no canvas ANTES de gravar: o `captureStream` já começa
    // com imagem em vez de alguns quadros pretos na abertura do clipe.
    if (video.readyState < 2) await waitEvent(video, 'loadeddata', 5_000);
    ctx2d.drawImage(video, 0, 0, canvas.width, canvas.height);

    recorder.start();
    // `play()` COM PRAZO. No iOS ele pode ficar pendurado sem resolver nem
    // rejeitar quando o áudio não está liberado — foi o 0% eterno da 1.32.7.
    await withDeadline(video.play().then(() => true).catch(() => false), 5_000, false);

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
    tick();

    // Fim do processo: o que vier primeiro entre o vídeo acabar, o relógio
    // estourar e o VIGIA de travamento. O vigia é o que salva o campo: se o
    // `currentTime` não anda (play recusado, aba em segundo plano, decodificação
    // presa), aborta em 8s em vez de deixar a barra em 0% pra sempre.
    const finished = await new Promise<'ended' | 'timeout' | 'stalled'>((resolve) => {
      let lastTime = -1;
      let lastMove = Date.now();
      const hardCap = setTimeout(() => finish('timeout'), Math.min(HARD_CAP_MS, (duration + 20) * 1000));
      const watchdog = setInterval(() => {
        if (video.currentTime > lastTime + 0.01) {
          lastTime = video.currentTime;
          lastMove = Date.now();
        } else if (Date.now() - lastMove > STALL_MS) {
          finish('stalled');
        }
      }, 1_000);
      const finish = (why: 'ended' | 'timeout' | 'stalled') => {
        clearTimeout(hardCap);
        clearInterval(watchdog);
        video.onended = null;
        resolve(why);
      };
      video.onended = () => finish('ended');
    });

    stopped = true;
    if (recorder.state !== 'inactive') recorder.stop();
    const blob = await withDeadline(recorded, 10_000, new Blob([], { type: mime }));

    // Travou no meio: o pedaço gravado é um vídeo CORTADO. Mandar isso pro
    // técnico seria pior que recusar — ele acharia que subiu o clipe inteiro.
    if (finished !== 'ended' || !blob.size) return null;
    onProgress?.(1);
    return { blob, ext };
  } catch {
    return null;
  } finally {
    cleanup();
  }
}
