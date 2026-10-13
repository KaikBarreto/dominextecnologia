import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/DatePicker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Textarea } from '@/components/ui/textarea';
import type {
  CustomerPaidExpense,
  CustomerPaidExpenseInput,
} from '@/hooks/useCustomerPaidExpenses';
import { readPastedCents } from '@/lib/money-paste-mask';
import { todayInTz } from '@/lib/timezone';
import { getErrorMessage } from '@/utils/errorMessages';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';

export interface CustomerExpenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense?: CustomerPaidExpense | null;
  /** Consulta sem mutação, inclusive para registros ativos sem permissão de gestão. */
  readOnly?: boolean;
  onSubmit: (input: CustomerPaidExpenseInput) => Promise<unknown>;
  isLoading?: boolean;
}

interface FormErrors {
  description?: string;
  amount?: string;
  expenseDate?: string;
}

const MAX_AMOUNT = 999_999_999.99;
const MIN_DATE = '2000-01-01';

function formatAmount(value: number): string {
  if (!value) return '';
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function CustomerExpenseDialog({
  open,
  onOpenChange,
  expense,
  readOnly = false,
  onSubmit,
  isLoading = false,
}: CustomerExpenseDialogProps) {
  const { timezone } = useAppLocaleContext();
  const today = useMemo(() => todayInTz(timezone), [timezone]);
  const isEditing = !!expense;
  const isVoided = !!expense?.voided_at;
  const isReadOnly = readOnly || isVoided;

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState(0);
  const [expenseDate, setExpenseDate] = useState(today);
  const [category, setCategory] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submitGuard = useRef(false);

  const busy = isLoading || submitting;

  useEffect(() => {
    if (!open) return;

    setDescription(expense?.description ?? '');
    setAmount(Number(expense?.amount ?? 0));
    setExpenseDate(expense?.expense_date ?? today);
    setCategory(expense?.category ?? '');
    setNotes(expense?.notes ?? '');
    setErrors({});
    setSubmitError(null);
  }, [open, expense, today]);

  const validate = (): boolean => {
    const next: FormErrors = {};

    if (!description.trim()) next.description = 'Informe a descrição do gasto.';
    if (!Number.isFinite(amount) || amount <= 0) next.amount = 'Informe um valor maior que zero.';
    else if (amount > MAX_AMOUNT) next.amount = 'O valor informado é muito alto.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) next.expenseDate = 'Informe uma data válida.';
    else if (expenseDate < MIN_DATE) next.expenseDate = 'A data deve ser posterior a 01/01/2000.';
    else if (expenseDate > today) next.expenseDate = 'A data do gasto não pode estar no futuro.';

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitGuard.current || busy || isReadOnly || !validate()) return;

    submitGuard.current = true;
    setSubmitError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        description: description.trim(),
        amount: Number(amount.toFixed(2)),
        expense_date: expenseDate,
        category: category.trim() || null,
        notes: notes.trim() || null,
      });
      onOpenChange(false);
    } catch (error) {
      setSubmitError(getErrorMessage(error));
    } finally {
      submitGuard.current = false;
      setSubmitting(false);
    }
  };

  const footer = (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy} className="min-h-11">
        {isReadOnly ? 'Fechar' : 'Cancelar'}
      </Button>
      {!isReadOnly && (
        <Button type="submit" form="customer-paid-expense-form" disabled={busy} className="min-h-11">
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {busy ? 'Salvando...' : isEditing ? 'Salvar alterações' : 'Registrar gasto'}
        </Button>
      )}
    </div>
  );

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={isReadOnly ? 'Consultar gasto pago pelo cliente' : isEditing ? 'Editar gasto pago pelo cliente' : 'Registrar gasto pago pelo cliente'}
      description="Guarde este gasto no histórico do cliente sem gerar movimentação financeira ou bancária para a empresa."
      className="sm:max-w-lg"
      footer={footer}
    >
      <form id="customer-paid-expense-form" onSubmit={handleSubmit} className="space-y-4">
        <NoticeBanner variant="info">
          Este registro não será lançado no Financeiro e não alterará contas, caixa ou banco.
        </NoticeBanner>

        {isVoided && (
          <NoticeBanner variant="warning">
            Este gasto foi cancelado e permanece somente para consulta do histórico.
          </NoticeBanner>
        )}

        {submitError && (
          <NoticeBanner variant="destructive" title="Não foi possível salvar">
            {submitError}
          </NoticeBanner>
        )}

        <div className="space-y-2">
          <Label htmlFor="customer-expense-description">Descrição *</Label>
          <Input
            id="customer-expense-description"
            value={description}
            onChange={(event) => {
              setDescription(event.target.value);
              if (errors.description) setErrors((current) => ({ ...current, description: undefined }));
            }}
            placeholder="Ex.: Peça comprada diretamente pelo cliente"
            className="min-h-11"
            disabled={busy || isReadOnly}
            aria-invalid={!!errors.description}
            aria-describedby={errors.description ? 'customer-expense-description-error' : undefined}
            autoFocus={!isReadOnly}
          />
          {errors.description && (
            <p id="customer-expense-description-error" className="text-sm text-destructive">
              {errors.description}
            </p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="customer-expense-amount">Valor *</Label>
            <Input
              id="customer-expense-amount"
              value={formatAmount(amount)}
              onChange={(event) => {
                const digits = event.target.value.replace(/\D/g, '');
                setAmount(Number.parseInt(digits || '0', 10) / 100);
                if (errors.amount) setErrors((current) => ({ ...current, amount: undefined }));
              }}
              onPaste={(event) => {
                const cents = readPastedCents(event);
                if (cents != null) {
                  setAmount(cents / 100);
                  if (errors.amount) setErrors((current) => ({ ...current, amount: undefined }));
                }
              }}
              placeholder="0,00"
              className="min-h-11"
              inputMode="numeric"
              disabled={busy || isReadOnly}
              aria-invalid={!!errors.amount}
              aria-describedby={errors.amount ? 'customer-expense-amount-error' : undefined}
            />
            {errors.amount && (
              <p id="customer-expense-amount-error" className="text-sm text-destructive">
                {errors.amount}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="customer-expense-date">Data do gasto *</Label>
            <DatePicker
              id="customer-expense-date"
              value={expenseDate}
              onValueChange={(value) => {
                setExpenseDate(value);
                if (errors.expenseDate) setErrors((current) => ({ ...current, expenseDate: undefined }));
              }}
              min={MIN_DATE}
              max={today}
              placeholder="Selecione a data"
              className="min-h-11"
              disabled={busy || isReadOnly}
              aria-describedby={errors.expenseDate ? 'customer-expense-date-error' : undefined}
            />
            {errors.expenseDate && (
              <p id="customer-expense-date-error" className="text-sm text-destructive">
                {errors.expenseDate}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="customer-expense-category">Categoria</Label>
          <Input
            id="customer-expense-category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            placeholder="Ex.: Peças e materiais"
            className="min-h-11"
            disabled={busy || isReadOnly}
          />
          <p className="text-xs text-muted-foreground">Opcional. Use apenas para organizar o histórico do cliente.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="customer-expense-notes">Observações</Label>
          <Textarea
            id="customer-expense-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Inclua detalhes importantes sobre o gasto"
            rows={3}
            disabled={busy || isReadOnly}
          />
        </div>
      </form>
    </ResponsiveModal>
  );
}
