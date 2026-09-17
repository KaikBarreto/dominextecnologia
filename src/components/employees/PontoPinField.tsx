// PontoPinField — PIN opcional do ponto, por funcionário.
//
// O PIN protege a PESSOA, não o link: com PIN, ela precisa digitar antes de
// bater o ponto (link pessoal e quiosque compartilhado). O hash NUNCA sai do
// banco — este campo só sabe SE existe (has_ponto_pin) e dispara
// set_ponto_pin pra definir/trocar/remover. Nunca exibe o PIN atual.
//
// RPC via hook (usePontoAdmin) — regra-lei nº4, componente nunca chama
// supabase direto.

import { useState } from 'react';
import { KeyRound, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useHasPontoPin, useSetPontoPin } from '@/hooks/usePontoAdmin';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/utils/errorMessages';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

interface PontoPinFieldProps {
  /** null = funcionário ainda não foi salvo (criação): PIN só depois de existir o ID. */
  employeeId: string | null;
}

// PIN tem 4 OU 6 dígitos (nunca 5) — mesmo tamanho aceito pelo teclado do ponto.
const PIN_LENGTHS = [4, 6];
const isCompletePin = (v: string) => PIN_LENGTHS.includes(v.length);
const digitsOnly = (raw: string) => raw.replace(/\D/g, '').slice(0, 6);

export function PontoPinField({ employeeId }: PontoPinFieldProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.employees.form.timeclock.pin;
  const { toast } = useToast();

  const { data: hasPin, isLoading } = useHasPontoPin(employeeId);
  const setPin = useSetPontoPin();

  const [editing, setEditing] = useState(false);
  const [pin, setPinValue] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  const mismatch = isCompletePin(pin) && isCompletePin(confirmPin) && pin !== confirmPin;
  const invalidLength = pin.length > 0 && !isCompletePin(pin);
  const canSave = isCompletePin(pin) && pin === confirmPin;

  const resetEditing = () => {
    setEditing(false);
    setPinValue('');
    setConfirmPin('');
  };

  const handleSave = () => {
    if (!employeeId || !canSave) return;
    setPin.mutate(
      { employeeId, pin },
      {
        onSuccess: () => {
          toast({ title: t.toastSetSuccess });
          resetEditing();
        },
        onError: (err) => {
          toast({ variant: 'destructive', title: t.toastError, description: getErrorMessage(err) });
        },
      },
    );
  };

  const handleRemove = () => {
    if (!employeeId) return;
    setPin.mutate(
      { employeeId, pin: null },
      {
        onSuccess: () => {
          toast({ title: t.toastRemoveSuccess });
          resetEditing();
        },
        onError: (err) => {
          toast({ variant: 'destructive', title: t.toastError, description: getErrorMessage(err) });
        },
      },
    );
  };

  if (!employeeId) {
    return (
      <div className="rounded-lg border p-3 space-y-1">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-muted-foreground shrink-0" />
          <Label className="text-sm font-medium">{t.label}</Label>
        </div>
        <p className="text-xs text-muted-foreground">{t.pendingHint}</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-3 space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-muted-foreground shrink-0" />
          <div>
            <Label className="text-sm font-medium">{t.label}</Label>
            <p className="text-xs text-muted-foreground">{t.optionalHint}</p>
          </div>
        </div>
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
        ) : (
          <Badge variant={hasPin ? 'success' : 'muted'} className="shrink-0 w-fit">
            {hasPin ? t.statusSet : t.statusUnset}
          </Badge>
        )}
      </div>

      {editing ? (
        <div className="space-y-2">
          <Input
            inputMode="numeric"
            autoComplete="off"
            placeholder={t.newPinPlaceholder}
            value={pin}
            className="text-base"
            onChange={(e) => setPinValue(digitsOnly(e.target.value))}
          />
          <Input
            inputMode="numeric"
            autoComplete="off"
            placeholder={t.confirmPinPlaceholder}
            value={confirmPin}
            className="text-base"
            onChange={(e) => setConfirmPin(digitsOnly(e.target.value))}
          />
          <p className="text-xs text-muted-foreground">{t.lengthHint}</p>
          {invalidLength && <p className="text-xs text-destructive">{t.invalidLength}</p>}
          {mismatch && <p className="text-xs text-destructive">{t.mismatch}</p>}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="edit-ghost"
              size="sm"
              disabled={!canSave || setPin.isPending}
              onClick={handleSave}
            >
              {setPin.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
              {hasPin ? t.changeButton : t.setButton}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={resetEditing} disabled={setPin.isPending}>
              {t.cancelButton}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="edit-ghost" size="sm" onClick={() => setEditing(true)}>
            <KeyRound className="h-3.5 w-3.5" />
            {hasPin ? t.changeButton : t.setButton}
          </Button>
          {hasPin && (
            <Button
              type="button"
              variant="destructive-ghost"
              size="sm"
              disabled={setPin.isPending}
              onClick={handleRemove}
            >
              {setPin.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {t.removeButton}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export default PontoPinField;
