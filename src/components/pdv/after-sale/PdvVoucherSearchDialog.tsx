import '@/components/pdv/PdvWorkspace.css';
import { useState } from "react";
import { Loader2, Ticket } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SearchField } from "@/components/ui/search-field-actions";
import { usePdvVoucherSearch } from "@/hooks/usePdvAfterSale";

const statusLabel = {
  active: "Disponível",
  exhausted: "Utilizado",
  expired: "Vencido",
  reversed: "Estornado",
} as const;

export function PdvVoucherSearchDialog({
  open,
  onOpenChange,
  customerId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId: string;
}) {
  const [query, setQuery] = useState("");
  const result = usePdvVoucherSearch({ query, customerId, enabled: open });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="pdv-dialog sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Vouchers do cliente</DialogTitle>
          <DialogDescription>
            Consulte o código, saldo e validade sem misturar voucher com fiado.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <SearchField value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar pelo código" aria-label="Buscar vouchers do cliente" />
          {result.isLoading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando vouchers…
            </div>
          ) : result.isError ? (
            <p className="rounded-xl border p-4 text-sm">
              Não foi possível consultar os vouchers.
            </p>
          ) : !result.data?.items.length ? (
          <p className="rounded-xl border bg-background p-4 text-sm text-muted-foreground">
              Nenhum voucher encontrado para este cliente.
            </p>
          ) : (
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {result.data.items.map((item) => (
                <div
                  key={item.voucherId}
                  className="pdv-voucher-record"
                >
                  <div className="pdv-voucher-band"><Ticket className="h-3 w-3" />Crédito da loja</div>
                  <div className="pdv-voucher-record-body">
                  <div>
                    <strong className="font-mono text-sm">
                      {item.publicCode}
                    </strong>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.expiresOn
                        ? `Validade ${new Date(`${item.expiresOn}T12:00:00`).toLocaleDateString("pt-BR")}`
                        : "Sem vencimento"}
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge
                      className={
                        item.status === "active"
                          ? "bg-emerald-600 text-white"
                          : "bg-slate-600 text-white"
                      }
                    >
                      {statusLabel[item.status]}
                    </Badge>
                    <strong className="mt-1 block tabular-nums">
                      {item.balance.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </strong>
                  </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="cancel" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
