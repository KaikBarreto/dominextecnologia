import { User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

/**
 * Avatar de usuário (criador / responsável / atribuído) com tooltip de
 * identificação: nome na primeira linha e e-mail numa segunda linha menor e
 * esmaecida. Presentacional — não busca dado, só renderiza o que recebe.
 *
 * Regras:
 * - Sem `name` → mostra "Usuário".
 * - Sem `email` → omite a segunda linha.
 * - Sem `avatarUrl` → cai nas iniciais; sem nome → ícone neutro.
 *
 * Usa o TooltipProvider global do app (já montado na árvore).
 */
export interface UserAvatarTooltipProps {
  name?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  /** Diâmetro do avatar (px). Default 28 (h-7/w-7). */
  size?: number;
  /** Rótulo opcional exibido abaixo do e-mail (ex.: "Criador da OS"). */
  roleLabel?: string;
  /** Lado do tooltip. Default 'top'. */
  side?: 'top' | 'right' | 'bottom' | 'left';
  className?: string;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function UserAvatarTooltip({
  name,
  email,
  avatarUrl,
  size = 28,
  roleLabel,
  side = 'top',
  className,
}: UserAvatarTooltipProps) {
  const displayName = name?.trim() || 'Usuário';
  const initials = name?.trim() ? getInitials(name) : '';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Avatar
          className={cn('cursor-help', className)}
          style={{ height: size, width: size }}
        >
          {avatarUrl ? (
            <AvatarImage src={avatarUrl} alt={displayName} />
          ) : null}
          <AvatarFallback className="text-[10px] font-medium bg-muted text-muted-foreground">
            {initials || <User className="h-3.5 w-3.5" aria-hidden="true" />}
          </AvatarFallback>
        </Avatar>
      </TooltipTrigger>
      <TooltipContent side={side} className="text-xs">
        <p className="font-medium">{displayName}</p>
        {email ? (
          <p className="text-[11px] text-muted-foreground">{email}</p>
        ) : null}
        {roleLabel ? (
          <p className="text-[11px] text-muted-foreground mt-0.5">{roleLabel}</p>
        ) : null}
      </TooltipContent>
    </Tooltip>
  );
}
