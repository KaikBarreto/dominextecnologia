import { cn } from "@/lib/utils";

const backgrounds = {
  blue: "!bg-blue-700",
  emerald: "!bg-emerald-700",
  violet: "!bg-violet-700",
  amber: "!bg-amber-700",
  rose: "!bg-rose-700",
  cyan: "!bg-cyan-700",
  slate: "!bg-slate-800",
} as const;

export type AdminKpiTone = keyof typeof backgrounds;

/** Only metric surfaces: tables, forms and chart containers keep their own theme. */
export function adminKpiClass(tone: AdminKpiTone = "blue", className?: string) {
  return cn(
    "admin-kpi !border-transparent !bg-none !text-white [&_*]:!text-white [&_button:hover]:!bg-black/20 [&_[role=progressbar]]:!bg-white/20 [&_[role=progressbar]>div]:!bg-white [&_.animate-pulse]:!bg-white/20",
    backgrounds[tone],
    className,
  );
}
