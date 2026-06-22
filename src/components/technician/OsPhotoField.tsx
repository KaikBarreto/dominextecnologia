import { useMemo, useRef, useState } from 'react';
import { Camera, ImageIcon, X, Download, Copy, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getErrorMessage } from '@/utils/errorMessages';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { processImageFile } from '@/utils/imageConvert';
import { SignedImg } from '@/components/ui/SignedImg';
import { PhotoCarousel } from '@/components/ui/PhotoCarousel';
import { ImagePreviewModal } from '@/components/ui/ImagePreviewModal';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { useToast } from '@/hooks/use-toast';

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
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<number | null>(null);
  const [previewImages, setPreviewImages] = useState<{ urls: string[]; index: number } | null>(null);
  const [photosToSave, setPhotosToSave] = useState<File[] | null>(null);

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
      if (how === 'download') toast({ title: 'Imagem salva no aparelho' });
      return;
    }
    fetch(url)
      .then((r) => r.blob())
      .then((b) => {
        const how = savePhotoToDevice(
          new File([b], `os-foto-${Date.now()}.jpg`, { type: b.type || 'image/jpeg' }),
        );
        if (how === 'download') toast({ title: 'Imagem salva no aparelho' });
      })
      .catch(() => {
        /* best-effort */
      });
  };

  const confirmRemovePhoto = () => {
    if (pendingRemoval === null) return;
    const remaining = photoUrls.filter((_, i) => i !== pendingRemoval);
    onChange(remaining.length ? remaining.join(',') : null);
    setPendingRemoval(null);
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
        title: 'Apenas uma foto permitida',
        description: 'Remova a atual para enviar outra.',
      });
      event.target.value = '';
      return;
    }

    // Foto única: mesmo que cheguem vários arquivos, considera só o primeiro.
    const selectedFiles = allowMultiple ? Array.from(files) : [files[0]];
    // Arquivos CRUS pra oferecer "salvar no aparelho" independente do upload.
    const rawFiles = Array.from(selectedFiles);

    setUploading(true);
    try {
      const uploadedUrls: string[] = [...photoUrls];

      for (const rawFile of selectedFiles) {
        const file = await processImageFile(rawFile);

        const fileExt = file.name.split('.').pop();
        const fileName = `${serviceOrderId}/${pathPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('os-photos')
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('os-photos')
          .getPublicUrl(fileName);

        uploadedUrls.push(publicUrl);
        capturedFilesRef.current.set(publicUrl, file);
      }

      await onChange(uploadedUrls.join(','));
      toast({ title: `${selectedFiles.length > 1 ? `${selectedFiles.length} fotos enviadas` : 'Foto enviada'}!` });

      // Só ABRE o modal perguntando se quer salvar no aparelho (câmera + toggle ON).
      if (fromCamera && saveToDeviceEnabled && rawFiles.length) {
        setPhotosToSave(rawFiles);
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Erro ao enviar foto',
        description: getErrorMessage(error),
      });
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

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
                  className="absolute top-1 right-1 z-10 p-1.5 rounded-full bg-destructive/90 text-destructive-foreground shadow-sm"
                  onClick={() => setPendingRemoval(idx)}
                  title="Remover foto"
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
                  title="Salvar imagem no aparelho"
                >
                  <Download className="h-3 w-3" />
                </button>
              )}
            </>
          )}
        />
      ) : showEmptyPlaceholder ? (
        <div className="aspect-square rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center">
          <Camera className="h-8 w-8 text-muted-foreground/50" />
        </div>
      ) : null}

      <div className={cameraOnly ? '' : 'grid grid-cols-2 gap-2'}>
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
              {uploading ? 'Enviando...' : 'Tirar Foto'}
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
                {uploading ? 'Enviando...' : 'Galeria'}
              </span>
            </Button>
          </label>
        )}
      </div>

      {photoUrls.length > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          {photoUrls.length} foto{allowMultiple && photoUrls.length > 1 ? 's' : ''}
        </p>
      )}

      {/* Confirmação antes de remover uma foto. */}
      <ResponsiveModal
        open={pendingRemoval !== null}
        onOpenChange={(o) => { if (!o) setPendingRemoval(null); }}
        title="Remover foto?"
        footer={
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setPendingRemoval(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" className="flex-1" onClick={confirmRemovePhoto}>
              Remover
            </Button>
          </div>
        }
      >
        <p className="text-sm text-muted-foreground">
          Tem certeza que deseja remover esta foto? Essa ação não pode ser desfeita.
        </p>
      </ResponsiveModal>

      {/* Após tirar foto pela câmera: pergunta se quer salvar uma cópia no aparelho. */}
      <ResponsiveModal
        open={photosToSave !== null}
        onOpenChange={(o) => { if (!o) setPhotosToSave(null); }}
        title="Salvar foto no aparelho?"
        footer={
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setPhotosToSave(null)}>
              Agora não
            </Button>
            <Button
              variant="default"
              className="flex-1"
              onClick={() => {
                if (photosToSave) {
                  const how = savePhotosToDevice(photosToSave);
                  if (how === 'download') toast({ title: 'Imagem salva no aparelho' });
                }
                setPhotosToSave(null);
              }}
            >
              Salvar imagem
            </Button>
          </div>
        }
      >
        <p className="text-sm text-muted-foreground">
          Deseja guardar {photosToSave && photosToSave.length > 1 ? `estas ${photosToSave.length} fotos` : 'esta foto'} no seu aparelho?
        </p>
        {isIOS() && (
          <div className="mt-3 rounded-lg border bg-muted/40 p-3">
            <p className="text-[11px] text-muted-foreground mb-2 text-center">
              Quando abrir, toque em <span className="font-semibold text-foreground">"Salvar Imagem"</span>:
            </p>
            <div className="flex items-end justify-center gap-4">
              <div className="flex flex-col items-center gap-1 opacity-40">
                <div className="h-11 w-11 rounded-full bg-muted flex items-center justify-center">
                  <Copy className="h-5 w-5 text-foreground" />
                </div>
                <span className="text-[10px] text-muted-foreground">Copiar</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <div className="h-11 w-11 rounded-full bg-muted ring-2 ring-primary ring-offset-2 ring-offset-background flex items-center justify-center">
                  <Download className="h-5 w-5 text-foreground" />
                </div>
                <span className="text-[10px] font-semibold text-foreground text-center leading-tight">Salvar<br/>Imagem</span>
              </div>
              <div className="flex flex-col items-center gap-1 opacity-40">
                <div className="h-11 w-11 rounded-full bg-muted flex items-center justify-center">
                  <ChevronDown className="h-5 w-5 text-foreground" />
                </div>
                <span className="text-[10px] text-muted-foreground">Ver Mais</span>
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
