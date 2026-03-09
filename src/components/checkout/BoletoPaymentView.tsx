import { Button } from "@/components/ui/button";
import { ArrowLeft, Copy, Check, Loader2, ExternalLink, FileText } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface BoletoPaymentViewProps {
  invoiceUrl?: string;
  bankSlipUrl?: string;
  identificationField?: string;
  dueDate?: string;
  isLoading: boolean;
  onBack: () => void;
}

export function BoletoPaymentView({
  invoiceUrl,
  bankSlipUrl,
  identificationField,
  dueDate,
  isLoading,
  onBack,
}: BoletoPaymentViewProps) {
  const [copied, setCopied] = useState(false);
  const [copiedLine, setCopiedLine] = useState(false);

  const handleCopyLink = async () => {
    const urlToCopy = bankSlipUrl || invoiceUrl;
    if (!urlToCopy) return;

    try {
      await navigator.clipboard.writeText(urlToCopy);
      setCopied(true);
      toast.success("Link copiado!");
      setTimeout(() => setCopied(false), 3000);
    } catch {
      toast.error("Erro ao copiar link");
    }
  };

  const handleOpenBoleto = () => {
    const urlToOpen = bankSlipUrl || invoiceUrl;
    if (urlToOpen) {
      window.open(urlToOpen, "_blank");
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-muted-foreground">Gerando boleto...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Button variant="outline" size="sm" onClick={onBack} className="mb-2">
        <ArrowLeft className="h-4 w-4 mr-2" />
        Voltar
      </Button>

      {dueDate && (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <FileText className="h-4 w-4" />
          <span>Vencimento: {new Date(dueDate).toLocaleDateString("pt-BR")}</span>
        </div>
      )}

      {invoiceUrl || bankSlipUrl ? (
        <div className="flex flex-col items-center gap-4">
          <div className="w-full p-6 rounded-xl bg-muted/50 border text-center space-y-2">
            <div className="flex items-center justify-center w-16 h-16 mx-auto rounded-full bg-muted text-muted-foreground">
              <FileText className="h-8 w-8" />
            </div>
            <h3 className="font-semibold text-lg">Boleto Gerado</h3>
            <p className="text-sm text-muted-foreground">
              Clique no botão abaixo para abrir o boleto
            </p>
          </div>

          {identificationField && (
            <div className="w-full">
              <p className="text-xs text-muted-foreground mb-1.5">Linha digitável:</p>
              <div className="flex items-center gap-2 w-full p-3 bg-muted/50 border rounded-lg">
                <span className="text-xs text-foreground flex-1 select-all font-mono break-all leading-relaxed">
                  {identificationField}
                </span>
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(identificationField);
                      setCopiedLine(true);
                      toast.success("Linha digitável copiada!");
                      setTimeout(() => setCopiedLine(false), 3000);
                    } catch {
                      toast.error("Erro ao copiar");
                    }
                  }}
                  className="shrink-0 p-1.5 rounded-md hover:bg-muted transition-colors"
                  title="Copiar linha digitável"
                >
                  {copiedLine ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
              </div>
            </div>
          )}


          <div className="w-full space-y-3">
            <Button
              onClick={handleOpenBoleto}
              className="w-full gap-2"
              size="lg"
            >
              <ExternalLink className="h-4 w-4" />
              Abrir Boleto
            </Button>
          </div>

          <div className="w-full p-3 bg-gradient-to-r from-gray-800 to-gray-900 rounded-lg">
            <p className="text-center text-sm text-white">
              <Loader2 className="h-4 w-4 animate-spin inline mr-2 text-white" />
              Aguardando confirmação do pagamento...
            </p>
            <p className="text-center text-xs text-white/70 mt-1">
              O pagamento pode levar até 3 dias úteis para ser confirmado
            </p>
          </div>
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          Erro ao gerar boleto. Tente novamente.
        </div>
      )}
    </div>
  );
}
