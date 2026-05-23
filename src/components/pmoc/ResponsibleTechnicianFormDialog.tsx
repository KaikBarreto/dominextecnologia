import { useEffect, useMemo, useState } from 'react';
import { Loader2, Upload, X, ImageIcon, Camera, Pen } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useUserCompany } from '@/hooks/useUserCompany';
import { phoneMask } from '@/utils/masks';
import {
  useResponsibleTechnicians,
  uploadResponsibleTechnicianMedia,
  type ResponsibleTechnician,
} from '@/hooks/useResponsibleTechnicians';
import { PmocSignatureCanvas, dataUrlToFile } from '@/components/pmoc/PmocSignatureCanvas';
import { cn } from '@/lib/utils';

const MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2 MB
const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg'];

interface ResponsibleTechnicianFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  technician?: ResponsibleTechnician | null;
}

interface FormState {
  full_name: string;
  cft_crea: string;
  modality: string;
  registry_number: string;
  email: string;
  phone: string;
  notes: string;
  is_active: boolean;
}

const EMPTY_FORM: FormState = {
  full_name: '',
  cft_crea: '',
  modality: '',
  registry_number: '',
  email: '',
  phone: '',
  notes: '',
  is_active: true,
};

/**
 * Cadastro/edição de Responsável Técnico (RT) — Onda A v1.9.0.
 *
 * Fluxo de upload de assinatura/carimbo:
 *   - CRIAR: salva o RT primeiro (precisa do `id` pra montar o path
 *     `{company_id}/{rt_id}/{kind}.{ext}`), depois faz upload e atualiza
 *     os campos `signature_image_url` / `stamp_image_url`.
 *   - EDITAR: faz upload direto (já tem `id`), depois `updateTechnician`.
 *
 * Imagens removidas: setam null nos campos `*_url`. (Não deleta o arquivo do
 * bucket nessa onda — Database limpa via política/cron quando necessário.)
 */
export function ResponsibleTechnicianFormDialog({
  open,
  onOpenChange,
  technician,
}: ResponsibleTechnicianFormDialogProps) {
  const { toast } = useToast();
  const { companyId } = useUserCompany();
  const { createTechnician, updateTechnician } = useResponsibleTechnicians();

  const isEditing = !!technician;

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [signaturePreview, setSignaturePreview] = useState<string | null>(null);
  const [stampFile, setStampFile] = useState<File | null>(null);
  const [stampPreview, setStampPreview] = useState<string | null>(null);
  const [removeSignature, setRemoveSignature] = useState(false);
  const [removeStamp, setRemoveStamp] = useState(false);
  const [saving, setSaving] = useState(false);
  // Aba ativa da assinatura. Default 'upload' porque foto/scan tem peso jurídico maior.
  const [signatureMode, setSignatureMode] = useState<'upload' | 'draw'>('upload');

  // Hydrate quando abre / muda de edição.
  useEffect(() => {
    if (!open) return;
    if (technician) {
      setForm({
        full_name: technician.full_name ?? '',
        cft_crea: technician.cft_crea ?? '',
        modality: technician.modality ?? '',
        registry_number: technician.registry_number ?? '',
        email: technician.email ?? '',
        phone: technician.phone ?? '',
        notes: technician.notes ?? '',
        is_active: technician.is_active ?? true,
      });
      setSignaturePreview(technician.signature_image_url);
      setStampPreview(technician.stamp_image_url);
    } else {
      setForm(EMPTY_FORM);
      setSignaturePreview(null);
      setStampPreview(null);
    }
    setSignatureFile(null);
    setStampFile(null);
    setRemoveSignature(false);
    setRemoveStamp(false);
    setSignatureMode('upload');
  }, [open, technician]);

  const titleText = useMemo(
    () => (isEditing ? 'Editar Responsável Técnico' : 'Novo Responsável Técnico'),
    [isEditing]
  );

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const validateImage = (file: File): string | null => {
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      return 'Formato inválido. Use PNG ou JPG.';
    }
    if (file.size > MAX_IMAGE_SIZE) {
      return 'Imagem muito grande. Máximo 2MB.';
    }
    return null;
  };

  const handleSignatureChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const err = validateImage(file);
    if (err) {
      toast({ variant: 'destructive', title: 'Imagem rejeitada', description: err });
      return;
    }
    setSignatureFile(file);
    setSignaturePreview(URL.createObjectURL(file));
    setRemoveSignature(false);
  };

  const handleStampChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const err = validateImage(file);
    if (err) {
      toast({ variant: 'destructive', title: 'Imagem rejeitada', description: err });
      return;
    }
    setStampFile(file);
    setStampPreview(URL.createObjectURL(file));
    setRemoveStamp(false);
  };

  const clearSignature = () => {
    setSignatureFile(null);
    setSignaturePreview(null);
    setRemoveSignature(true);
  };

  /**
   * Recebe data URL do `PmocSignatureCanvas` (quando o usuário clica "Salvar imagem").
   * Converte pra `File` PNG pra reaproveitar o pipeline de upload existente.
   * Se vier string vazia (limpou o canvas), trata como remoção.
   */
  const handleSignatureFromCanvas = (dataUrl: string) => {
    if (!dataUrl) {
      clearSignature();
      return;
    }
    const file = dataUrlToFile(dataUrl, `signature-${Date.now()}.png`);
    setSignatureFile(file);
    setSignaturePreview(dataUrl);
    setRemoveSignature(false);
  };

  const clearStamp = () => {
    setStampFile(null);
    setStampPreview(null);
    setRemoveStamp(true);
  };

  const handleSubmit = async () => {
    if (!form.full_name.trim()) {
      toast({ variant: 'destructive', title: 'Nome obrigatório', description: 'Informe o nome completo do responsável técnico.' });
      return;
    }
    if (!companyId) {
      toast({ variant: 'destructive', title: 'Empresa não identificada', description: 'Recarregue a página e tente novamente.' });
      return;
    }

    setSaving(true);
    try {
      const basePayload = {
        full_name: form.full_name.trim(),
        cft_crea: form.cft_crea.trim() || null,
        modality: form.modality.trim() || null,
        registry_number: form.registry_number.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        notes: form.notes.trim() || null,
        is_active: form.is_active,
      };

      if (isEditing && technician) {
        // EDITAR: upload primeiro (se houver), depois update único com URLs novas.
        let signature_image_url: string | null | undefined = undefined;
        let stamp_image_url: string | null | undefined = undefined;

        if (signatureFile) {
          signature_image_url = await uploadResponsibleTechnicianMedia({
            companyId,
            technicianId: technician.id,
            kind: 'signature',
            file: signatureFile,
          });
        } else if (removeSignature) {
          signature_image_url = null;
        }

        if (stampFile) {
          stamp_image_url = await uploadResponsibleTechnicianMedia({
            companyId,
            technicianId: technician.id,
            kind: 'stamp',
            file: stampFile,
          });
        } else if (removeStamp) {
          stamp_image_url = null;
        }

        await updateTechnician.mutateAsync({
          id: technician.id,
          ...basePayload,
          ...(signature_image_url !== undefined ? { signature_image_url } : {}),
          ...(stamp_image_url !== undefined ? { stamp_image_url } : {}),
        });
      } else {
        // CRIAR: insert primeiro pra ter o ID, depois upload, depois update.
        const created = await createTechnician.mutateAsync(basePayload);

        if (signatureFile || stampFile) {
          const patch: { signature_image_url?: string; stamp_image_url?: string } = {};
          if (signatureFile) {
            patch.signature_image_url = await uploadResponsibleTechnicianMedia({
              companyId,
              technicianId: created.id,
              kind: 'signature',
              file: signatureFile,
            });
          }
          if (stampFile) {
            patch.stamp_image_url = await uploadResponsibleTechnicianMedia({
              companyId,
              technicianId: created.id,
              kind: 'stamp',
              file: stampFile,
            });
          }
          await updateTechnician.mutateAsync({ id: created.id, ...basePayload, ...patch });
        }
      }

      onOpenChange(false);
    } catch (err) {
      // toasts já são exibidos pelos mutations / upload helper joga erro
      console.error('[ResponsibleTechnicianFormDialog] erro ao salvar', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={titleText}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saving || !form.full_name.trim()}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEditing ? 'Salvar alterações' : 'Cadastrar responsável'}
          </Button>
        </div>
      }
    >
      <div className="space-y-5 py-2">
        {/* Nome */}
        <div className="space-y-1.5">
          <Label htmlFor="rt-name">
            Nome completo <span className="text-destructive">*</span>
          </Label>
          <Input
            id="rt-name"
            value={form.full_name}
            onChange={(e) => setField('full_name', e.target.value)}
            placeholder="Ex: João da Silva"
            autoFocus
          />
        </div>

        {/* CFT/CREA + Modalidade */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="rt-cftcrea">CFT/CREA</Label>
            <Input
              id="rt-cftcrea"
              value={form.cft_crea}
              onChange={(e) => setField('cft_crea', e.target.value)}
              placeholder="Ex: CREA-SP 1234567"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rt-modality">Modalidade</Label>
            <Input
              id="rt-modality"
              value={form.modality}
              onChange={(e) => setField('modality', e.target.value)}
              placeholder="Ex: Engenheiro Mecânico"
            />
          </div>
        </div>

        {/* Registro ART/TRT */}
        <div className="space-y-1.5">
          <Label htmlFor="rt-registry">Número de registro (ART/TRT)</Label>
          <Input
            id="rt-registry"
            value={form.registry_number}
            onChange={(e) => setField('registry_number', e.target.value)}
            placeholder="Ex: ART 1234567/2026"
          />
        </div>

        {/* Email + Telefone */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="rt-email">Email</Label>
            <Input
              id="rt-email"
              type="email"
              value={form.email}
              onChange={(e) => setField('email', e.target.value)}
              placeholder="email@exemplo.com.br"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rt-phone">Telefone</Label>
            <Input
              id="rt-phone"
              value={form.phone}
              onChange={(e) => setField('phone', phoneMask(e.target.value))}
              placeholder="(21) 99999-9999"
            />
          </div>
        </div>

        {/* Assinatura — híbrida (upload OU canvas). Default upload, recomendado. */}
        <div className="space-y-1.5">
          <Label>Assinatura digitalizada</Label>
          <Tabs value={signatureMode} onValueChange={(v) => setSignatureMode(v as 'upload' | 'draw')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="upload" className="gap-1.5">
                <Camera className="h-3.5 w-3.5" />
                Enviar imagem
              </TabsTrigger>
              <TabsTrigger value="draw" className="gap-1.5">
                <Pen className="h-3.5 w-3.5" />
                Desenhar
              </TabsTrigger>
            </TabsList>

            <TabsContent value="upload" className="space-y-2">
              <ImageUploadField
                label=""
                preview={signaturePreview}
                onChange={handleSignatureChange}
                onClear={clearSignature}
              />
              <p className="text-xs text-muted-foreground">
                Fotografe a assinatura no papel e envie. Mais aceito juridicamente.
              </p>
            </TabsContent>

            <TabsContent value="draw">
              <PmocSignatureCanvas
                value={signaturePreview}
                onChange={handleSignatureFromCanvas}
              />
            </TabsContent>
          </Tabs>
        </div>

        {/* Carimbo — upload apenas. Desenhar carimbo não faz sentido. */}
        <div className="space-y-1.5">
          <Label>Carimbo do responsável</Label>
          <ImageUploadField
            label=""
            preview={stampPreview}
            onChange={handleStampChange}
            onClear={clearStamp}
          />
        </div>

        {/* Observações */}
        <div className="space-y-1.5">
          <Label htmlFor="rt-notes">Observações</Label>
          <Textarea
            id="rt-notes"
            value={form.notes}
            onChange={(e) => setField('notes', e.target.value)}
            placeholder="Informações adicionais (opcional)"
            rows={3}
          />
        </div>

        {/* Ativo */}
        <div className="flex items-center justify-between rounded-lg border bg-card/50 p-3">
          <div>
            <Label htmlFor="rt-active" className="font-medium">Cadastro ativo</Label>
            <p className="text-xs text-muted-foreground">
              Quando inativo, este RT não aparece como opção em novos contratos.
            </p>
          </div>
          <Switch
            id="rt-active"
            checked={form.is_active}
            onCheckedChange={(v) => setField('is_active', v)}
          />
        </div>
      </div>
    </ResponsiveModal>
  );
}

// ---------------------------------------------------------------------------
// Subcomponente: campo de upload com preview e botão de remover.
// ---------------------------------------------------------------------------
interface ImageUploadFieldProps {
  label: string;
  preview: string | null;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
}

function ImageUploadField({ label, preview, onChange, onClear }: ImageUploadFieldProps) {
  // `label` pode ser string vazia (quando o componente pai já renderizou o label).
  const safeKey = label.trim() ? label.toLowerCase().replace(/\s+/g, '-') : `field-${Math.random().toString(36).slice(2, 8)}`;
  const inputId = `upload-${safeKey}`;
  return (
    <div className="space-y-1.5">
      {label && <Label>{label}</Label>}
      <div
        className={cn(
          'relative flex h-32 w-full items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-border bg-muted/30',
          preview && 'border-solid border-border bg-white'
        )}
      >
        {preview ? (
          <>
            <img src={preview} alt={label} className="h-full w-full object-contain" />
            <button
              type="button"
              onClick={onClear}
              aria-label="Remover imagem"
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
            <span className="text-xs">PNG ou JPG (máx. 2MB)</span>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
              <Upload className="h-3 w-3" />
              Selecionar
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
    </div>
  );
}
