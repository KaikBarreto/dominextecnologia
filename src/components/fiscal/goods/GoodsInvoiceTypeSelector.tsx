import { memo } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowDownLeft, ArrowUpRight, Receipt, X } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import type { GoodsDirection } from "@/hooks/useGoodsFiscal";

interface GoodsInvoiceTypeSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (direction: GoodsDirection) => void;
}

export const GoodsInvoiceTypeSelector = memo(
  ({ open, onOpenChange, onSelect }: GoodsInvoiceTypeSelectorProps) => {
    const isMobile = useIsMobile();
    const select = (direction: GoodsDirection) => {
      onOpenChange(false);
      window.setTimeout(() => onSelect(direction), 180);
    };
    const choices = (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card
          role="button"
          tabIndex={0}
          className="group cursor-pointer border-2 border-transparent transition-all duration-300 hover:border-blue-600 hover:shadow-xl active:scale-[0.98]"
          onClick={() => select("entrada")}
          onKeyDown={(event) => event.key === "Enter" && select("entrada")}
        >
          <CardContent className="p-5 sm:p-6">
            <div className="flex flex-col items-center gap-3 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600 text-white sm:h-20 sm:w-20">
                <ArrowDownLeft className="h-8 w-8 sm:h-10 sm:w-10" />
              </span>
              <div>
                <CardTitle className="mb-1 text-lg font-bold sm:text-xl">NF-e de Entrada</CardTitle>
                <CardDescription>Registrar compra ou entrada de mercadoria</CardDescription>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card
          role="button"
          tabIndex={0}
          className="group cursor-pointer border-2 border-transparent transition-all duration-300 hover:border-green-600 hover:shadow-xl active:scale-[0.98]"
          onClick={() => select("saida")}
          onKeyDown={(event) => event.key === "Enter" && select("saida")}
        >
          <CardContent className="p-5 sm:p-6">
            <div className="flex flex-col items-center gap-3 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-green-600 text-white sm:h-20 sm:w-20">
                <ArrowUpRight className="h-8 w-8 sm:h-10 sm:w-10" />
              </span>
              <div>
                <CardTitle className="mb-1 text-lg font-bold sm:text-xl">NF-e de Saída</CardTitle>
                <CardDescription>Emitir venda ou saída de mercadoria</CardDescription>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );

    if (isMobile) {
      return (
        <Drawer open={open} onOpenChange={onOpenChange}>
          <DrawerContent>
            <DrawerHeader className="text-center">
              <span className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Receipt className="h-7 w-7" />
              </span>
              <DrawerTitle className="text-xl">Nova Nota Fiscal</DrawerTitle>
              <DrawerDescription>Selecione o tipo de NF-e</DrawerDescription>
            </DrawerHeader>
            <div className="p-4">{choices}</div>
            <DrawerFooter className="pt-0">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      );
    }

    return (
      <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-background/70 backdrop-blur-md" />
          <DialogPrimitive.Content
            className={cn(
              "fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2",
              "rounded-2xl border bg-card p-6 shadow-2xl focus:outline-none",
            )}
          >
            <div className="mb-6 text-center">
              <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Receipt className="h-7 w-7" />
              </span>
              <DialogPrimitive.Title className="text-xl font-bold">Nova Nota Fiscal</DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">
                Selecione o tipo de NF-e
              </DialogPrimitive.Description>
            </div>
            {choices}
            <Button variant="outline" className="mt-6 w-full" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <DialogPrimitive.Close className="absolute right-4 top-4 rounded-full p-1.5 opacity-70 hover:opacity-100">
              <X className="h-4 w-4" />
              <span className="sr-only">Fechar</span>
            </DialogPrimitive.Close>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    );
  },
);

GoodsInvoiceTypeSelector.displayName = "GoodsInvoiceTypeSelector";
