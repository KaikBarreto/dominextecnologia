import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EquipmentAvatarProps {
  photoUrl?: string | null;
  name?: string | null;
  /** Clique na foto (com foto) abre o viewer. Não é disparado quando não há foto. */
  onPreview?: () => void;
  className?: string;
}

// Inicial pro fallback (1ª letra do nome).
function initialOf(name?: string | null): string {
  const t = (name ?? '').trim();
  return t ? t[0].toUpperCase() : '';
}

/**
 * Avatar circular do equipamento na listagem de ambientes (PMOC). Com foto,
 * clicar abre o viewer ampliado (ImagePreviewModal) — nunca nova aba; o clique é
 * isolado (stopPropagation) pra não marcar/desmarcar o checkbox. Sem foto, mostra
 * a inicial do nome (ou ícone de chave quando sem nome).
 */
export function EquipmentAvatar({ photoUrl, name, onPreview, className }: EquipmentAvatarProps) {
  const hasPhoto = !!(photoUrl && photoUrl.trim());
  const initial = initialOf(name);

  if (hasPhoto) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onPreview?.();
        }}
        className={cn(
          'shrink-0 rounded-full ring-offset-background transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          className,
        )}
        aria-label={`Ver foto de ${name || 'equipamento'}`}
      >
        <Avatar className="h-9 w-9 border">
          <AvatarImage src={photoUrl!} alt={name || 'Equipamento'} className="object-cover" />
          <AvatarFallback className="text-xs font-medium text-muted-foreground">
            {initial || <Wrench className="h-4 w-4" />}
          </AvatarFallback>
        </Avatar>
      </button>
    );
  }

  return (
    <Avatar className={cn('h-9 w-9 shrink-0 border', className)}>
      <AvatarFallback className="text-xs font-medium text-muted-foreground">
        {initial || <Wrench className="h-4 w-4" />}
      </AvatarFallback>
    </Avatar>
  );
}
