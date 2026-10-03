import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react';
import { buildWhatsAppUrl } from '@/lib/whatsapp';
import { useLocale } from '@/lib/i18n';
import { COMPANY_WHATSAPP_NUMBER } from './whatsappNumbers';

interface WhatsAppCtaLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  children: ReactNode;
  fragmentOverride?: string;
}

/**
 * Link único das CTAs públicas para o WhatsApp oficial da Dominex.
 *
 * O href direto mantém o destino legível por crawlers e funciona sem JS. No
 * clique, a URL é remontada para incluir a página e a UTM atuais na mensagem.
 */
export default function WhatsAppCtaLink({
  children,
  fragmentOverride,
  onClick,
  ...props
}: WhatsAppCtaLinkProps) {
  const { locale } = useLocale();
  const directUrl = `https://wa.me/${COMPANY_WHATSAPP_NUMBER}`;

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (event.defaultPrevented) return;

    event.preventDefault();
    window.open(
      buildWhatsAppUrl(COMPANY_WHATSAPP_NUMBER, fragmentOverride, locale),
      '_blank',
      'noopener,noreferrer',
    );
  }

  return (
    <a
      {...props}
      href={directUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
    >
      {children}
    </a>
  );
}
