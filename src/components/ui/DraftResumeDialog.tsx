import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { useIsCompact } from '@/hooks/use-mobile';
import { FileText, RotateCcw } from 'lucide-react';

interface DraftResumeDialogProps {
  open: boolean;
  onResume: () => void;
  onDiscard: () => void;
}

export function DraftResumeDialog({ open, onResume, onDiscard }: DraftResumeDialogProps) {
  const isCompact = useIsCompact();

  const icon = (
    <div className="flex items-center gap-3 mb-1">
      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
        <FileText className="h-5 w-5 text-primary" />
      </div>
    </div>
  );

  const description = 'Existe um preenchimento interrompido deste formulário. Deseja retomar de onde parou ou começar do zero?';

  if (isCompact) {
    return (
      <Drawer open={open} onOpenChange={() => {}}>
        <DrawerContent>
          <DrawerHeader>
            {icon}
            <DrawerTitle>Rascunho encontrado</DrawerTitle>
            <DrawerDescription>{description}</DrawerDescription>
          </DrawerHeader>
          <DrawerFooter className="flex-row gap-2">
            <Button variant="outline" onClick={onDiscard} className="flex-1">
              <RotateCcw className="mr-2 h-4 w-4" />
              Começar do zero
            </Button>
            <Button onClick={onResume} className="flex-1">
              <FileText className="mr-2 h-4 w-4" />
              Retomar rascunho
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <AlertDialogTitle>Rascunho encontrado</AlertDialogTitle>
          </div>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onDiscard}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Começar do zero
          </AlertDialogCancel>
          <AlertDialogAction onClick={onResume}>
            <FileText className="mr-2 h-4 w-4" />
            Retomar rascunho
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
