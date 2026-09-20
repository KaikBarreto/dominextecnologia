import { useEffect, useState } from 'react';
import { Copy, Fingerprint, Loader2, ShieldCheck, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  useCreateFaceEnrollmentLink,
  useDeleteFaceBiometrics,
  useFaceTemplateStatus,
} from '@/hooks/useFaceBiometrics';
import { useToast } from '@/hooks/use-toast';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { getErrorMessage } from '@/utils/errorMessages';

interface FaceBiometricsFieldProps {
  employeeId: string | null;
}

export function FaceBiometricsField({ employeeId }: FaceBiometricsFieldProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.employees.form.timeclock.face;
  const { toast } = useToast();
  const status = useFaceTemplateStatus(employeeId);
  const createLink = useCreateFaceEnrollmentLink();
  const deleteBiometrics = useDeleteFaceBiometrics();
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => setGeneratedLink(null), [employeeId]);

  const copyLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      toast({ title: t.copied });
    } catch {
      toast({ variant: 'destructive', title: t.error });
    }
  };

  const handleGenerate = async () => {
    if (!employeeId) return;
    try {
      const result = await createLink.mutateAsync(employeeId);
      if (!result?.token || !/^[0-9a-f]{64}$/.test(result.token)) throw new Error('invalid_token');
      const link = `${window.location.origin}/cadastro-facial/${result.token}`;
      setGeneratedLink(link);
      await copyLink(link);
    } catch (error) {
      toast({ variant: 'destructive', title: t.error, description: getErrorMessage(error) });
    }
  };

  const handleDelete = async () => {
    if (!employeeId) return;
    try {
      await deleteBiometrics.mutateAsync(employeeId);
      setGeneratedLink(null);
      toast({ title: t.deleted });
    } catch (error) {
      toast({ variant: 'destructive', title: t.error, description: getErrorMessage(error) });
    } finally {
      setConfirmDelete(false);
    }
  };

  if (!employeeId) {
    return (
      <div className="space-y-1 rounded-lg border p-3">
        <div className="flex items-center gap-2">
          <Fingerprint className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Label className="text-sm font-medium">{t.label}</Label>
        </div>
        <p className="text-xs text-muted-foreground">{t.pendingHint}</p>
      </div>
    );
  }

  const enrolled = status.data?.enrolled === true;

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-2">
          <Fingerprint className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div>
            <Label className="text-sm font-medium">{t.label}</Label>
            <p className="text-xs text-muted-foreground">{t.description}</p>
          </div>
        </div>
        {status.isLoading ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <Badge variant={enrolled ? 'success' : 'muted'} className="w-fit shrink-0">
            {enrolled ? t.statusEnrolled : t.statusNotEnrolled}
          </Badge>
        )}
      </div>

      <div className="flex items-start gap-2 rounded-md bg-muted/45 px-3 py-2">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
        <p className="text-xs leading-relaxed text-muted-foreground">{t.privacy}</p>
      </div>

      {generatedLink && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input readOnly value={generatedLink} className="min-w-0 text-xs" onFocus={(event) => event.currentTarget.select()} />
            <Button type="button" variant="outline" size="sm" className="h-10 shrink-0" onClick={() => void copyLink(generatedLink)}>
              <Copy className="h-3.5 w-3.5" /> {t.copyButton}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t.linkHint}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="edit-ghost" disabled={createLink.isPending} onClick={() => void handleGenerate()}>
          {createLink.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Fingerprint className="h-3.5 w-3.5" />}
          {enrolled || generatedLink ? t.regenerateButton : t.generateButton}
        </Button>
        {enrolled && (
          <Button type="button" size="sm" variant="destructive-ghost" disabled={deleteBiometrics.isPending} onClick={() => setConfirmDelete(true)}>
            <Trash2 className="h-3.5 w-3.5" /> {t.deleteButton}
          </Button>
        )}
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>{t.deleteDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => void handleDelete()}>
              {deleteBiometrics.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t.deleteConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default FaceBiometricsField;
