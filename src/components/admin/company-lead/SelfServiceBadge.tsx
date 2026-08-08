import { Badge } from '@/components/ui/badge';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Badge sólido indigo "Self-service" — aparece apenas enquanto o lead ainda
 * nao foi trabalhado (lead_worked_at nulo). Some automaticamente assim que o
 * operador fala no WhatsApp e a RPC carimba o atendimento.
 *
 * Segue a regra de badges saturados: fundo preenchido + texto/icone brancos.
 */
export function SelfServiceBadge({
  company,
  className,
}: {
  company: { is_self_service?: boolean | null; lead_worked_at?: string | null };
  className?: string;
}) {
  if (!company?.is_self_service || company?.lead_worked_at) return null;

  return (
    <Badge
      className={cn(
        'bg-indigo-600 hover:bg-indigo-600 text-white border-0 gap-1',
        className,
      )}
    >
      <Sparkles className="h-3 w-3" />
      Self-service
    </Badge>
  );
}
