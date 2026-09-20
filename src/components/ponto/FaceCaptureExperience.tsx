import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Camera, Check, Loader2, ShieldCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { detectFaceFrame, loadFaceApiModels } from '@/lib/face/faceApiClient';
import {
  evaluateFaceFrame,
  type FaceCaptureGuidance,
  type FaceCapturePose,
  type FaceTemplatePayload,
} from '@/lib/face/faceCapture';
import { FaceScanRing } from '@/components/ponto/FaceScanRing';

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

  return (
    <div className="relative flex min-h-[100svh] flex-col items-center overflow-hidden bg-[#050506] px-5 pb-8 pt-[max(1.25rem,env(safe-area-inset-top))] text-white">
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

      <div className="flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-7 py-12 text-center">
        {setup === 'error' ? (
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
        ) : (
          <>
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.22em] text-white/45">
                {copy.scanLabel}
              </p>
              <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">{copy.poses[currentPose]}</h1>
            </div>

            <div className="relative h-[19rem] w-[19rem] sm:h-[23rem] sm:w-[23rem]">
              <FaceScanRing progress={progress} accentColor={accentColor} />
              <div className="relative h-full w-full overflow-hidden rounded-full bg-white/[0.04] ring-1 ring-white/10">
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

            <div aria-live="polite" className="min-h-16">
              <p className="text-lg font-medium">{statusText}</p>
            </div>
          </>
        )}
      </div>

      <div className="flex max-w-md items-start gap-2.5 text-center text-xs leading-relaxed text-white/45">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <p>{copy.privacy}</p>
      </div>
      {secondaryActionLabel && setup !== 'error' && (
        <Button
          type="button"
          variant="ghost"
          onClick={() => { stopCamera(); onCancel(); }}
          className="mt-3 text-white/70 hover:bg-white/10 hover:text-white"
        >
          {secondaryActionLabel}
        </Button>
      )}
    </div>
  );
}

export default FaceCaptureExperience;
