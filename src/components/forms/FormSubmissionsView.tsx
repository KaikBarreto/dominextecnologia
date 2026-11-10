import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ClipboardList, Loader2, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ImagePreviewModal } from '@/components/ui/ImagePreviewModal';
import { EmptyState } from '@/components/mobile/EmptyState';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { fillMessage } from '@/lib/leadFormBuilderText';
import { LEAD_CAPTURE_FIELDS, type LeadCaptureForm } from '@/hooks/useLeadCaptureForms';
import { usePublicFormQuestions } from '@/hooks/usePublicFormQuestions';
import { usePublicFormSubmissions, type PublicFormSubmission } from '@/hooks/usePublicFormSubmissions';
import { isAllowedUploadUrl, isAnswerEmpty, type PublicFormAnswerValue, type PublicFormQuestion } from '@/lib/publicFormQuestions';

interface FormSubmissionsViewProps {
  form: Pick<LeadCaptureForm, 'id' | 'title'>;
}

type Messages = ReturnType<typeof useMessages>;
function useMessages() {
  const { locale } = useAppLocaleContext();
  return MESSAGES[locale].app.customers.leadFormBuilder;
}

/** "2026-11-09" ou "2026-11-09T10:00" -> "09/11/2026". Outro formato volta como veio. */
function formatDateAnswer(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

interface AnswerValueProps {
  question: PublicFormQuestion | null;
  value: unknown;
  t: Messages;
  onOpenImage: (url: string, alt: string) => void;
}

function AnswerValue({ question, value, t, onOpenImage }: AnswerValueProps) {
  if (isAnswerEmpty(value as PublicFormAnswerValue)) {
    return <span className="text-muted-foreground">{t.subNoAnswer}</span>;
  }
  const type = question?.question_type;

  if ((type === 'photo' || type === 'signature') && isAllowedUploadUrl(value)) {
    const alt = type === 'signature' ? t.subSignatureAlt : t.subPhotoAlt;
    return (
      <button
        type="button"
        onClick={() => onOpenImage(value, alt)}
        className="block overflow-hidden rounded-lg border bg-white"
        aria-label={alt}
      >
        <img src={value} alt={alt} loading="lazy" className="max-h-40 max-w-full object-contain" />
      </button>
    );
  }
  if (typeof value === 'boolean' || (type === 'boolean' && (value === 'true' || value === 'false'))) {
    return <>{value === true || value === 'true' ? t.subYes : t.subNo}</>;
  }
  if (Array.isArray(value)) return <>{value.map(String).join(', ')}</>;
  if (type === 'date' && typeof value === 'string') return <>{formatDateAnswer(value)}</>;
  if (type === 'rating') return <>{`${String(value)}/10`}</>;
  return <span className="whitespace-pre-wrap break-words">{String(value)}</span>;
}

function SubmissionCard({
  submission,
  questions,
  t,
  onOpenImage,
}: {
  submission: PublicFormSubmission;
  questions: PublicFormQuestion[];
  t: Messages;
  onOpenImage: (url: string, alt: string) => void;
}) {
  const byId = useMemo(() => new Map(questions.map((question) => [question.id, question])), [questions]);

  // Ordem das perguntas do formulário; resposta de pergunta que já foi removida vai no fim.
  const knownRows = questions
    .filter((question) => question.id in submission.answers)
    .map((question) => ({ key: question.id, question, value: submission.answers[question.id] }));
  const orphanRows = Object.entries(submission.answers)
    .filter(([id]) => !byId.has(id))
    .map(([id, value]) => ({ key: id, question: null as PublicFormQuestion | null, value }));
  const answerRows = [...knownRows, ...orphanRows];

  // Dados do cliente enviados nos campos fixos (a foto é um caminho de arquivo, não texto).
  const fieldRows = LEAD_CAPTURE_FIELDS
    .filter((key) => key !== 'photo_url' && !isAnswerEmpty(submission.fields[key] as PublicFormAnswerValue))
    .map((key) => ({ key, label: t.fieldLabels[key], value: String(submission.fields[key]) }));

  const submittedAt = new Date(submission.submitted_at);

  return (
    <article className="rounded-xl border bg-card">
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b px-3 py-2.5">
        <span className="text-sm font-medium tabular-nums">
          {Number.isNaN(submittedAt.getTime()) ? '-' : format(submittedAt, 'dd/MM/yyyy HH:mm')}
        </span>
        <Badge variant={submission.source === 'customer_portal' ? 'info' : 'muted'}>
          {submission.source === 'customer_portal' ? t.subSourcePortal : t.subSourcePublic}
        </Badge>
        {submission.customer_id && (
          <span className="inline-flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
            <User className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{submission.customer_name ?? t.subCustomer}</span>
          </span>
        )}
      </header>

      <div className="space-y-3 px-3 py-3">
        {fieldRows.length > 0 && (
          <section>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t.subCustomerData}
            </p>
            <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
              {fieldRows.map((row) => (
                <div key={row.key} className="min-w-0">
                  <dt className="text-xs text-muted-foreground">{row.label}</dt>
                  <dd className="break-words text-sm">{row.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {answerRows.length > 0 && (
          <dl className="space-y-2.5">
            {answerRows.map((row) => (
              <div key={row.key} className="min-w-0">
                <dt className="text-xs font-medium text-muted-foreground">
                  {row.question ? row.question.question : t.subRemovedQuestion}
                </dt>
                <dd className="mt-0.5 text-sm">
                  <AnswerValue question={row.question} value={row.value} t={t} onOpenImage={onOpenImage} />
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </article>
  );
}

/**
 * Respostas de um formulário, pergunta a pergunta (rótulo da pergunta, nunca o
 * id). Só leitura. Foto e assinatura abrem no viewer dedicado.
 */
export function FormSubmissionsView({ form }: FormSubmissionsViewProps) {
  const t = useMessages();
  const { questions, isLoading: questionsLoading } = usePublicFormQuestions(form.id);
  const {
    submissions, total, isLoading, isError, refetch, hasNextPage, fetchNextPage, isFetchingNextPage,
  } = usePublicFormSubmissions(form.id);
  const [image, setImage] = useState<{ url: string; alt: string } | null>(null);

  if (isLoading || questionsLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-3 py-6 text-center">
        <p className="text-sm text-muted-foreground">{t.subLoadError}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
          {t.retry}
        </Button>
      </div>
    );
  }

  if (submissions.length === 0) {
    return (
      <EmptyState
        size="compact"
        icon={<ClipboardList className="h-8 w-8" />}
        title={t.subEmptyTitle}
        description={t.subEmptyDesc}
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {fillMessage(total === 1 ? t.subTotalOne : t.subTotalMany, { n: total })}
      </p>
      {submissions.map((submission) => (
        <SubmissionCard
          key={submission.id}
          submission={submission}
          questions={questions}
          t={t}
          onOpenImage={(url, alt) => setImage({ url, alt })}
        />
      ))}
      {hasNextPage && (
        <Button
          type="button"
          variant="outline"
          className="w-full gap-2"
          disabled={isFetchingNextPage}
          onClick={() => fetchNextPage()}
        >
          {isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin" />}
          {t.subLoadMore}
        </Button>
      )}
      {image && (
        <ImagePreviewModal src={image.url} alt={image.alt} open onClose={() => setImage(null)} />
      )}
    </div>
  );
}
