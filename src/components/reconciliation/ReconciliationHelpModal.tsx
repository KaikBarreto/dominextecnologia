import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { FileUp, Link2, FileDown, CheckCircle2 } from 'lucide-react';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

const ICONS = [FileUp, Link2, FileDown, CheckCircle2];

interface ReconciliationHelpModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Modal didático "Como funciona?" da conciliação bancária. */
export function ReconciliationHelpModal({ open, onOpenChange }: ReconciliationHelpModalProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.finance.reconciliation.help;
  const steps = [t.steps.import, t.steps.match, t.steps.destination, t.steps.finalize];

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={t.title}
      description={t.intro}
      footer={
        <Button className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>
          {t.closeButton}
        </Button>
      }
    >
      <div className="space-y-4">
        {steps.map((step, i) => {
          const Icon = ICONS[i] ?? FileUp;
          return (
            <div key={step.title} className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{step.title}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{step.description}</p>
              </div>
            </div>
          );
        })}
      </div>
    </ResponsiveModal>
  );
}
