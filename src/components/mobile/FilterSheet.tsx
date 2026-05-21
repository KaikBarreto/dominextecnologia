import { useState, type ReactNode } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from '@/components/ui/sheet';

interface FilterSheetProps {
  triggerLabel?: string;
  activeCount?: number;
  children: ReactNode;
  onClear?: () => void;
  onApply?: () => void;
}

/**
 * Mobile: botão "Filtros" + Sheet bottom com footer sticky. Desktop: renderiza children inline.
 */
export function FilterSheet({
  triggerLabel = 'Filtros',
  activeCount = 0,
  children,
  onClear,
  onApply,
}: FilterSheetProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  if (!isMobile) {
    return <>{children}</>;
  }

  const handleClear = () => {
    onClear?.();
  };

  const handleApply = () => {
    onApply?.();
    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 h-9">
          <SlidersHorizontal className="h-4 w-4" />
          {triggerLabel}
          {activeCount > 0 && (
            <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1.5 text-[10px]">
              {activeCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[85vh] p-0 flex flex-col rounded-t-2xl">
        <SheetHeader className="px-4 pt-4 pb-2 border-b">
          <SheetTitle>{triggerLabel}</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">{children}</div>
        <div className="sticky bottom-0 border-t bg-background px-4 py-3 flex items-center gap-2 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
          <Button variant="outline" className="flex-1" onClick={handleClear}>
            Limpar
          </Button>
          <Button className="flex-1" onClick={handleApply}>
            Aplicar
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
