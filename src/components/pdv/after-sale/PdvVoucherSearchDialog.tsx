import { useState } from "react";
import { Loader2, Search } from "lucide-react";
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
import { Input } from "@/components/ui/input";
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Vouchers do cliente</DialogTitle>
          <DialogDescription>
            Consulte o código, saldo e validade sem misturar voucher com fiado.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar pelo código"
            />
          </div>
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
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
                >
                  <div>
                    <strong className="font-mono text-sm">
                      {item.publicCode}
                    </strong>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.expiresOn
                        ? `Validade ${new Date(`${item.expiresOn}T12:00:00`).toLocaleDateString("pt-BR")}`
                        : "Sem validade definida"}
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
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
