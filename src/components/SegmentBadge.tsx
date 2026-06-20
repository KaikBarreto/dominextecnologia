import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { getSegment } from '@/utils/companySegments';

interface SegmentBadgeProps {
  /** Valor do segmento (ex.: 'refrigeracao'). null/undefined → não renderiza nada. */
  segment: string | null | undefined;
  className?: string;
}

/**
 * Badge colorido do segmento da empresa (cor saturada + ícone + label).
 * Fonte do catálogo: `getSegment` em `@/utils/companySegments`. Se o segmento
 * não resolver (super_admin / empresa sem segmento), renderiza `null`.
 *
 * NOTE: as telas admin (CompanyTable / CompanyKanbanCard) hoje repetem este mesmo
 * markup inline. Podem migrar pra este componente depois pra matar a duplicação —
 * não migrar agora pra manter o escopo mínimo.
 */
export function SegmentBadge({ segment, className }: SegmentBadgeProps) {
  const seg = getSegment(segment);
  if (!seg) return null;

  return (
    <Badge
      className={cn('text-white border-0 gap-1.5', className)}
      style={{ backgroundColor: seg.color }}
    >
      <seg.icon className="h-3 w-3" />
      <span className="truncate">{seg.label}</span>
    </Badge>
  );
}
