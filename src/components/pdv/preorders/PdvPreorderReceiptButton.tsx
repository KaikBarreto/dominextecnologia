import { useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { fetchPdvPreorderDetail } from "@/hooks/usePdvPreorders";
import { fetchPdvOrderReceiptSnapshot } from "@/hooks/usePdvOrderReceiptSnapshot";
import {
  generatePdvReceiptPdf,
  preparePdvReceiptSnapshotLogo,
} from "@/lib/pdv/receipt/pdf";
import {
  receiptFilename,
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
  const { settings } = useCompanySettings();
  const [loading, setLoading] = useState(false);

  async function open() {
    const target = openPendingPdfTab("Gerando comprovante...");
    setLoading(true);
    try {
      const detail = await fetchPdvPreorderDetail(preorderId);
      if (detail.preorder.converted_order_id) {
        const savedSnapshot = await fetchPdvOrderReceiptSnapshot(
          detail.preorder.converted_order_id,
        );
        const snapshot = await preparePdvReceiptSnapshotLogo(savedSnapshot);
        openPdfInTab(
          generatePdvReceiptPdf(snapshot, "a4"),
          receiptFilename(snapshot, "a4"),
          target,
        );
        return;
      }

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
      const logoUrl = settings?.white_label_enabled
        ? settings.white_label_logo_url || settings.logo_url
        : settings?.logo_url;
      const snapshot: PdvReceiptSnapshot = {
        documentKind: "budget",
        company: {
          name: settings?.name || "Empresa",
          document: settings?.document,
          address:
            [
              settings?.address,
              settings?.address_number,
              settings?.city,
              settings?.state,
            ]
              .filter(Boolean)
              .join(", ") || null,
          phone: settings?.phone,
          logoUrl,
          timeZone: settings?.timezone,
          whiteLabelEnabled: settings?.white_label_enabled === true,
        },
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
        generatePdvReceiptPdf(prepared, "a4"),
        budgetFilename(detail.preorder.number, resolvedCustomerName),
        target,
      );
    } catch (error) {
      target?.close();
      toast({
        title: "Não foi possível gerar o comprovante",
        description:
          error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  if (appearance === "menu-item") {
    return (
      <DropdownMenuItem disabled={loading} onSelect={() => void open()}>
        <Printer className="mr-2 h-4 w-4" />
        {loading ? "Gerando..." : label}
      </DropdownMenuItem>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      className={className}
      disabled={loading}
      onClick={() => void open()}
    >
      <Printer className="h-4 w-4" />
      {loading ? "Gerando..." : label}
    </Button>
  );
}
