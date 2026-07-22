import React, { useState } from 'react';
import { Phone, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

/**
 * Logo oficial do WhatsApp (SVG inline — path da marca Meta/WhatsApp).
 * viewBox 0 0 24 24, fill currentColor.
 */
function WhatsAppIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
      style={style}
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.149-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.885-9.885 9.885M20.52 3.449C18.24 1.245 15.24 0 12.045 0 5.463 0 .104 5.359.101 11.892c0 2.096.549 4.14 1.595 5.945L0 24l6.335-1.652a11.93 11.93 0 005.71 1.454h.006c6.585 0 11.946-5.359 11.949-11.893a11.821 11.821 0 00-3.481-8.401" />
    </svg>
  );
}

interface PortalContactButtonProps {
  /** Telefone/celular da empresa (dd + numero, ex.: "11912345678"). */
  phone?: string | null;
  /** E-mail da empresa. */
  email?: string | null;
  /** Cor de texto/icone no header (calculado pelo shell). */
  textColor?: string;
}

/**
 * Acoes de contato do portal no header:
 *  - Botao de WhatsApp (quando ha telefone): abre wa.me diretamente em nova aba.
 *  - Botao de telefone: abre modal com todas as opcoes (ligar, WhatsApp, e-mail).
 *
 * Opcoes sem dado ficam ocultas. Ambos os botoes convivem no headerAction do shell.
 * Reutiliza ResponsiveModal (drawer no mobile, dialog no desktop).
 */
export function PortalContactButton({
  phone,
  email,
  textColor = '#ffffff',
}: PortalContactButtonProps) {
  const [open, setOpen] = useState(false);
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.customers.portal;

  // Remove todos os caracteres nao-numericos para montar o link wa.me
  // Inclui DDI 55 se o numero nao comecar com 55 (numeros brasileiros sem DDI).
  const digitsOnly = (v: string) => v.replace(/\D/g, '');
  const waLink = (v: string) => {
    const d = digitsOnly(v);
    // Adiciona DDI 55 se ausente (numero com 10-11 digitos = BR sem DDI)
    return `https://wa.me/${d.startsWith('55') ? d : `55${d}`}`;
  };

  const hasAny = !!phone || !!email;
  if (!hasAny) return null;

  return (
    <>
      {/* Botao de WhatsApp direto no header (so quando ha telefone) */}
      {phone && (
        <a
          href={waLink(phone)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t.contactWhatsapp}
          className="flex items-center justify-center h-9 w-9 rounded-full transition-opacity active:opacity-70"
          style={{ background: 'rgba(255,255,255,0.18)' }}
        >
          <WhatsAppIcon className="h-4 w-4" style={{ color: textColor }} />
        </a>
      )}

      {/* Botao de telefone: abre modal com todas as opcoes */}
      <button
        type="button"
        aria-label={t.contactTitle}
        onClick={() => setOpen(true)}
        className="flex items-center justify-center h-9 w-9 rounded-full transition-opacity active:opacity-70"
        style={{ background: 'rgba(255,255,255,0.18)' }}
      >
        <Phone className="h-4 w-4" style={{ color: textColor }} />
      </button>

      <ResponsiveModal
        open={open}
        onOpenChange={setOpen}
        title={t.contactTitle}
      >
        <div className="space-y-3 py-2">
          {phone && (
            <a href={`tel:${phone}`} className="block">
              <Button variant="outline" className="w-full justify-start gap-3 h-12 text-base">
                <Phone className="h-5 w-5 text-primary shrink-0" />
                <span>{t.contactCall}</span>
                <span className="ml-auto text-sm text-muted-foreground">{phone}</span>
              </Button>
            </a>
          )}

          {phone && (
            <a
              href={waLink(phone)}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              <Button variant="outline" className="w-full justify-start gap-3 h-12 text-base">
                <WhatsAppIcon className="h-5 w-5 text-emerald-600 shrink-0" />
                <span>{t.contactWhatsapp}</span>
              </Button>
            </a>
          )}

          {email && (
            <a href={`mailto:${email}`} className="block">
              <Button variant="outline" className="w-full justify-start gap-3 h-12 text-base">
                <Mail className="h-5 w-5 text-blue-600 shrink-0" />
                <span>{t.contactEmail}</span>
                <span className="ml-auto text-sm text-muted-foreground truncate max-w-[8rem]">{email}</span>
              </Button>
            </a>
          )}
        </div>
      </ResponsiveModal>
    </>
  );
}
