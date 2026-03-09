import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Copy, Check, Loader2, Clock } from "lucide-react";
import { toast } from "sonner";

interface PixPaymentViewProps {
  pixQrCode?: string;
  pixCopyPaste?: string;
  pixExpirationDate?: string;
  isLoading: boolean;
  onBack: () => void;
}

export function PixPaymentView({
  pixQrCode,
  pixCopyPaste,
  pixExpirationDate,
  isLoading,
  onBack,
}: PixPaymentViewProps) {
  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState<string>("");

  useEffect(() => {
    if (!pixExpirationDate) return;

    const updateTimer = () => {
      try {
        const expiration = new Date(pixExpirationDate);
        if (isNaN(expiration.getTime())) {
          setTimeLeft("--:--");
          return;
        }
        const now = new Date();
        const diff = expiration.getTime() - now.getTime();
        if (diff <= 0) {
          setTimeLeft("Expirado");
          return;
        }
        const totalSeconds = Math.floor(diff / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        if (hours > 0) {
          setTimeLeft(`${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`);
        } else {
          setTimeLeft(`${minutes}:${seconds.toString().padStart(2, "0")}`);
        }
      } catch {
        setTimeLeft("--:--");
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [pixExpirationDate]);

  const handleCopy = async () => {
    if (!pixCopyPaste) return;
    try {
      await navigator.clipboard.writeText(pixCopyPaste);
      setCopied(true);
      toast.success("Código PIX copiado!");
      setTimeout(() => setCopied(false), 3000);
    } catch {
      toast.error("Erro ao copiar código");
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-muted-foreground">Gerando QR Code PIX...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Button variant="outline" size="sm" onClick={onBack} className="mb-2">
        <ArrowLeft className="h-4 w-4 mr-2" />
        Voltar
      </Button>

      {pixExpirationDate && timeLeft && (
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          <span>Expira em: {timeLeft}</span>
        </div>
      )}

      {pixQrCode ? (
        <div className="flex flex-col items-center gap-4">
          <div className="bg-white p-4 rounded-lg">
            <img
              src={`data:image/png;base64,${pixQrCode}`}
              alt="QR Code PIX"
              className="w-48 h-48"
            />
          </div>

          <p className="text-center text-sm text-muted-foreground">
            Escaneie o QR Code com o app do seu banco
          </p>

          <div className="w-full space-y-2">
            <p className="text-xs text-muted-foreground text-center">
              Ou copie o código PIX:
            </p>
            
            <div className="flex gap-2">
              <div className="flex-1 p-2 bg-muted rounded text-xs font-mono break-all">
                {pixCopyPaste}
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopy}
                className="shrink-0"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          <div className="w-full p-3 bg-gradient-to-r from-gray-800 to-gray-900 rounded-lg">
            <p className="text-center text-sm text-white">
              <Loader2 className="h-4 w-4 animate-spin inline mr-2 text-white" />
              Aguardando confirmação do pagamento...
            </p>
          </div>
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          Erro ao gerar QR Code. Tente novamente.
        </div>
      )}
    </div>
  );
}
