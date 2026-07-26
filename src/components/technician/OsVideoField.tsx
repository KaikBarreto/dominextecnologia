import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Video, Square, X, RotateCcw, Upload, ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getErrorMessage } from '@/utils/errorMessages';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { OsVideoPlayer } from '@/components/technician/OsVideoPlayer';
import { useToast } from '@/hooks/use-toast';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

/** Duração máxima do clipe (segundos). */
const MAX_SECONDS = 30;
/** Teto de tamanho pro caminho de fallback (input file). ~40 MB. */
const MAX_FALLBACK_BYTES = 40 * 1024 * 1024;

interface OsVideoFieldProps {
  /** OS dona do vídeo — usado no path do bucket. */
  serviceOrderId: string;
  /**
   * Sufixo do nome do arquivo no bucket pra identificar a origem do vídeo.
   * Ex.: `form-<questionId>`. Path final: `{serviceOrderId}/{pathPrefix}-{ts}-{rand}.{ext}`.
   */
  pathPrefix: string;
  /** URL única do clipe já anexado. '' ou null = nenhum. */
  value: string | null | undefined;
  /** Recebe a nova URL (ou null quando remove) após upload/remoção. */
  onChange: (url: string | null) => void | Promise<void>;
  /** Bloqueia gravar/remover (OS pausada). */
  readOnly?: boolean;
  /**
   * Quando false, esconde o botão de galeria e só permite gravar na hora.
   * Default true (galeria disponível).
   */
  allowGallery?: boolean;
}

// Escolhe o melhor mimeType de gravação disponível. Prefere mp4 (mais compatível
// pra tocar no <video> depois); cai pra webm quando o device não grava mp4.
function pickRecordingMime(): { mime: string; ext: string } | null {
  if (typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return null;
  const candidates: { mime: string; ext: string }[] = [
    { mime: 'video/mp4', ext: 'mp4' },
    { mime: 'video/webm;codecs=vp9,opus', ext: 'webm' },
    { mime: 'video/webm;codecs=vp8,opus', ext: 'webm' },
    { mime: 'video/webm', ext: 'webm' },
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c.mime)) return c;
  }
  return null;
}

/**
 * Campo de VÍDEO da OS — espelha OsPhotoField, mas guarda EXATAMENTE 1 clipe curto
 * (até 30s, ~720p leve). Grava via getUserMedia + MediaRecorder já leve (sem
 * transcodificar), com auto-stop em 30s. Regravar substitui o clipe anterior.
 *
 * Durante a gravação, exibe um overlay em tela cheia (via createPortal) com o
 * preview ao vivo, contador regressivo e botão de parar acessível (safe-area).
 *
 * Fallback (device sem MediaRecorder): input file com câmera; rejeita arquivo
 * grande demais. Sobe pro mesmo bucket público `os-photos` das fotos e devolve a
 * URL pública única via onChange. O consumidor decide onde persistir a URL.
 *
 * Quando allowGallery=true (default), exibe também um botão "Galeria" que abre
 * um input file sem capture, permitindo escolher vídeo já gravado.
 */
export function OsVideoField({
  serviceOrderId,
  pathPrefix,
  value,
  onChange,
  readOnly = false,
  allowGallery = true,
}: OsVideoFieldProps) {
  const { toast } = useToast();
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.os.osVideo;
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [remaining, setRemaining] = useState(MAX_SECONDS);
  const [pendingRemoval, setPendingRemoval] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const livePreviewRef = useRef<HTMLVideoElement | null>(null);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Input de fallback (câmera / device sem MediaRecorder).
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Input de galeria (sem capture, só galeria).
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  const disabled = uploading || readOnly;

  // Garante que câmera/timers sejam liberados ao desmontar.
  useEffect(() => {
    return () => {
      cleanupCapture();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Quando a gravação começa, reatribui o stream ao elemento de preview que agora
  // vive no overlay (portal). Padrão seguro: o ref é atribuído pelo React antes
  // deste efeito rodar, porque o overlay já está montado quando recording vira true.
  useEffect(() => {
    if (recording && streamRef.current && livePreviewRef.current) {
      livePreviewRef.current.srcObject = streamRef.current;
      livePreviewRef.current.play().catch(() => {});
    }
  }, [recording]);

  function cleanupCapture() {
    if (autoStopRef.current) { clearTimeout(autoStopRef.current); autoStopRef.current = null; }
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    recorderRef.current = null;
  }

  const uploadClip = async (blob: Blob, ext: string) => {
    setUploading(true);
    try {
      const fileName = `${serviceOrderId}/${pathPrefix}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 6)}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('os-photos')
        .upload(fileName, blob, { contentType: blob.type || `video/${ext}` });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('os-photos')
        .getPublicUrl(fileName);

      await onChange(publicUrl);
      toast({ title: t.toastUploaded });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: t.toastUploadError,
        description: getErrorMessage(error),
      });
    } finally {
      setUploading(false);
    }
  };

  const startRecording = async () => {
    if (disabled) return;
    const picked = pickRecordingMime();
    if (!picked || !navigator.mediaDevices?.getUserMedia) {
      // Sem suporte a gravação — cai pro input file (câmera).
      fileInputRef.current?.click();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      streamRef.current = stream;
      // O stream será atribuído ao <video> do overlay pelo useEffect acima,
      // quando recording virar true e o elemento já estiver no DOM.

      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, {
        mimeType: picked.mime,
        videoBitsPerSecond: 1_500_000,
      });
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: picked.mime });
        cleanupCapture();
        setRecording(false);
        setRemaining(MAX_SECONDS);
        if (blob.size > 0) await uploadClip(blob, picked.ext);
      };

      recorder.start();
      setRecording(true);
      setRemaining(MAX_SECONDS);

      // Auto-stop em MAX_SECONDS.
      autoStopRef.current = setTimeout(() => stopRecording(), MAX_SECONDS * 1000);
      // Contador regressivo.
      tickRef.current = setInterval(() => {
        setRemaining((r) => (r > 1 ? r - 1 : 0));
      }, 1000);
    } catch (error: any) {
      cleanupCapture();
      setRecording(false);
      toast({
        variant: 'destructive',
        title: t.toastCameraError,
        description: t.toastCameraErrorDesc,
      });
    }
  };

  const stopRecording = () => {
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') {
      rec.stop(); // dispara onstop → cleanup + upload
    } else {
      cleanupCapture();
      setRecording(false);
      setRemaining(MAX_SECONDS);
    }
  };

  // Fallback / galeria: seleção de arquivo via input file.
  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_FALLBACK_BYTES) {
      toast({
        variant: 'destructive',
        title: t.toastFileTooLarge,
        description: t.toastFileTooLargeDesc.replace('{n}', String(MAX_SECONDS)),
      });
      return;
    }
    // Best-effort: se der pra medir a duração, rejeita acima de ~35s.
    const durationOk = await checkDuration(file);
    if (durationOk === false) {
      toast({
        variant: 'destructive',
        title: t.toastTooLong,
        description: t.toastTooLongDesc.replace('{n}', String(MAX_SECONDS)),
      });
      return;
    }
    const ext = (file.name.split('.').pop() || 'mp4').toLowerCase();
    await uploadClip(file, ext);
  };

  const confirmRemove = () => {
    onChange(null);
    setPendingRemoval(false);
  };

  const hasClip = !!value;

  // Overlay de gravação em tela cheia (portal no body).
  const recordingOverlay = recording
    ? createPortal(
        <div className="fixed inset-0 z-[200] bg-black flex flex-col">
          {/* Preview ao vivo — ocupa o espaço disponível */}
          <div className="flex-1 relative overflow-hidden">
            <video
              ref={livePreviewRef}
              muted
              playsInline
              className="w-full h-full object-contain bg-black"
            />
            {/* Contador regressivo — canto superior com safe-area */}
            <div
              className="absolute left-4 flex items-center gap-1.5 rounded-full bg-destructive px-3 py-1.5 text-sm font-semibold text-destructive-foreground shadow-lg"
              style={{ top: 'max(1rem, env(safe-area-inset-top))' }}
            >
              <span className="h-2.5 w-2.5 rounded-full bg-white animate-pulse" />
              {remaining}s
            </div>
          </div>
          {/* Botão de parar — rodapé com safe-area */}
          <div
            className="shrink-0 px-6 pt-4 bg-black"
            style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
          >
            <Button
              variant="destructive"
              size="lg"
              className="w-full h-14 text-base rounded-2xl"
              onClick={stopRecording}
            >
              <Square className="h-5 w-5 mr-2" />
              {t.btnStop}
            </Button>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <div className="space-y-2">
      {/* Overlay de gravação em tela cheia (portal) */}
      {recordingOverlay}

      {/* Preview do clipe já anexado. */}
      {hasClip && !recording && (
        <div className="relative rounded-lg overflow-hidden border bg-black">
          <OsVideoPlayer
            src={value}
            className="w-full max-h-72"
          />
          {!readOnly && (
            <button
              type="button"
              className="absolute top-1 right-1 z-[1] p-1.5 rounded-full bg-destructive/90 text-destructive-foreground shadow-sm"
              onClick={() => setPendingRemoval(true)}
              title={t.titleRemoveVideo}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Controles — não mostrar enquanto o overlay de gravação está ativo. */}
      {!recording && (
        hasClip ? (
          // Já tem clipe: botão de regravar + (se allowGallery) trocar da galeria.
          <div className={cn(allowGallery ? 'grid grid-cols-2 gap-2' : 'w-full')}>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={startRecording}
              disabled={disabled}
            >
              {uploading ? (
                <>
                  <Upload className="h-3.5 w-3.5 mr-1.5 animate-pulse" />
                  {t.btnUploading}
                </>
              ) : (
                <>
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                  {t.btnReRecord}
                </>
              )}
            </Button>
            {allowGallery && (
              <label className={disabled ? 'pointer-events-none' : 'cursor-pointer'}>
                <input
                  ref={galleryInputRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={handleFilePick}
                  disabled={disabled}
                />
                <Button variant="outline" size="sm" className="w-full" asChild disabled={disabled}>
                  <span>
                    <ImageIcon className="h-3.5 w-3.5 mr-1.5" />
                    {t.btnGallery}
                  </span>
                </Button>
              </label>
            )}
          </div>
        ) : (
          // Sem clipe: botão de gravar + (se allowGallery) escolher da galeria.
          <div className={cn(allowGallery ? 'grid grid-cols-2 gap-2' : 'w-full')}>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={startRecording}
              disabled={disabled}
            >
              {uploading ? (
                <>
                  <Upload className="h-3.5 w-3.5 mr-1.5 animate-pulse" />
                  {t.btnUploading}
                </>
              ) : (
                <>
                  <Video className="h-3.5 w-3.5 mr-1.5" />
                  {t.btnRecord.replace('{n}', String(MAX_SECONDS))}
                </>
              )}
            </Button>
            {allowGallery && (
              <label className={disabled ? 'pointer-events-none' : 'cursor-pointer'}>
                <input
                  ref={galleryInputRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={handleFilePick}
                  disabled={disabled}
                />
                <Button variant="outline" size="sm" className="w-full" asChild disabled={disabled}>
                  <span>
                    <ImageIcon className="h-3.5 w-3.5 mr-1.5" />
                    {t.btnGallery}
                  </span>
                </Button>
              </label>
            )}
          </div>
        )
      )}

      {/* Input de fallback câmera (device sem gravação nativa). Sempre presente e escondido. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        capture="environment"
        className="hidden"
        onChange={handleFilePick}
        disabled={disabled}
      />

      {!hasClip && !recording && (
        <p className="text-xs text-muted-foreground text-center">
          {t.hintClip.replace('{n}', String(MAX_SECONDS))}
        </p>
      )}

      {/* Confirmação antes de remover. */}
      <ResponsiveModal
        open={pendingRemoval}
        onOpenChange={(o) => { if (!o) setPendingRemoval(false); }}
        title={t.modalRemoveTitle}
        footer={
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setPendingRemoval(false)}>
              {t.btnCancel}
            </Button>
            <Button variant="destructive" className="flex-1" onClick={confirmRemove}>
              {t.btnRemove}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-muted-foreground">
          {t.modalRemoveBody}
        </p>
      </ResponsiveModal>
    </div>
  );
}

// Mede a duração do vídeo carregando os metadados. Retorna true (ok), false
// (passou de ~35s) ou null (não deu pra medir → deixa passar).
function checkDuration(file: File): Promise<boolean | null> {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const v = document.createElement('video');
      v.preload = 'metadata';
      const done = (result: boolean | null) => {
        URL.revokeObjectURL(url);
        resolve(result);
      };
      v.onloadedmetadata = () => {
        const d = v.duration;
        if (!isFinite(d) || d <= 0) return done(null);
        done(d <= 35);
      };
      v.onerror = () => done(null);
      v.src = url;
    } catch {
      resolve(null);
    }
  });
}
