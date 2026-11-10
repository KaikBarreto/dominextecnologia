import { useEffect, useId, useRef, useState } from 'react';
import { Copy, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { cn } from '@/lib/utils';

export interface DuplicateEntityDialogLabels {
  title: string;
  description?: string;
  nameLabel: string;
  namePlaceholder?: string;
  quantityLabel: string;
  quantityHint?: string;
  copyHint?: string;
  cancel: string;
  confirm: string;
  confirming?: string;
  nameRequired: string;
  quantityInvalid: string;
}

interface DuplicateEntityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName: string;
  labels: DuplicateEntityDialogLabels;
  isPending?: boolean;
  maxCopies?: number;
  maxNameLength?: number;
  onConfirm: (name: string, copyCount: number) => void | Promise<void>;
}

/**
 * Diálogo compartilhado para duplicar estruturas reutilizáveis.
 *
 * O componente valida somente o contrato comum (nome + quantidade). A regra de
 * quais dados são copiados e o isolamento por empresa continuam no hook/RPC de
 * cada domínio.
 */
export function DuplicateEntityDialog({
  open,
  onOpenChange,
  initialName,
  labels,
  isPending = false,
  maxCopies = 20,
  maxNameLength = 200,
  onConfirm,
}: DuplicateEntityDialogProps) {
  const fieldId = useId();
  const nameId = `${fieldId}-name`;
  const quantityId = `${fieldId}-quantity`;
  const [name, setName] = useState(initialName);
  const [quantity, setQuantity] = useState('1');
  const [nameError, setNameError] = useState('');
  const [quantityError, setQuantityError] = useState('');
  const submittingRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setQuantity('1');
    setNameError('');
    setQuantityError('');
    submittingRef.current = false;
  }, [initialName, open]);

  const submit = () => {
    const trimmedName = name.trim();
    const parsedQuantity = Number(quantity);
    const validName = trimmedName.length > 0 && trimmedName.length <= maxNameLength;
    const validQuantity =
      Number.isInteger(parsedQuantity) && parsedQuantity >= 1 && parsedQuantity <= maxCopies;

    setNameError(validName ? '' : labels.nameRequired);
    setQuantityError(validQuantity ? '' : labels.quantityInvalid);
    if (!validName || !validQuantity || isPending || submittingRef.current) return;

    submittingRef.current = true;
    void Promise.resolve(onConfirm(trimmedName, parsedQuantity))
      // O hook do domínio já apresenta o erro ao usuário. Consumir a rejeição
      // aqui evita unhandled promise e mantém o diálogo aberto para nova tentativa.
      .catch(() => undefined)
      .finally(() => {
        submittingRef.current = false;
      });
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isPending) onOpenChange(nextOpen);
      }}
      title={labels.title}
      description={labels.description}
      className="space-y-5"
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={isPending} onClick={() => onOpenChange(false)}>
            {labels.cancel}
          </Button>
          <Button type="button" disabled={isPending} onClick={submit} className="gap-2">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
            {isPending ? (labels.confirming ?? labels.confirm) : labels.confirm}
          </Button>
        </div>
      }
    >
      <div className="space-y-2">
        <Label htmlFor={nameId}>{labels.nameLabel}</Label>
        <Input
          id={nameId}
          value={name}
          maxLength={maxNameLength}
          placeholder={labels.namePlaceholder}
          disabled={isPending}
          autoFocus
          aria-invalid={!!nameError}
          aria-describedby={nameError ? `${nameId}-error` : undefined}
          className={cn(nameError && 'border-destructive focus-visible:border-destructive focus-visible:ring-destructive')}
          onChange={(event) => {
            setName(event.target.value);
            if (nameError) setNameError('');
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              submit();
            }
          }}
        />
        {nameError && (
          <p id={`${nameId}-error`} role="alert" className="text-sm font-medium text-destructive">
            {nameError}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor={quantityId}>{labels.quantityLabel}</Label>
        <Input
          id={quantityId}
          type="number"
          min={1}
          max={maxCopies}
          step={1}
          inputMode="numeric"
          value={quantity}
          disabled={isPending}
          aria-invalid={!!quantityError}
          aria-describedby={quantityError ? `${quantityId}-error` : (labels.quantityHint ? `${quantityId}-hint` : undefined)}
          className={cn(
            'sm:max-w-40',
            quantityError && 'border-destructive focus-visible:border-destructive focus-visible:ring-destructive',
          )}
          onChange={(event) => {
            setQuantity(event.target.value);
            if (quantityError) setQuantityError('');
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              submit();
            }
          }}
        />
        {quantityError ? (
          <p id={`${quantityId}-error`} role="alert" className="text-sm font-medium text-destructive">
            {quantityError}
          </p>
        ) : labels.quantityHint ? (
          <p id={`${quantityId}-hint`} className="text-sm text-muted-foreground">
            {labels.quantityHint}
          </p>
        ) : null}
      </div>

      {labels.copyHint && (
        <p className="border-l-2 border-primary pl-3 text-sm text-muted-foreground">
          {labels.copyHint}
        </p>
      )}
    </ResponsiveModal>
  );
}
