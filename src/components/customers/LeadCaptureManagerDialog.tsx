import { useState } from 'react';
import { Plus, Pencil, Trash2, Link2, ClipboardList, MessageSquareText, UserPlus } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { RowActionsMenu } from '@/components/ui/RowActionsMenu';
import { EmptyState } from '@/components/mobile/EmptyState';
import { useToast } from '@/hooks/use-toast';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { fillMessage } from '@/lib/leadFormBuilderText';
import { buildSlugSegment } from '@/utils/prettyLinks';
import {
  useLeadCaptureForms,
  type LeadCaptureForm,
  type LeadCaptureFormInput,
} from '@/hooks/useLeadCaptureForms';
import { usePublicFormQuestionCounts } from '@/hooks/usePublicFormQuestions';
import { FormSubmissionsView } from '@/components/forms/FormSubmissionsView';
import { LeadCaptureFormDialog } from './LeadCaptureFormDialog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function isExpired(form: LeadCaptureForm): boolean {
  return !!form.expires_at && new Date(form.expires_at).getTime() < Date.now();
}

export function LeadCaptureManagerDialog({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.customers.leadFormBuilder;
  const { forms, isLoading, createForm, updateForm, toggleActive, deleteForm } = useLeadCaptureForms();
  const { counts: questionCounts } = usePublicFormQuestionCounts();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<LeadCaptureForm | null>(null);
  const [toDelete, setToDelete] = useState<LeadCaptureForm | null>(null);
  const [answersFor, setAnswersFor] = useState<LeadCaptureForm | null>(null);

  // `formId` vem do diálogo: id já gravado (edição, ou criação de uma tentativa
  // anterior que falhou nas perguntas) ou null quando ainda precisa criar.
  const handleSubmit = async (data: LeadCaptureFormInput, formId: string | null): Promise<LeadCaptureForm> => {
    if (formId) {
      return updateForm.mutateAsync({ ...data, id: formId });
    }
    return createForm.mutateAsync(data);
  };

  const copyLink = (form: LeadCaptureForm) => {
    if (!form.short_code) return;
    const segment = buildSlugSegment([form.title], form.short_code, 'cadastro');
    const url = `${window.location.origin}/cadastro/${segment}`;
    navigator.clipboard?.writeText(url).then(
      () => toast({ title: t.linkCopied }),
      () => toast({ title: t.linkGenerated, description: url }),
    );
  };

  const statusBadge = (form: LeadCaptureForm) => {
    if (isExpired(form)) {
      return <Badge className="border-transparent bg-slate-600 text-white hover:bg-slate-600">{t.statusExpired}</Badge>;
    }
    if (!form.is_active) {
      return <Badge className="border-transparent bg-slate-600 text-white hover:bg-slate-600">{t.statusInactive}</Badge>;
    }
    return <Badge className="border-transparent bg-emerald-600 text-white hover:bg-emerald-600">{t.statusActive}</Badge>;
  };

  return (
    <>
      <ResponsiveModal
        open={open}
        onOpenChange={onOpenChange}
        title={t.managerTitle}
        description={t.managerDesc}
        footer={
          <Button
            className="w-full gap-2"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            {t.newForm}
          </Button>
        }
      >
        {isLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : forms.length === 0 ? (
          <EmptyState
            size="compact"
            icon={<ClipboardList className="h-8 w-8" />}
            title={t.emptyTitle}
            description={t.emptyDesc}
          />
        ) : (
          <div className="rounded-xl border bg-card">
            {forms.map((form, idx) => {
              const questionCount = questionCounts[form.id] ?? 0;
              return (
                <div
                  key={form.id}
                  className={`flex items-center gap-3 px-3 py-3 ${idx > 0 ? 'border-t' : ''}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="min-w-0 truncate text-sm font-medium">{form.title}</p>
                      {statusBadge(form)}
                      {form.purpose === 'generic' ? (
                        <Badge variant="info" className="gap-1">
                          <ClipboardList className="h-3 w-3" />
                          {t.purposeGenericTitle}
                        </Badge>
                      ) : (
                        <Badge variant="default" className="gap-1">
                          <UserPlus className="h-3 w-3" />
                          {t.purposeLeadTitle}
                        </Badge>
                      )}
                      {form.show_in_customer_portal && (
                        <Badge className="border-transparent bg-violet-600 text-white hover:bg-violet-600">{t.badgePortal}</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {fillMessage(form.submission_count === 1 ? t.sentOne : t.sentMany, { n: form.submission_count })}
                      {' · '}
                      {fillMessage(questionCount === 1 ? t.questionsOne : t.questionsMany, { n: questionCount })}
                    </p>
                  </div>
                  <Switch
                    checked={form.is_active && !isExpired(form)}
                    disabled={isExpired(form) || toggleActive.isPending}
                    onCheckedChange={(v) => toggleActive.mutate({ id: form.id, is_active: v })}
                    aria-label={t.activateAria}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title={t.actionCopyLink}
                    aria-label={t.actionCopyLink}
                    onClick={() => copyLink(form)}
                  >
                    <Link2 className="h-4 w-4" />
                  </Button>
                  <RowActionsMenu
                    triggerClassName="h-8 w-8"
                    actions={[
                      {
                        label: t.actionAnswers,
                        icon: MessageSquareText,
                        onClick: () => setAnswersFor(form),
                      },
                      {
                        label: t.actionEdit,
                        icon: Pencil,
                        variant: 'edit',
                        onClick: () => {
                          setEditing(form);
                          setFormOpen(true);
                        },
                      },
                      {
                        label: t.actionDelete,
                        icon: Trash2,
                        variant: 'delete',
                        onClick: () => setToDelete(form),
                      },
                    ]}
                  />
                </div>
              );
            })}
          </div>
        )}
      </ResponsiveModal>

      <LeadCaptureFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        form={editing}
        onSubmit={handleSubmit}
        isLoading={createForm.isPending || updateForm.isPending}
      />

      <ResponsiveModal
        open={!!answersFor}
        onOpenChange={(o) => !o && setAnswersFor(null)}
        title={t.subTitle}
        description={answersFor?.title}
      >
        {answersFor && <FormSubmissionsView form={answersFor} />}
      </ResponsiveModal>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {fillMessage(t.deleteDesc, { title: toDelete?.title ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.deleteCancel}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (toDelete) deleteForm.mutate(toDelete.id);
                setToDelete(null);
              }}
            >
              {t.deleteConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
