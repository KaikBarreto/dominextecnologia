import { buildWhatsAppLink } from '@/utils/shareLinks';
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon';
import { cn } from '@/lib/utils';

/**
 * Atalho de WhatsApp ao lado do telefone do cliente: um toque abre a conversa,
 * sem copiar o número. Usado no Resumo da OS da agenda e no app do técnico em
 * campo (ScheduleDetailPanel, TechnicianOS).
 *
 * Não renderiza nada quando o telefone cadastrado não tem dígitos suficientes
 * (`buildWhatsAppLink` devolve null) — melhor ausência do que um link que abre
 * uma conversa quebrada. `stopPropagation` porque o atalho costuma morar dentro
 * de card clicável.
 */
export function CustomerWhatsAppLink({
  phone,
  className,
}: {
  phone?: string | null;
  className?: string;
}) {
  const href = buildWhatsAppLink(phone);
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      aria-label="WhatsApp"
      title="WhatsApp"
      className={cn('shrink-0 text-[#25D366] transition-opacity hover:opacity-80', className)}
    >
      <WhatsAppIcon className="h-4 w-4" />
    </a>
  );
}
