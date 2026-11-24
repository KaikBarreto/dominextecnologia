import { Toaster as Sonner, toast } from "sonner";
import { SONNER_TOAST_CLASS_NAMES } from "./toast-layout";

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
        classNames: SONNER_TOAST_CLASS_NAMES,
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
