import '@/components/pdv/PdvWorkspace.css';
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Repeat2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  usePdvCoverExchange,
  type PdvAfterSaleAttempt,
  type PdvAfterSaleReturn,
  type PdvAfterSaleWorkspace,
} from "@/hooks/usePdvAfterSale";
import {
  formatPdvMoneyCents,
  parsePdvMoneyText,
  pdvMoneyCentsFromNumber,
  pdvMoneyInputFromCents,
} from "@/lib/pdv/afterSaleMoney";
import { normalizePdvExchangeDifference } from "./exchangeDifference";

const methods = [
  { value: "dinheiro", label: "Dinheiro" },
  { value: "pix", label: "Pix" },
  { value: "transferencia", label: "Transferência" },
  { value: "debito", label: "Cartão de débito" },
  { value: "credito", label: "Cartão de crédito" },
  { value: "fiado", label: "Fiado aprovado" },
];

export function PdvExchangeDialog({
  open,
  onOpenChange,
  orderId,
  entry,
  workspace,
  canApproveCredit,
  getAttempt,
  onCompleted,
  isCurrent = () => true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  entry: PdvAfterSaleReturn;
  workspace: PdvAfterSaleWorkspace;
  canApproveCredit: boolean;
  getAttempt: (key: string, signature: string) => PdvAfterSaleAttempt;
  onCompleted: () => void;
  isCurrent?: () => boolean;
}) {
  const { toast } = useToast();
  const mutation = usePdvCoverExchange();
  const [candidateId, setCandidateId] = useState("");
  const [voucherId, setVoucherId] = useState("none");
  const [voucherAmount, setVoucherAmount] = useState("0");
  const [creditAmount, setCreditAmount] = useState("0");
  const [differenceMethod, setDifferenceMethod] = useState("");
  const [optionId, setOptionId] = useState("");
  const candidate =
    workspace.exchangeCandidates.find((item) => item.orderId === candidateId) ??
    null;
  const voucher =
    entry.vouchers.find((item) => item.voucherId === voucherId) ?? null;
  const candidateCents = candidate
    ? pdvMoneyCentsFromNumber(candidate.total)
    : null;
  const voucherBalanceCents = voucher
    ? pdvMoneyCentsFromNumber(voucher.balance)
    : 0;
  const voucherLimitCents =
    candidateCents === null || voucherBalanceCents === null
      ? null
      : Math.min(candidateCents, voucherBalanceCents);
  const parsedVoucher =
    voucherLimitCents === null
      ? null
      : parsePdvMoneyText(voucherAmount, {
          minCents: 0,
          maxCents: voucher ? voucherLimitCents : 0,
        });
  const parsedCredit =
    candidateCents === null
      ? null
      : parsePdvMoneyText(creditAmount, {
          minCents: 0,
          maxCents: candidateCents,
        });
  const allocatedCents =
    parsedVoucher && parsedCredit
      ? parsedVoucher.cents + parsedCredit.cents
      : null;
  const differenceCents =
    candidateCents !== null &&
    allocatedCents !== null &&
    allocatedCents <= candidateCents
      ? candidateCents - allocatedCents
      : null;
  const normalizedDifference = normalizePdvExchangeDifference({
    differenceCents,
    differenceMethod,
    optionId,
    cashOptions: workspace.cashOptions,
    canApproveCredit,
  });
  const options =
    normalizedDifference.differenceMethod === "dinheiro"
      ? workspace.cashOptions.filter(item => item.sessionId === candidate?.targetCashSessionId).map((item) => ({
          id: item.sessionId,
          label: item.label,
        }))
      : ["pix", "transferencia"].includes(
            normalizedDifference.differenceMethod ?? "",
          )
        ? workspace.accountOptions.map((item) => ({
            id: item.accountId,
            label: item.label,
          }))
        : [];
  const valid = Boolean(
    candidate?.targetCashSessionId && candidate.targetTerminalId && candidate.targetCashAccountId && candidate.couponRevision !== undefined && parsedVoucher && parsedCredit && normalizedDifference.valid && isCurrent()
      && (normalizedDifference.differenceMethod !== "dinheiro" || normalizedDifference.cashSessionId === candidate.targetCashSessionId),
  );
  const signature = useMemo(
    () =>
      JSON.stringify({
        returnId: entry.returnId,
        candidateId,
        targetCashSessionId: candidate?.targetCashSessionId,
        ...(candidate?.couponRevision && candidate.couponRevision > 0 ? { couponRevision: candidate.couponRevision } : {}),
        voucherId: voucher?.voucherId ?? null,
        voucherAmount: parsedVoucher?.decimal ?? null,
        creditAmount: parsedCredit?.decimal ?? null,
        differenceMethod: normalizedDifference.differenceMethod,
        differenceAccountId: normalizedDifference.differenceAccountId,
        cashSessionId: normalizedDifference.cashSessionId,
      }),
    [
      candidateId,
      candidate?.couponRevision,
      candidate?.targetCashSessionId,
      entry.returnId,
      normalizedDifference.cashSessionId,
      normalizedDifference.differenceAccountId,
      normalizedDifference.differenceMethod,
      parsedCredit?.decimal,
      parsedVoucher?.decimal,
      voucher?.voucherId,
    ],
  );
  const contextSignature = JSON.stringify([open, orderId, entry.returnId, candidateId, candidate?.targetCashSessionId, candidate?.couponRevision, isCurrent()]);
  const current = useRef<{ signature: string; mounted: boolean } | null>(null);
  if (!current.current || current.current.signature !== contextSignature) current.current = { signature: contextSignature, mounted: true };
  const token = current.current;
  useEffect(() => { token.mounted = true; return () => { token.mounted = false; }; }, [token]);
  const canComplete = () => open && token.mounted && current.current === token && isCurrent();
  async function submit() {
    if (!candidate || !parsedVoucher || !parsedCredit || !valid || !canComplete()) return;
    const attempt = getAttempt(`exchange:${entry.returnId}`, signature);
    try {
      const result = await mutation.mutateAsync({
        orderId,
        returnId: entry.returnId,
        newOrderId: candidate.orderId,
        voucherId: voucher?.voucherId ?? null,
        voucherAmount: parsedVoucher.decimal,
        creditAmount: parsedCredit.decimal,
        differenceMethod: normalizedDifference.differenceMethod,
        differenceAccountId: normalizedDifference.differenceAccountId,
        cashSessionId: normalizedDifference.cashSessionId,
        attemptId: attempt.id,
        targetCashSessionId: candidate.targetCashSessionId,
        ...(candidate.couponRevision === undefined ? {} : { couponRevision: candidate.couponRevision }),
      });
      if (!canComplete()) return;
      const status = result && typeof result === 'object' && 'status' in result ? result.status : null;
      toast({
        title: "Troca concluída",
        description: status === 'entregue' ? `Pedido #${candidate.orderNumber} entregue no caixa.`
          : status === 'liberado_retirada' ? `Pedido #${candidate.orderNumber} liberado para retirada.`
            : `Troca registrada no pedido #${candidate.orderNumber}. Consulte o pedido para acompanhar a retirada.`,
      });
      onCompleted();
      onOpenChange(false);
    } catch (error) {
      if (!canComplete()) return;
      toast({
        title: "Troca não concluída",
        description:
          error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="pdv-dialog max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Usar devolução em troca</DialogTitle>
          <DialogDescription>
            Use saldo ou voucher da devolução em um pedido do cliente.
          </DialogDescription>
        </DialogHeader>
        <div className="pdv-form-section grid gap-4 py-2 sm:grid-cols-2">
          <div className="grid gap-2 sm:col-span-2">
            <Label>Novo pedido</Label>
            <Select value={candidateId} onValueChange={setCandidateId}>
              <SelectTrigger>
                <SelectValue placeholder="Escolha o pedido do cliente" />
              </SelectTrigger>
              <SelectContent>
                {workspace.exchangeCandidates.map((item) => (
                  <SelectItem key={item.orderId} value={item.orderId}>
                    Pedido #{item.orderNumber} ·{" "}
                    {item.total.toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {candidate && <p className="text-sm sm:col-span-2">{candidate.targetCashSessionId
            ? `Caixa de destino: ${candidate.targetCashLabel}. Esta abertura receberá o novo pedido, inclusive quando a troca não tiver diferença em dinheiro.`
            : 'O caixa de destino não possui uma abertura disponível para seu perfil. Atualize o pós-venda antes de concluir a troca.'}</p>}
          <div className="grid gap-2">
            <Label>Voucher</Label>
            <Select
              value={voucherId}
              onValueChange={(value) => {
                setVoucherId(value);
                const selected = entry.vouchers.find(
                  (item) => item.voucherId === value,
                );
                const selectedCents = selected
                  ? pdvMoneyCentsFromNumber(selected.balance)
                  : null;
                const totalCents = candidate
                  ? pdvMoneyCentsFromNumber(candidate.total)
                  : null;
                setVoucherAmount(
                  selectedCents !== null && totalCents !== null
                    ? pdvMoneyInputFromCents(
                        Math.min(selectedCents, totalCents),
                      )
                    : "0",
                );
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem voucher</SelectItem>
                {entry.vouchers
                  .filter(
                    (item) =>
                      item.status === "active" &&
                      (pdvMoneyCentsFromNumber(item.balance) ?? 0) > 0,
                  )
                  .map((item) => (
                    <SelectItem key={item.voucherId} value={item.voucherId}>
                      {item.publicCode} ·{" "}
                      {item.balance.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="exchange-voucher">Valor do voucher</Label>
            <Input
              id="exchange-voucher"
              inputMode="decimal"
              disabled={!voucher}
              value={voucherAmount}
              onChange={(event) => setVoucherAmount(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="exchange-credit">Saldo do cliente</Label>
            <Input
              id="exchange-credit"
              inputMode="decimal"
              value={creditAmount}
              onChange={(event) => setCreditAmount(event.target.value)}
            />
          </div>
        <div className="rounded-xl border bg-background p-3">
            <span className="text-xs text-muted-foreground">Diferença</span>
            <strong className="block text-lg tabular-nums">
              {differenceCents === null
                ? "—"
                : formatPdvMoneyCents(differenceCents)}
            </strong>
          </div>
          {differenceCents !== null && differenceCents > 0 && (
            <>
              <div className="grid gap-2">
                <Label>Forma da diferença</Label>
                <Select
                  value={differenceMethod}
                  onValueChange={(value) => {
                    setDifferenceMethod(value);
                    setOptionId("");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha" />
                  </SelectTrigger>
                  <SelectContent>
                    {methods
                      .filter(
                        (item) => item.value !== "fiado" || canApproveCredit,
                      )
                      .map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              {normalizedDifference.needsOption && (
                <div className="grid gap-2">
                  <Label>Gaveta ou conta</Label>
                  <Select value={optionId} onValueChange={setOptionId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Escolha" />
                    </SelectTrigger>
                    <SelectContent>
                      {options.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          )}
        </div>
        {differenceCents !== null && differenceCents > 0 && differenceMethod === 'fiado' && <p className="text-sm text-muted-foreground">Na troca, o fiado da diferença vence em um mês. Para usar fiado sem vencimento, conclua o novo pedido no caixa.</p>}
        <DialogFooter>
          <Button variant="cancel" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={!valid || mutation.isPending}
            onClick={() => void submit()}
          >
            {mutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Repeat2 className="mr-2 h-4 w-4" />
            )}
            Confirmar troca
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
