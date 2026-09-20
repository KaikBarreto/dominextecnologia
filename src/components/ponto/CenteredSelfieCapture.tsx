import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Camera, Loader2, ShieldCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FaceScanRing } from '@/components/ponto/FaceScanRing';
import { detectFaceFrame, loadFaceApiModels } from '@/lib/face/faceApiClient';
import { evaluateFaceFrame, type FaceCaptureGuidance } from '@/lib/face/faceCapture';

export interface CenteredSelfieCopy {
  title: string;
  preparing: string;
  guidance: Record<FaceCaptureGuidance, string>;
  captureNow: string;
  useDeviceCamera: string;
  cameraDenied: string;
  cameraMissing: string;
  genericError: string;
  privacy: string;
  cancel: string;
  closeAria: string;
}

interface CenteredSelfieCaptureProps {
  accentColor: string;
  copy: CenteredSelfieCopy;
  onCapture: (file: File) => void;
  onCancel: () => void;
}

const STABLE_FRAMES = 3;
const LOOP_DELAY_MS = 260;

function cameraMessage(error: unknown, copy: CenteredSelfieCopy) {
  const name = (error as DOMException)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return copy.cameraDenied;
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return copy.cameraMissing;
  return copy.genericError;
}

export function CenteredSelfieCapture({
  accentColor,
  copy,
  onCapture,
  onCancel,
}: CenteredSelfieCaptureProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const stoppedRef = useRef(false);
  const capturingRef = useRef(false);
  const stableRef = useRef(0);
  const [ready, setReady] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [guidance, setGuidance] = useState<FaceCaptureGuidance>('center_face');
  const [stable, setStable] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    stoppedRef.current = true;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const finishWithFile = useCallback((file: File) => {
    if (capturingRef.current) return;
    capturingRef.current = true;
    stopCamera();
    onCapture(file);
  }, [onCapture, stopCamera]);

  const captureFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.videoWidth <= 0 || video.videoHeight <= 0 || capturingRef.current) return;
    const scale = Math.min(1, 960 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const context = canvas.getContext('2d');
    if (!context) return;
    // A prévia é espelhada; salvar no mesmo sentido evita a sensação de que a
    // foto "virou" depois da captura.
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob) return;
      finishWithFile(new File([blob], `selfie-${Date.now()}.jpg`, { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.88);
  }, [finishWithFile]);

  useEffect(() => {
    stoppedRef.current = false;
    let timer: number | null = null;

    const schedule = () => {
      if (!stoppedRef.current) timer = window.setTimeout(() => void detect(), LOOP_DELAY_MS);
    };
    const detect = async () => {
      const video = videoRef.current;
      if (stoppedRef.current || !video || video.readyState < 2) {
        schedule();
        return;
      }
      try {
        const frame = await detectFaceFrame(video);
        const evaluation = evaluateFaceFrame(frame.metrics, 'front');
        setGuidance(evaluation.guidance);
        if (evaluation.ready) {
          stableRef.current += 1;
          setStable(stableRef.current);
          if (stableRef.current >= STABLE_FRAMES) {
            captureFrame();
            return;
          }
        } else {
          stableRef.current = 0;
          setStable(0);
        }
      } catch {
        // O detector e uma ajuda de enquadramento. Se falhar, a camera e o
        // botao manual continuam disponiveis e a batida nao fica bloqueada.
        setModelReady(false);
      }
      schedule();
    };

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices?.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 960 } },
          audio: false,
        });
        if (!stream) throw new DOMException('Camera unavailable', 'NotFoundError');
        if (stoppedRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setReady(true);

        // Carrega depois que a camera ja esta visivel. O modelo melhora o
        // enquadramento, mas nunca e pre-requisito para tirar a selfie.
        void loadFaceApiModels().then(() => {
          if (stoppedRef.current) return;
          setModelReady(true);
          schedule();
        }).catch(() => setModelReady(false));
      } catch (cameraError) {
        stopCamera();
        setError(cameraMessage(cameraError, copy));
      }
    };

    void start();
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      stopCamera();
    };
  }, [captureFrame, copy, stopCamera]);

  const handleFallbackFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) finishWithFile(file);
    event.target.value = '';
  };

  const status = modelReady ? copy.guidance[guidance] : copy.preparing;

  return (
    <div className="relative flex min-h-[100svh] flex-col items-center overflow-hidden bg-[#050506] px-5 pb-8 pt-[max(1.25rem,env(safe-area-inset-top))] text-white">
      <button
        type="button"
        aria-label={copy.closeAria}
        onClick={() => { stopCamera(); onCancel(); }}
        className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-20 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white/80 backdrop-blur-md hover:bg-white/15"
      >
        <X className="h-5 w-5" />
      </button>

      <div className="flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-7 py-12 text-center">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.22em] text-white/45">Selfie do ponto</p>
          <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">{copy.title}</h1>
        </div>

        {error ? (
          <div className="flex max-w-md flex-col items-center gap-5">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-destructive/15 text-destructive">
              <AlertCircle className="h-10 w-10" />
            </div>
            <p className="text-lg font-medium">{error}</p>
            <Button type="button" size="lg" onClick={() => fileRef.current?.click()}>
              <Camera className="h-4 w-4" /> {copy.useDeviceCamera}
            </Button>
          </div>
        ) : (
          <>
            <div className="relative h-[19rem] w-[19rem] sm:h-[23rem] sm:w-[23rem]">
              <FaceScanRing progress={stable / STABLE_FRAMES} accentColor={accentColor} />
              <div className="relative h-full w-full overflow-hidden rounded-full bg-white/[0.04] ring-1 ring-white/10">
                <video ref={videoRef} muted playsInline autoPlay className="h-full w-full scale-x-[-1] object-cover" />
                {!ready && (
                  <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0b]/90">
                    <Loader2 className="h-9 w-9 animate-spin" style={{ color: accentColor }} />
                  </div>
                )}
              </div>
            </div>
            <div aria-live="polite" className="min-h-20">
              <p className="text-lg font-medium">{status}</p>
              <Button type="button" variant="ghost" disabled={!ready} onClick={captureFrame} className="mt-2 text-white/70 hover:bg-white/10 hover:text-white">
                <Camera className="h-4 w-4" /> {copy.captureNow}
              </Button>
            </div>
          </>
        )}
      </div>

      <div className="flex max-w-md items-start gap-2.5 text-center text-xs leading-relaxed text-white/45">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <p>{copy.privacy}</p>
      </div>
      <button type="button" onClick={onCancel} className="mt-3 text-sm text-white/55 hover:text-white">
        {copy.cancel}
      </button>
      <input ref={fileRef} type="file" accept="image/*" capture="user" className="hidden" onChange={handleFallbackFile} />
    </div>
  );
}

export default CenteredSelfieCapture;
