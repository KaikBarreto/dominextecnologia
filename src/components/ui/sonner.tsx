import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      // Rodapé (mobile e desktop), com margem da borda inferior + safe-area pra
      // não colar na borda nem no rodapé sticky de ações da OS.
      position="bottom-center"
      offset="calc(env(safe-area-inset-bottom) + 1.5rem)"
      closeButton
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          // X sempre visível e contrastado (sonner esconde por padrão até o hover).
          closeButton:
            "group-[.toast]:!opacity-100 group-[.toast]:!bg-foreground/10 group-[.toast]:!text-foreground/80 group-[.toast]:!border-transparent group-[.toast]:hover:!bg-foreground/20",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
