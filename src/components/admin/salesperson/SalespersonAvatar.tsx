import * as React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

/**
 * Avatar reutilizável do vendedor.
 * - Renderiza a foto se houver `photoUrl`; caso contrário, fallback com iniciais.
 * - Cor de fundo das iniciais derivada por hash do nome (estável).
 */

interface SalespersonAvatarProps {
  /** Nome completo do vendedor (usado para iniciais e tooltip/alt). */
  name?: string | null;
  /** URL pública da foto (vinda de `salespeople.photo_url`). */
  photoUrl?: string | null;
  /** Tamanho pré-definido. */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Classes extras (tailwind). */
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<SalespersonAvatarProps['size']>, string> = {
  sm: 'h-6 w-6 text-[9px]',
  md: 'h-9 w-9 text-xs',
  lg: 'h-14 w-14 text-base',
  xl: 'h-20 w-20 text-xl',
};

// Paleta de cores estáveis (sem amarelo claro pra contraste com texto branco).
const PALETTE = [
  '#00C597', // verde Dominex
  '#0EA5E9', // sky
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#F97316', // orange
  '#10B981', // emerald
  '#F43F5E', // rose
  '#6366F1', // indigo
  '#14B8A6', // teal
  '#D946EF', // fuchsia
  '#3B82F6', // blue
  '#EF4444', // red
];

function colorFromName(name: string): string {
  if (!name) return '#6B7280'; // gray
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % PALETTE.length;
  return PALETTE[idx];
}

function getInitials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((word) => word[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  );
}

export function SalespersonAvatar({
  name,
  photoUrl,
  size = 'md',
  className,
}: SalespersonAvatarProps) {
  const safeName = (name || '').trim() || 'Sem vendedor';
  const initials = getInitials(safeName);
  const bgColor = colorFromName(safeName);

  return (
    <Avatar className={cn(SIZE_CLASSES[size], className)}>
      {photoUrl ? (
        <AvatarImage src={photoUrl} alt={safeName} className="object-cover" />
      ) : null}
      <AvatarFallback
        className="text-white font-medium border-0"
        style={{ backgroundColor: bgColor }}
      >
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}
