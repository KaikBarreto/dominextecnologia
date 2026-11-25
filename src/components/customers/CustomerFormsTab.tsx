import { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { ClipboardList, Loader2, MessageSquareText, User } from 'lucide-react';
import { LeadCaptureManagerDialog } from '@/components/customers/LeadCaptureManagerDialog';
import { FormSubmissionDetailView } from '@/components/forms/FormSubmissionsView';
import { EmptyState } from '@/components/mobile/EmptyState';
import { MobilePillTabs } from '@/components/mobile/MobilePillTabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useLeadCaptureForms, type LeadCaptureForm } from '@/hooks/useLeadCaptureForms';
import {
  useAllPublicFormSubmissions,
  usePublicFormSubmission,
  type PublicFormSubmissionFeedItem,
} from '@/hooks/usePublicFormSubmissions';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

type FormsSection = 'manage' | 'answers';

function submittedAtLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : format(date, 'dd/MM/yyyy HH:mm');
}

function responseOwner(submission: PublicFormSubmissionFeedItem): string | null {
  if (submission.customer_name) return submission.customer_name;
  const name = submission.fields.name;
  if (typeof name === 'string' && name.trim()) return name.trim();
  const email = submission.fields.email;
  if (typeof email === 'string' && email.trim()) return email.trim();
  return null;
}

function AllFormSubmissionsView({
  forms,
  formsLoading,
  initialFormId,
  initialSubmissionId,
}: {
  forms: LeadCaptureForm[];
  formsLoading: boolean;
  initialFormId?: string | null;
  initialSubmissionId?: string | null;
}) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.customers.leadFormBuilder;
  const [formFilter, setFormFilter] = useState(initialFormId ?? 'all');
  const [selected, setSelected] = useState<PublicFormSubmissionFeedItem | null>(null);
  const handledInitialSubmission = useRef<string | null>(null);
  const {
    submissions,
    total,
    isLoading,
    isError,
    refetch,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useAllPublicFormSubmissions(formFilter === 'all' ? null : formFilter);
  const initialSubmission = usePublicFormSubmission(initialSubmissionId);

  useEffect(() => {
    if (
      !initialSubmissionId
      || !initialSubmission.data
      || handledInitialSubmission.current === initialSubmissionId
    ) return;
    handledInitialSubmission.current = initialSubmissionId;
    setSelected(initialSubmission.data);
  }, [initialSubmission.data, initialSubmissionId]);

  const selectedForm = selected
    ? forms.find((form) => form.id === selected.form_id)
      ?? ({ id: selected.form_id, title: selected.form_title } as Pick<LeadCaptureForm, 'id' | 'title'>)
    : null;

  if (isLoading || formsLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full sm:w-72" />
        {[...Array(4)].map((_, index) => (
          <Skeleton key={index} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <EmptyState
        size="compact"
        icon={<MessageSquareText className="h-8 w-8" />}
        title={t.feedLoadError}
        description={t.feedLoadErrorDesc}
        action={{ label: t.retry, onClick: () => refetch() }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {total === 1 ? t.feedTotalOne.replace('{n}', String(total)) : t.feedTotalMany.replace('{n}', String(total))}
        </p>
        <Select value={formFilter} onValueChange={setFormFilter}>
          <SelectTrigger className="w-full sm:w-72" aria-label={t.feedFilterLabel}>
            <SelectValue placeholder={t.feedFilterLabel} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t.feedFilterAll}</SelectItem>
            {forms.map((form) => (
              <SelectItem key={form.id} value={form.id}>{form.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {submissions.length === 0 ? (
        <EmptyState
          size="compact"
          icon={<MessageSquareText className="h-8 w-8" />}
          title={t.feedEmptyTitle}
          description={t.feedEmptyDesc}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          {submissions.map((submission, index) => {
            const owner = responseOwner(submission);
            return (
              <button
                key={submission.id}
                type="button"
                onClick={() => setSelected(submission)}
                className={`flex w-full flex-col gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset ${index > 0 ? 'border-t' : ''}`}
              >
                <div className="flex w-full flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{submission.form_title}</span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {submittedAtLabel(submission.submitted_at)}
                  </span>
                </div>
                <div className="flex w-full flex-wrap items-center gap-2">
                  <Badge variant={submission.source === 'customer_portal' ? 'info' : 'muted'}>
                    {submission.source === 'customer_portal' ? t.subSourcePortal : t.subSourcePublic}
                  </Badge>
                  {owner && (
                    <span className="inline-flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                      <User className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{owner}</span>
                    </span>
                  )}
                  <span className="ml-auto text-xs font-medium text-primary">{t.feedOpenAnswer}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

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

      <ResponsiveModal
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
        title={t.feedAnswerTitle}
        description={selected ? `${selected.form_title} · ${submittedAtLabel(selected.submitted_at)}` : undefined}
      >
        {selected && selectedForm && (
          <FormSubmissionDetailView form={selectedForm} submission={selected} />
        )}
      </ResponsiveModal>
    </div>
  );
}

export function CustomerFormsTab() {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.customers.leadFormBuilder;
  const params = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
  const initialFormId = params.get('form');
  const initialSubmissionId = params.get('submission');
  const [section, setSection] = useState<FormsSection>(
    initialFormId || initialSubmissionId ? 'answers' : 'manage',
  );
  const { forms, isLoading: formsLoading } = useLeadCaptureForms();

  return (
    <div className="space-y-5">
      <MobilePillTabs
        variant="underline"
        level="section"
        tabs={[
          { value: 'manage', label: t.manageTab, icon: <ClipboardList className="h-4 w-4" /> },
          { value: 'answers', label: t.allAnswersTab, icon: <MessageSquareText className="h-4 w-4" /> },
        ]}
        activeTab={section}
        onTabChange={(value) => setSection(value as FormsSection)}
      />

      {section === 'manage' ? (
        <LeadCaptureManagerDialog open onOpenChange={() => undefined} embedded />
      ) : (
        <AllFormSubmissionsView
          forms={forms}
          formsLoading={formsLoading}
          initialFormId={initialFormId}
          initialSubmissionId={initialSubmissionId}
        />
      )}
    </div>
  );
}
