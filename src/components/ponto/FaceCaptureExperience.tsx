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

export type { FaceTemplatePayload } from '@/lib/face/faceCapture';

export interface FaceCaptureCopy {
  preparing: string;
  requestingCamera: string;
  captureLabel: string;
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
  mode?: 'enrollment' | 'verification';
}

type SetupState = 'preparing' | 'requesting_camera' | 'scanning' | 'error';

const ENROLLMENT_POSES: FaceCapturePose[] = ['front', 'first_side', 'opposite_side'];
const VERIFICATION_POSES: FaceCapturePose[] = ['front'];
const STABLE_FRAMES = 3;
const LOOP_DELAY_MS = 260;

function ScanRing({ progress, accentColor }: { progress: number; accentColor: string }) {
  const ticks = 48;
  const active = Math.round(Math.max(0, Math.min(1, progress)) * ticks);
  return (
    <div className="pointer-events-none absolute -inset-3" aria-hidden>
      {Array.from({ length: ticks }).map((_, index) => (
        <span
          key={index}
          className="absolute left-1/2 top-1/2 h-2.5 w-0.5 origin-[50%_10.75rem] rounded-full transition-colors duration-200 motion-reduce:transition-none sm:origin-[50%_12.75rem]"
          style={{
            backgroundColor: index < active ? accentColor : 'rgba(255,255,255,0.18)',
            transform: `translate(-50%, -10.75rem) rotate(${index * (360 / ticks)}deg)`,
          }}
        />
      ))}
    </div>
  );
}

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
}: FaceCaptureExperienceProps) {
  const poses = mode === 'verification' ? VERIFICATION_POSES : ENROLLMENT_POSES;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stoppedRef = useRef(false);
  const stableFramesRef = useRef(0);
  const capturesRef = useRef<FaceTemplatePayload[]>([]);
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
    capturesRef.current = [];
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
      loopTimer = window.setTimeout(() => void detect(), LOOP_DELAY_MS);
    };

    const capture = (embedding: number[], qualityScore: number, yawSign: -1 | 0 | 1) => {
      const next = [...capturesRef.current, { embedding, quality_score: qualityScore }];
      capturesRef.current = next;
      stableFramesRef.current = 0;
      setStableFrames(0);
      setJustCaptured(true);

      if (poseIndexRef.current === 1) firstSideSignRef.current = yawSign;
      if (next.length === poses.length) {
        stopCamera();
        transitionTimerRef.current = window.setTimeout(() => onComplete(next), 450);
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
      }, 900);
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
        );
        setGuidance(evaluation.guidance);

        if (evaluation.ready && frame.embedding) {
          stableFramesRef.current += 1;
          setStableFrames(stableFramesRef.current);
          if (stableFramesRef.current >= STABLE_FRAMES) {
            capture(frame.embedding, evaluation.qualityScore, evaluation.yawSign);
            return;
          }
        } else {
          stableFramesRef.current = 0;
          setStableFrames(0);
        }
      } catch {
        stableFramesRef.current = 0;
        setStableFrames(0);
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
  }, [attempt, copy, onComplete, poses, stopCamera]);

  const progress = useMemo(
    () => (poseIndex + Math.min(stableFrames, STABLE_FRAMES) / STABLE_FRAMES) / poses.length,
    [poseIndex, poses.length, stableFrames],
  );

  const currentPose = poses[Math.min(poseIndex, poses.length - 1)];
  const statusText = justCaptured ? copy.captured : copy.guidance[guidance];

  return (
    <div className="relative flex min-h-[100svh] flex-col items-center overflow-hidden bg-[#050506] px-5 pb-8 pt-[max(1.25rem,env(safe-area-inset-top))] text-white">
      <button
        type="button"
        aria-label={copy.closeAria}
        onClick={() => { stopCamera(); onCancel(); }}
        className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-20 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white/80 backdrop-blur-md transition-colors hover:bg-white/15"
      >
        <X className="h-5 w-5" />
      </button>

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
                {copy.captureLabel.replace('{current}', String(poseIndex + 1)).replace('{total}', String(poses.length))}
              </p>
              <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">{copy.poses[currentPose]}</h1>
            </div>

            <div className="relative h-[19rem] w-[19rem] sm:h-[23rem] sm:w-[23rem]">
              <ScanRing progress={progress} accentColor={accentColor} />
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
              <div className="mt-3 flex justify-center gap-2" aria-hidden>
                {poses.map((_, index) => (
                  <span
                    key={index}
                    className="h-1.5 rounded-full transition-all duration-300 motion-reduce:transition-none"
                    style={{
                      width: index === poseIndex ? 32 : 12,
                      backgroundColor: index < poseIndex ? accentColor : index === poseIndex ? accentColor : 'rgba(255,255,255,0.18)',
                    }}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="flex max-w-md items-start gap-2.5 text-center text-xs leading-relaxed text-white/45">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <p>{copy.privacy}</p>
      </div>
    </div>
  );
}

export default FaceCaptureExperience;
