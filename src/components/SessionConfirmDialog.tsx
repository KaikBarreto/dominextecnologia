import { Monitor, Smartphone, Clock } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

interface SessionConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingSessions: {
    device_info: string | null;
    last_activity: string;
  }[];
  disconnectOthers: boolean;
  onDisconnectOthersChange: (checked: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

function SessionContent({
  existingSessions,
  disconnectOthers,
  onDisconnectOthersChange,
  onConfirm,
  onCancel,
  isLoading,
}: Omit<SessionConfirmDialogProps, "open" | "onOpenChange">) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Sua conta já está conectada em {existingSessions.length === 1 ? "outro dispositivo" : `${existingSessions.length} outros dispositivos`}. Você pode continuar e usar ambos ao mesmo tempo.
      </p>
      
      <div className="space-y-2">
        {existingSessions.map((session, idx) => {
          const isMobileDevice = session.device_info?.toLowerCase().includes("mobile");
          return (
            <div key={idx} className="bg-muted/50 rounded-lg p-3 space-y-1.5 border border-border">
              <div className="flex items-center gap-2 text-sm">
                {isMobileDevice ? (
                  <Smartphone className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Monitor className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="font-medium text-foreground">
                  {session.device_info || "Dispositivo desconhecido"}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>
                  Último acesso: {format(new Date(session.last_activity), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center space-x-2 pt-1">
        <Checkbox
          id="disconnect-others"
          checked={disconnectOthers}
          onCheckedChange={(checked) => onDisconnectOthersChange(!!checked)}
        />
        <label
          htmlFor="disconnect-others"
          className="text-sm text-muted-foreground cursor-pointer select-none"
        >
          Desconectar outros acessos ao entrar
        </label>
      </div>

      <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-2">
        <Button variant="outline" onClick={onCancel} disabled={isLoading} className="w-full sm:w-auto">
          Cancelar
        </Button>
        <Button onClick={onConfirm} disabled={isLoading} className="w-full sm:w-auto" autoFocus>
          {isLoading ? "Entrando..." : "Continuar"}
        </Button>
      </div>
    </div>
  );
}

export function SessionConfirmDialog({
  open,
  onOpenChange,
  existingSessions,
  disconnectOthers,
  onDisconnectOthersChange,
  onConfirm,
  onCancel,
  isLoading,
}: SessionConfirmDialogProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-w-md">
          <DrawerHeader className="text-left">
            <DrawerTitle>Sessão ativa detectada</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-4">
            <SessionContent
              existingSessions={existingSessions}
              disconnectOthers={disconnectOthers}
              onDisconnectOthersChange={onDisconnectOthersChange}
              onConfirm={onConfirm}
              onCancel={onCancel}
              isLoading={isLoading}
            />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Sessão ativa detectada</DialogTitle>
        </DialogHeader>
        <SessionContent
          existingSessions={existingSessions}
          disconnectOthers={disconnectOthers}
          onDisconnectOthersChange={onDisconnectOthersChange}
          onConfirm={onConfirm}
          onCancel={onCancel}
          isLoading={isLoading}
        />
      </DialogContent>
    </Dialog>
  );
}
