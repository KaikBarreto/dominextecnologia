import { useCallback, useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { PublicFormQuestionField, publicFormQuestionDomId } from '@/components/forms/PublicFormQuestionField';
import { submitCustomerPortalForm, type CustomerPortalForm } from '@/utils/customerPortalApi';
import { uploadPublicFormFile } from '@/utils/publicFormUpload';
import {
  buildAnswersPayload, validatePublicFormAnswers,
  type PublicFormAnswers, type PublicFormAnswerValue,
} from '@/lib/publicFormQuestions';

/** Subconjunto do `MESSAGES[locale].app.customers.portal` que esta seção usa. */
export interface PortalFormsTexts {
  formsIntro: string;
  formsFillCta: string;
  formsBackToList: string;
  formsSubmit: string;
  formsSubmitting: string;
  formsNoQuestions: string;
  formsSuccessTitle: string;
  formsSuccessDefault: string;
  formsErrorTitle: string;
  formsErrorUnavailable: string;
  formsErrorTooMany: string;
  formsErrorInvalid: string;
  formsErrorGeneric: string;
  formsUploadWait: string;
}

interface PortalFormsSectionProps {
  token: string;
  sessionToken: string;
  forms: CustomerPortalForm[];
  lang: string;
  t: PortalFormsTexts;
}

/**
 * Seção "Formulários" do Portal do Cliente: lista os formulários publicados no
 * portal, abre um, renderiza as perguntas com o MESMO campo da página pública e
 * envia pela RPC do portal (que grava a resposta já vinculada ao cliente do
 * token, sem criar cliente).
 *
 * O erro nunca chega ao cliente final como texto do banco: traduz pelo `code`
 * (42501 indisponível, 22023 rate-limit ou resposta inválida).
 */
export function PortalFormsSection({ token, sessionToken, forms, lang, t }: PortalFormsSectionProps) {
  const { toast } = useToast();
  const [openFormId, setOpenFormId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<PublicFormAnswers>({});
  const [fieldError, setFieldError] = useState<{ questionId: string | null; message: string } | null>(null);
  const [busyUploads, setBusyUploads] = useState<Set<string>>(() => new Set());
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ title: string; message: string } | null>(null);

  const openForm = forms.find((form) => form.id === openFormId) ?? null;

  const reset = useCallback(() => {
    setOpenFormId(null);
    setAnswers({});
    setFieldError(null);
    setBusyUploads(new Set());
    setDone(null);
  }, []);

  const setAnswer = (questionId: string, value: PublicFormAnswerValue) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    setFieldError((prev) => (prev?.questionId === questionId ? null : prev));
  };

  const setUploadBusy = (questionId: string, busy: boolean) => {
    setBusyUploads((prev) => {
      if (prev.has(questionId) === busy) return prev;
      const next = new Set(prev);
      if (busy) next.add(questionId); else next.delete(questionId);
      return next;
    });
  };

  const handleSubmit = async (form: CustomerPortalForm) => {
    setFieldError(null);
    if (busyUploads.size > 0) {
      toast({ variant: 'destructive', title: t.formsErrorTitle, description: t.formsUploadWait });
      return;
    }
    const validation = validatePublicFormAnswers(form.questions, answers);
    if (!validation.ok) {
      setFieldError({ questionId: validation.questionId, message: validation.message });
      if (validation.questionId) {
        document.getElementById(publicFormQuestionDomId(validation.questionId))
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    setSubmitting(true);
    try {
      await submitCustomerPortalForm(
        token,
        sessionToken || null,
        form.id,
        buildAnswersPayload(form.questions, answers),
      );
      setDone({
        title: form.title,
        message: form.successMessage?.trim() || t.formsSuccessDefault,
      });
    } catch (err: unknown) {
      const { code, message } = (err ?? {}) as { code?: string; message?: string };
      // A mensagem do banco serve só pra distinguir o rate-limit (também 22023)
      // da resposta inválida; ela nunca é exibida.
      const description =
        code === '42501'
          ? t.formsErrorUnavailable
          : code === '22023'
            ? (message ?? '').toLowerCase().includes('muitas tentativas')
              ? t.formsErrorTooMany
              : t.formsErrorInvalid
            : t.formsErrorGeneric;
      toast({ variant: 'destructive', title: t.formsErrorTitle, description });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Sucesso ──
  if (done) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 px-4 py-10 text-center">
          <CheckCircle2 className="h-14 w-14 text-emerald-600" />
          <h2 className="text-lg font-semibold">{t.formsSuccessTitle}</h2>
          <p className="max-w-sm whitespace-pre-line break-words text-sm text-muted-foreground">{done.message}</p>
          <Button type="button" variant="outline" className="mt-2 h-11" onClick={reset}>
            {t.formsBackToList}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ── Formulário aberto ──
  if (openForm) {
    return (
      <Card>
        <CardContent className="space-y-4 p-4 sm:p-5">
          <button
            type="button"
            onClick={reset}
            disabled={submitting}
            className="inline-flex min-h-9 items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            {t.formsBackToList}
          </button>

          <div>
            <h2 className="break-words text-lg font-bold">{openForm.title}</h2>
            {openForm.description ? (
              <p className="mt-1 whitespace-pre-line break-words text-sm text-muted-foreground">{openForm.description}</p>
            ) : null}
          </div>

          {openForm.questions.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t.formsNoQuestions}</p>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => { e.preventDefault(); void handleSubmit(openForm); }}
            >
              {openForm.questions.map((question) => (
                <PublicFormQuestionField
                  key={question.id}
                  question={question}
                  value={answers[question.id]}
                  onChange={(v) => setAnswer(question.id, v)}
                  error={fieldError?.questionId === question.id ? fieldError.message : null}
                  disabled={submitting}
                  lang={lang}
                  // Sem short_code a edge de upload não aceita o arquivo: o campo
                  // de foto/assinatura fica desabilitado em vez de falhar no envio.
                  onUploadFile={openForm.shortCode
                    ? (dataUrl) => uploadPublicFormFile(openForm.shortCode as string, dataUrl)
                    : undefined}
                  onBusyChange={(busy) => setUploadBusy(question.id, busy)}
                />
              ))}

              {fieldError && !fieldError.questionId ? (
                <p className="text-sm text-destructive">{fieldError.message}</p>
              ) : null}

              <Button type="submit" className="h-11 w-full gap-2" disabled={submitting || busyUploads.size > 0}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {submitting ? t.formsSubmitting : t.formsSubmit}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    );
  }

  // ── Lista ──
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t.formsIntro}</p>
      {forms.map((form) => (
        <button
          key={form.id}
          type="button"
          onClick={() => { setAnswers({}); setFieldError(null); setOpenFormId(form.id); }}
          className="group w-full rounded-xl border bg-card p-4 text-left transition-colors hover:bg-muted/40 active:bg-muted/60"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <ClipboardList className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="break-words text-sm font-semibold">{form.title}</p>
              {form.description ? (
                <p className="mt-0.5 line-clamp-2 break-words text-xs text-muted-foreground">{form.description}</p>
              ) : null}
            </div>
            <span className="hidden shrink-0 text-xs font-medium text-primary sm:inline">{t.formsFillCta}</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-60 transition-opacity group-hover:opacity-100" />
          </div>
        </button>
      ))}
    </div>
  );
}
