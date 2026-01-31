import { useState, useEffect } from 'react';
import { Camera, Upload, Check, X } from 'lucide-react';
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
import { useToast } from '@/hooks/use-toast';
import type { FormQuestion } from '@/types/database';

interface FormResponse {
  question_id: string;
  response_value: string | null;
  response_photo_url: string | null;
}

interface DynamicFormQuestionsProps {
  serviceOrderId: string;
  templateId: string;
}

export function DynamicFormQuestions({ serviceOrderId, templateId }: DynamicFormQuestionsProps) {
  const { toast } = useToast();
  const [questions, setQuestions] = useState<FormQuestion[]>([]);
  const [responses, setResponses] = useState<Record<string, FormResponse>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState<string | null>(null);

  useEffect(() => {
    fetchQuestions();
    fetchResponses();
  }, [templateId, serviceOrderId]);

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
      const { data, error } = await supabase
        .from('form_responses')
        .select('*')
        .eq('service_order_id', serviceOrderId);

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
      // Check if response already exists
      const { data: existing } = await supabase
        .from('form_responses')
        .select('id')
        .eq('service_order_id', serviceOrderId)
        .eq('question_id', questionId)
        .single();

      if (existing) {
        // Update existing
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
        // Insert new
        const { error } = await supabase
          .from('form_responses')
          .insert({
            service_order_id: serviceOrderId,
            question_id: questionId,
            response_value: value,
            response_photo_url: photoUrl || null,
          });
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
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingPhoto(questionId);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${serviceOrderId}/form-${questionId}-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('os-photos')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('os-photos')
        .getPublicUrl(fileName);

      await saveResponse(questionId, null, publicUrl);
      toast({ title: 'Foto enviada!' });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Erro ao enviar foto',
        description: error.message,
      });
    } finally {
      setUploadingPhoto(null);
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
        Nenhuma pergunta configurada para este formulário.
      </p>
    );
  }

  const renderQuestionInput = (question: FormQuestion) => {
    const response = responses[question.id];
    const value = response?.response_value || '';
    const isSaving = saving === question.id;

    switch (question.question_type) {
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
        return (
          <Select
            value={value}
            onValueChange={(val) => saveResponse(question.id, val)}
            disabled={isSaving}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione uma opção" />
            </SelectTrigger>
            <SelectContent>
              {options.map((opt, idx) => (
                <SelectItem key={idx} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case 'photo':
        const photoUrl = response?.response_photo_url;
        return (
          <div className="space-y-2">
            {photoUrl ? (
              <div className="relative aspect-video rounded-lg overflow-hidden bg-muted">
                <img
                  src={photoUrl}
                  alt="Resposta"
                  className="w-full h-full object-cover"
                />
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
                capture="environment"
                className="hidden"
                onChange={(e) => handlePhotoUpload(e, question.id)}
                disabled={uploadingPhoto === question.id}
              />
              <Button variant="outline" size="sm" className="w-full" asChild disabled={uploadingPhoto === question.id}>
                <span>
                  <Upload className="h-3 w-3 mr-1" />
                  {uploadingPhoto === question.id ? 'Enviando...' : photoUrl ? 'Trocar Foto' : 'Enviar Foto'}
                </span>
              </Button>
            </label>
          </div>
        );

      default:
        return <p className="text-sm text-muted-foreground">Tipo não suportado</p>;
    }
  };

  return (
    <div className="space-y-4">
      {questions.map((question, index) => (
        <div key={question.id} className="space-y-2 p-3 rounded-lg bg-muted/30">
          <Label className="flex items-start gap-2">
            <span className="font-bold text-muted-foreground">{index + 1}.</span>
            <span className="flex-1">
              {question.question}
              {question.is_required && <span className="text-destructive ml-1">*</span>}
            </span>
          </Label>
          {question.description && (
            <p className="text-xs text-muted-foreground ml-5">{question.description}</p>
          )}
          <div className="ml-5">
            {renderQuestionInput(question)}
          </div>
        </div>
      ))}
    </div>
  );
}
