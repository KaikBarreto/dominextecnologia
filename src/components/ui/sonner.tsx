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
      style={{ "--width": "min(34rem, calc(100vw - 2rem))" } as React.CSSProperties}
      toastOptions={{
        classNames: {
          toast:
            "group toast !w-[min(34rem,calc(100vw-2rem))] !min-h-[4.5rem] !items-stretch !gap-0 !overflow-hidden !rounded-md !border-border !bg-background !p-0 !text-foreground !shadow-lg",
          content: "min-w-0 flex-1 self-center px-4 py-3.5 pr-3",
          icon: "!m-0 !h-auto !w-[4.5rem] !min-w-[4.5rem] !self-stretch !rounded-none !text-white [&>svg]:!h-6 [&>svg]:!w-6",
          title: "!text-sm !font-semibold !text-foreground",
          description: "!mt-0.5 !text-sm !text-muted-foreground",
          actionButton: "!mr-8 !h-8 !self-center !bg-transparent !px-2 !font-semibold !text-foreground hover:!bg-muted",
          cancelButton: "!mr-8 !h-8 !self-center !bg-transparent !px-2 !font-semibold !text-muted-foreground hover:!bg-muted",
          closeButton:
            "!left-auto !right-2 !top-1/2 !h-7 !w-7 !-translate-y-1/2 !translate-x-0 !border-0 !bg-transparent !text-muted-foreground !opacity-100 !shadow-none hover:!bg-muted hover:!text-foreground",
          success: "[&_[data-icon]]:!bg-emerald-600",
          error: "[&_[data-icon]]:!bg-red-600",
          warning: "[&_[data-icon]]:!bg-amber-600",
          info: "[&_[data-icon]]:!bg-blue-600",
          loading: "[&_[data-icon]]:!bg-slate-600",
          default: "[&_[data-icon]]:!bg-slate-700",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
