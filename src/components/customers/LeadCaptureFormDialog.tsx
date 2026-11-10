import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Check, ChevronLeft, ChevronRight, ClipboardList, Link2, Loader2, UserPlus } from 'lucide-react';
import { FullscreenWizard, FullscreenWizardAction } from '@/components/ui/FullscreenWizard';
import { FormWizardStepper } from '@/components/ui/FormWizardStepper';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumericInput } from '@/components/ui/numeric-input';
import { DateTimePicker } from '@/components/ui/DateTimePicker';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { buildSlugSegment } from '@/utils/prettyLinks';
import {
  LEAD_CAPTURE_FIELDS,
  type LeadCaptureFieldConfig,
  type LeadCaptureFieldKey,
  type LeadCaptureForm,
  type LeadCaptureFormInput,
} from '@/hooks/useLeadCaptureForms';
import {
  toQuestionDraft,
  usePublicFormQuestions,
  type PublicFormQuestionDraft,
} from '@/hooks/usePublicFormQuestions';
import { PublicFormQuestionsEditor } from '@/components/forms/PublicFormQuestionsEditor';

const STEP_KEYS = ['form', 'customer', 'questions', 'publish'] as const;
const LAST_STEP = STEP_KEYS.length - 1;
type FormPurpose = 'lead' | 'generic';

interface LeadCaptureFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: LeadCaptureForm | null;
  /**
   * Grava o formulário e devolve o registro salvo. `formId` é o id já gravado
   * (edição, ou criação que o próprio diálogo já concluiu numa tentativa
   * anterior), `null` quando ainda precisa criar. Assim um "Salvar" que falha
   * nas perguntas e é repetido não cria o formulário em duplicata.
   */
  onSubmit: (data: LeadCaptureFormInput, formId: string | null) => Promise<LeadCaptureForm>;
  isLoading?: boolean;
}

function buildInitialConfig(form: LeadCaptureForm | null): LeadCaptureFieldConfig {
  const cfg = (form?.field_config as LeadCaptureFieldConfig | null) ?? null;
  const result: LeadCaptureFieldConfig = {};
  for (const key of LEAD_CAPTURE_FIELDS) {
    const existing = cfg?.[key];
    if (existing) {
      result[key] = { enabled: !!existing.enabled, required: !!existing.required };
    } else if (!form) {
      // Novo formulário: só "Nome" já vem habilitado e obrigatório.
      result[key] = { enabled: key === 'name', required: key === 'name' };
    } else {
      result[key] = { enabled: false, required: false };
    }
  }
  return result;
}

/** Converte ISO (com timezone) para o valor de <input type="datetime-local">. */
function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function LeadCaptureFormDialog({
  open,
  onOpenChange,
  form,
  onSubmit,
  isLoading,
}: LeadCaptureFormDialogProps) {
  const { toast } = useToast();
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.customers.leadFormBuilder;

  const [step, setStep] = useState(0);
  const [maxStepReached, setMaxStepReached] = useState(0);
  // A mensagem de validação só aparece depois de uma tentativa de avançar.
  const [showStepError, setShowStepError] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [purpose, setPurpose] = useState<FormPurpose>('lead');
  const [showInPortal, setShowInPortal] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [expiresAt, setExpiresAt] = useState('');
  const [maxSubmissions, setMaxSubmissions] = useState('');
  const [requireConsent, setRequireConsent] = useState(true);
  const [consentText, setConsentText] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [fieldConfig, setFieldConfig] = useState<LeadCaptureFieldConfig>(buildInitialConfig(null));
  const [drafts, setDrafts] = useState<PublicFormQuestionDraft[]>([]);
  // Só vira true depois que as perguntas gravadas foram carregadas pro editor.
  // Sem isso, salvar um formulário cujas perguntas ainda não chegaram apagaria todas.
  const [draftsReady, setDraftsReady] = useState(false);
  const [saving, setSaving] = useState(false);
  // Id gravado por uma tentativa de "Salvar" que criou o formulário mas falhou depois.
  const createdFormIdRef = useRef<string | null>(null);

  const savedFormId = form?.id ?? null;
  const {
    questions: savedQuestions,
    isSuccess: questionsLoaded,
    isFetching: questionsFetching,
    isError: questionsError,
    refetch: refetchQuestions,
    saveQuestions,
  } = usePublicFormQuestions(open ? savedFormId : null);

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setMaxStepReached(form ? LAST_STEP : 0);
    setShowStepError(false);
    setTitle(form?.title ?? '');
    setDescription(form?.description ?? '');
    setPurpose(form?.purpose === 'generic' ? 'generic' : 'lead');
    setShowInPortal(form?.show_in_customer_portal ?? false);
    setIsActive(form?.is_active ?? true);
    setExpiresAt(isoToLocalInput(form?.expires_at));
    setMaxSubmissions(form?.max_submissions ? String(form.max_submissions) : '');
    setRequireConsent(form?.require_consent ?? true);
    setConsentText(form?.consent_text ?? '');
    setSuccessMessage(form?.success_message ?? '');
    setFieldConfig(buildInitialConfig(form));
    setDrafts([]);
    setDraftsReady(!form);
    createdFormIdRef.current = null;
  }, [open, form]);

  // Edição: carrega as perguntas gravadas UMA vez por abertura (esperando o
  // refetch terminar pra não partir de cache velho).
  useEffect(() => {
    if (!open || !form || draftsReady) return;
    if (questionsLoaded && !questionsFetching) {
      setDrafts(savedQuestions.map(toQuestionDraft));
      setDraftsReady(true);
    }
  }, [open, form, draftsReady, questionsLoaded, questionsFetching, savedQuestions]);

  const setField = (key: LeadCaptureFieldKey, patch: Partial<{ enabled: boolean; required: boolean }>) => {
    setFieldConfig((prev) => {
      const current = prev[key] ?? { enabled: false, required: false };
      const next = { ...current, ...patch };
      // required só faz sentido quando o campo está habilitado.
      if (!next.enabled) next.required = false;
      return { ...prev, [key]: next };
    });
  };

  const handleCopyLink = () => {
    if (!form?.short_code) {
      toast({
        variant: 'destructive',
        title: t.saveFirstTitle,
        description: t.saveFirstDesc,
      });
      return;
    }
    const segment = buildSlugSegment([form.title], form.short_code, 'cadastro');
    const url = `${window.location.origin}/cadastro/${segment}`;
    navigator.clipboard?.writeText(url).then(
      () => toast({ title: t.linkCopied }),
      () => toast({ title: t.linkGenerated, description: url }),
    );
  };

  const anyFieldEnabled = Object.values(fieldConfig).some((f) => f?.enabled);

  /** Mensagem de bloqueio da etapa (ou null quando pode seguir). */
  const stepError = (index: number): string | null => {
    if (index === 0 && !title.trim()) return t.errTitleRequired;
    if (index === 1 && purpose === 'lead' && !anyFieldEnabled) return t.errNoField;
    if (index === 2) {
      if (!draftsReady) return t.errQuestionsNotLoaded;
      if (purpose === 'generic' && !anyFieldEnabled && drafts.length === 0) return t.errNothingToAsk;
    }
    return null;
  };

  const currentError = stepError(step);
  const canNext = currentError === null;

  /** Tenta ir até `target`; para na primeira etapa com problema e mostra a mensagem dela. */
  const goToStep = (target: number) => {
    if (target <= step) {
      setStep(target);
      setShowStepError(false);
      return;
    }
    for (let i = step; i < target; i += 1) {
      if (stepError(i) !== null) {
        setStep(i);
        setShowStepError(true);
        return;
      }
    }
    setStep(target);
    setMaxStepReached((prev) => Math.max(prev, target));
    setShowStepError(false);
  };

  const handleSave = async () => {
    for (let i = 0; i <= LAST_STEP; i += 1) {
      if (stepError(i) !== null) {
        setStep(i);
        setShowStepError(true);
        return;
      }
    }

    const cleanConfig: LeadCaptureFieldConfig = {};
    for (const key of LEAD_CAPTURE_FIELDS) {
      const f = fieldConfig[key];
      if (f?.enabled) cleanConfig[key] = { enabled: true, required: !!f.required };
    }

    const parsedMax = Number.parseInt(maxSubmissions, 10);

    setSaving(true);
    try {
      const saved = await onSubmit(
        {
          title: title.trim(),
          description: description.trim() || null,
          field_config: cleanConfig,
          is_active: isActive,
          expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
          require_consent: requireConsent,
          consent_text: requireConsent ? consentText.trim() || null : null,
          max_submissions: Number.isFinite(parsedMax) && parsedMax > 0 ? parsedMax : null,
          purpose,
          show_in_customer_portal: showInPortal,
          success_message: successMessage.trim() || null,
        },
        savedFormId ?? createdFormIdRef.current,
      );
      if (!savedFormId) createdFormIdRef.current = saved.id;

      await saveQuestions.mutateAsync({ formId: saved.id, questions: drafts });
      onOpenChange(false);
    } catch {
      // Os toasts de erro já saem nos hooks; o diálogo fica aberto pra tentar de novo.
    } finally {
      setSaving(false);
    }
  };

  const busy = saving || !!isLoading || saveQuestions.isPending;

  const steps = [
    { key: 'form', label: t.stepForm },
    { key: 'customer', label: t.tabCustomer },
    { key: 'questions', label: t.tabQuestions },
    { key: 'publish', label: t.tabPublish },
  ];

  const purposeOptions: { value: FormPurpose; icon: ReactNode; title: string; description: string }[] = [
    { value: 'lead', icon: <UserPlus className="h-5 w-5" />, title: t.purposeLeadTitle, description: t.purposeLeadCard },
    { value: 'generic', icon: <ClipboardList className="h-5 w-5" />, title: t.purposeGenericTitle, description: t.purposeGenericCard },
  ];

  const wizardFooter = (
    <div className="flex flex-col gap-2">
      {showStepError && currentError && (
        <p className="text-right text-xs text-destructive" role="alert">
          {currentError}
        </p>
      )}
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 sm:flex sm:flex-wrap sm:justify-end sm:gap-3">
        <FullscreenWizardAction
          variant="cancel"
          className="h-[3.25rem] px-3 text-base font-bold sm:h-14 sm:min-w-36 sm:px-7"
          onClick={() => (step === 0 ? onOpenChange(false) : goToStep(step - 1))}
          disabled={busy}
        >
          {step === 0 ? t.wizardCancel : <><ChevronLeft className="mr-1 h-4 w-4" /> {t.wizardBack}</>}
        </FullscreenWizardAction>

        {step < LAST_STEP ? (
          <FullscreenWizardAction
            onClick={() => goToStep(step + 1)}
            aria-disabled={!canNext}
            className="h-[3.25rem] bg-primary px-3 text-base font-bold text-primary-foreground hover:bg-primary/90 aria-disabled:opacity-50 sm:h-14 sm:min-w-48 sm:px-8"
            disabled={busy}
          >
            {t.wizardNext} <ChevronRight className="ml-1 h-4 w-4" />
          </FullscreenWizardAction>
        ) : (
          <FullscreenWizardAction
            onClick={handleSave}
            disabled={busy}
            className="h-[3.25rem] bg-primary px-3 text-base font-bold text-primary-foreground hover:bg-primary/90 sm:h-14 sm:min-w-56 sm:px-8"
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
            {t.saveBtn}
          </FullscreenWizardAction>
        )}
      </div>
    </div>
  );

  const stepHeading = (label: string, intro?: string) => (
    <div className="space-y-1">
      <h2 className="text-xl font-semibold tracking-tight">{label}</h2>
      {intro && <p className="text-sm text-muted-foreground">{intro}</p>}
    </div>
  );

  return (
    <FullscreenWizard
      open={open}
      onOpenChange={onOpenChange}
      title={form ? t.dialogTitleEdit : t.dialogTitleNew}
      description={t.dialogDesc}
      exitLabel={t.exitLabel}
      footer={wizardFooter}
      lockBackdrop
      overlayId="lead-capture-form-modal"
    >
      <div className="flex min-h-full flex-col">
        <FormWizardStepper
          steps={steps}
          currentIndex={step}
          maxReachedIndex={Math.min(LAST_STEP, Math.max(maxStepReached, canNext ? step + 1 : step))}
          onStepChange={goToStep}
          ariaLabel={t.stepperAria}
          tone="contrast"
          className="sticky top-0 z-20 -mx-4 border-b bg-background px-4 pb-4 pt-4 sm:-mx-10 sm:px-10 sm:pt-6"
        />

        <div className="mx-auto mt-8 w-full max-w-3xl flex-1 space-y-7 text-[15px] [&_input]:min-h-11 [&_input]:text-base [&_textarea]:text-base [&_[role=combobox]]:min-h-11">
          {step === 0 && (
            <section className="space-y-6">
              {stepHeading(t.stepForm)}
              <div className="space-y-2">
                <Label htmlFor="lcf-title" className="text-base font-semibold">{t.pubTitleLabel}</Label>
                <Input
                  id="lcf-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t.pubTitlePlaceholder}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lcf-desc" className="text-base font-semibold">{t.pubDescLabel}</Label>
                <Textarea
                  id="lcf-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t.pubDescPlaceholder}
                  rows={3}
                />
              </div>

              <div className="space-y-3">
                <p id="lcf-purpose-label" className="text-base font-semibold">{t.purposeLabel}</p>
                <div
                  role="radiogroup"
                  aria-labelledby="lcf-purpose-label"
                  className="grid gap-3 sm:grid-cols-2"
                >
                  {purposeOptions.map((option) => {
                    const selected = purpose === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setPurpose(option.value)}
                        className={cn(
                          'flex min-w-0 items-start gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                          selected && 'bg-primary/5 ring-1 ring-inset ring-primary',
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                            selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                          )}
                        >
                          {option.icon}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-base font-semibold leading-snug">{option.title}</span>
                          <span className="mt-1 block text-sm leading-snug text-muted-foreground">{option.description}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>
          )}

          {step === 1 && (
            <section className="space-y-4">
              {stepHeading(t.tabCustomer, purpose === 'lead' ? t.customerIntro : t.customerIntroGeneric)}
              <div className="rounded-xl border bg-card">
                {LEAD_CAPTURE_FIELDS.map((key, idx) => {
                  const f = fieldConfig[key] ?? { enabled: false, required: false };
                  const label = t.fieldLabels[key];
                  return (
                    <div
                      key={key}
                      className={`flex items-center justify-between gap-3 px-3 py-3 ${idx > 0 ? 'border-t' : ''}`}
                    >
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span>{t.fieldShow}</span>
                          <Switch
                            checked={f.enabled}
                            onCheckedChange={(v) => setField(key, { enabled: v })}
                            aria-label={`${t.fieldShow} ${label}`}
                          />
                        </label>
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span>{t.fieldRequired}</span>
                          <Switch
                            checked={f.required}
                            disabled={!f.enabled}
                            onCheckedChange={(v) => setField(key, { required: v })}
                            aria-label={`${label}: ${t.fieldRequired}`}
                          />
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {step === 2 && (
            <section className="space-y-4">
              {stepHeading(t.tabQuestions)}
              {!draftsReady && questionsError ? (
                <div className="space-y-3 py-6 text-center">
                  <p className="text-sm text-muted-foreground">{t.questionsLoadError}</p>
                  <Button type="button" variant="outline" size="sm" onClick={() => refetchQuestions()}>
                    {t.retry}
                  </Button>
                </div>
              ) : !draftsReady ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <PublicFormQuestionsEditor questions={drafts} onChange={setDrafts} />
              )}
            </section>
          )}

          {step === 3 && (
            <section className="space-y-5">
              {stepHeading(t.tabPublish)}

              <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{t.activeTitle}</p>
                  <p className="text-xs text-muted-foreground">{t.activeDesc}</p>
                </div>
                <Switch checked={isActive} onCheckedChange={setIsActive} aria-label={t.activeTitle} />
              </div>

              <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{t.portalTitle}</p>
                  <p className="text-xs text-muted-foreground">{t.portalDesc}</p>
                </div>
                <Switch checked={showInPortal} onCheckedChange={setShowInPortal} aria-label={t.portalTitle} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="lcf-expires">{t.expiresLabel}</Label>
                {/* Opcional (expires_at vira null se vazio), por isso clearable */}
                <DateTimePicker
                  id="lcf-expires"
                  value={expiresAt}
                  onValueChange={setExpiresAt}
                  placeholder="dd/mm/aaaa --:--"
                  clearable
                />
                <p className="text-xs text-muted-foreground">{t.expiresHint}</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="lcf-max">{t.maxLabel}</Label>
                <NumericInput
                  id="lcf-max"
                  value={maxSubmissions}
                  onValueChange={setMaxSubmissions}
                  placeholder={t.maxPlaceholder}
                />
                <p className="text-xs text-muted-foreground">{t.maxHint}</p>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{t.consentTitle}</p>
                  <p className="text-xs text-muted-foreground">{t.consentDesc}</p>
                </div>
                <Switch checked={requireConsent} onCheckedChange={setRequireConsent} aria-label={t.consentTitle} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lcf-consent">{t.consentTextLabel}</Label>
                <Textarea
                  id="lcf-consent"
                  value={consentText}
                  onChange={(e) => setConsentText(e.target.value)}
                  placeholder={t.consentDefault}
                  rows={3}
                  disabled={!requireConsent}
                />
                <p className="text-xs text-muted-foreground">{t.consentHint}</p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="lcf-success">{t.successLabel}</Label>
                <Textarea
                  id="lcf-success"
                  value={successMessage}
                  onChange={(e) => setSuccessMessage(e.target.value)}
                  placeholder={t.successPlaceholder}
                  maxLength={2000}
                  rows={2}
                />
                <p className="text-xs text-muted-foreground">{t.successHint}</p>
              </div>

              {form?.short_code && (
                <Button type="button" variant="outline" onClick={handleCopyLink} className="gap-2">
                  <Link2 className="h-4 w-4" />
                  {t.copyLinkBtn}
                </Button>
              )}
            </section>
          )}
        </div>
      </div>
    </FullscreenWizard>
  );
}
