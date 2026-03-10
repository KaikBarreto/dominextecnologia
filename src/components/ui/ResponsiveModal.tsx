import * as React from 'react';
import { useIsCompact } from '@/hooks/use-mobile';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

export interface ResponsiveModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  /** Footer content rendered below the scrollable area */
  footer?: React.ReactNode;
}

export function ResponsiveModal({ open, onOpenChange, title, children, className, footer }: ResponsiveModalProps) {
  const isCompact = useIsCompact();

  if (isCompact) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[90vh]">
          <DrawerHeader>
            <DrawerTitle>{title}</DrawerTitle>
          </DrawerHeader>
          <div className={cn("px-4 pb-6 overflow-y-auto", className)} style={{ maxHeight: footer ? 'calc(90vh - 140px)' : 'calc(90vh - 80px)' }}>
            {children}
          </div>
          {footer && <div className="px-4 pb-4 border-t pt-3">{footer}</div>}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("max-h-[90vh] flex flex-col sm:max-w-[600px]", className)} aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto flex-1">{children}</div>
        {footer && <div className="border-t pt-3">{footer}</div>}
      </DialogContent>
    </Dialog>
  );
}
