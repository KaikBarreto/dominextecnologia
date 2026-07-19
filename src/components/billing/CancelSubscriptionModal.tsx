import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Gift, Heart, MessageCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { StepTransition } from '@/components/ui/step-transition';
import { useCancelSubscription } from '@/hooks/useCancelSubscription';
import { getRandomWhatsAppNumber } from '@/components/landing/whatsappNumbers';
import { format } from 'date-fns';
import { type Locale, ptBR, enUS, es, fr } from 'date-fns/locale';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

const DATE_LOCALES: Record<string, Locale> = { 'pt-br': ptBR, en: enUS, es, fr };

const REASON_VALUES = [
  'preco_alto',
  'nao_uso',
  'funcionalidades',
  'dificuldade_uso',
  'concorrente',
  'fechando_empresa',
  'temporario',
  'outro',
] as const;

type ReasonValue = (typeof REASON_VALUES)[number];

interface CancelSubscriptionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  subscriptionExpiresAt?: string | null;
}

const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

export function CancelSubscriptionModal({
  open,
  onOpenChange,
  companyId,
  subscriptionExpiresAt,
}: CancelSubscriptionModalProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.settings.billing.cancelSubscription;
  const dateLocale = DATE_LOCALES[locale] ?? ptBR;

  const CANCELLATION_REASONS = REASON_VALUES.map((value) => ({
    value,
    label: t.reasons[value as ReasonValue],
  }));

  const [step, setStep] = useState<'reason' | 'confirm' | 'done'>('reason');
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const cancelMutation = useCancelSubscription();

  const handleClose = () => {
    // Não reseta no meio de um envio em andamento.
    if (cancelMutation.isPending) return;
    setStep('reason');
    setReason('');
    setDetails('');
    onOpenChange(false);
  };

  const handleSubmit = () => {
    if (!reason) {
      toast.error(t.toastSelectReason);
      return;
    }
    const reasonLabel = CANCELLATION_REASONS.find((r) => r.value === reason)?.label || reason;
    cancelMutation.mutate(
      {
        companyId,
        reason: reasonLabel,
        reasonDetails: details.trim() || null,
      },
      {
        onSuccess: () => setStep('done'),
        onError: (error: unknown) => {
          console.error('Erro ao cancelar assinatura:', error);
          toast.error(t.toastError);
        },
      },
    );
  };

  const selectedReasonData = CANCELLATION_REASONS.find((r) => r.value === reason);

  type RetentionKey = keyof typeof t.retention;
  const RETENTION_ICONS: Record<string, typeof Gift> = {
    preco_alto: Gift,
    nao_uso: Heart,
    funcionalidades: MessageCircle,
    dificuldade_uso: Heart,
  };
  const RETENTION_BG: Record<string, string> = {
    preco_alto: 'bg-emerald-600',
    nao_uso: 'bg-blue-600',
    funcionalidades: 'bg-purple-600',
    dificuldade_uso: 'bg-blue-600',
  };

  const getRetentionMessage = () => {
    if (!(reason in RETENTION_ICONS)) return null;
    const retData = t.retention[reason as RetentionKey];
    return {
      icon: RETENTION_ICONS[reason],
      title: retData.title,
      message: retData.message,
      bg: RETENTION_BG[reason],
      waText: retData.waText,
    };
  };

  const retention = getRetentionMessage();

  const getTitle = () => {
    if (step === 'confirm') return t.titleConfirm;
    if (step === 'done') return t.titleDone;
    return t.titleReason;
  };

  const footerContent =
    step === 'reason' ? (
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={handleClose}>
          {t.btnBack}
        </Button>
        <Button
          variant="destructive"
          className="flex-1"
          onClick={() => setStep('confirm')}
          disabled={!reason || (reason === 'outro' && !details.trim())}
        >
          {t.btnContinue}
        </Button>
      </div>
    ) : step === 'confirm' ? (
      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => setStep('reason')}
          disabled={cancelMutation.isPending}
        >
          {t.btnBack}
        </Button>
        <Button
          variant="destructive"
          className="flex-1"
          onClick={handleSubmit}
          disabled={cancelMutation.isPending}
        >
          {cancelMutation.isPending ? t.btnCanceling : t.btnConfirm}
        </Button>
      </div>
    ) : (
      <Button className="w-full" onClick={handleClose}>
        {t.btnUnderstood}
      </Button>
    );

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={handleClose}
      title={getTitle()}
      className="max-w-md"
      footer={footerContent}
    >
      <StepTransition stepKey={step} index={['reason', 'confirm', 'done'].indexOf(step)} className="space-y-4">
        {step === 'reason' && (
          <div className="space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-xl bg-destructive shrink-0">
              <AlertTriangle className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="font-semibold">{t.titleReason}</p>
              <p className="text-sm text-muted-foreground">{t.headerSubtitle}</p>
            </div>
          </div>

          <div>
            <Label>{t.labelReason}</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="mt-1.5">
                <SelectValue placeholder={t.placeholderReason} />
              </SelectTrigger>
              <SelectContent>
                {CANCELLATION_REASONS.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {reason && (
            <div>
              <Label>
                {reason === 'outro' ? t.labelDetailsRequired : t.labelDetailsOptional}
              </Label>
              <Textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder={
                  reason === 'outro'
                    ? t.placeholderDetailsRequired
                    : t.placeholderDetailsOther
                }
                className="mt-1.5 min-h-[80px]"
                required={reason === 'outro'}
              />
            </div>
          )}

          {retention && (
            <div className={`${retention.bg} rounded-xl p-4`}>
              <div className="flex items-start gap-3">
                <div className="p-1.5 rounded-lg bg-white/20 shrink-0 mt-0.5">
                  <retention.icon className="h-4 w-4 text-white" />
                </div>
                <div>
                  <p className="font-medium text-sm text-white">{retention.title}</p>
                  <p className="text-xs text-white/80 mt-1">{retention.message}</p>
                </div>
              </div>
              {/* Número sorteado no CLIQUE (rodízio de números do suporte). */}
              <button
                type="button"
                onClick={() =>
                  window.open(
                    `https://wa.me/${getRandomWhatsAppNumber()}?text=${encodeURIComponent(retention.waText)}`,
                    '_blank',
                    'noopener,noreferrer',
                  )
                }
                className="mt-3 flex items-center justify-center gap-2 w-full py-2 rounded-lg bg-[#25D366] hover:bg-[#20BD5A] transition-colors text-white text-sm font-medium"
              >
                <WhatsAppIcon className="h-4 w-4" />
                {t.retentionTalkSupport}
              </button>
            </div>
          )}
        </div>
      )}

        {step === 'confirm' && (
          <div className="space-y-4">
          <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-4 space-y-2">
            <p className="text-sm font-medium">{t.confirmOnConfirm}</p>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
              <li>{t.confirmBullet1}</li>
              <li>
                {t.confirmBullet2Until}{' '}
                {subscriptionExpiresAt
                  ? format(new Date(subscriptionExpiresAt), "dd 'de' MMMM 'de' yyyy", { locale: dateLocale })
                  : t.confirmBullet2NoDate}
              </li>
              <li>{t.confirmBullet3}</li>
              <li>{t.confirmBullet4}</li>
            </ul>
          </div>

          <div className="bg-muted/50 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">
              {t.confirmReasonPrefix} <span className="font-medium text-foreground">{selectedReasonData?.label}</span>
            </p>
            {details.trim() && (
              <p className="text-xs text-muted-foreground mt-1">{t.confirmDetailsPrefix} {details}</p>
            )}
          </div>
        </div>
      )}

        {step === 'done' && (
          <div className="space-y-4 text-center">
          <div className="p-3 bg-emerald-500/10 rounded-full w-fit mx-auto">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
          </div>
          <div>
            <p className="font-medium">{t.doneTitle}</p>
            <p className="text-sm text-muted-foreground mt-1">
              {t.doneDesc}
              {subscriptionExpiresAt
                ? ` ${t.doneDescUntil.replace('{date}', format(new Date(subscriptionExpiresAt), 'dd/MM/yyyy', { locale: dateLocale }))}`
                : ` ${t.doneDescNoDate}`}
              {t.doneDescSuffix}
            </p>
          </div>
        </div>
        )}
      </StepTransition>
    </ResponsiveModal>
  );
}
