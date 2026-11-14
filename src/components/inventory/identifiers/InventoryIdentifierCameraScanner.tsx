import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import {
  canScanInventoryIdentifierWithCamera,
  getInventoryBarcodeDetectorConstructor,
} from '@/lib/pdv/inventoryCameraCapability';

interface InventoryIdentifierCameraScannerProps {
  onScan: (code: string) => void;
  disabled?: boolean;
  className?: string;
}

export function InventoryIdentifierCameraScanner({
  onScan,
  disabled = false,
  className,
}: InventoryIdentifierCameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const onScanRef = useRef(onScan);
  const [active, setActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const supported = canScanInventoryIdentifierWithCamera();

  useEffect(() => { onScanRef.current = onScan; }, [onScan]);

  function stop() {
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setActive(false);
    setStarting(false);
  }

  useEffect(() => stop, []);

  async function start() {
    const Constructor = getInventoryBarcodeDetectorConstructor();
    if (!Constructor || !navigator.mediaDevices?.getUserMedia || disabled) return;
    setStarting(true);
    setMessage(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) { stream.getTracks().forEach((track) => track.stop()); return; }
      video.srcObject = stream;
      await video.play();
      setActive(true);
      setStarting(false);
      const detector = new Constructor({ formats: ['qr_code','code_128','ean_13','ean_8','upc_a','upc_e'] });
      let lastValue = '';
      let lastAt = 0;
      const detect = async () => {
        if (!streamRef.current || !videoRef.current) return;
        try {
          const [result] = await detector.detect(videoRef.current);
          const value = result?.rawValue?.trim() ?? '';
          const now = Date.now();
          if (value && (value !== lastValue || now - lastAt > 1500)) {
            lastValue = value;
            lastAt = now;
            onScanRef.current(value);
          }
        } catch {
          // Um frame sem leitura nao encerra a camera; o proximo tenta novamente.
        }
        timerRef.current = window.setTimeout(() => { void detect(); }, 220);
      };
      void detect();
    } catch {
      stop();
      setMessage('Não foi possível abrir a câmera. Confira a permissão do navegador.');
    }
  }

  return (
    <div className={className}>
      <div className={active ? 'overflow-hidden rounded-xl border bg-black' : 'hidden'}>
        <video ref={videoRef} muted playsInline className="aspect-[4/3] w-full object-cover" aria-label="Leitor de códigos pela câmera" />
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {!active ? (
          <Button type="button" variant="outline" onClick={() => void start()} disabled={!supported || disabled || starting}>
            {starting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Camera className="mr-2 h-4 w-4" />}
            Ler com a câmera
          </Button>
        ) : (
          <Button type="button" variant="destructive" onClick={stop}>
            <CameraOff className="mr-2 h-4 w-4" /> Fechar câmera
          </Button>
        )}
      </div>
      {!supported && <p className="mt-2 text-xs text-muted-foreground">Este navegador não oferece leitura de códigos pela câmera. Use o leitor USB ou digite o código.</p>}
      {message && <NoticeBanner variant="warning" className="mt-3">{message}</NoticeBanner>}
    </div>
  );
}
