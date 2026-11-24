import { PdvReceiptCompanyTooltip } from '@/components/pdv/receipt/PdvReceiptCompanyTooltip';
import { useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { usePdvReceiptCompany, PDV_RECEIPT_COMPANY_PENDING } from "@/hooks/usePdvReceiptCompany";
import { fetchPdvPreorderDetail } from "@/hooks/usePdvPreorders";
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

export async function openPdvPreorderReceipt(preorderId: string, {
  company, customerName, inventory = [], format, target, copies = 1,
}: {
  company: PdvReceiptSnapshot["company"] | null;
  customerName?: string | null;
  inventory?: CatalogItem[];
  format: PdvReceiptFormat;
  target?: Window | null;
  copies?: 1 | 2 | 3;
}) {
  if (!company) { target?.close(); throw new Error(PDV_RECEIPT_COMPANY_PENDING); }
  const detail = await fetchPdvPreorderDetail(preorderId);
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
      total: Math.max(0, quantity * unitPrice - discount),
      pricePending: item.unit_price == null,
    };
  });
  const subtotal = items.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0,
  );
  const discount =
    items.reduce((sum, item) => sum + item.discount, 0) +
    Number(detail.preorder.discount_amount || 0);
  const resolvedCustomerName = customerName?.trim() || null;

  const snapshot: PdvReceiptSnapshot = {
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
      total: Math.max(0, subtotal - discount),
    },
    payments: [],
    note: detail.preorder.notes,
  };
  const prepared = await preparePdvReceiptSnapshotLogo(snapshot);
  openPdfInTab(
    generatePdvReceiptPdf(prepared, format, { copies }),
    budgetFilename(detail.preorder.number, resolvedCustomerName),
    target,
  );
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
  const company = usePdvReceiptCompany();
  const [loading, setLoading] = useState(false);

  async function open() {
    if (!company) {
      toast({ title: "Identificação da empresa indisponível", description: PDV_RECEIPT_COMPANY_PENDING });
      return;
    }
    const target = openPendingPdfTab("Gerando comprovante...");
    setLoading(true);
    try {
      await openPdvPreorderReceipt(preorderId, {
        company, customerName, inventory, format, target,
      });
    } catch {
      target?.close();
      toast({
        title: "Não foi possível gerar o comprovante",
        description:
          "Tente novamente pelo botão do orçamento.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  if (appearance === "menu-item") {
    return (
      <PdvReceiptCompanyTooltip ready={!!company} message={PDV_RECEIPT_COMPANY_PENDING}><DropdownMenuItem disabled={loading || !company} onSelect={() => void open()}>
        <Printer className="mr-2 h-4 w-4" />
        {loading ? "Gerando..." : label}
      </DropdownMenuItem></PdvReceiptCompanyTooltip>
    );
  }

  return (
    <PdvReceiptCompanyTooltip ready={!!company} message={PDV_RECEIPT_COMPANY_PENDING}><Button
      type="button"
      variant="outline"
      size={size}
      className={className}
      disabled={loading || !company}
      onClick={() => void open()}
    >
      <Printer className="h-4 w-4" />
      {loading ? "Gerando..." : label}
    </Button></PdvReceiptCompanyTooltip>
  );
}
