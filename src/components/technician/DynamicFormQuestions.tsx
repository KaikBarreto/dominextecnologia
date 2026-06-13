import { useState, useEffect, useRef, useMemo } from 'react';
import { Camera, Upload, Check, X, Pencil, Trash2, ImageIcon, AlertTriangle, Download, Copy, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getErrorMessage } from '@/utils/errorMessages';
import { Checkbox } from '@/components/ui/checkbox';
import { SignaturePad } from '@/components/SignaturePad';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { processImageFile } from '@/utils/imageConvert';
import { SignedImg } from '@/components/ui/SignedImg';
import { PhotoCarousel } from '@/components/ui/PhotoCarousel';
import { ImagePreviewModal } from '@/components/ui/ImagePreviewModal';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { useToast } from '@/hooks/use-toast';
import type { FormQuestion } from '@/types/database';

interface FormResponse {
  question_id: string;
  response_value: string | null;
  response_photo_url: string | null;
}

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
    // Sem await: preserva o gesto do toque. .catch engole o AbortError (cancelar).
    navigator.share({ files: [file], title: 'Foto da OS' }).catch(() => {
      /* cancelado pelo usuário ou sem suporte */
    });
    return 'share';
  }

  // Android/desktop (ou iOS antigo sem canShare): download direto.
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
// iOS: UM único navigator.share com TODOS os arquivos (uma folha só). SEM await
// pra preservar o gesto. Android/desktop: baixa cada arquivo via <a download>.
// Retorna 'share' ou 'download' pra UI decidir se mostra toast (só no download).
function savePhotosToDevice(files: File[]): 'share' | 'download' {
  if (isIOS() && typeof navigator.canShare === 'function' && navigator.canShare({ files })) {
    navigator.share({ files, title: 'Foto da OS' }).catch(() => {
      /* cancelado pelo usuário ou sem suporte */
    });
    return 'share';
  }

  // Android/desktop: baixa cada arquivo individualmente.
  for (const file of files) {
    savePhotoToDevice(file);
  }
  return 'download';
}

export interface FormValidationResult {
  isValid: boolean;
  missingQuestions: string[];
}

interface DynamicFormQuestionsProps {
  serviceOrderId: string;
  templateId: string;
  equipmentId?: string;
  onValidationChange?: (result: FormValidationResult) => void;
}

export function DynamicFormQuestions({ serviceOrderId, templateId, equipmentId, onValidationChange }: DynamicFormQuestionsProps) {
  const { toast } = useToast();
  const [questions, setQuestions] = useState<FormQuestion[]>([]);
  const [responses, setResponses] = useState<Record<string, FormResponse>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [uploadingPhotos, setUploadingPhotos] = useState<Set<string>>(new Set());
  const [editingQuestion, setEditingQuestion] = useState<string | null>(null);
  // Confirmação antes de remover uma foto (qual pergunta + índice da foto).
  const [pendingRemoval, setPendingRemoval] = useState<{ questionId: string; index: number } | null>(null);
  // Visualizador de foto ampliada ao tocar (nunca abre nova aba).
  const [previewImages, setPreviewImages] = useState<{ urls: string[]; index: number } | null>(null);
  // Fotos recém-tiradas pela câmera, aguardando o usuário decidir se salva no aparelho.
  const [photosToSave, setPhotosToSave] = useState<File[] | null>(null);

  // Guarda o File processado de cada foto enviada NESTA sessão, indexado pela
  // mesma publicUrl que aparece em photoUrls. Permite salvar no aparelho sem
  // await antes do navigator.share (exigência do iOS pra preservar o gesto).
  const capturedFilesRef = useRef<Map<string, File>>(new Map());

  // Toggle "Salvar fotos no dispositivo" (Configurações › Usabilidade).
  // Chave ausente => default ligado (!== false). Lido uma vez por render.
  const saveToDeviceEnabled = useMemo(() => {
    try {
      const s = JSON.parse(localStorage.getItem('usability-settings') || '{}');
      return s.saveOSPhotosToDevice !== false;
    } catch {
      return true;
    }
  }, []);

  // Salva a foto no aparelho ao TOQUE do botão (gesto fresco → iOS aceita).
  // Caminho confiável: File em memória (sessão atual), sem await antes do share.
  // Fallback (foto de sessão anterior): busca o blob do bucket público e salva
  // best-effort — no iOS o share pode não abrir nesse caso (sem gesto preservado).
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

  // Remove a foto de fato, só após confirmação no modal. Reconstrói a lista a
  // partir de pendingRemoval (não usa o closure local do case 'photo').
  const confirmRemovePhoto = () => {
    if (!pendingRemoval) return;
    const { questionId, index } = pendingRemoval;
    const raw = responses[questionId]?.response_photo_url;
    const urls = raw ? raw.split(',').filter(Boolean) : [];
    const remaining = urls.filter((_, i) => i !== index);
    saveResponse(questionId, responses[questionId]?.response_value || null, remaining.length ? remaining.join(',') : null);
    setPendingRemoval(null);
  };

  // Validation effect
  useEffect(() => {
    if (onValidationChange && questions.length > 0) {
      const requiredQuestions = questions.filter(q => q.is_required);
      const missingQuestions: string[] = [];
      
      requiredQuestions.forEach(q => {
        const response = responses[q.id];
        const hasValue = response?.response_value?.trim() || response?.response_photo_url;
        if (!hasValue) {
          missingQuestions.push(q.question);
        }
      });

      onValidationChange({
        isValid: missingQuestions.length === 0,
        missingQuestions,
      });
    }
  }, [questions, responses, onValidationChange]);

  useEffect(() => {
    fetchQuestions();
    fetchResponses();
  }, [templateId, serviceOrderId, equipmentId]);

  const fetchQuestions = async () => {
    try {
      const { data, error } = await supabase
        .from('form_questions')
        .select('*')
        .eq('template_id', templateId)
        .order('position', { ascending: true });

      if (error) throw error;
      setQuestions((data as FormQuestion[]) || []);
    } catch (error: any) {
      console.error('Error fetching questions:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchResponses = async () => {
    try {
      // First get question IDs for THIS template to avoid cross-equipment contamination
      const { data: templateQuestions } = await supabase
        .from('form_questions')
        .select('id')
        .eq('template_id', templateId);
      
      const questionIds = (templateQuestions || []).map(q => q.id);
      if (questionIds.length === 0) { setResponses({}); return; }

      let query = supabase
        .from('form_responses')
        .select('*')
        .eq('service_order_id', serviceOrderId)
        .in('question_id', questionIds);

      // Filter by equipment_id to isolate responses per equipment
      if (equipmentId) {
        query = query.eq('equipment_id', equipmentId);
      }

      const { data, error } = await query;

      if (error) throw error;

      const responsesMap: Record<string, FormResponse> = {};
      (data || []).forEach((r) => {
        responsesMap[r.question_id] = {
          question_id: r.question_id,
          response_value: r.response_value,
          response_photo_url: r.response_photo_url,
        };
      });
      setResponses(responsesMap);
    } catch (error: any) {
      console.error('Error fetching responses:', error);
    }
  };

  const saveResponse = async (questionId: string, value: string | null, photoUrl?: string | null) => {
    setSaving(questionId);
    try {
      // Build query to find existing response scoped to this equipment
      let existingQuery = supabase
        .from('form_responses')
        .select('id')
        .eq('service_order_id', serviceOrderId)
        .eq('question_id', questionId);
      
      if (equipmentId) {
        existingQuery = existingQuery.eq('equipment_id', equipmentId);
      } else {
        existingQuery = existingQuery.is('equipment_id', null);
      }

      const { data: existing } = await existingQuery.single();

      if (existing) {
        const { error } = await supabase
          .from('form_responses')
          .update({
            response_value: value,
            response_photo_url: photoUrl !== undefined ? photoUrl : responses[questionId]?.response_photo_url,
            responded_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('form_responses')
          .insert({
            service_order_id: serviceOrderId,
            question_id: questionId,
            response_value: value,
            response_photo_url: photoUrl || null,
            equipment_id: equipmentId || null,
          } as any);
        if (error) throw error;
      }

      setResponses((prev) => ({
        ...prev,
        [questionId]: {
          question_id: questionId,
          response_value: value,
          response_photo_url: photoUrl !== undefined ? photoUrl : prev[questionId]?.response_photo_url || null,
        },
      }));
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar resposta',
        description: getErrorMessage(error),
      });
    } finally {
      setSaving(null);
    }
  };

  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>, questionId: string, fromCamera: boolean = false) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const allowMultiple = (questions.find(q => q.id === questionId) as any)?.allow_multiple_photos !== false;
    const existingUrls = (responses[questionId]?.response_photo_url || '').split(',').filter(Boolean);

    // Pergunta de foto única que já tem uma foto: bloqueia e orienta a remover.
    if (!allowMultiple && existingUrls.length >= 1) {
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

    // Guarda os arquivos CRUS do input antes do processamento: servem como cópia
    // pra oferecer "salvar no aparelho" sem depender do resultado do upload.
    const rawFiles = Array.from(selectedFiles);

    setUploadingPhotos(prev => new Set(prev).add(questionId));
    try {
      const uploadedUrls: string[] = [];
      // Get existing photos
      const existing = responses[questionId]?.response_photo_url;
      if (existing) uploadedUrls.push(...existing.split(','));

      for (const rawFile of selectedFiles) {
        const file = await processImageFile(rawFile);

        const fileExt = file.name.split('.').pop();
        const fileName = `${serviceOrderId}/form-${questionId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('os-photos')
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('os-photos')
          .getPublicUrl(fileName);

        uploadedUrls.push(publicUrl);
        // Guarda o File processado pra salvar no aparelho sem await (mesma sessão).
        capturedFilesRef.current.set(publicUrl, file);
      }

      const combinedUrl = uploadedUrls.join(',');
      await saveResponse(questionId, responses[questionId]?.response_value || null, combinedUrl);
      toast({ title: `${selectedFiles.length > 1 ? `${selectedFiles.length} fotos enviadas` : 'Foto enviada'}!` });

      // Só ABRE o modal perguntando se quer salvar no aparelho (câmera + toggle ON).
      // NÃO chama savePhotosToDevice aqui: o iOS bloqueia o share sem gesto fresco;
      // o share/download só dispara quando o usuário toca "Salvar imagem" no modal.
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
      setUploadingPhotos(prev => { const next = new Set(prev); next.delete(questionId); return next; });
      // Reset input so same file can be selected again
      event.target.value = '';
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-muted rounded-lg" />
        ))}
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        Nenhuma pergunta configurada para este checklist.
      </p>
    );
  }

  const renderSingleTypeInput = (question: FormQuestion, type: string) => {
    const response = responses[question.id];
    const value = response?.response_value || '';
    const isSaving = saving === question.id;

    switch (type) {
      case 'boolean':
        return (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Switch
                checked={value === 'true'}
                onCheckedChange={(checked) => saveResponse(question.id, checked ? 'true' : 'false')}
                disabled={isSaving}
              />
              <span className="text-sm">
                {value === 'true' ? (
                  <Badge variant="success" className="gap-1">
                    <Check className="h-3 w-3" /> Sim
                  </Badge>
                ) : value === 'false' ? (
                  <Badge variant="destructive" className="gap-1">
                    <X className="h-3 w-3" /> Não
                  </Badge>
                ) : (
                  <span className="text-muted-foreground">Não respondido</span>
                )}
              </span>
            </div>
          </div>
        );

      case 'text':
        return (
          <Textarea
            placeholder="Digite sua resposta..."
            value={value}
            onChange={(e) => setResponses((prev) => ({
              ...prev,
              [question.id]: { ...prev[question.id], question_id: question.id, response_value: e.target.value, response_photo_url: prev[question.id]?.response_photo_url || null },
            }))}
            onBlur={() => saveResponse(question.id, responses[question.id]?.response_value || null)}
            rows={2}
            disabled={isSaving}
          />
        );

      case 'number':
        return (
          <Input
            type="number"
            placeholder="Digite o valor..."
            value={value}
            onChange={(e) => setResponses((prev) => ({
              ...prev,
              [question.id]: { ...prev[question.id], question_id: question.id, response_value: e.target.value, response_photo_url: prev[question.id]?.response_photo_url || null },
            }))}
            onBlur={() => saveResponse(question.id, responses[question.id]?.response_value || null)}
            disabled={isSaving}
          />
        );

      // Onda D v1.9.x — campo sanitário PMOC.
      // Valor numérico com unidade exibida no sufixo e validação visual quando
      // sai da faixa esperada. Não bloqueia salvamento (intencional: técnico
      // precisa registrar valor anômalo pra documentar a anomalia).
      case 'pmoc_measurement': {
        const unit = question.unit ?? null;
        const min = question.expected_min ?? null;
        const max = question.expected_max ?? null;
        const numericValue = value.trim() === '' ? NaN : parseFloat(value);
        const isOutOfRange =
          !isNaN(numericValue) &&
          ((min != null && numericValue < min) ||
            (max != null && numericValue > max));

        return (
          <div className="space-y-1.5">
            <div className="relative">
              <Input
                type="number"
                step="0.01"
                inputMode="decimal"
                placeholder="Digite a medida..."
                value={value}
                onChange={(e) =>
                  setResponses((prev) => ({
                    ...prev,
                    [question.id]: {
                      ...prev[question.id],
                      question_id: question.id,
                      response_value: e.target.value,
                      response_photo_url: prev[question.id]?.response_photo_url || null,
                    },
                  }))
                }
                onBlur={() => saveResponse(question.id, responses[question.id]?.response_value || null)}
                disabled={isSaving}
                className={cn(
                  unit ? 'pr-16' : '',
                  isOutOfRange && 'border-warning focus-visible:ring-warning',
                )}
              />
              {unit && (
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">
                  {unit}
                </span>
              )}
            </div>
            {(min != null || max != null) && (
              <p className="text-xs text-muted-foreground">
                Faixa esperada: {min ?? '—'} a {max ?? '—'}{unit ? ` ${unit}` : ''}
              </p>
            )}
            {isOutOfRange && (
              <p className="text-xs text-warning flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 shrink-0" />
                Valor fora da faixa esperada — confira o equipamento ou registre observação.
              </p>
            )}
          </div>
        );
      }

      case 'select':
        const options = (question.options as string[]) || [];
        const selectedValues = value ? value.split('|||').filter(Boolean) : [];
        
        const toggleOption = (opt: string) => {
          let next: string[];
          if (selectedValues.includes(opt)) {
            next = selectedValues.filter(v => v !== opt);
          } else {
            next = [...selectedValues, opt];
          }
          const newValue = next.join('|||');
          setResponses((prev) => ({
            ...prev,
            [question.id]: { ...prev[question.id], question_id: question.id, response_value: newValue, response_photo_url: prev[question.id]?.response_photo_url || null },
          }));
          saveResponse(question.id, newValue);
        };

        return (
          <div className="space-y-1.5">
            {options.map((opt, idx) => (
              <label key={idx} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer hover:bg-muted/50 transition-colors">
                <Checkbox
                  checked={selectedValues.includes(opt)}
                  onCheckedChange={() => toggleOption(opt)}
                  disabled={isSaving}
                />
                {opt}
              </label>
            ))}
            {selectedValues.length > 0 && (
              <p className="text-xs text-muted-foreground">{selectedValues.length} selecionada{selectedValues.length > 1 ? 's' : ''}</p>
            )}
          </div>
        );

      case 'photo':
        const photoUrlRaw = response?.response_photo_url;
        const photoUrls = photoUrlRaw ? photoUrlRaw.split(',').filter(Boolean) : [];
        const cameraOnly = !!(question as any).require_camera;
        const allowMultiple = (question as any).allow_multiple_photos !== false;

        return (
          <div className="space-y-2">
            {photoUrls.length > 0 ? (
              <PhotoCarousel
                urls={photoUrls}
                aspectClassName="aspect-square"
                onOpen={(i) => setPreviewImages({ urls: photoUrls, index: i })}
                renderImage={(url, alt, className) => <SignedImg src={url} alt={alt} className={className} />}
                renderOverlay={(idx) => (
                  <>
                    <button
                      type="button"
                      className="absolute top-1 right-1 z-10 p-1.5 rounded-full bg-destructive/90 text-destructive-foreground shadow-sm"
                      onClick={() => setPendingRemoval({ questionId: question.id, index: idx })}
                      title="Remover foto"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    {saveToDeviceEnabled && (
                      <button
                        type="button"
                        className="absolute bottom-1 right-1 z-10 p-1.5 rounded-full bg-black/60 text-white shadow-sm"
                        onClick={() => handleSavePhotoToDevice(photoUrls[idx])}
                        title="Salvar imagem no aparelho"
                      >
                        <Download className="h-3 w-3" />
                      </button>
                    )}
                  </>
                )}
              />
            ) : (
              <div className="aspect-square rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center">
                <Camera className="h-8 w-8 text-muted-foreground/50" />
              </div>
            )}
            <div className={cameraOnly ? '' : 'grid grid-cols-2 gap-2'}>
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  multiple={allowMultiple}
                  capture="environment"
                  className="hidden"
                  onChange={(e) => handlePhotoUpload(e, question.id, true)}
                  disabled={uploadingPhotos.has(question.id)}
                />
                <Button variant="outline" size="sm" className="w-full" asChild disabled={uploadingPhotos.has(question.id)}>
                  <span>
                    <Camera className="h-3 w-3 mr-1" />
                    {uploadingPhotos.has(question.id) ? 'Enviando...' : 'Tirar Foto'}
                  </span>
                </Button>
              </label>
              {!cameraOnly && (
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    multiple={allowMultiple}
                    className="hidden"
                    onChange={(e) => handlePhotoUpload(e, question.id)}
                    disabled={uploadingPhotos.has(question.id)}
                  />
                  <Button variant="outline" size="sm" className="w-full" asChild disabled={uploadingPhotos.has(question.id)}>
                    <span>
                      <ImageIcon className="h-3 w-3 mr-1" />
                      {uploadingPhotos.has(question.id) ? 'Enviando...' : 'Galeria'}
                    </span>
                  </Button>
                </label>
              )}
            </div>
            {photoUrls.length > 0 && (
              <p className="text-xs text-muted-foreground text-center">{photoUrls.length} foto{allowMultiple && photoUrls.length > 1 ? 's' : ''}</p>
            )}
          </div>
        );

      case 'signature':
        return (
          <SignaturePad
            value={value || null}
            onChange={(dataUrl) => saveResponse(question.id, dataUrl)}
            label={question.description || undefined}
            disabled={isSaving}
          />
        );

      default:
        return <p className="text-sm text-muted-foreground">Tipo não suportado</p>;
    }
  };

  const renderQuestionInput = (question: FormQuestion) => {
    const answerTypes = ((question as any).answer_types as string[] | null);
    const effectiveTypes = answerTypes && answerTypes.length > 0 ? answerTypes : [question.question_type];
    const answerMode = (question as any).answer_mode || 'exclusive';

    // Single type - just render it
    if (effectiveTypes.length === 1) {
      return renderSingleTypeInput(question, effectiveTypes[0]);
    }

    // Combined mode - always show all types
    if (answerMode === 'combined') {
      return (
        <div className="space-y-3">
          {effectiveTypes.map((type) => (
            <div key={type} className="space-y-1">
              <Badge variant="outline" className="text-xs">
                {type === 'boolean' ? 'Sim/Não' : type === 'text' ? 'Texto' : type === 'number' ? 'Número' : type === 'photo' ? 'Foto' : type === 'select' ? 'Seleção' : type === 'signature' ? 'Assinatura' : type === 'pmoc_measurement' ? 'Medida PMOC' : type}
              </Badge>
              {renderSingleTypeInput(question, type)}
            </div>
          ))}
        </div>
      );
    }

    // Exclusive mode - hide others when one is answered
    const response = responses[question.id];
    const hasTextValue = response?.response_value?.trim();
    const hasPhotoValue = response?.response_photo_url;

    let answeredType: string | null = null;
    if (hasPhotoValue) {
      answeredType = 'photo';
    } else if (hasTextValue) {
      if (hasTextValue === 'true' || hasTextValue === 'false') {
        answeredType = effectiveTypes.includes('boolean') ? 'boolean' : null;
      }
      if (!answeredType) {
        for (const t of effectiveTypes) {
          if (t !== 'photo' && t !== 'signature') {
            answeredType = t;
            break;
          }
        }
      }
    }

    return (
      <div className="space-y-3">
        {effectiveTypes.map((type) => {
          if (answeredType && answeredType !== type) return null;
          return (
            <div key={type} className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {type === 'boolean' ? 'Sim/Não' : type === 'text' ? 'Texto' : type === 'number' ? 'Número' : type === 'photo' ? 'Foto' : type === 'select' ? 'Seleção' : type === 'signature' ? 'Assinatura' : type === 'pmoc_measurement' ? 'Medida PMOC' : type}
                </Badge>
                {answeredType === type && (
                  <Badge variant="default" className="text-xs gap-1">
                    <Check className="h-3 w-3" /> Respondido
                  </Badge>
                )}
              </div>
              {renderSingleTypeInput(question, type)}
            </div>
          );
        })}
        {answeredType && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
            onClick={() => saveResponse(question.id, null, null)}
          >
            Limpar resposta e mostrar todas as opções
          </Button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {questions.map((question, index) => {
        const response = responses[question.id];
        const hasAnswer = !!(response?.response_value?.trim() || response?.response_photo_url);
        const isEditing = editingQuestion === question.id;
        const showReadOnly = hasAnswer && !isEditing && question.question_type !== 'photo';
        
        return (
          <div key={question.id} className="space-y-2 p-3 rounded-lg bg-muted/30">
            <Label className="flex items-start gap-2">
              <span className="font-bold text-muted-foreground">{index + 1}.</span>
              <span className="flex-1">
                {question.question}
                {question.is_required && <span className="text-destructive ml-1">*</span>}
              </span>
              {hasAnswer && !isEditing && (
                <button
                  type="button"
                  className="p-1 rounded hover:bg-muted transition-colors shrink-0"
                  onClick={() => setEditingQuestion(question.id)}
                  title="Editar resposta"
                >
                  <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              )}
              {isEditing && (
                <button
                  type="button"
                  className="p-1 rounded hover:bg-muted transition-colors shrink-0"
                  onClick={() => setEditingQuestion(null)}
                  title="Fechar edição"
                >
                  <Check className="h-3.5 w-3.5 text-primary" />
                </button>
              )}
            </Label>
            {question.description && (
              <p className="text-xs text-muted-foreground ml-5">{question.description}</p>
            )}
            <div className="ml-5">
              {showReadOnly ? (
                <div className="text-sm py-1">
                  {response.response_value === 'true' ? (
                    <Badge variant="success" className="gap-1"><Check className="h-3 w-3" /> Sim</Badge>
                  ) : response.response_value === 'false' ? (
                    <Badge variant="destructive" className="gap-1"><X className="h-3 w-3" /> Não</Badge>
                  ) : response.response_value?.includes('|||') ? (
                    <div className="flex flex-wrap gap-1">
                      {response.response_value.split('|||').map((v, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">{v}</Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-foreground">{response.response_value}</p>
                  )}
                </div>
              ) : (
                renderQuestionInput(question)
              )}
            </div>
          </div>
        );
      })}

      {/* Confirmação antes de remover uma foto (qualquer pergunta). */}
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
                // Chama ANTES do setState e SEM await: o gesto do toque habilita
                // o navigator.share no iOS (folha "Salvar Imagem").
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

      {/* Visualizador de foto ampliada — tocar numa foto enviada abre aqui (não em nova aba). */}
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
