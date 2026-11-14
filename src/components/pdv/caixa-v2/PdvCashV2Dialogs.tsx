import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { NoticeBanner } from '@/components/ui/NoticeBanner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PdvMoneyInput } from '@/components/pdv/caixa/PdvMoneyInput';
import {
  buildPdvCashEventV2AttemptPayload,
  buildPdvCloseCashV2AttemptPayload,
  buildPdvOpenCashV2AttemptPayload,
  type PdvCashV2AttemptRegistry,
  type PdvCashCloseV2Result,
  type PdvCashV2EventKind,
  type PdvCashV2Session,
  type PdvCashV2Terminal,
} from '@/hooks/usePdvCashSessionsV2';

interface OpenDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  terminals: PdvCashV2Terminal[];
  available: number | null;
  canViewTreasury: boolean;
  cashAccountId: string;
  attemptRegistry: PdvCashV2AttemptRegistry;
  money: (value: number) => string;
  onConfirm: (input: {
    terminalId: string;
    openingAmount: number;
    attemptId: string;
  }) => Promise<void>;
}

export function PdvCashV2OpenDialog({
  open,
  onOpenChange,
  terminals,
  available,
  canViewTreasury,
  cashAccountId,
  attemptRegistry,
  money,
  onConfirm,
}: OpenDialogProps) {
  const [terminalId, setTerminalId] = useState('');
  const [amount, setAmount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTerminalId(terminals[0]?.id ?? '');
    setAmount(0);
    setError(null);
    setSubmitting(false);
  }, [open, terminals]);

  async function submit() {
    if (!terminalId || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload = buildPdvOpenCashV2AttemptPayload({
        terminalId,
        cashAccountId,
        openingAmount: amount,
      });
      const attempt = attemptRegistry.resolve('open', terminalId, payload);
      await onConfirm({ terminalId, openingAmount: amount, attemptId: attempt.key });
      attemptRegistry.complete('open', terminalId, payload);
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível abrir o caixa.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(next) => !submitting && onOpenChange(next)}
      title="Abrir caixa"
      description="O dinheiro inicial fica reservado no cofre da empresa até o fechamento."
      footer={(
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="cancel" disabled={submitting} onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={submitting || !terminalId || amount < 0} onClick={submit}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Abrir caixa
          </Button>
        </div>
      )}
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="pdv-v2-terminal">Caixa</Label>
          <Select value={terminalId} onValueChange={setTerminalId}>
            <SelectTrigger id="pdv-v2-terminal"><SelectValue placeholder="Escolha o caixa" /></SelectTrigger>
            <SelectContent>
              {terminals.map((terminal) => (
                <SelectItem key={terminal.id} value={terminal.id}>{terminal.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            A disponibilidade deste caixa será confirmada ao abrir.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pdv-v2-opening">Dinheiro inicial</Label>
          <PdvMoneyInput id="pdv-v2-opening" value={amount} onChange={setAmount} autoFocus />
          <p className="text-xs text-muted-foreground">
            {canViewTreasury && available !== null
              ? `Disponível no cofre: ${money(available)}.`
              : 'O servidor confere o limite do cofre sem expor o saldo.'}
          </p>
        </div>
        {error ? <NoticeBanner variant="destructive">{error}</NoticeBanner> : null}
      </div>
    </ResponsiveModal>
  );
}

interface EventDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: PdvCashV2EventKind;
  session: PdvCashV2Session | null;
  attemptRegistry: PdvCashV2AttemptRegistry;
  onConfirm: (input: {
    kind: PdvCashV2EventKind;
    amount: number;
    description: string | null;
    notes: string | null;
    attemptId: string;
  }) => Promise<void>;
}

export function PdvCashV2EventDialog({
  open,
  onOpenChange,
  kind,
  session,
  attemptRegistry,
  onConfirm,
}: EventDialogProps) {
  const [amount, setAmount] = useState(0);
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const content = {
    supply: {
      title: 'Adicionar dinheiro',
      description: 'Dinheiro do cofre da empresa entra neste caixa.',
      placeholder: 'Ex.: reforço de troco',
      needsDescription: false,
    },
    withdrawal: {
      title: 'Retirar dinheiro',
      description: 'Dinheiro deste caixa retorna ao cofre da empresa.',
      placeholder: 'Ex.: retirada para o cofre',
      needsDescription: false,
    },
    cash_receipt: {
      title: 'Nova receita',
      description: 'Registre uma entrada recebida em dinheiro neste caixa.',
      placeholder: 'Ex.: recebimento de serviço',
      needsDescription: true,
    },
    cash_payment: {
      title: 'Nova despesa',
      description: 'Registre uma despesa paga em dinheiro por este caixa.',
      placeholder: 'Ex.: material de limpeza',
      needsDescription: true,
    },
  }[kind];

  useEffect(() => {
    if (!open) return;
    setAmount(0);
    setDescription('');
    setNotes('');
    setError(null);
    setSubmitting(false);
  }, [kind, open]);

  async function submit() {
    if (!session || amount <= 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const normalizedNotes = notes.trim() || null;
      const payload = buildPdvCashEventV2AttemptPayload({
        sessionId: session.id,
        cashAccountId: session.cashAccountId,
        kind,
        amount,
        description: description.trim() || null,
        notes: normalizedNotes,
      });
      const scope = `${session.id}:${kind}`;
      const attempt = attemptRegistry.resolve('event', scope, payload);
      await onConfirm({
        kind,
        amount,
        description: description.trim() || null,
        notes: normalizedNotes,
        attemptId: attempt.key,
      });
      attemptRegistry.complete('event', scope, payload);
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível registrar o movimento.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(next) => !submitting && onOpenChange(next)}
      title={content.title}
      description={content.description}
      footer={(
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="cancel" disabled={submitting} onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={submitting || amount <= 0 || !session || (content.needsDescription && !description.trim())} onClick={submit}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Confirmar
          </Button>
        </div>
      )}
    >
      <div className="space-y-4">
        {content.needsDescription ? (
          <div className="space-y-1.5">
            <Label htmlFor="pdv-v2-event-description">Descrição</Label>
            <Textarea
              id="pdv-v2-event-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={content.placeholder}
              rows={2}
            />
          </div>
        ) : null}
        <div className="space-y-1.5">
          <Label htmlFor="pdv-v2-event-amount">Valor</Label>
          <PdvMoneyInput id="pdv-v2-event-amount" value={amount} onChange={setAmount} autoFocus />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pdv-v2-event-notes">Motivo</Label>
          <Textarea
            id="pdv-v2-event-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder={content.needsDescription ? 'Observação opcional' : content.placeholder}
            rows={3}
          />
        </div>
        {error ? <NoticeBanner variant="destructive">{error}</NoticeBanner> : null}
      </div>
    </ResponsiveModal>
  );
}

interface CloseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: PdvCashV2Session | null;
  expectedAmount: number | null;
  money: (value: number) => string;
  attemptRegistry: PdvCashV2AttemptRegistry;
  onConfirm: (input: {
    countedAmount: number;
    notes: string | null;
    attemptId: string;
  }) => Promise<PdvCashCloseV2Result>;
}

export function PdvCashV2CloseDialog({
  open,
  onOpenChange,
  session,
  expectedAmount,
  money,
  attemptRegistry,
  onConfirm,
}: CloseDialogProps) {
  const [counted, setCounted] = useState(0);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const difference = expectedAmount == null ? null : Math.round((counted - expectedAmount) * 100) / 100;

  useEffect(() => {
    if (!open) return;
    setCounted(0);
    setNotes('');
    setError(null);
    setSubmitting(false);
  }, [open]);

  async function submit() {
    if (!session || counted < 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const normalizedNotes = notes.trim() || null;
      const payload = buildPdvCloseCashV2AttemptPayload({
        sessionId: session.id,
        cashAccountId: session.cashAccountId,
        countedAmount: counted,
        notes: normalizedNotes,
      });
      const attempt = attemptRegistry.resolve('close', session.id, payload);
      await onConfirm({
        countedAmount: counted,
        notes: normalizedNotes,
        attemptId: attempt.key,
      });
      attemptRegistry.complete('close', session.id, payload);
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível fechar o caixa.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(next) => !submitting && onOpenChange(next)}
      title="Fechar caixa"
      description="Conte somente o dinheiro físico deste caixa."
      footer={(
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="cancel" disabled={submitting} onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={submitting || counted < 0 || !session || expectedAmount == null} onClick={submit}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Fechar e conferir
          </Button>
        </div>
      )}
    >
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Pix, cartão e transferência não entram nesta contagem.
        </p>
        <div className="grid grid-cols-2 gap-3 border-y py-3 text-sm sm:grid-cols-3">
          <div><span className="block text-xs text-muted-foreground">Dinheiro inicial</span><strong className="tabular-nums">{money(session?.openingAmount ?? 0)}</strong></div>
          <div><span className="block text-xs text-muted-foreground">Esperado agora</span><strong className="tabular-nums">{expectedAmount == null ? 'Carregando…' : money(expectedAmount)}</strong></div>
          <div className="col-span-2 sm:col-span-1"><span className="block text-xs text-muted-foreground">Diferença</span><strong className={difference != null && difference < 0 ? 'tabular-nums text-red-600' : 'tabular-nums'}>{difference == null ? '—' : money(difference)}</strong></div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pdv-v2-counted">Dinheiro contado</Label>
          <PdvMoneyInput id="pdv-v2-counted" value={counted} onChange={setCounted} autoFocus />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pdv-v2-close-notes">Observação</Label>
          <Textarea
            id="pdv-v2-close-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Opcional"
            rows={3}
          />
        </div>
        {error ? <NoticeBanner variant="destructive">{error}</NoticeBanner> : null}
      </div>
    </ResponsiveModal>
  );
}
