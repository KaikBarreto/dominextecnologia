import { Star } from 'lucide-react';
import { useCatalogActivity } from '@/hooks/useCatalogActivity';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { catalogActivityCopy } from './catalogActivityCopy';

export function CatalogFavoriteButton({ modelId, modelLabel }: { modelId: string; modelLabel?: string }) {
  const { locale } = useAppLocaleContext();
  const t = catalogActivityCopy[locale];
  const activity = useCatalogActivity();
  const active = activity.isFavorite(modelId);
  const label = !activity.isReady ? t.unavailable : active ? t.remove : t.add;
  return <Button type="button" variant={active ? 'default' : 'ghost'} size="icon" disabled={!activity.isReady} aria-label={modelLabel ? `${label}: ${modelLabel}` : label} title={label} aria-pressed={active} className="h-11 w-11 shrink-0" onClick={() => activity.toggleFavorite(modelId)}>
    <Star aria-hidden className={cn('h-5 w-5', active && 'fill-current')} />
  </Button>;
}
