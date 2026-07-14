import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      // Rodapé (mobile e desktop). No mobile sobe pra ficar ACIMA da
      // MobileBottomNav (~4rem + safe-area), senão cobre o menu enquanto não some.
      position="bottom-center"
      offset="calc(env(safe-area-inset-bottom) + 1.5rem)"
      mobileOffset="calc(env(safe-area-inset-bottom) + 5.5rem)"
      closeButton
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          // X sempre visível, explícito e contrastado (sonner esconde por padrão
          // até o hover): chip maior, com contorno e mais contraste.
          closeButton:
            "group-[.toast]:!opacity-100 group-[.toast]:!h-6 group-[.toast]:!w-6 group-[.toast]:!bg-foreground/10 group-[.toast]:!text-foreground/80 group-[.toast]:!border-foreground/20 group-[.toast]:hover:!bg-foreground/20 group-[.toast]:hover:!text-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
