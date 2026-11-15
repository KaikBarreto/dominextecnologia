import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  canScanInventoryIdentifierWithCamera,
  getInventoryBarcodeDetectorConstructor,
} from '@/lib/pdv/inventoryCameraCapability';

interface InventoryIdentifierCameraScannerProps {
  onScan: (code: string) => void;
  disabled?: boolean;
  className?: string;
  triggerVariant?: 'default' | 'icon';
}

export function InventoryIdentifierCameraScanner({
  onScan,
  disabled = false,
  className,
  triggerVariant = 'default',
}: InventoryIdentifierCameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const scannerControlsRef = useRef<{ stop: () => void } | null>(null);
  const scanSessionRef = useRef(0);
  const disabledRef = useRef(disabled);
  const onScanRef = useRef(onScan);
  const [active, setActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const supported = canScanInventoryIdentifierWithCamera();

  useEffect(() => { onScanRef.current = onScan; }, [onScan]);

  useEffect(() => { disabledRef.current = disabled; }, [disabled]);

  const stop = useCallback(() => {
    scanSessionRef.current += 1;
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    scannerControlsRef.current?.stop();
    scannerControlsRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setActive(false);
    setStarting(false);
  }, []);

  useEffect(() => stop, [stop]);
  useEffect(() => {
    if (disabled) stop();
  }, [disabled, stop]);

  async function start() {
    const Constructor = getInventoryBarcodeDetectorConstructor();
    if (!navigator.mediaDevices?.getUserMedia || disabled) return;
    const scanSession = scanSessionRef.current + 1;
    scanSessionRef.current = scanSession;
    setStarting(true);
    setMessage(null);
    try {
      const video = videoRef.current;
      if (!video) return;

      if (!Constructor) {
        setActive(true);
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        if (disabledRef.current || scanSessionRef.current !== scanSession) return;
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' } }, audio: false },
          video,
          (result) => {
            const value = result?.getText().trim() ?? '';
            if (!value || disabledRef.current || scanSessionRef.current !== scanSession) return;
            onScanRef.current(value);
            stop();
          },
        );
        if (disabledRef.current || scanSessionRef.current !== scanSession) {
          controls.stop();
          return;
        }
        scannerControlsRef.current = controls;
        streamRef.current = video.srcObject instanceof MediaStream ? video.srcObject : null;
        setStarting(false);
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      if (!video) { stream.getTracks().forEach((track) => track.stop()); return; }
      if (disabledRef.current || scanSessionRef.current !== scanSession) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      video.srcObject = stream;
      await video.play();
      setActive(true);
      setStarting(false);
      const detector = new Constructor({ formats: ['qr_code','code_128','ean_13','ean_8','upc_a','upc_e'] });
      let lastValue = '';
      let lastAt = 0;
      const detect = async () => {
        if (!streamRef.current || !videoRef.current || disabledRef.current || scanSessionRef.current !== scanSession) return;
        try {
          const [result] = await detector.detect(videoRef.current);
          const value = result?.rawValue?.trim() ?? '';
          const now = Date.now();
          if (value && (value !== lastValue || now - lastAt > 1500)) {
            lastValue = value;
            lastAt = now;
            onScanRef.current(value);
            // Uma leitura encerra a câmera. Evita adicionar o mesmo material
            // várias vezes enquanto o aparelho continua apontado para a etiqueta.
            stop();
            return;
          }
        } catch {
          // Um frame sem leitura nao encerra a camera; o proximo tenta novamente.
        }
        if (streamRef.current && !disabledRef.current && scanSessionRef.current === scanSession) {
          timerRef.current = window.setTimeout(() => { void detect(); }, 220);
        }
      };
      void detect();
    } catch {
      stop();
      setMessage('Não foi possível abrir a câmera. Confira a permissão do navegador.');
    }
  }

  const startButton = <Button type="button" variant="outline" size={triggerVariant === 'icon' ? 'icon' : 'default'} className={triggerVariant === 'icon' ? 'btn h-12 w-12' : undefined} aria-label="Ler com a câmera" onClick={() => void start()} disabled={!supported || disabled || starting}>{starting ? <Loader2 className={cn('h-4 w-4 animate-spin', triggerVariant !== 'icon' && 'mr-2')} /> : <Camera className={cn('h-4 w-4', triggerVariant !== 'icon' && 'mr-2')} />}{triggerVariant !== 'icon' && 'Ler com a câmera'}</Button>;

  return (
    <div className={cn(triggerVariant === 'icon' && 'relative shrink-0', className)}>
      <div className={active ? cn('overflow-hidden rounded-xl border bg-black', triggerVariant === 'icon' && 'absolute right-0 top-full z-50 mt-2 w-[min(20rem,calc(100vw-2rem))]') : 'hidden'}>
        <video ref={videoRef} muted playsInline className="aspect-[4/3] w-full object-cover" aria-label="Leitor de códigos pela câmera" />
      </div>
      <div className={triggerVariant === 'icon' ? 'flex' : 'mt-2 flex flex-wrap gap-2'}>
        {!active ? (
          triggerVariant === 'icon' ? <Tooltip delayDuration={100}><TooltipTrigger asChild>{startButton}</TooltipTrigger><TooltipContent>Ler código com a câmera</TooltipContent></Tooltip> : startButton
        ) : (
          <Button type="button" variant="destructive" size={triggerVariant === 'icon' ? 'icon' : 'default'} className={triggerVariant === 'icon' ? 'h-12 w-12' : undefined} aria-label="Fechar câmera" onClick={stop}>
            <CameraOff className={cn('h-4 w-4', triggerVariant !== 'icon' && 'mr-2')} /> {triggerVariant !== 'icon' && 'Fechar câmera'}
          </Button>
        )}
      </div>
      {!supported && triggerVariant !== 'icon' && <p className="mt-2 text-xs text-muted-foreground">A câmera não está disponível neste navegador. Use o leitor USB ou digite o código.</p>}
      {message && <NoticeBanner variant="warning" className="mt-3">{message}</NoticeBanner>}
    </div>
  );
}
