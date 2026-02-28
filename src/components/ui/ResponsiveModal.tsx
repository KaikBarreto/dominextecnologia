import * as React from 'react';
import { useIsCompact } from '@/hooks/use-mobile';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface ResponsiveModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function ResponsiveModal({ open, onOpenChange, title, children, className }: ResponsiveModalProps) {
  const isCompact = useIsCompact();

  if (isCompact) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[90vh]">
          <DrawerHeader>
            <DrawerTitle>{title}</DrawerTitle>
          </DrawerHeader>
          <div className={cn("px-4 pb-6 overflow-y-auto", className)} style={{ maxHeight: 'calc(90vh - 80px)' }}>
            {children}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("max-h-[90vh] overflow-y-auto sm:max-w-[600px]", className)}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
