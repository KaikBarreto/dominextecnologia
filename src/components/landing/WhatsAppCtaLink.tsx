import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { buildWhatsAppUrl, getPageContextFragment } from '@/lib/whatsapp';
import { useLocale } from '@/lib/i18n';
import { COMPANY_WHATSAPP_NUMBER } from './whatsappNumbers';
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon';

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
  const { pathname } = useLocation();
  const contextualFragment =
    fragmentOverride ?? getPageContextFragment(pathname, locale);
  const contextualUrl = buildWhatsAppUrl(
    COMPANY_WHATSAPP_NUMBER,
    contextualFragment,
    locale,
  );

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (event.defaultPrevented) return;

    event.preventDefault();
    window.open(
      buildWhatsAppUrl(COMPANY_WHATSAPP_NUMBER, contextualFragment, locale),
      '_blank',
      'noopener,noreferrer',
    );
  }

  return (
    <a
      {...props}
      href={contextualUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
    >
      <WhatsAppIcon className="h-4 w-4 shrink-0" />
      {children}
    </a>
  );
}
