import { useEffect, useState } from 'react';
import { Loader2, Upload, X, ImageIcon, Camera, Pen, AlertTriangle } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useUserCompany } from '@/hooks/useUserCompany';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { uploadResponsibleTechnicianMedia } from '@/hooks/useResponsibleTechnicians';
import { supabase } from '@/integrations/supabase/client';
import { PmocSignatureCanvas, dataUrlToFile } from '@/components/pmoc/PmocSignatureCanvas';
import { cn } from '@/lib/utils';
import { getErrorMessage } from '@/utils/errorMessages';

/**
 * Dialog rápido pra cadastrar/atualizar a assinatura do RT direto da aba
 * Documentos do contrato (Onda E — v1.9.x).
 *
 * Foco único: assinatura. Reaproveita upload + canvas do
 * `ResponsibleTechnicianFormDialog`, mas sem todos os outros campos.
 *
 * Fluxo:
 *  1. Usuário escolhe upload de imagem OU desenha no canvas.
 *  2. Ao confirmar, faz upload pro bucket `responsible-technicians-media` no
 *     path `{company_id}/{rt_id}/signature.{ext}` e UPDATE em
 *     `responsible_technicians.signature_image_url`.
 *  3. Invalida `responsible-technicians` (hash da assinatura muda → próxima
 *     geração de TRT/Dossiê/Cronograma cria nova versão).
 *  4. Mostra toast pedindo pra regerar o TRT.
 */

const MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2 MB
const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg'];

interface RtSignatureQuickDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** ID do RT vinculado ao contrato. Pode ser null (UI bloqueia abrir nesse caso). */
  responsibleTechnicianId: string | null;
}

export function RtSignatureQuickDialog({
  open,
  onOpenChange,
  responsibleTechnicianId,
}: RtSignatureQuickDialogProps) {
  const { toast } = useToast();
  const { companyId } = useUserCompany();
  const { locale } = useAppLocaleContext();
  const trt = MESSAGES[locale].app.pmoc.rt;
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<'upload' | 'draw'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Reset quando reabre.
  useEffect(() => {
    if (!open) return;
    setMode('upload');
    setFile(null);
    setPreview(null);
  }, [open]);

  const validateImage = (f: File): string | null => {
    if (!ACCEPTED_IMAGE_TYPES.includes(f.type)) {
      return trt.imageInvalidFormat;
    }
    if (f.size > MAX_IMAGE_SIZE) {
      return trt.imageTooBig;
    }
    return null;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const err = validateImage(f);
    if (err) {
      toast({ variant: 'destructive', title: trt.imageRejected, description: err });
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const handleCanvas = (dataUrl: string) => {
    if (!dataUrl) {
      setFile(null);
      setPreview(null);
      return;
    }
    const f = dataUrlToFile(dataUrl, `signature-${Date.now()}.png`);
    setFile(f);
    setPreview(dataUrl);
  };

  const handleClear = () => {
    setFile(null);
    setPreview(null);
  };

  const handleSubmit = async () => {
    if (!file) {
      toast({
        variant: 'destructive',
        title: trt.sigNoFile,
        description: trt.sigNoFileDesc,
      });
      return;
    }
    if (!responsibleTechnicianId) {
      toast({
        variant: 'destructive',
        title: trt.sigNoRt,
        description: trt.sigNoRtDesc,
      });
      return;
    }
    if (!companyId) {
      toast({
        variant: 'destructive',
        title: trt.companyNotFound,
        description: trt.companyNotFoundDesc,
      });
      return;
    }

    setSaving(true);
    try {
      const signature_image_url = await uploadResponsibleTechnicianMedia({
        companyId,
        technicianId: responsibleTechnicianId,
        kind: 'signature',
        file,
      });

      // UPDATE parcial: só `signature_image_url`. Não usamos `updateTechnician`
      // do hook porque o tipo do input exige `full_name` e o spread sobreescreveria
      // o nome com string vazia. Aqui vamos direto no client com payload mínimo.
      const { error } = await supabase
        .from('responsible_technicians')
        .update({ signature_image_url } as never)
        .eq('id', responsibleTechnicianId);
      if (error) throw error;

      // Invalida caches que dependem da assinatura. A próxima chamada de
      // generate-pmoc-* recalcula hash e gera versão nova.
      queryClient.invalidateQueries({ queryKey: ['responsible-technicians'] });
      queryClient.invalidateQueries({ queryKey: ['contracts'] });

      toast({
        title: trt.sigSaved,
        description: trt.sigSavedDesc,
      });
      onOpenChange(false);
    } catch (err) {
      console.error('[RtSignatureQuickDialog] erro ao salvar', err);
      toast({
        variant: 'destructive',
        title: trt.sigError,
        description: getErrorMessage(err, 'Tente novamente.'),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(o) => !saving && onOpenChange(o)}
      title={trt.sigQuickTitle}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {trt.cancel}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saving || !file}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {trt.sigSaveBtn}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 py-2">
        <p className="text-xs text-muted-foreground">
          {trt.sigDesc}
        </p>

        <div className="space-y-2">
          <Label>{trt.sigModeLabel}</Label>
          <Tabs value={mode} onValueChange={(v) => setMode(v as 'upload' | 'draw')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="upload" className="gap-1.5">
                <Camera className="h-3.5 w-3.5" />
                {trt.tabUpload}
              </TabsTrigger>
              <TabsTrigger value="draw" className="gap-1.5">
                <Pen className="h-3.5 w-3.5" />
                {trt.tabDraw}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="upload" className="space-y-2">
              <UploadField preview={preview} onChange={handleFileChange} onClear={handleClear} removeLabel={trt.removeImage} formatHint={trt.imageFormatHint} selectLabel={trt.selectImage} altText={trt.sigAltText} />
              <p className="text-xs text-muted-foreground">
                {trt.sigUploadHint}
              </p>
            </TabsContent>

            <TabsContent value="draw">
              <PmocSignatureCanvas value={preview} onChange={handleCanvas} />
            </TabsContent>
          </Tabs>
        </div>

        <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/5 px-2.5 py-2 text-xs">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
          <span>
            {trt.sigWarning}
          </span>
        </div>
      </div>
    </ResponsiveModal>
  );
}

function UploadField({
  preview,
  onChange,
  onClear,
  removeLabel = 'Remover imagem',
  formatHint = 'PNG ou JPG (máx. 2MB)',
  selectLabel = 'Selecionar',
  altText = 'Assinatura',
}: {
  preview: string | null;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
  removeLabel?: string;
  formatHint?: string;
  selectLabel?: string;
  altText?: string;
}) {
  const inputId = 'rt-signature-quick-upload';
  return (
    <div
      className={cn(
        'relative flex h-32 w-full items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-border bg-muted/30',
        preview && 'border-solid border-border bg-white',
      )}
    >
      {preview ? (
        <>
          <img src={preview} alt={altText} className="h-full w-full object-contain" />
          <button
            type="button"
            onClick={onClear}
            aria-label={removeLabel}
            className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-md hover:bg-destructive/90"
          >
            <X className="h-4 w-4" />
          </button>
        </>
      ) : (
        <label
          htmlFor={inputId}
          className="flex h-full w-full cursor-pointer flex-col items-center justify-center gap-2 text-muted-foreground hover:bg-muted/50"
        >
          <ImageIcon className="h-6 w-6" />
          <span className="text-xs">{formatHint}</span>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
            <Upload className="h-3 w-3" />
            {selectLabel}
          </span>
        </label>
      )}
      <input
        id={inputId}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(',')}
        className="hidden"
        onChange={onChange}
      />
    </div>
  );
}
