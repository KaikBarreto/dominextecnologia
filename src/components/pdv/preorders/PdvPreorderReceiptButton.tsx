import { cartLineGrossCents } from '@/lib/pdv/cart';
import { useDomiLinkReceiptOutput, type PdvReceiptOutput } from '@/hooks/useDomiLinkReceiptOutput';
import { PdvReceiptCompanyTooltip } from '@/components/pdv/receipt/PdvReceiptCompanyTooltip';
import { useState } from "react";
import { assertPdvReceiptOperationCurrent, usePdvReceiptOperation, withPdvReceiptTarget, type PdvReceiptOperationGuard } from "@/hooks/usePdvReceiptOperation";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { usePdvReceiptCompany, PDV_RECEIPT_COMPANY_PENDING } from "@/hooks/usePdvReceiptCompany";
import { fetchPdvPreorderDetail, type PdvPreorderDetail } from "@/hooks/usePdvPreorders";
import { usePdvReceiptSettings } from "@/hooks/usePdvReceiptSettings";
import { resolvePdvReceiptStagePolicy } from "@/lib/pdv/receipt/stagePolicy";
import { readDeviceReceiptFormat } from "@/lib/pdv/receipt/devicePreference";
import {
  generatePdvReceiptPdf,
  preparePdvReceiptSnapshotLogo,
} from "@/lib/pdv/receipt/pdf";
import {
  type PdvReceiptFormat,
  type PdvReceiptSnapshot,
} from "@/lib/pdv/receipt/model";
import { openPdfInTab, openPendingPdfTab } from "@/utils/openPdfInTab";

interface CatalogItem {
  id: string;
  unit: string;
}

interface PdvPreorderReceiptButtonProps {
  preorderId: string;
  customerName?: string | null;
  inventory?: CatalogItem[];
  label?: string;
  className?: string;
  size?: "default" | "sm" | "lg" | "icon";
  appearance?: "button" | "menu-item";
}

export function budgetFilename(number: number, customerName?: string | null): string {
  const customer = customerName?.trim();
  return `Orçamento ${number}${customer ? ` - ${customer}` : ""}`;
}

/** A tela e as vias de impressão usam a mesma composição dos dados salvos. */
export function toPdvPreorderReceiptSnapshot(detail: PdvPreorderDetail, {
  company, customerName, inventory = [],
}: {
  company: PdvReceiptSnapshot["company"];
  customerName?: string | null;
  inventory?: CatalogItem[];
}): PdvReceiptSnapshot {
  const units = new Map(inventory.map((item) => [item.id, item.unit]));
  const items = detail.items.map((item) => {
    const quantity = Number(item.quantity) || 0;
    const unitPrice = item.unit_price ?? 0;
    const discount = Number(item.discount_amount) || 0;
    return {
      description: item.description,
      unit: (item.inventory_id && units.get(item.inventory_id)) || "un",
      quantity,
      unitPrice,
      discount,
      total: Math.max(0, cartLineGrossCents({ quantity, unitPrice }) - Math.round(discount * 100)) / 100,
      pricePending: item.unit_price == null,
    };
  });
  const subtotal = items.reduce(
    (sum, item) => sum + cartLineGrossCents(item),
    0,
  ) / 100;
  const discount =
    items.reduce((sum, item) => sum + item.discount, 0) +
    Number(detail.preorder.discount_amount || 0);
  const resolvedCustomerName = customerName?.trim() || null;

  return {
    documentKind: "budget",
    company,
    order: {
      number: detail.preorder.number,
      issuedAt: detail.preorder.updated_at,
      operatorName: "Atendimento de balcão",
      customerName: resolvedCustomerName,
    },
    items,
    totals: {
      subtotal,
      discount,
      total: detail.preorder.total ?? Math.max(0, Math.round((subtotal - discount) * 100)) / 100,
    },
    payments: [],
    note: detail.preorder.notes,
  };
}

export async function openPdvPreorderReceipt(preorderId: string, {
  company, customerName, inventory = [], format, target, copies = 1, output, ...guard
}: {
  company: PdvReceiptSnapshot["company"] | null;
  customerName?: string | null;
  inventory?: CatalogItem[];
  format: PdvReceiptFormat;
  target?: Window | null;
  copies?: 1 | 2 | 3;
  output?: PdvReceiptOutput;
} & Partial<PdvReceiptOperationGuard>) {
  if (!company) { target?.close(); throw new Error(PDV_RECEIPT_COMPANY_PENDING); }
  await withPdvReceiptTarget(target, guard, async () => {
  const detail = guard.signal ? await fetchPdvPreorderDetail(preorderId, guard.signal) : await fetchPdvPreorderDetail(preorderId);
  assertPdvReceiptOperationCurrent(guard);
  const snapshot = toPdvPreorderReceiptSnapshot(detail, { company, customerName, inventory });
  const prepared = await preparePdvReceiptSnapshotLogo(snapshot);
  assertPdvReceiptOperationCurrent(guard);
  const blob = generatePdvReceiptPdf(prepared, format, { copies });
  const filename = budgetFilename(detail.preorder.number, snapshot.order.customerName);
  if (output) await output(blob, filename, target, guard);
  else openPdfInTab(blob, filename, target);
  });
}

export function usePdvPreorderReceiptOpener(entityId?: string | null) {
  const operation = usePdvReceiptOperation(entityId);
  const company = usePdvReceiptCompany();
  const output = useDomiLinkReceiptOutput();
  return { ...operation, ready: operation.ready && Boolean(company), open: async (preorderId: string, options: Omit<Parameters<typeof openPdvPreorderReceipt>[1], 'company'>) => {
    if (!operation.isCurrent()) { options.target?.close(); return; }
    await operation.run(guard => openPdvPreorderReceipt(preorderId, { output, ...options, company, ...guard }));
  } };
}

export function PdvPreorderReceiptButton({
  preorderId,
  customerName,
  inventory = [],
  label = "Gerar comprovante",
  className,
  size = "sm",
  appearance = "button",
}: PdvPreorderReceiptButtonProps) {
  const { toast } = useToast();
  const receiptSettings = usePdvReceiptSettings();
  const format = readDeviceReceiptFormat() ?? resolvePdvReceiptStagePolicy(receiptSettings.data, "budget").format;
  const opener = usePdvPreorderReceiptOpener(preorderId);
  const [loadingScope, setLoadingScope] = useState<typeof opener.isCurrent | null>(null);
  const loading = loadingScope?.() === true;

  async function open() {
    if (!opener.ready) {
      toast({ title: "Identificação da empresa indisponível", description: PDV_RECEIPT_COMPANY_PENDING });
      return;
    }
    const target = openPendingPdfTab("Gerando comprovante...");
    setLoadingScope(() => opener.isCurrent);
    try {
      await opener.open(preorderId, {
        customerName, inventory, format, target,
      });
    } catch {
      target?.close();
      if (opener.isCurrent()) toast({
        title: "Não foi possível gerar o comprovante",
        description:
          "Tente novamente pelo botão do orçamento.",
        variant: "destructive",
      });
    } finally {
      if (opener.isCurrent()) setLoadingScope(null);
    }
  }

  if (appearance === "menu-item") {
    return (
      <PdvReceiptCompanyTooltip ready={opener.ready} message={PDV_RECEIPT_COMPANY_PENDING}><DropdownMenuItem disabled={loading || !opener.ready} onSelect={() => void open()}>
        <Printer className="mr-2 h-4 w-4" />
        {loading ? "Gerando..." : label}
      </DropdownMenuItem></PdvReceiptCompanyTooltip>
    );
  }

  return (
    <PdvReceiptCompanyTooltip ready={opener.ready} message={PDV_RECEIPT_COMPANY_PENDING}><Button
      type="button"
      variant="outline"
      size={size}
      className={className}
      disabled={loading || !opener.ready}
      onClick={() => void open()}
    >
      <Printer className="h-4 w-4" />
      {loading ? "Gerando..." : label}
    </Button></PdvReceiptCompanyTooltip>
  );
}
