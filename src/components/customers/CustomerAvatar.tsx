import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { SignedAvatarImage } from '@/components/ui/SignedAvatarImage';
import { cn } from '@/lib/utils';

export function CustomerAvatar({ name, photoUrl, className }: {
  name: string;
  photoUrl?: string | null;
  className?: string;
}) {
  const initials = name.trim().split(/\s+/).filter(Boolean).slice(0, 2)
    .map(part => part[0]).join('').toLocaleUpperCase('pt-BR');

  return (
    <Avatar className={cn('h-11 w-11 rounded-xl', className)}>
      <SignedAvatarImage src={photoUrl} alt={name} className="object-cover" />
      <AvatarFallback className="rounded-[inherit] bg-primary text-sm font-semibold text-primary-foreground">
        {initials || '?'}
      </AvatarFallback>
    </Avatar>
  );
}
