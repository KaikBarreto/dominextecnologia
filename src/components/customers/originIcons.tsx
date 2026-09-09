import * as LucideIcons from 'lucide-react';

/**
 * Catálogo de ícones Lucide disponíveis pra origem de cliente (CRM + cadastro
 * de cliente). Compartilhado entre `CustomerOriginManagerDialog` (tela de
 * gestão do catálogo) e `OriginSelectField` (mini-dialog de criação rápida),
 * pra não duplicar a lista.
 */
export const ICON_OPTIONS = [
  'Globe', 'UserPlus', 'Megaphone', 'Handshake', 'Phone', 'Mail', 'MapPin',
  'Star', 'Heart', 'Target', 'Zap', 'TrendingUp', 'Share2', 'Users',
  'MessageCircle', 'Search', 'Instagram', 'Facebook', 'CalendarDays', 'Tag',
];

export function IconPreview({ name, className }: { name: string; className?: string }) {
  const LucideIcon = (LucideIcons as any)[name];
  if (!LucideIcon) return null;
  return <LucideIcon className={className || 'h-4 w-4'} />;
}
