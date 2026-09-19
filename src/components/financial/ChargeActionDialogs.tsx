/**
 * Diálogos de EDITAR e EXCLUIR cobrança + a faixa de aviso do financeiro.
 *
 * Renderizados uma vez por tela (são portais) e alimentados pelo estado do
 * `useChargeActions`. Vivem aqui, e não dentro de cada tela, para a Central de
 * Cobranças e a ficha do cliente mostrarem exatamente o mesmo formulário e a
 * mesma confirmação — inclusive a copy.
 */
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { formatBRL } from '@/utils/currency';
import { readPastedCents } from '@/lib/money-paste-mask';
import type { ChargeActions } from './useChargeActions';

/**
 * Faixa persistente de "o lançamento no financeiro ficou para trás".
 * Fica no topo da lista (não é dialog) e só some quando o usuário dispensa.
 */
export function ChargeFinanceWarningBanner({ actions }: { actions: ChargeActions }) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.charges.central;
  if (!actions.warningBanner) return null;
  return (
    <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2.5">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm font-medium text-foreground">{t.financeWarning.title}</p>
        <p className="whitespace-pre-line text-xs text-muted-foreground">{actions.warningBanner}</p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0"
        onClick={actions.dismissWarning}
        aria-label={t.financeWarning.dismiss}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

/**
 * Modal de edição + confirmação de exclusão. Renderizar UMA vez por tela,
 * fora da lista (são portais).
 */
export function ChargeActionDialogs({ actions }: { actions: ChargeActions }) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.charges.central;
  const { update, remove } = actions;

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    actions.setEditAmount(parseInt(raw || '0', 10) / 100);
  };
  // Colar um valor pronto (ex. "4.550" de planilha) NÃO passa pela regra de
  // centavos comum: daria R$ 45,50 (100x menor). Ver `money-paste-mask.ts`.
  const handleAmountPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const cents = readPastedCents(e);
    if (cents != null) actions.setEditAmount(cents / 100);
  };
  const amountDisplay = actions.editAmount
    ? actions.editAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '';

  // Confirmação NOMEIA o que será excluído (descrição + valor), em vez de
  // perguntar "excluir cobrança?" sem dizer qual.
  const deleteTargetLabel = actions.deleteTarget
    ? `${actions.deleteTarget.description?.trim() || t.noDescription} · ${formatBRL(actions.deleteTarget.value)}`
    : '';

  return (
    <>
      {/* ── Editar cobrança (valor, vencimento, descrição) — só PENDING/OVERDUE ── */}
      <ResponsiveModal
        open={!!actions.editTarget}
        onOpenChange={(open) => !open && actions.closeEditDialog()}
        title={t.editDialog.title}
        description={t.editDialog.description}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={actions.closeEditDialog} disabled={update.isPending}>
              {t.editDialog.cancel}
            </Button>
            <Button onClick={actions.submitEdit} disabled={update.isPending}>
              {update.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t.editDialog.submitting}
                </>
              ) : (
                t.editDialog.submit
              )}
            </Button>
          </div>
        }
      >
        <div className="space-y-4 px-4 pb-4 sm:px-1">
          {/* Valor (máscara de dinheiro — NÃO NumericInput, é campo monetário) */}
          <div className="space-y-2">
            <Label htmlFor="edit-charge-amount" className="text-sm font-medium">
              {t.editDialog.fields.value}
            </Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                R$
              </span>
              <Input
                id="edit-charge-amount"
                className="pl-9"
                inputMode="numeric"
                placeholder={t.editDialog.fields.valuePlaceholder}
                value={amountDisplay}
                onChange={handleAmountChange}
                onPaste={handleAmountPaste}
              />
            </div>
          </div>

          {/* Vencimento */}
          <div className="space-y-2">
            <Label htmlFor="edit-charge-due" className="text-sm font-medium">
              {t.editDialog.fields.dueDate}
            </Label>
            <Input
              id="edit-charge-due"
              type="date"
              value={actions.editDueDate}
              onChange={(e) => actions.setEditDueDate(e.target.value)}
            />
          </div>

          {/* Descrição */}
          <div className="space-y-2">
            <Label htmlFor="edit-charge-desc" className="text-sm font-medium">
              {t.editDialog.fields.description}
            </Label>
            <Textarea
              id="edit-charge-desc"
              rows={2}
              placeholder={t.editDialog.fields.descriptionPlaceholder}
              value={actions.editDescription}
              onChange={(e) => actions.setEditDescription(e.target.value)}
            />
          </div>
        </div>
      </ResponsiveModal>

      {/* ── Confirmação de exclusão individual ──────────────────────────────── */}
      <AlertDialog open={!!actions.deleteTarget} onOpenChange={(open) => !open && actions.cancelDelete()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.deleteDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="block font-medium text-foreground">{deleteTargetLabel}</span>
              <span className="mt-1 block">{t.deleteDialog.description}</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={actions.cancelDelete}>
              {t.deleteDialog.cancel}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={actions.confirmDelete}
              disabled={remove.isPending}
            >
              {t.deleteDialog.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
