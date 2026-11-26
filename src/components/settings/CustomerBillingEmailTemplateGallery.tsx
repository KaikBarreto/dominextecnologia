import { useState } from "react";
import {
  Building2,
  Check,
  Copy,
  CreditCard,
  Eye,
  ReceiptText,
} from "lucide-react";
import dominexLogoWhite from "@/assets/logo-white-horizontal.png";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { CustomerBillingEmailTemplate } from "@/hooks/useCustomerBillingEmails";

const TEMPLATES: Array<{
  id: CustomerBillingEmailTemplate;
  name: string;
  description: string;
}> = [
  {
    id: "classic_light",
    name: "Clássico claro",
    description: "Sóbrio, limpo e fácil de ler.",
  },
  {
    id: "brand_light",
    name: "Marca clara",
    description: "Cabeçalho com destaque de cor.",
  },
  {
    id: "premium_dark",
    name: "Premium escuro",
    description: "Visual sofisticado inspirado na OS.",
  },
  {
    id: "bento_gray",
    name: "Bento grafite",
    description: "Resumo financeiro em blocos de leitura rápida.",
  },
];

function CompanyMark({
  surface = false,
  inverse = false,
}: {
  surface?: boolean;
  inverse?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center",
        surface
          ? "rounded-lg bg-zinc-100 text-zinc-800"
          : inverse
            ? "text-white"
            : "text-zinc-700",
      )}
    >
      <Building2 className="h-4 w-4" aria-hidden="true" />
    </div>
  );
}

function TemplateCanvas({
  template,
  compact = false,
}: {
  template: CustomerBillingEmailTemplate;
  compact?: boolean;
}) {
  const isBento = template === "bento_gray";
  const isDark = template === "premium_dark" || isBento;
  const isBrand = template === "brand_light";

  return (
    <div
      className={cn(
        "overflow-hidden text-left",
        compact
          ? "h-36 rounded-lg"
          : "mx-auto w-full max-w-[620px] rounded-2xl shadow-2xl",
        isBento
          ? "bg-zinc-900 text-white"
          : isDark
            ? "bg-slate-900 text-white"
            : "bg-white text-zinc-900",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-3",
          compact ? "px-3 py-2.5" : "px-7 py-6",
          template === "premium_dark" &&
            "bg-gradient-to-br from-zinc-950 to-zinc-800",
          isBento && "bg-zinc-800",
          isBrand && "bg-zinc-950 text-white",
        )}
      >
        <CompanyMark surface={isDark} inverse={isBrand} />
        <div className="min-w-0">
          <p
            className={cn(
              "truncate font-bold",
              compact ? "text-[9px]" : "text-lg",
            )}
          >
            Clima Sul Refrigeração
          </p>
          <p
            className={cn(
              "truncate opacity-75",
              compact ? "text-[7px]" : "mt-1 text-[11px]",
            )}
          >
            CNPJ 12.345.678/0001-90 · financeiro@climasul.com.br
          </p>
        </div>
      </div>

      {template === "classic_light" && <div className="h-1 bg-blue-600" />}

      <div className={cn(compact ? "px-3 py-2.5" : "px-8 py-7")}>
        <p
          className={cn(
            "font-extrabold uppercase tracking-widest text-blue-600",
            compact ? "text-[6px]" : "text-[10px]",
          )}
        >
          Nova cobrança
        </p>
        <p
          className={cn(
            "font-extrabold",
            compact ? "mt-1 text-[11px]" : "mt-2 text-2xl",
          )}
        >
          Sua cobrança foi gerada
        </p>
        {!compact && (
          <p
            className={cn(
              "mt-2 text-sm leading-6",
              isDark ? "text-slate-300" : "text-zinc-600",
            )}
          >
            Olá, Maria. A Clima Sul gerou uma nova cobrança para você.
          </p>
        )}

        {isBento ? (
          <div
            className={cn(
              "overflow-hidden bg-zinc-800/70",
              compact ? "mt-2 rounded-md" : "mt-5 rounded-xl",
            )}
          >
            <div className={compact ? "px-2 py-1.5" : "px-4 py-3.5"}>
              <span
                className={cn(
                  "block font-bold uppercase tracking-wider text-zinc-400",
                  compact ? "text-[6px]" : "text-[10px]",
                )}
              >
                Valor
              </span>
              <span
                className={cn(
                  "block font-extrabold tabular-nums text-white",
                  compact ? "mt-0.5 text-[10px]" : "mt-1 text-3xl",
                )}
              >
                R$ 1.234,50
              </span>
            </div>
            {!compact && (
              <>
                <div className="grid grid-cols-2 border-t border-zinc-700/80">
                  <div className="px-4 py-3">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                      Vencimento
                    </span>
                    <span className="mt-1 block text-sm font-bold tabular-nums">
                      30/11/2026
                    </span>
                  </div>
                  <div className="border-l border-zinc-700/80 px-4 py-3">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                      Pagamento
                    </span>
                    <span className="mt-1 block text-sm font-bold">Pix</span>
                  </div>
                </div>
                <div className="border-t border-zinc-700/80 px-4 py-3">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                    Descrição
                  </span>
                  <span className="mt-1 block text-sm font-bold text-zinc-200">
                    Manutenção preventiva do sistema
                  </span>
                </div>
              </>
            )}
          </div>
        ) : (
          <div
            className={cn(
              "border",
              compact
                ? "mt-2 rounded-md px-2 py-1.5"
                : "mt-5 rounded-xl px-4 py-2.5",
              isDark
                ? "border-slate-800 bg-slate-800/45"
                : "border-zinc-100 bg-zinc-50/50",
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <span
                className={cn(
                  isDark ? "text-slate-400" : "text-zinc-500",
                  compact ? "text-[7px]" : "text-xs",
                )}
              >
                Valor
              </span>
              <span
                className={cn("font-bold", compact ? "text-[8px]" : "text-sm")}
              >
                R$ 1.234,50
              </span>
            </div>
            {!compact && (
              <div
                className={cn(
                  "mt-2 flex items-center justify-between border-t pt-2",
                  isDark ? "border-slate-800" : "border-zinc-100",
                )}
              >
                <span
                  className={cn(
                    isDark ? "text-slate-400" : "text-zinc-500",
                    "text-xs",
                  )}
                >
                  Vencimento
                </span>
                <span className="text-sm font-bold">30/11/2026</span>
              </div>
            )}
          </div>
        )}

        {!compact && (
          <div
            className={cn(
              "mt-4 rounded-xl px-3.5 py-3",
              isBento
                ? "bg-zinc-800/70"
                : isDark
                  ? "border border-slate-800 bg-slate-800/35"
                  : "border border-zinc-100 bg-zinc-50/45",
            )}
          >
            <span
              className={cn(
                "block text-[10px] font-bold uppercase tracking-wider",
                isDark ? "text-slate-400" : "text-zinc-500",
              )}
            >
              Pix copia e cola
            </span>
            <span
              className={cn(
                "mt-1.5 block break-all text-[11px] leading-4",
                isDark ? "text-slate-300" : "text-zinc-600",
              )}
            >
              00020101021226850014br.gov.bcb.pix…530398654071234.50
            </span>
            <div className="mt-2 flex justify-end">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-bold",
                  isDark
                    ? "bg-zinc-200 text-zinc-900"
                    : "bg-zinc-100 text-zinc-800",
                )}
              >
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                Copiar código Pix
              </span>
            </div>
          </div>
        )}

        {!compact && (
          <div className="mt-5 flex flex-wrap gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-2 rounded-xl px-5 py-3.5 text-[15px] font-bold",
                "bg-blue-600 text-white",
              )}
            >
              <CreditCard className="h-4 w-4" aria-hidden="true" />
              Pagar agora
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-2 rounded-xl border px-5 py-[13px] text-[15px] font-bold",
                isDark
                  ? "border-zinc-600 bg-zinc-800 text-zinc-100"
                  : "border-blue-600 text-blue-600",
              )}
            >
              <ReceiptText className="h-4 w-4" aria-hidden="true" />
              Abrir boleto
            </span>
          </div>
        )}
      </div>

      {!compact && (
        <div className="border-t border-slate-700 bg-zinc-950 px-8 py-5 text-center">
          <img
            src={dominexLogoWhite}
            alt="Dominex"
            className="mx-auto h-5 w-auto max-w-[112px] object-contain"
          />
          <p className="mt-1 text-[10px] text-slate-400">www.dominex.app</p>
        </div>
      )}
    </div>
  );
}

interface CustomerBillingEmailTemplateGalleryProps {
  value: CustomerBillingEmailTemplate;
  onChange: (value: CustomerBillingEmailTemplate) => void;
  disabled?: boolean;
}

export function CustomerBillingEmailTemplateGallery({
  value,
  onChange,
  disabled = false,
}: CustomerBillingEmailTemplateGalleryProps) {
  const [preview, setPreview] = useState<CustomerBillingEmailTemplate | null>(
    null,
  );
  const previewTemplate = TEMPLATES.find((item) => item.id === preview);

  return (
    <div className="space-y-3 [--primary:0_0%_10%] [--primary-foreground:0_0%_100%] [--ring:0_0%_10%] dark:[--primary:0_0%_88%] dark:[--primary-foreground:0_0%_8%] dark:[--ring:0_0%_70%]">
      <div>
        <p className="text-xs font-semibold">Aparência do e-mail</p>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          O modelo vale para todos os eventos. Logo, dados e cores são
          preenchidos com a configuração da empresa.
        </p>
      </div>

      <div
        role="radiogroup"
        aria-label="Modelo do e-mail"
        className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"
      >
        {TEMPLATES.map((template) => {
          const selected = template.id === value;
          return (
            <div
              key={template.id}
              className={cn(
                "relative overflow-hidden rounded-xl border bg-background transition-colors",
                selected
                  ? "border-primary ring-2 ring-primary/15"
                  : "border-border hover:border-foreground/25",
                disabled && "opacity-60",
              )}
            >
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled}
                onClick={() => onChange(template.id)}
                className="block w-full p-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:cursor-not-allowed"
              >
                <TemplateCanvas template={template.id} compact />
                <div className="flex items-start justify-between gap-2 px-1 pb-1 pt-3">
                  <div>
                    <p className="text-xs font-semibold">
                      {template.name}
                      {template.id === "classic_light" && (
                        <span className="ml-1 font-normal text-muted-foreground">
                          (padrão)
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">
                      {template.description}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                      selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground/30",
                    )}
                  >
                    {selected && (
                      <Check className="h-3 w-3" aria-hidden="true" />
                    )}
                  </span>
                </div>
              </button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mx-2 mb-2 h-8 w-[calc(100%_-_1rem)] justify-center text-xs"
                onClick={() => setPreview(template.id)}
              >
                <Eye className="mr-1.5 h-3.5 w-3.5" />
                Ver prévia
              </Button>
            </div>
          );
        })}
      </div>

      <Dialog
        open={preview !== null}
        onOpenChange={(open) => !open && setPreview(null)}
      >
        <DialogContent className="max-w-3xl overflow-y-auto p-0 sm:max-h-[90vh]">
          <DialogHeader className="border-b px-5 py-4 pr-28 text-left sm:px-6">
            <DialogTitle>
              {previewTemplate?.name ?? "Prévia do e-mail"}
            </DialogTitle>
            <DialogDescription>
              Exemplo com dados ilustrativos. O envio real usa a identidade e os
              dados habilitados nos documentos da empresa.
            </DialogDescription>
          </DialogHeader>
          <div
            className={cn(
              "p-4 sm:p-8",
              preview === "premium_dark" || preview === "bento_gray"
                ? "bg-zinc-950"
                : "bg-zinc-100",
            )}
          >
            {preview && <TemplateCanvas template={preview} />}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
