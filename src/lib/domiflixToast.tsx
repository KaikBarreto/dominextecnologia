import { toast } from "sonner";
import { Check, Bookmark, X, AlertTriangle } from "lucide-react";

type Variant = "added" | "removed" | "error" | "info";

interface DomiflixToastOptions {
  variant?: Variant;
  message: string;
  description?: string;
  duration?: number;
}

export function domiflixToast({
  variant = "info",
  message,
  description,
  duration = 2800,
}: DomiflixToastOptions) {
  const accent = variant === "error" ? "#E50914" : variant === "removed" ? "#6d6d6e" : "#00C597";

  const Icon =
    variant === "added" ? Check : variant === "removed" ? X : variant === "error" ? AlertTriangle : Bookmark;

  toast.custom(
    (id) => (
      <div
        onClick={() => toast.dismiss(id)}
        className="domiflix-toast pointer-events-auto cursor-pointer flex items-center gap-3 min-w-[280px] max-w-[360px] bg-[#141414]/95 backdrop-blur-md text-white rounded-md shadow-2xl border border-white/10 pl-0 pr-4 py-3 overflow-hidden"
        style={{ boxShadow: "0 12px 32px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04)" }}
      >
        <div className="self-stretch w-[4px] shrink-0" style={{ backgroundColor: accent }} />
        <div
          className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center ml-2"
          style={{
            backgroundColor: variant === "added" ? "rgba(0,197,151,0.18)" : "rgba(255,255,255,0.08)",
            color: variant === "added" ? "#00C597" : variant === "error" ? "#E50914" : "#fff",
          }}
        >
          <Icon className="w-4 h-4" strokeWidth={2.5} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold leading-tight">{message}</div>
          {description && (
            <div className="text-xs text-white/60 mt-0.5 leading-snug line-clamp-2">{description}</div>
          )}
        </div>
      </div>
    ),
    {
      duration,
      position: "bottom-right",
      unstyled: true,
      closeButton: false,
      classNames: {
        toast: "!bg-transparent !border-0 !shadow-none !p-0 !overflow-visible",
        closeButton: "!hidden",
      },
    }
  );
}
