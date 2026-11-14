import { useMemo, useState } from "react";
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  entry: PdvAfterSaleReturn;
  workspace: PdvAfterSaleWorkspace;
  canApproveCredit: boolean;
  getAttempt: (key: string, signature: string) => PdvAfterSaleAttempt;
  onCompleted: () => void;
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
      ? workspace.cashOptions.map((item) => ({
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
    candidate && parsedVoucher && parsedCredit && normalizedDifference.valid,
  );
  const signature = useMemo(
    () =>
      JSON.stringify({
        returnId: entry.returnId,
        candidateId,
        voucherId: voucher?.voucherId ?? null,
        voucherAmount: parsedVoucher?.decimal ?? null,
        creditAmount: parsedCredit?.decimal ?? null,
        differenceMethod: normalizedDifference.differenceMethod,
        differenceAccountId: normalizedDifference.differenceAccountId,
        cashSessionId: normalizedDifference.cashSessionId,
      }),
    [
      candidateId,
      entry.returnId,
      normalizedDifference.cashSessionId,
      normalizedDifference.differenceAccountId,
      normalizedDifference.differenceMethod,
      parsedCredit?.decimal,
      parsedVoucher?.decimal,
      voucher?.voucherId,
    ],
  );
  async function submit() {
    if (!candidate || !parsedVoucher || !parsedCredit || !valid) return;
    const attempt = getAttempt(`exchange:${entry.returnId}`, signature);
    try {
      await mutation.mutateAsync({
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
      });
      toast({
        title: "Troca valorizada",
        description: `O pedido #${candidate.orderNumber} foi ligado à devolução e liberado conforme as coberturas.`,
      });
      onCompleted();
      onOpenChange(false);
    } catch (error) {
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Usar devolução em troca</DialogTitle>
          <DialogDescription>
            A troca cria um novo pedido. A venda e a devolução originais
            permanecem no histórico.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2 sm:grid-cols-2">
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
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
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
