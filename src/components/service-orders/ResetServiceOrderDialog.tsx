import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

interface ResetServiceOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderNumber?: number | null;
  isPending?: boolean;
  onConfirm: (clearResponses: boolean) => Promise<void> | void;
}

export function ResetServiceOrderDialog({
  open,
  onOpenChange,
  orderNumber,
  isPending = false,
  onConfirm,
}: ResetServiceOrderDialogProps) {
  const [responseMode, setResponseMode] = useState<'keep' | 'clear'>('keep');

  useEffect(() => {
    if (open) setResponseMode('keep');
  }, [open]);

  const handleConfirm = async () => {
    try {
      await onConfirm(responseMode === 'clear');
    } catch {
      // A mutation dona da operacao exibe o erro. Consumir a rejeicao mantem o
      // dialog aberto para nova tentativa e evita Promise nao tratada no clique.
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-amber-500" />
            Resetar OS{orderNumber ? ` #${orderNumber}` : ''}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            A OS voltará para Agendada e poderá ser marcada como A caminho e receber um novo check-in.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <RadioGroup
          value={responseMode}
          onValueChange={(value) => setResponseMode(value as 'keep' | 'clear')}
          className="gap-3"
        >
          <Label
            htmlFor="reset-os-keep"
            className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-muted/50"
          >
            <RadioGroupItem id="reset-os-keep" value="keep" className="mt-0.5" />
            <span>
              <span className="block font-medium text-foreground">Manter o preenchimento</span>
              <span className="block text-sm font-normal text-muted-foreground">
                Preserva respostas, fotos, assinaturas e informações registradas na execução anterior.
              </span>
            </span>
          </Label>
          <Label
            htmlFor="reset-os-clear"
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-destructive/30 p-3 hover:bg-destructive/5"
          >
            <RadioGroupItem id="reset-os-clear" value="clear" className="mt-0.5" />
            <span>
              <span className="block font-medium text-foreground">Apagar o preenchimento</span>
              <span className="block text-sm font-normal text-muted-foreground">
                Remove respostas, fotos, assinaturas, medições e registros de localização desta execução.
              </span>
            </span>
          </Label>
        </RadioGroup>

        <p className="text-xs text-muted-foreground">
          Materiais, estoque, faturamento e dados administrativos da OS não serão alterados.
        </p>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={isPending}
            className="bg-amber-500 text-white hover:bg-amber-600"
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            {isPending ? 'Resetando...' : 'Resetar OS'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
