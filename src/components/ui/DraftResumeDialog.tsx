import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { FileText, RotateCcw } from 'lucide-react';

interface DraftResumeDialogProps {
  open: boolean;
  onResume: () => void;
  onDiscard: () => void;
}

export function DraftResumeDialog({ open, onResume, onDiscard }: DraftResumeDialogProps) {
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
          <AlertDialogDescription>
            Existe um preenchimento interrompido deste formulário. Deseja retomar de onde parou ou começar do zero?
          </AlertDialogDescription>
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
