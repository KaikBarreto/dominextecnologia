import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, Camera, Check, Loader2, ShieldCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { detectFaceFrame, loadFaceApiModels } from '@/lib/face/faceApiClient';
import {
  evaluateFaceFrame,
  type FaceCaptureGuidance,
  type FaceCapturePose,
  type FaceTemplatePayload,
} from '@/lib/face/faceCapture';
import { FaceIdFrame } from '@/components/ponto/FaceIdFrame';

export type { FaceTemplatePayload } from '@/lib/face/faceCapture';

export interface FaceCaptureCopy {
  preparing: string;
  requestingCamera: string;
  captureLabel: string;
  scanLabel: string;
  poses: Record<FaceCapturePose, string>;
  guidance: Record<FaceCaptureGuidance, string>;
  captured: string;
  privacy: string;
  cameraDenied: string;
  cameraMissing: string;
  genericError: string;
  tryAgain: string;
  cancel: string;
  closeAria: string;
}

interface FaceCaptureExperienceProps {
  accentColor: string;
  copy: FaceCaptureCopy;
  onComplete: (templates: FaceTemplatePayload[]) => void;
  onCancel: () => void;
  mode?: 'enrollment' | 'verification' | 'identification';
  /** Acao secundaria opcional, usada pelo quiosque para abrir a busca manual. */
  secondaryActionLabel?: string;
  showClose?: boolean;
  /**
   * Conteudo extra (relogio + data da empresa) no topo da coluna direita, so
   * visivel no layout de 2 colunas em landscape (tablet do quiosque deitado).
   * Nunca aparece em retrato. O cadastro de biometria (mode="enrollment") nao
   * passa essa prop — logica de relogio/i18n fica no caller, nao aqui dentro.
   */
  headerSlot?: ReactNode;
  /**
   * Quando presente, substitui o bloco rotulo/pose + status (ex.: card de
   * resultado do reconhecimento facial do quiosque), mantendo a mesma
   * moldura (video + coluna direita). A camera ja foi desligada por
   * stopCamera() antes deste slot entrar em uso — ver capture() abaixo, nao
   * mexer nesse contrato.
   */
  statusSlot?: ReactNode;
}

type SetupState = 'preparing' | 'requesting_camera' | 'scanning' | 'error';

const ENROLLMENT_POSES: FaceCapturePose[] = ['front', 'first_side', 'opposite_side'];
const VERIFICATION_POSES: FaceCapturePose[] = ['front'];
// No quiosque, o pequeno giro comprova movimento ao vivo antes do 1:N. A
// comparacao usa a captura frontal; a segunda leitura e apenas o desafio de
// vivacidade e nunca sai do aparelho.
const IDENTIFICATION_POSES: FaceCapturePose[] = ['front', 'first_side'];
const ENROLLMENT_CONFIRMATIONS = 3;
const LIVE_SCAN_CONFIRMATIONS = 2;
const MAX_TRANSIENT_MISSES = 1;
const ENROLLMENT_LOOP_DELAY_MS = 260;
// A leitura ao vivo nao precisa disputar todos os quadros da camera. Um ritmo
// proximo de 3 analises/s reduz a disputa de CPU em aparelhos modestos; cada
// analise continua esperando a anterior terminar, sem criar fila de frames.
const LIVE_SCAN_LOOP_DELAY_MS = 320;

function cameraErrorMessage(error: unknown, copy: FaceCaptureCopy): string {
  const name = (error as DOMException)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return copy.cameraDenied;
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return copy.cameraMissing;
  return copy.genericError;
}

export function FaceCaptureExperience({
  accentColor,
  copy,
  onComplete,
  onCancel,
  mode = 'enrollment',
  secondaryActionLabel,
  showClose = true,
  headerSlot,
  statusSlot,
}: FaceCaptureExperienceProps) {
  const poses = mode === 'verification'
    ? VERIFICATION_POSES
    : mode === 'identification'
      ? IDENTIFICATION_POSES
      : ENROLLMENT_POSES;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stoppedRef = useRef(false);
  const stableFramesRef = useRef(0);
  const transientMissesRef = useRef(0);
  const capturesRef = useRef<FaceTemplatePayload[]>([]);
  const bestCandidateRef = useRef<FaceTemplatePayload | null>(null);
  const firstSideSignRef = useRef<-1 | 0 | 1>(0);
  const poseIndexRef = useRef(0);
  const transitionTimerRef = useRef<number | null>(null);

  const [setup, setSetup] = useState<SetupState>('preparing');
  const [setupError, setSetupError] = useState('');
  const [poseIndex, setPoseIndex] = useState(0);
  const [stableFrames, setStableFrames] = useState(0);
  const [guidance, setGuidance] = useState<FaceCaptureGuidance>('hold_still');
  const [justCaptured, setJustCaptured] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Cadastro, verificacao e identificacao sao apresentados como UMA leitura
  // guiada. O cadastro continua mais rigoroso nos bastidores: exige tres
  // confirmacoes por pose e usa os limites estritos antes de persistir os
  // templates. Quiosque/verificacao usam a tolerancia propria de leitura ao vivo.
  const isLiveMatch = mode !== 'enrollment';
  const requiredConfirmations = isLiveMatch ? LIVE_SCAN_CONFIRMATIONS : ENROLLMENT_CONFIRMATIONS;
  const loopDelayMs = isLiveMatch ? LIVE_SCAN_LOOP_DELAY_MS : ENROLLMENT_LOOP_DELAY_MS;

  const stopCamera = useCallback(() => {
    stoppedRef.current = true;
    if (transitionTimerRef.current !== null) {
      window.clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  useEffect(() => {
    stoppedRef.current = false;
    stableFramesRef.current = 0;
    transientMissesRef.current = 0;
    capturesRef.current = [];
    bestCandidateRef.current = null;
    firstSideSignRef.current = 0;
    poseIndexRef.current = 0;
    setPoseIndex(0);
    setStableFrames(0);
    setGuidance('hold_still');
    setJustCaptured(false);
    setSetupError('');

    let loopTimer: number | null = null;

    const scheduleDetection = () => {
      if (stoppedRef.current) return;
      loopTimer = window.setTimeout(() => void detect(), loopDelayMs);
    };

    const capture = (embedding: number[], qualityScore: number, yawSign: -1 | 0 | 1) => {
      const next = [...capturesRef.current, { embedding, quality_score: qualityScore }];
      capturesRef.current = next;
      stableFramesRef.current = 0;
      transientMissesRef.current = 0;
      bestCandidateRef.current = null;
      setStableFrames(0);
      const finalCapture = next.length === poses.length;
      // Confirmacao visual so no fim. Mostrar um check entre poses faria o
      // usuario perceber varias "capturas", embora seja uma sessao continua.
      setJustCaptured(finalCapture);

      if (poseIndexRef.current === 1) firstSideSignRef.current = yawSign;
      if (finalCapture) {
        stopCamera();
        transitionTimerRef.current = window.setTimeout(() => onComplete(next), 260);
        return;
      }

      poseIndexRef.current += 1;
      setPoseIndex(poseIndexRef.current);
      transitionTimerRef.current = window.setTimeout(() => {
        if (stoppedRef.current) return;
        setJustCaptured(false);
        setGuidance(
          poseIndexRef.current === 1 ? 'turn_to_one_side' : 'turn_to_other_side',
        );
        scheduleDetection();
      }, 120);
    };

    const detect = async () => {
      if (stoppedRef.current || !videoRef.current || videoRef.current.readyState < 2) {
        scheduleDetection();
        return;
      }
      try {
        const frame = await detectFaceFrame(videoRef.current);
        if (stoppedRef.current) return;
        const evaluation = evaluateFaceFrame(
          frame.metrics,
          poses[poseIndexRef.current],
          firstSideSignRef.current,
          { tolerateMotion: isLiveMatch },
        );
        setGuidance(evaluation.guidance);

        if (evaluation.ready && frame.embedding) {
          transientMissesRef.current = 0;
          if (
            !bestCandidateRef.current ||
            evaluation.qualityScore > bestCandidateRef.current.quality_score
          ) {
            bestCandidateRef.current = {
              embedding: frame.embedding,
              quality_score: evaluation.qualityScore,
            };
          }
          stableFramesRef.current += 1;
          setStableFrames(stableFramesRef.current);
          if (stableFramesRef.current >= requiredConfirmations) {
            const best = bestCandidateRef.current;
            capture(
              best?.embedding ?? frame.embedding,
              best?.quality_score ?? evaluation.qualityScore,
              evaluation.yawSign,
            );
            return;
          }
        } else {
          transientMissesRef.current += 1;
          // Um unico quadro ruim costuma ser apenas movimento ou autofocus.
          // Mais de um erro seguido reinicia a confirmacao; multiplas pessoas
          // sempre reiniciam imediatamente por seguranca.
          if (
            evaluation.guidance === 'multiple_faces' ||
            transientMissesRef.current > MAX_TRANSIENT_MISSES
          ) {
            stableFramesRef.current = 0;
            transientMissesRef.current = 0;
            bestCandidateRef.current = null;
            setStableFrames(0);
          }
        }
      } catch {
        transientMissesRef.current += 1;
        if (transientMissesRef.current > MAX_TRANSIENT_MISSES) {
          stableFramesRef.current = 0;
          transientMissesRef.current = 0;
          bestCandidateRef.current = null;
          setStableFrames(0);
        }
        setGuidance('hold_still');
      }
      scheduleDetection();
    };

    const start = async () => {
      try {
        setSetup('preparing');
        const modelPromise = loadFaceApiModels();
        setSetup('requesting_camera');
        const streamPromise = navigator.mediaDevices?.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 720 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        if (!streamPromise) throw new DOMException('Camera unavailable', 'NotFoundError');

        const [stream] = await Promise.all([streamPromise, modelPromise]);
        if (stoppedRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setSetup('scanning');
        scheduleDetection();
      } catch (error) {
        stopCamera();
        setSetupError(cameraErrorMessage(error, copy));
        setSetup('error');
      }
    };

    void start();
    return () => {
      if (loopTimer) window.clearTimeout(loopTimer);
      stopCamera();
    };
  }, [attempt, copy, isLiveMatch, loopDelayMs, onComplete, poses, requiredConfirmations, stopCamera]);

  const progress = useMemo(
    () => (poseIndex + Math.min(stableFrames, requiredConfirmations) / requiredConfirmations) / poses.length,
    [poseIndex, poses.length, requiredConfirmations, stableFrames],
  );

  const currentPose = poses[Math.min(poseIndex, poses.length - 1)];
  const statusText = justCaptured ? copy.captured : copy.guidance[guidance];

  // Limiar de 2 colunas: SÓ landscape com altura mínima de tablet. Celular
  // deitado (ex.: 667x375) tem menos de 600px de altura e fica de fora de
  // propósito — o mesmo limiar é usado no produto irmão, os dois precisam
  // bater. Em retrato nada muda (layout de coluna única de sempre), EXCETO a
  // moldura (círculo -> Face ID) — é identidade visual, vale nas duas
  // orientações.
  //
  // As classes landscape são escritas por extenso (nunca via variável
  // interpolada): o scanner estático do Tailwind só gera CSS pra classes que
  // aparecem como string literal completa no arquivo-fonte.
  //
  // `order-2` fixa a posição do vídeo no fluxo de retrato (entre o rótulo da
  // pose e o status — ou logo após o statusSlot, ver os dois ramos abaixo),
  // independente de onde ele fica no DOM: em retrato o wrapper da coluna 2
  // vira `contents` e promove seus filhos pro MESMO flex container do
  // vídeo, então a ordem visual é só `order-*`, não a ordem no arquivo. Em
  // landscape o valor de `order` não tem efeito (grid-column/row explícitos
  // decidem a posição), por isso não precisa de override.
  const videoFrame = (
    <div className="relative order-2 h-[19rem] w-[19rem] sm:h-[23rem] sm:w-[23rem] kiosk-landscape:col-start-1 kiosk-landscape:row-start-1 kiosk-landscape:h-[29rem] kiosk-landscape:w-[29rem] kiosk-landscape:justify-self-center">
      <FaceIdFrame progress={progress} accentColor={accentColor} />
      <div className="relative h-full w-full overflow-hidden rounded-[2.5rem] bg-white/[0.04] ring-1 ring-white/10">
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          aria-label={copy.poses[currentPose]}
          className="h-full w-full scale-x-[-1] object-cover"
        />
        {setup !== 'scanning' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0a0a0b]/90">
            <Loader2 className="h-9 w-9 animate-spin motion-reduce:animate-none" style={{ color: accentColor }} />
            <p className="max-w-[14rem] text-sm text-white/65">
              {setup === 'preparing' ? copy.preparing : copy.requestingCamera}
            </p>
          </div>
        )}
        {justCaptured && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/55 backdrop-blur-sm">
            <div className="flex h-24 w-24 items-center justify-center rounded-full" style={{ backgroundColor: accentColor }}>
              <Check className="h-12 w-12 text-white" strokeWidth={3} />
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // Nota de privacidade: SEMPRE visível (inclusive no erro — regra que já
  // existia e não está em escopo mudar). `[@media(landscape)]:col-start-2`
  // funciona nos dois usos abaixo: como item direto da grade (erro, sem
  // pai-grid real) ou como filho normal dentro do wrapper da coluna 2 (grid
  // só tem efeito em item direto de um `display:grid`; dentro de um
  // `display:flex` a propriedade é ignorada, então não atrapalha lá).
  const privacyNote = (
    <div className="order-4 flex max-w-md items-start gap-2.5 text-center text-xs leading-relaxed text-white/45 kiosk-landscape:col-start-2 kiosk-landscape:text-left">
      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
      <p>{copy.privacy}</p>
    </div>
  );

  return (
    <div className="relative flex min-h-[100svh] flex-col items-center overflow-hidden bg-[#050506] px-5 pb-8 pt-[max(1.25rem,env(safe-area-inset-top))] text-white kiosk-landscape:grid kiosk-landscape:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] kiosk-landscape:items-center kiosk-landscape:justify-center kiosk-landscape:gap-x-14 kiosk-landscape:px-16 kiosk-landscape:pb-6">
      {showClose && (
        <button
          type="button"
          aria-label={copy.closeAria}
          onClick={() => { stopCamera(); onCancel(); }}
          className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-20 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white/80 backdrop-blur-md transition-colors hover:bg-white/15"
        >
          <X className="h-5 w-5" />
        </button>
      )}

      {setup === 'error' ? (
        <>
          <div className="flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-7 py-12 text-center">
            <div className="flex max-w-md flex-col items-center gap-5">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-destructive/15 text-destructive">
                <AlertCircle className="h-10 w-10" />
              </div>
              <p className="text-xl font-semibold">{setupError}</p>
              <div className="flex flex-wrap justify-center gap-3">
                <Button type="button" size="lg" onClick={() => setAttempt((value) => value + 1)}>
                  <Camera className="h-4 w-4" /> {copy.tryAgain}
                </Button>
                <Button type="button" size="lg" variant="outline" onClick={onCancel} className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white">
                  {copy.cancel}
                </Button>
              </div>
            </div>
          </div>
          {privacyNote}
        </>
      ) : (
        <div className="flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-7 py-12 text-center kiosk-landscape:contents">
          {videoFrame}

          {/* Coluna 2 em landscape: cabeçalho + rótulo/status (ou statusSlot)
              + privacidade + CTA secundário numa ÚNICA pilha vertical
              (gap-6), centralizada na altura da câmera. Em retrato esse
              agrupamento desaparece (`contents`) e cada filho volta a fluir
              solto no MESMO flex column do vídeo — a ordem visual usa
              `order-*` (ver comentário em `videoFrame`), não a posição no
              arquivo. */}
          <div className="contents kiosk-landscape:col-start-2 kiosk-landscape:row-start-1 kiosk-landscape:flex kiosk-landscape:flex-col kiosk-landscape:items-start kiosk-landscape:gap-6 kiosk-landscape:text-left">
            {headerSlot && (
              <div className="hidden kiosk-landscape:block">
                {headerSlot}
              </div>
            )}

            {statusSlot ? (
              <div className="order-3">{statusSlot}</div>
            ) : (
              <>
                <div className="order-1 kiosk-landscape:text-left">
                  <p className="text-sm font-medium uppercase tracking-[0.22em] text-white/45">
                    {copy.scanLabel}
                  </p>
                  <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">{copy.poses[currentPose]}</h1>
                </div>

                <div aria-live="polite" className="order-3 min-h-16 kiosk-landscape:text-left">
                  <p className="text-lg font-medium">{statusText}</p>
                </div>
              </>
            )}

            {privacyNote}

            {secondaryActionLabel && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => { stopCamera(); onCancel(); }}
                className="order-5 mt-3 text-white/70 hover:bg-white/10 hover:text-white kiosk-landscape:mt-0"
              >
                {secondaryActionLabel}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default FaceCaptureExperience;
