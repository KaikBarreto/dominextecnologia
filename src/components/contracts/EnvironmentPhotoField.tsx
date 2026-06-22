import { useRef, useState } from 'react';
import { ImagePlus, X, Loader2 } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { ImagePreviewModal } from '@/components/ui/ImagePreviewModal';
import { supabase } from '@/integrations/supabase/client';
import { buildStorageFilePath } from '@/utils/storagePath';
import { processImageFile } from '@/utils/imageConvert';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/utils/errorMessages';

interface EnvironmentPhotoFieldProps {
  /** URL pública da foto já persistida (ou recém-enviada). */
  value?: string | null;
  /** Reporta a nova URL pública (ou null ao remover) pro estado do ambiente. */
  onChange: (photoUrl: string | null) => void;
  /** Rótulo do ambiente (usado no alt do viewer). */
  envLabel?: string;
}

/**
 * Campo de UMA foto por ambiente climatizado (PMOC). Reaproveita o padrão de
 * upload de foto de equipamento: bucket público `equipment-files` +
 * `buildStorageFilePath` + `getPublicUrl`. O upload do binário pro Storage é
 * feito inline (igual ao EquipmentFormDialog) — aceitável por ser arquivo, não
 * dado de tabela. A persistência da URL no banco continua passando pelo hook
 * (useContracts) via o `photo_url` que reportamos no onChange.
 */
export function EnvironmentPhotoField({ value, onChange, envLabel }: EnvironmentPhotoFieldProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(false);

  const handlePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Limpa o input pra permitir re-selecionar o mesmo arquivo depois.
    e.target.value = '';
    if (!file) return;

    setUploading(true);
    try {
      const processed = await processImageFile(file);
      const path = buildStorageFilePath({ folder: 'environment-photos', fileName: processed.name });
      const { error } = await supabase.storage.from('equipment-files').upload(path, processed);
      if (error) throw error;
      const { data } = supabase.storage.from('equipment-files').getPublicUrl(path);
      onChange(data.publicUrl);
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro ao enviar a foto',
        description: getErrorMessage(err),
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Foto do ambiente</Label>
      <div className="flex items-center gap-3">
        {value ? (
          <div className="relative h-20 w-20 overflow-hidden rounded-lg border bg-muted">
            <button
              type="button"
              className="h-full w-full"
              onClick={() => setPreview(true)}
              aria-label="Ver foto do ambiente"
            >
              <img src={value} alt={envLabel || 'Foto do ambiente'} className="h-full w-full object-cover" />
            </button>
            <button
              type="button"
              className="absolute right-1 top-1 rounded-full bg-destructive p-0.5 text-destructive-foreground hover:bg-destructive/90"
              onClick={() => onChange(null)}
              aria-label="Remover foto do ambiente"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={uploading}
            className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-muted-foreground/30 text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-60"
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? <Loader2 className="h-6 w-6 animate-spin" /> : <ImagePlus className="h-6 w-6" />}
            <span className="text-[10px]">{uploading ? 'Enviando…' : 'Adicionar'}</span>
          </button>
        )}
        {value && (
          <button
            type="button"
            disabled={uploading}
            className="text-xs text-primary hover:underline disabled:opacity-60"
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? 'Enviando…' : 'Trocar foto'}
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handlePick}
        />
      </div>

      <ImagePreviewModal
        open={preview}
        src={value ?? ''}
        alt={envLabel || 'Foto do ambiente'}
        onClose={() => setPreview(false)}
      />
    </div>
  );
}
