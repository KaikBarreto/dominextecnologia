import { useState } from 'react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

interface LossReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string, details: string) => void;
  leadTitle?: string;
}

export function LossReasonDialog({
  open,
  onOpenChange,
  onConfirm,
  leadTitle,
}: LossReasonDialogProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.crm;

  const LOSS_REASONS = [
    t.loss.reasons.highPrice,
    t.loss.reasons.competitorChosen,
    t.loss.reasons.noBudget,
    t.loss.reasons.noResponse,
    t.loss.reasons.projectCanceled,
    t.loss.reasons.outOfScope,
    t.loss.reasons.other,
  ];

  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');

  const handleConfirm = () => {
    onConfirm(reason, details);
    setReason('');
    setDetails('');
  };

  const handleCancel = () => {
    setReason('');
    setDetails('');
    onOpenChange(false);
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={t.loss.title}
      footer={
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleCancel} className="flex-1">
            {t.loss.cancel}
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!reason}
            className="flex-1 bg-destructive text-white hover:bg-destructive/90"
          >
            {t.loss.confirm}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {leadTitle && (
          <p className="text-sm text-muted-foreground">
            {t.loss.description} <strong>"{leadTitle}"</strong>
          </p>
        )}

        <div className="space-y-2">
          <Label>{t.loss.reasonLabel}</Label>
          <Select value={reason} onValueChange={setReason}>
            <SelectTrigger>
              <SelectValue placeholder={t.loss.reasonPlaceholder} />
            </SelectTrigger>
            <SelectContent>
              {LOSS_REASONS.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>{t.loss.detailsLabel}</Label>
          <Textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder={t.loss.detailsPlaceholder}
            rows={3}
          />
        </div>
      </div>
    </ResponsiveModal>
  );
}
