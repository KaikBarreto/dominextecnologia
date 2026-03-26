import { useState, useEffect } from 'react';
import { Camera, Upload, Check, X, Pencil, Trash2 } from 'lucide-react';
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
import { useToast } from '@/hooks/use-toast';
import type { FormQuestion } from '@/types/database';

interface FormResponse {
  question_id: string;
  response_value: string | null;
  response_photo_url: string | null;
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
  const [uploadingPhoto, setUploadingPhoto] = useState<string | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<string | null>(null);

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
        description: error.message,
      });
    } finally {
      setSaving(null);
    }
  };

  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>, questionId: string) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploadingPhoto(questionId);
    try {
      const uploadedUrls: string[] = [];
      // Get existing photos
      const existing = responses[questionId]?.response_photo_url;
      if (existing) uploadedUrls.push(...existing.split(','));

      for (const rawFile of Array.from(files)) {
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
      }

      const combinedUrl = uploadedUrls.join(',');
      await saveResponse(questionId, responses[questionId]?.response_value || null, combinedUrl);
      toast({ title: `${files.length > 1 ? `${files.length} fotos enviadas` : 'Foto enviada'}!` });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Erro ao enviar foto',
        description: error.message,
      });
    } finally {
      setUploadingPhoto(null);
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
        Nenhuma pergunta configurada para este questionário.
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
        
        const removePhoto = (indexToRemove: number) => {
          const remaining = photoUrls.filter((_, i) => i !== indexToRemove);
          const newUrl = remaining.length > 0 ? remaining.join(',') : null;
          saveResponse(question.id, responses[question.id]?.response_value || null, newUrl);
        };
        
        return (
          <div className="space-y-2">
            {photoUrls.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {photoUrls.map((url, idx) => (
                  <div key={idx} className="relative aspect-video rounded-lg overflow-hidden bg-muted">
                    <img src={url} alt={`Resposta ${idx + 1}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      className="absolute top-1 right-1 p-1.5 rounded-full bg-destructive/90 text-destructive-foreground shadow-sm"
                      onClick={() => removePhoto(idx)}
                      title="Remover foto"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="aspect-video rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center">
                <Camera className="h-8 w-8 text-muted-foreground/50" />
              </div>
            )}
            <label className="cursor-pointer">
              <input
                type="file"
                accept="image/*"
                multiple
                {...(cameraOnly ? { capture: "environment" as const } : {})}
                className="hidden"
                onChange={(e) => handlePhotoUpload(e, question.id)}
                disabled={uploadingPhoto === question.id}
              />
              <Button variant="outline" size="sm" className="w-full" asChild disabled={uploadingPhoto === question.id}>
                <span>
                  <Upload className="h-3 w-3 mr-1" />
                  {uploadingPhoto === question.id ? 'Enviando...' : photoUrls.length > 0 ? 'Adicionar Foto' : cameraOnly ? 'Tirar Foto' : 'Enviar Foto'}
                </span>
              </Button>
            </label>
            {photoUrls.length > 0 && (
              <p className="text-xs text-muted-foreground text-center">{photoUrls.length} foto{photoUrls.length > 1 ? 's' : ''}</p>
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
                {type === 'boolean' ? 'Sim/Não' : type === 'text' ? 'Texto' : type === 'number' ? 'Número' : type === 'photo' ? 'Foto' : type === 'select' ? 'Seleção' : type === 'signature' ? 'Assinatura' : type}
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
                  {type === 'boolean' ? 'Sim/Não' : type === 'text' ? 'Texto' : type === 'number' ? 'Número' : type === 'photo' ? 'Foto' : type === 'select' ? 'Seleção' : type === 'signature' ? 'Assinatura' : type}
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
    </div>
  );
}
