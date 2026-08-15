import { Star } from 'lucide-react';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { Button } from '@/components/ui/button';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { GoogleGIcon } from '@/components/icons/GoogleGIcon';

interface GoogleReviewInviteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Link público de avaliação do Google da empresa. */
  googleUrl: string;
}

/**
 * Convite dedicado pra avaliar a empresa no Google. Aparece num dialog (desktop)
 * ou drawer (mobile) focado só no CTA: logo do Google, 5 estrelas douradas e uma
 * copy indutiva pedindo 5 estrelas.
 *
 * Documento público = tema CLARO forçado: card branco, texto escuro, sem borda
 * aninhada. As cores do Google e das estrelas são fixas (não seguem o tema).
 */
export function GoogleReviewInviteModal({
  open,
  onOpenChange,
  googleUrl,
}: GoogleReviewInviteModalProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.os.nps;

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title=""
      footer={
        <div className="flex w-full flex-col gap-2">
          <Button asChild size="lg" className="h-12 w-full text-base">
            <a href={googleUrl} target="_blank" rel="noopener noreferrer">
              <GoogleGIcon size={20} className="shrink-0" />
              {t.googleModalCta}
            </a>
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="h-10 w-full text-sm text-muted-foreground"
          >
            {t.googleModalDismiss}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col items-center gap-4 py-2 text-center">
        <GoogleGIcon size={44} className="shrink-0" />

        {/* 5 estrelas douradas decorativas (não clicáveis) */}
        <div className="flex items-center gap-1" aria-hidden>
          {[1, 2, 3, 4, 5].map((i) => (
            <Star key={i} className="h-7 w-7 fill-warning text-warning" />
          ))}
        </div>

        <div className="space-y-1.5">
          <h3 className="text-lg font-bold text-foreground">{t.googleModalTitle}</h3>
          <p className="text-sm text-muted-foreground">{t.googleModalBody}</p>
        </div>
      </div>
    </ResponsiveModal>
  );
}
