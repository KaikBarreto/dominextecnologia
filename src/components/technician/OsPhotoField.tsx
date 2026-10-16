import { useMemo, useRef, useState } from 'react';
import { Camera, ImageIcon, X, Download, Copy, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getErrorMessage } from '@/utils/errorMessages';
import { Button } from '@/components/ui/button';
import { processImageFile, OS_PHOTO_COMPRESSION } from '@/utils/imageConvert';
import { buildOsMediaPath, removeOsMedia, uploadOsMediaBatch } from '@/utils/osUpload';
import { SignedImg } from '@/components/ui/SignedImg';
import { PhotoCarousel } from '@/components/ui/PhotoCarousel';
import { ImagePreviewModal } from '@/components/ui/ImagePreviewModal';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { useToast } from '@/hooks/use-toast';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

// Detecta iPhone/iPad (inclui iPadOS que se disfarça de Mac no userAgent).
const isIOS = () => {
  const ua = navigator.userAgent || '';
  return /iP(hone|ad|od)/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

// Salva uma cópia da foto no aparelho. Best-effort: nunca quebra a tela.
// Disparada por TOQUE do usuário no botão "Salvar imagem" (gesto fresco) —
// no iOS é o único caminho confiável: ao VOLTAR da câmera o iOS perde o gesto
// ativo (transient activation) e bloqueia o navigator.share em silêncio.
// iOS: folha nativa de compartilhamento (tem "Salvar Imagem"). SEM await antes
// do share pra preservar o gesto.
// Android/desktop: download direto via <a download> (vai pros Downloads).
// Retorna 'share' (iOS, folha nativa abriu) ou 'download' (baixou) pra UI
// decidir se mostra toast (só no download, que é silencioso).
function savePhotoToDevice(file: File): 'share' | 'download' {
  if (isIOS() && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file], title: 'Foto da OS' }).catch(() => {
      /* cancelado pelo usuário ou sem suporte */
    });
    return 'share';
  }

  try {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name || `os-foto-${Date.now()}.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    // download é best-effort; ignora silenciosamente
  }
  return 'download';
}

// Versão PLURAL: salva várias fotos de uma vez. Disparada por TOQUE do usuário
// no modal "Salvar foto no aparelho?" (gesto fresco → iOS aceita).
function savePhotosToDevice(files: File[]): 'share' | 'download' {
  if (isIOS() && typeof navigator.canShare === 'function' && navigator.canShare({ files })) {
    navigator.share({ files, title: 'Foto da OS' }).catch(() => {
      /* cancelado pelo usuário ou sem suporte */
    });
    return 'share';
  }
  for (const file of files) {
    savePhotoToDevice(file);
  }
  return 'download';
}

interface OsPhotoFieldProps {
  /** OS dona das fotos — usado no path do bucket. */
  serviceOrderId: string;
  /**
   * Sufixo do nome do arquivo no bucket pra agrupar/identificar a origem da foto.
   * Ex.: `form-<questionId>` no formulário, `activity-<activityId>` no checklist.
   * Path final: `{serviceOrderId}/{pathPrefix}-{ts}-{rand}.{ext}`.
   */
  pathPrefix: string;
  /** CSV de URLs já anexadas (separadas por vírgula). '' ou null = nenhuma. */
  value: string | null | undefined;
  /** Recebe o novo CSV (ou null quando esvazia) após upload/remoção. */
  onChange: (csv: string | null) => void | Promise<void>;
  /** Bloqueia anexar/remover (OS pausada). */
  readOnly?: boolean;
  /** Só câmera (sem galeria) — usado quando a evidência exige foto na hora. */
  cameraOnly?: boolean;
  /** Permite múltiplas fotos (default true). Quando false, trava em 1. */
  allowMultiple?: boolean;
  /** Quadro vazio com ícone de câmera quando ainda não há foto (default true). */
  showEmptyPlaceholder?: boolean;
  /** Proporção do quadro da foto. */
  aspectClassName?: string;
}

/**
 * Campo de foto da OS reutilizável — encapsula TODA a máquina de foto do app do
 * técnico: câmera + galeria como inputs separados, HEIC→JPEG, compressão,
 * salvar cópia no aparelho (folha iOS / download Android), carrossel das fotos
 * anexadas, visualizador em tela cheia e confirmação antes de remover.
 *
 * O contrato externo é simples: um CSV de URLs (`value`) e um `onChange(csv)`.
 * Quem decide ONDE esse CSV é persistido (form_responses, service_order_activities,
 * etc.) é o consumidor — este componente nunca conhece a tabela de destino.
 * Upload de Storage segue o mesmo padrão direto que o app já usa.
 */
export function OsPhotoField({
  serviceOrderId,
  pathPrefix,
  value,
  onChange,
  readOnly = false,
  cameraOnly = false,
  allowMultiple = true,
  showEmptyPlaceholder = true,
  aspectClassName = 'aspect-square',
}: OsPhotoFieldProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.os.osPhotoField;
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<number | null>(null);
  const [previewImages, setPreviewImages] = useState<{ urls: string[]; index: number } | null>(null);
  const [photosToSave, setPhotosToSave] = useState<File[] | null>(null);
  // Fração 0..1 do LOTE sendo enviado (bytes de todas as fotos juntas), ou null
  // fora de envio. Antes a tela só dizia "Enviando..." e parava ali: numa foto
  // grande em 4G o técnico não sabia se tinha andado ou travado.
  const [uploadPct, setUploadPct] = useState<number | null>(null);

  // File processado de cada foto enviada NESTA sessão, indexado pela publicUrl.
  // Permite salvar no aparelho sem await antes do navigator.share (exigência iOS).
  const capturedFilesRef = useRef<Map<string, File>>(new Map());

  const photoUrls = (value || '').split(',').filter(Boolean);

  // Toggle "Salvar fotos no dispositivo" (Configurações › Usabilidade).
  // Chave ausente => default ligado (!== false).
  const saveToDeviceEnabled = useMemo(() => {
    try {
      const s = JSON.parse(localStorage.getItem('usability-settings') || '{}');
      return s.saveOSPhotosToDevice !== false;
    } catch {
      return true;
    }
  }, []);

  const photoDisabled = uploading || readOnly;

  const handleSavePhotoToDevice = (url: string) => {
    const cached = capturedFilesRef.current.get(url);
    if (cached) {
      const how = savePhotoToDevice(cached);
      if (how === 'download') toast({ title: t.toastSavedToDevice });
      return;
    }
    fetch(url)
      .then((r) => r.blob())
      .then((b) => {
        const how = savePhotoToDevice(
          new File([b], `os-foto-${Date.now()}.jpg`, { type: b.type || 'image/jpeg' }),
        );
        if (how === 'download') toast({ title: t.toastSavedToDevice });
      })
      .catch(() => {
        /* best-effort */
      });
  };

  const confirmRemovePhoto = () => {
    if (pendingRemoval === null) return;
    const removed = photoUrls[pendingRemoval];
    const remaining = photoUrls.filter((_, i) => i !== pendingRemoval);
    onChange(remaining.length ? remaining.join(',') : null);
    setPendingRemoval(null);
    // Apaga o arquivo de verdade, não só o ponteiro. A auditoria de 16/10/2026
    // achou 502 arquivos órfãos (209 MB) no bucket vindos exatamente daqui.
    // Best-effort e DEPOIS do onChange: tirar a foto da pergunta é o que importa
    // pro técnico e não pode depender da limpeza dar certo.
    capturedFilesRef.current.delete(removed);
    void removeOsMedia([removed]);
  };

  const handlePhotoUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
    fromCamera: boolean = false,
  ) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    // Foto única que já tem uma foto: bloqueia e orienta a remover.
    if (!allowMultiple && photoUrls.length >= 1) {
      toast({
        variant: 'destructive',
        title: t.toastUploadErrorOnlyOne,
        description: t.toastUploadErrorOnlyOneDesc,
      });
      event.target.value = '';
      return;
    }

    // Foto única: mesmo que cheguem vários arquivos, considera só o primeiro.
    const selectedFiles = allowMultiple ? Array.from(files) : [files[0]];
    // Arquivos CRUS pra oferecer "salvar no aparelho" independente do upload.
    const rawFiles = Array.from(selectedFiles);

    setUploading(true);
    setUploadPct(0);
    try {
      // Compressão das fotos em paralelo (é trabalho de CPU, não de rede): no
      // laço antigo cada foto esperava a anterior comprimir E subir.
      const processed = await Promise.all(
        selectedFiles.map(async (raw) => {
          try {
            return await processImageFile(raw, OS_PHOTO_COMPRESSION);
          } catch {
            return raw;
          }
        }),
      );

      const items = processed.map((file) => ({
        path: buildOsMediaPath(serviceOrderId, pathPrefix, (file.name.split('.').pop() || 'jpg').toLowerCase()),
        body: file,
        label: file.name,
      }));

      const { uploaded, failed } = await uploadOsMediaBatch(items, setUploadPct);

      // 🚨 PARCIAL VALE. O laço antigo lançava na primeira falha e NUNCA chamava
      // o onChange: as fotos que já tinham subido sumiam da pergunta (e viravam
      // lixo pago no bucket) e o técnico refazia tudo. Agora o que entrou é
      // salvo, e só o que faltou é cobrado dele.
      if (uploaded.length) {
        uploaded.forEach(({ url, index }) => capturedFilesRef.current.set(url, processed[index]));
        await onChange([...photoUrls, ...uploaded.map((u) => u.url)].join(','));
      }

      if (failed.length) {
        toast({
          variant: 'destructive',
          title: t.toastUploadError,
          description: uploaded.length
            ? t.toastPartialUpload
                .replace('{ok}', String(uploaded.length))
                .replace('{total}', String(items.length))
            : getErrorMessage(failed[0].error),
        });
        return;
      }

      // Câmera + toggle ON: abre o modal "Salvar no aparelho?", que JÁ confirma o
      // envio. Nesse caminho NÃO dispara o toast "Foto enviada!" — ele sobe por cima
      // do modal (z acima) e come o toque no "FECHAR"/rodapé. Nos demais casos
      // (galeria, ou toggle OFF) o toast de sucesso segue normal.
      if (fromCamera && saveToDeviceEnabled && rawFiles.length) {
        setPhotosToSave(rawFiles);
      } else {
        toast({ title: selectedFiles.length > 1 ? t.toastCountUploaded.replace('{n}', String(selectedFiles.length)) : t.toastPhotoUploaded });
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: t.toastUploadError,
        description: getErrorMessage(error),
      });
    } finally {
      setUploading(false);
      setUploadPct(null);
      event.target.value = '';
    }
  };

  // Botões de captura (câmera + galeria). Reutilizados tanto DENTRO do card
  // vazio (quando ainda não há foto) quanto soltos (quando já há fotos).
  // Barra de progresso do lote. Fica logo acima dos botões (que viram
  // "Enviando...") e some sozinha no fim. Determinada por BYTES, não por
  // contagem de arquivos — a barra anda liso mesmo com fotos de tamanhos bem
  // diferentes no mesmo envio.
  const uploadBar = uploadPct !== null && (
    <div className="w-full space-y-1" aria-live="polite">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-200 ease-out"
          style={{ width: `${Math.round(uploadPct * 100)}%` }}
        />
      </div>
      <p className="text-center text-[11px] tabular-nums text-muted-foreground">
        {t.btnUploading} {Math.round(uploadPct * 100)}%
      </p>
    </div>
  );

  const captureButtons = (
    <div className={cameraOnly ? 'w-full space-y-2' : 'w-full space-y-2'}>
      {uploadBar}
      <div className={cameraOnly ? 'w-full' : 'grid grid-cols-2 gap-2 w-full'}>
      <label className={photoDisabled ? 'pointer-events-none' : 'cursor-pointer'}>
        <input
          type="file"
          accept="image/*"
          multiple={allowMultiple}
          capture="environment"
          className="hidden"
          onChange={(e) => handlePhotoUpload(e, true)}
          disabled={photoDisabled}
        />
        <Button variant="outline" size="sm" className="w-full" asChild disabled={photoDisabled}>
          <span>
            <Camera className="h-3 w-3 mr-1" />
            {uploading ? t.btnUploading : t.btnTakePhoto}
          </span>
        </Button>
      </label>
      {!cameraOnly && (
        <label className={photoDisabled ? 'pointer-events-none' : 'cursor-pointer'}>
          <input
            type="file"
            accept="image/*"
            multiple={allowMultiple}
            className="hidden"
            onChange={(e) => handlePhotoUpload(e)}
            disabled={photoDisabled}
          />
          <Button variant="outline" size="sm" className="w-full" asChild disabled={photoDisabled}>
            <span>
              <ImageIcon className="h-3 w-3 mr-1" />
              {uploading ? t.btnUploading : t.btnGallery}
            </span>
          </Button>
        </label>
      )}
      </div>
    </div>
  );

  return (
    <div className="space-y-2">
      {photoUrls.length > 0 ? (
        <PhotoCarousel
          urls={photoUrls}
          aspectClassName={aspectClassName}
          onOpen={(i) => setPreviewImages({ urls: photoUrls, index: i })}
          renderImage={(url, alt, className) => <SignedImg src={url} alt={alt} className={className} />}
          renderOverlay={(idx) => (
            <>
              {!readOnly && (
                <button
                  type="button"
                  // z baixo (local à foto): fica acima da imagem mas ABAIXO do
                  // cabeçalho sticky do equipamento (z-10) e do header (z-20),
                  // pra não vazar por cima deles ao rolar.
                  className="absolute top-1 right-1 z-[1] p-1.5 rounded-full bg-destructive/90 text-destructive-foreground shadow-sm"
                  onClick={() => setPendingRemoval(idx)}
                  title={t.titleRemovePhoto}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
              {saveToDeviceEnabled && (
                <button
                  type="button"
                  // z baixo (local à foto): fica acima da imagem mas ABAIXO do
                  // cabeçalho sticky do equipamento (z-10) e do header (z-20),
                  // pra não vazar por cima deles ao rolar.
                  className="absolute bottom-1 right-1 z-[1] p-1.5 rounded-full bg-black/60 text-white shadow-sm"
                  onClick={() => handleSavePhotoToDevice(photoUrls[idx])}
                  title={t.titleSavePhoto}
                >
                  <Download className="h-3 w-3" />
                </button>
              )}
            </>
          )}
        />
      ) : showEmptyPlaceholder ? (
        // Estado VAZIO compacto: card pontilhado baixo com o ícone de câmera em
        // cima e os botões Tirar Foto / Galeria empilhados logo abaixo, tudo dentro.
        <div className="rounded-lg border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center gap-3 px-3 py-4">
          <Camera className="h-7 w-7 text-muted-foreground/50" />
          {captureButtons}
        </div>
      ) : (
        captureButtons
      )}

      {/* Quando JÁ há fotos, os botões de adicionar mais ficam soltos abaixo do carrossel. */}
      {photoUrls.length > 0 && captureButtons}

      {photoUrls.length > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          {allowMultiple && photoUrls.length > 1
            ? t.photoCountPlural.replace('{n}', String(photoUrls.length))
            : t.photoCount.replace('{n}', String(photoUrls.length))}
        </p>
      )}

      {/* Confirmação antes de remover uma foto. */}
      <ResponsiveModal
        open={pendingRemoval !== null}
        onOpenChange={(o) => { if (!o) setPendingRemoval(null); }}
        title={t.modalRemoveTitle}
        footer={
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setPendingRemoval(null)}>
              {t.modalRemoveCancel}
            </Button>
            <Button variant="destructive" className="flex-1" onClick={confirmRemovePhoto}>
              {t.modalRemoveConfirm}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-muted-foreground">
          {t.modalRemoveBody}
        </p>
      </ResponsiveModal>

      {/* Após tirar foto pela câmera: pergunta se quer salvar uma cópia no aparelho. */}
      <ResponsiveModal
        open={photosToSave !== null}
        onOpenChange={(o) => { if (!o) setPhotosToSave(null); }}
        title={t.modalSaveTitle}
        footer={
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setPhotosToSave(null)}>
              {t.modalSaveNotNow}
            </Button>
            <Button
              variant="default"
              className="flex-1"
              onClick={() => {
                if (photosToSave) {
                  const how = savePhotosToDevice(photosToSave);
                  if (how === 'download') toast({ title: t.toastSavedToDevice });
                }
                setPhotosToSave(null);
              }}
            >
              {t.modalSaveBtnLabel}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-muted-foreground">
          {t.modalSaveBody.replace(
            '{count}',
            photosToSave && photosToSave.length > 1
              ? t.modalSaveBodyPlural.replace('{n}', String(photosToSave.length))
              : t.modalSaveBodySingular,
          )}
        </p>
        {isIOS() && (
          <div className="mt-3 rounded-lg border bg-muted/40 p-3">
            <p className="text-[11px] text-muted-foreground mb-2 text-center">
              {t.modalSaveIOSHint} <span className="font-semibold text-foreground">&quot;{t.modalSaveIOSAction}&quot;</span>:
            </p>
            <div className="flex items-end justify-center gap-4">
              <div className="flex flex-col items-center gap-1 opacity-40">
                <div className="h-11 w-11 rounded-full bg-muted flex items-center justify-center">
                  <Copy className="h-5 w-5 text-foreground" />
                </div>
                <span className="text-[10px] text-muted-foreground">{t.modalSaveIOSLabelCopy}</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <div className="h-11 w-11 rounded-full bg-muted ring-2 ring-primary ring-offset-2 ring-offset-background flex items-center justify-center">
                  <Download className="h-5 w-5 text-foreground" />
                </div>
                <span className="text-[10px] font-semibold text-foreground text-center leading-tight">{t.modalSaveIOSLabelSave}</span>
              </div>
              <div className="flex flex-col items-center gap-1 opacity-40">
                <div className="h-11 w-11 rounded-full bg-muted flex items-center justify-center">
                  <ChevronDown className="h-5 w-5 text-foreground" />
                </div>
                <span className="text-[10px] text-muted-foreground">{t.modalSaveIOSLabelMore}</span>
              </div>
            </div>
          </div>
        )}
      </ResponsiveModal>

      {/* Visualizador de foto ampliada — nunca abre nova aba. */}
      {previewImages && (
        <ImagePreviewModal
          open
          src={previewImages.urls[previewImages.index]}
          images={previewImages.urls}
          currentIndex={previewImages.index}
          onNavigate={(index) => setPreviewImages((prev) => (prev ? { ...prev, index } : prev))}
          onClose={() => setPreviewImages(null)}
        />
      )}
    </div>
  );
}
