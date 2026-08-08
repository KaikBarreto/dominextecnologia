import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon';
import { cn } from '@/lib/utils';
import { buildWhatsAppLink } from '@/utils/shareLinks';

const DEFAULT_INVALIDATE_KEYS = [
  ['admin-companies'],
  ['admin-company'],
] as const;

/**
 * Botao "Falar no WhatsApp" que tambem MARCA o lead como trabalhado e LIBERA
 * a comissao segurada (RPC `mark_lead_worked_and_release`, idempotente).
 *
 * Fluxo:
 * 1. Normaliza o telefone via buildWhatsAppLink (fronteira unica wa.me na Dominex).
 * 2. Chama a RPC mark_lead_worked_and_release.
 * 3. Invalida as queries de lista/detalhe de empresas para o badge sumir na hora.
 * 4. Abre a conversa no WhatsApp.
 *
 * A RPC e inofensiva em empresas que nao sao self-service, entao o botao pode
 * aparecer em qualquer empresa com telefone.
 *
 * Usa o icone canonico WhatsAppIcon (src/components/icons/WhatsAppIcon.tsx),
 * nunca MessageCircle.
 */
export function LeadWhatsAppButton({
  company,
  variant = 'full',
  className,
  invalidateKeys,
  onDone,
}: {
  company: { id: string; phone?: string | null; lead_worked_at?: string | null };
  variant?: 'full' | 'icon';
  className?: string;
  /** queryKeys extras a invalidar alem da lista/detalhe. */
  invalidateKeys?: (readonly unknown[])[];
  onDone?: () => void;
}) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();

    const waLink = buildWhatsAppLink(company.phone);
    if (!waLink) {
      toast.error('Esta empresa nao tem telefone cadastrado');
      return;
    }

    setLoading(true);
    try {
      // Somente chama a RPC se o lead ainda nao foi trabalhado — a RPC e
      // idempotente, mas evitar chamada desnecessaria e mais limpo.
      if (!company.lead_worked_at) {
        const { error } = await supabase.rpc('mark_lead_worked_and_release', {
          p_company_id: company.id,
        });

        if (error) {
          console.error('mark_lead_worked_and_release:', error);
          const isAuth = /permission|denied|not authorized|autoriza/i.test(
            error.message || '',
          );
          toast.error(
            isAuth
              ? 'Voce nao tem permissao para marcar este lead'
              : 'Nao foi possivel marcar o lead. Tente novamente',
          );
          // Abre o WhatsApp mesmo assim — contato nao deve depender do carimbo.
          window.open(waLink, '_blank');
          return;
        }

        const keys = [...DEFAULT_INVALIDATE_KEYS, ...(invalidateKeys ?? [])];
        keys.forEach((queryKey) =>
          queryClient.invalidateQueries({ queryKey: queryKey as unknown[] }),
        );

        toast.success('Lead marcado como atendido');
      }

      window.open(waLink, '_blank');
      onDone?.();
    } finally {
      setLoading(false);
    }
  };

  if (variant === 'icon') {
    return (
      <Button
        type="button"
        size="icon"
        className={cn('bg-[#25D366] hover:bg-[#25D366]/90 text-white', className)}
        onClick={handleClick}
        disabled={loading}
        title="Falar no WhatsApp"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <WhatsAppIcon className="h-4 w-4" />
        )}
      </Button>
    );
  }

  return (
    <Button
      type="button"
      className={cn('bg-[#25D366] hover:bg-[#25D366]/90 text-white gap-1.5', className)}
      onClick={handleClick}
      disabled={loading}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <WhatsAppIcon className="h-4 w-4" />
      )}
      Falar no WhatsApp
    </Button>
  );
}
