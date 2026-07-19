import { Lock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon';
import { getSegment } from '@/utils/companySegments';
import { getRandomWhatsAppNumber } from '@/components/landing/whatsappNumbers';
import { buildWhatsAppUrl } from '@/lib/whatsapp';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

interface SegmentLockedScreenProps {
  /** Nicho escolhido que a empresa NÃO tem acesso. */
  segment: string;
}

/**
 * Tela de bloqueio (upsell) da Área do Técnico™. Aparece quando o técnico
 * escolhe no seletor um nicho diferente do contratado pela empresa. Centraliza um
 * card mobile-first com a cor do nicho e CTA de WhatsApp pro comercial Dominex.
 */
export function SegmentLockedScreen({ segment }: SegmentLockedScreenProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.technicianTools.segmentLocked;

  const seg = getSegment(segment);
  if (!seg) return null;

  const handleContact = () => {
    // Já é cliente: usa fragmento próprio (a frase vira "Olá! Vim ${fragment}
    // da Dominex...") preservando a intenção de contratar o segmento bloqueado.
    const fragmento = `da Área do Técnico e já uso a Dominex, gostaria de contratar as ferramentas do segmento de *${seg.label}*`;
    const url = buildWhatsAppUrl(getRandomWhatsAppNumber(), fragmento);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="flex w-full justify-center px-4 py-8">
      <div className="flex w-full max-w-md flex-col items-center gap-5 rounded-2xl border border-border bg-card p-6 text-center shadow-sm sm:p-8">
        {/* Ícone do nicho com cadeado, tingido com a cor do catálogo */}
        <div
          className="relative flex h-16 w-16 items-center justify-center rounded-full"
          style={{ backgroundColor: seg.color + '22' }}
        >
          <seg.icon className="h-8 w-8" style={{ color: seg.color }} />
          <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-card bg-muted">
            <Lock className="h-3.5 w-3.5 text-muted-foreground" />
          </span>
        </div>

        <div className="flex flex-col items-center gap-2">
          <Badge
            className="gap-1.5 border-0 text-white"
            style={{ backgroundColor: seg.color }}
          >
            <seg.icon className="h-3 w-3" />
            <span className="truncate">{seg.label}</span>
          </Badge>
          <h2 className="text-lg font-semibold tracking-tight">
            {t.toolsOf} {seg.label}
          </h2>
        </div>

        <p className="text-sm text-muted-foreground">
          {t.noAccess}{' '}
          <span className="font-medium text-foreground">{seg.label}</span>.
          <br />
          {t.contactNote}
        </p>

        <Button onClick={handleContact} className="w-full gap-2 sm:w-auto">
          <WhatsAppIcon className="h-4 w-4" />
          {t.contactButton}
        </Button>
      </div>
    </div>
  );
}
